// FX-06 — approveExpense concurrency tests (audit J5).
//
// The defect: the old action did check-then-insert (read is_approved →
// insert payable → update expense) across three round-trips; two concurrent
// approvals could both pass the check and create two payable rows.
// The fix (migration 063): ONE atomic RPC — approve_expense_atomic — whose
// conditional UPDATE is the race arbiter (0 rows ⇒ EXP002) and whose payable
// insert is ON CONFLICT DO NOTHING + an exactly-one-live-row assert (FX06).
//
// These tests mock the RPC boundary and model the DB arbitration: the first
// caller claims the expense (claim=1), the concurrent caller sees 0 rows
// claimed and receives EXP002 — exactly one payable row results.
//
// Run: pnpm exec vitest run src/lib/expenses/approve-expense-race.test.ts

import { describe, expect, it, vi, beforeEach } from "vitest"

// ── Mocks (hoisted) ────────────────────────────────────────────────────────

const { rpcMock, adminState, authState, rateLimitState, auditState, dispatcherState, emitState } = vi.hoisted(() => {
  // Models the DB: is_approved flag + the claim rows each RPC call returns.
  const adminState = {
    expenseApproved: false,
    // Each call: { claimed } mirrors GET DIAGNOSTICS ROW_COUNT; a claim of 0
    // raises 'EXP002: expense already approved' (the conditional UPDATE
    // matched no row because the concurrent caller already set is_approved).
    calls: [] as Array<{ claimed: number }>,
  }
  const rpcMock = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn !== "approve_expense_atomic") throw new Error(`unexpected rpc ${fn}`)
    adminState.calls.push({ claimed: 0 })
    const idx = adminState.calls.length - 1
    // supabase-js .rpc() resolves to { data, error } — a raised DB exception
    // surfaces as error, it does NOT reject.
    if (adminState.expenseApproved) {
      // Row lock released after the winner committed; re-evaluated predicate
      // (is_approved = FALSE) matches 0 rows → EXP002.
      adminState.calls[idx].claimed = 0
      return { data: null, error: { message: "EXP002: expense already approved" } }
    }
    adminState.expenseApproved = true
    adminState.calls[idx].claimed = 1
    return {
      data: {
        expense_id: args.p_expense_id,
        expense_ref: "EXP-2026-000042",
        amount: 1000,
        vat_amount: 150,
        total: 1150,
        coa_account_code: "5200",
        vat_recoverability: "recoverable",
        event_id: "event-1",
      },
      error: null,
    }
  })
  const authState = { user: null as null | Record<string, unknown> }
  const rateLimitState = { ok: true }
  const auditState = { writeAuditLog: vi.fn(async () => undefined) }
  const dispatcherState = { runEventDispatcher: vi.fn(async () => undefined) }
  const emitState = { emit: vi.fn() }
  return { rpcMock, adminState, authState, rateLimitState, auditState, dispatcherState, emitState }
})

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}))

vi.mock("@/lib/auth/authorization", () => ({
  requirePermission: vi.fn(async () => undefined),
  getCurrentUser: async () => authState.user,
}))

vi.mock("@/lib/auth/rate-limit", () => ({
  rateLimitExpenses: vi.fn(async () => ({ success: rateLimitState.ok })),
}))

vi.mock("@/lib/auth/sessions", () => ({
  writeAuditLog: (...args: unknown[]) => auditState.writeAuditLog(...(args as [])),
}))

vi.mock("@/lib/accounting/dispatcher", () => ({
  runEventDispatcher: (...args: unknown[]) => dispatcherState.runEventDispatcher(...(args as [])),
}))

vi.mock("@/lib/webhooks/events", () => ({
  emit: (...args: unknown[]) => emitState.emit(...(args as [])),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

// NOTE: @/lib/accounting/csv-utils (mapFinancialError) is NOT mocked — the
// real EXP002 taxonomy message and the FX06 raw passthrough are asserted.

// ── Load the action module ─────────────────────────────────────────────────

import { approveExpense } from "./actions"

const USER = {
  id: "user-1",
  authUserId: "auth-1",
  tenantId: "00000000-0000-0000-0000-000000000001",
}

beforeEach(() => {
  adminState.expenseApproved = false
  adminState.calls = []
  authState.user = { ...USER }
  rateLimitState.ok = true
  auditState.writeAuditLog.mockClear()
  dispatcherState.runEventDispatcher.mockClear()
  emitState.emit.mockClear()
  rpcMock.mockClear()
})

// ── The acceptance test: two concurrent approvals → one payable row ───────

describe("FX-06 approveExpense race", () => {
  it("two concurrent approvals of the same expense → exactly one claim, one success, one EXP002", async () => {
    // Fire both approvals simultaneously (double-click / two tabs).
    const [a, b] = await Promise.all([
      approveExpense({ id: "exp-1" }),
      approveExpense({ id: "exp-1" }),
    ])

    // Exactly one wins; the loser gets the taxonomy EXP002 message.
    const successes = [a, b].filter((r) => r.success)
    const failures = [a, b].filter((r) => !r.success)
    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(failures[0].error).toBe("This expense is already approved.")

    // The DB claimed the expense exactly once (one row inserted).
    expect(adminState.calls).toHaveLength(2)
    expect(adminState.calls.reduce((n, c) => n + c.claimed, 0)).toBe(1)

    // The winner posted the journal event + audit + webhook exactly once.
    expect(dispatcherState.runEventDispatcher).toHaveBeenCalledTimes(1)
    expect(auditState.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(auditState.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: USER.tenantId,
        actorId: USER.authUserId,
        module: "expenses",
        action: "expense_approved",
        entityId: "exp-1",
      })
    )
    expect(emitState.emit).toHaveBeenCalledTimes(1)
    expect(emitState.emit).toHaveBeenCalledWith(
      "expense.approved",
      USER.tenantId,
      expect.objectContaining({ id: "exp-1", amount: 1150 })
    )
  }, 15_000)

  it("passes tenant scoping, actor, and VAT inputs to the atomic RPC", async () => {
    const res = await approveExpense({
      id: "exp-2",
      vat_rate: 5,
      vat_recoverability: "non_recoverable",
    })

    expect(res.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith("approve_expense_atomic", {
      p_tenant_id: USER.tenantId,
      p_expense_id: "exp-2",
      p_vat_rate: 5,
      p_vat_recoverability: "non_recoverable",
      p_actor: USER.authUserId,
    })
  })

  it("maps an RPC EXP002 failure to the taxonomy message", async () => {
    adminState.expenseApproved = true // already approved before this call
    const res = await approveExpense({ id: "exp-3" })
    expect(res.success).toBe(false)
    expect(res.error).toBe("This expense is already approved.")
  })

  it("passes the FX06 exactly-one assert through verbatim (not masked)", async () => {
    rpcMock.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "FX06: expected exactly 1 live payable for expense exp-4, found 0" },
    }))
    const res = await approveExpense({ id: "exp-4" })
    expect(res.success).toBe(false)
    expect(res.error).toContain("FX06")
  })

  it("rejects invalid VAT before touching the DB", async () => {
    const res = await approveExpense({ id: "exp-5", vat_rate: 150 })
    expect(res.success).toBe(false)
    expect(res.error).toBe("Invalid VAT rate or recoverability classification.")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("rejects when not authenticated", async () => {
    authState.user = null
    const res = await approveExpense({ id: "exp-6" })
    expect(res.success).toBe(false)
    expect(res.error).toBe("Not authenticated.")
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("rejects when rate limited", async () => {
    rateLimitState.ok = false
    const res = await approveExpense({ id: "exp-7" })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/rate limit/i)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
