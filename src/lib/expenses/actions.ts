"use server"

// Financial Phase 7 — Expense approval.
//
// approveExpense() approves a pending expense: captures input VAT
// (vat_rate / vat_amount / vat_recoverability), resolves the CoA expense
// account from `expense_category_mappings` (snapshot to coa_account_code),
// creates the Accounts Payable row (source_entity_type = 'expense'), and
// emits the ExpenseApprovedEvent for the Phase 9 journal/VAT consumers.
//
// Canonical math lives in the DB (migration 063, approve_expense_atomic RPC):
//   vat_amount = round(amount × vat_rate / 100, 2) — `amount` is the NET base
//   payable total = amount + vat_amount
//
// FX-06: the approval is ONE atomic RPC (claim expense via conditional UPDATE
// → payable with ON CONFLICT DO NOTHING + exactly-one assert →
// ExpenseApprovedEvent). The old client-side check-then-insert had a
// double-payable race under two concurrent approvals.
//
// Error codes (error-codes.ts): EXP001 not found · EXP002 already approved
// · EXP003 invalid VAT/recoverability · EXP004 approval guard (DB trigger)
// · EXP005 no CoA mapping for the category. FX06 = RPC exactly-one assert
// (raw passthrough — not in the taxonomy).

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser, requirePermission } from "@/lib/auth/authorization"
import { writeAuditLog } from "@/lib/auth/sessions"
import { mapFinancialError } from "@/lib/accounting/csv-utils"
import { runEventDispatcher } from "@/lib/accounting/dispatcher"
import { rateLimitExpenses } from "@/lib/auth/rate-limit"
import { emit } from "@/lib/webhooks/events"

type ActionResult = { success: boolean; error?: string }

// Domain constants live in @/lib/expenses/constants (a regular module) so
// client components can import them without hitting the server-action proxy.
import { EXPENSE_TYPES, RECOVERABILITY, type ExpenseVatRecoverability, type ExpenseType } from "@/lib/expenses/constants"

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error"
}

/**
 * Approve a pending expense → payable + ExpenseApprovedEvent.
 * Permission: expenses:approve.
 */
export async function approveExpense(input: {
  id: string
  vat_rate?: number
  vat_recoverability?: ExpenseVatRecoverability
}): Promise<ActionResult> {
  try {
    await requirePermission("expenses", "approve")
    const currentUser = await getCurrentUser()
    if (!currentUser) return { success: false, error: "Not authenticated." }
    const rl = await rateLimitExpenses(currentUser.id)
    if (!rl.success) return { success: false, error: "Rate limit exceeded. Try again later." }

    const vatRate = Number(input.vat_rate ?? 15)
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      return { success: false, error: mapFinancialError("EXP003: invalid VAT rate") }
    }
    const recoverability = input.vat_recoverability ?? "recoverable"
    if (!RECOVERABILITY.includes(recoverability)) {
      return { success: false, error: mapFinancialError("EXP003: invalid recoverability") }
    }

    // FX-06: the whole approval is ONE atomic RPC (migration 063).
    // The DB arbitrates the race: a conditional UPDATE claims the expense
    // (0 rows ⇒ EXP002), the payable insert uses ON CONFLICT DO NOTHING and
    // asserts exactly one live row (FX06), and the ExpenseApprovedEvent is
    // enqueued in the same transaction.
    const admin = createAdminClient()
    const { data: rpcData, error: rpcErr } = await admin.rpc("approve_expense_atomic", {
      p_tenant_id: currentUser.tenantId,
      p_expense_id: input.id,
      p_vat_rate: vatRate,
      p_vat_recoverability: input.vat_recoverability ?? null,
      p_actor: currentUser.authUserId,
    })
    if (rpcErr) {
      // EXP002 has a dedicated 409 message in the taxonomy; FX06 (the
      // exactly-one-assert) passes through verbatim.
      return { success: false, error: mapFinancialError(rpcErr.message) }
    }

    const rpc = rpcData as {
      expense_id: string
      expense_ref: string
      amount: number
      vat_amount: number
      total: number
      coa_account_code: string
      vat_recoverability: ExpenseVatRecoverability
      event_id: string
    } | null
    if (!rpc) return { success: false, error: mapFinancialError("EXP001: expense not found") }

    // Phase 9 — dispatch now: Dr Expense (+ Dr VAT In when recoverable) /
    // Cr AP journal + classified input-VAT ledger row.
    await runEventDispatcher()

    await writeAuditLog({
      tenantId: currentUser.tenantId,
      actorId: currentUser.authUserId,
      module: "expenses",
      action: "expense_approved",
      entityType: "expenses",
      entityId: rpc.expense_id,
      newValues: {
        expense_ref: rpc.expense_ref,
        amount: rpc.amount,
        vat_amount: rpc.vat_amount,
        total: rpc.total,
        coa_account_code: rpc.coa_account_code,
        vat_recoverability: rpc.vat_recoverability,
      },
    })

    emit("expense.approved", currentUser.tenantId, {
      id: rpc.expense_id,
      amount: rpc.total,
      approvedBy: currentUser.id,
    })

    revalidatePath("/expenses")
    revalidatePath("/accounting")
    return { success: true }
  } catch (e) {
    return { success: false, error: errorMessage(e) }
  }
}

/**
 * Create a pending expense (entered from the UI, approved later).
 * Permission: expenses:create. The DB assigns the EXP-YYYY-000xxx code.
 */
export async function createExpense(input: {
  expense_type: ExpenseType
  category?: string
  amount: number
  expense_date: string
  vendor?: string | null
  description?: string | null
  vat_rate?: number
}): Promise<ActionResult & { id?: string }> {
  try {
    await requirePermission("expenses", "create")
    const currentUser = await getCurrentUser()
    if (!currentUser) return { success: false, error: "Not authenticated." }
    const rl = await rateLimitExpenses(currentUser.id)
    if (!rl.success) return { success: false, error: "Rate limit exceeded. Try again later." }

    const amount = Number(input.amount)
    const vatRate = Number(input.vat_rate ?? 15)
    const type = input.expense_type
    if (!EXPENSE_TYPES.includes(type)) {
      return { success: false, error: mapFinancialError("EXP006: invalid expense type") }
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false, error: mapFinancialError("EXP006: amount must be positive") }
    }
    if (!input.expense_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)) {
      return { success: false, error: mapFinancialError("EXP006: expense date required") }
    }
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      return { success: false, error: mapFinancialError("EXP003: invalid VAT rate") }
    }

    const admin = createAdminClient()
    const { data: row, error } = await admin
      .from("expenses")
      .insert({
        tenant_id: currentUser.tenantId,
        expense_type: type,
        category: input.category?.trim() || null,
        amount,
        currency: "SAR",
        expense_date: input.expense_date,
        description: input.description?.trim() || null,
        vendor: input.vendor?.trim() || null,
        vat_rate: vatRate,
        is_approved: false,
        created_by: currentUser.authUserId,
      })
      .select("id,expense_code")
      .single()
    if (error) return { success: false, error: mapFinancialError(error.message) }

    await writeAuditLog({
      tenantId: currentUser.tenantId,
      actorId: currentUser.authUserId,
      module: "expenses",
      action: "expense_created",
      entityType: "expenses",
      entityId: row.id,
      newValues: { expense_code: row.expense_code, expense_type: type, amount, expense_date: input.expense_date },
    })

    revalidatePath("/expenses")
    return { success: true, id: row.id }
  } catch (e) {
    return { success: false, error: errorMessage(e) }
  }
}
