'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';

interface RecentDriver {
  id: string;
  full_name_en: string | null;
  full_name_ar: string | null;
  status: string | null;
  created_at: string | null;
}

interface Tenant {
  id: string;
  name: string;
  logo_url?: string;
  brand_colors?: { primary?: string; secondary?: string };
  slug: string;
}

interface DashboardStats {
  drivers: number;
  vehicles: number;
  monthIncome: number;
  monthExpenses: number;
}

const INITIAL_STATS: DashboardStats = {
  drivers: 0,
  vehicles: 0,
  monthIncome: 0,
  monthExpenses: 0,
};

function formatSar(amount: number) {
  return `${amount.toLocaleString('en-SA', {
    maximumFractionDigits: 0,
  })} SAR`;
}

function driverName(driver: RecentDriver) {
  return driver.full_name_en || driver.full_name_ar || 'Unnamed driver';
}

function formatDate(value: string | null) {
  if (!value) return 'Recently added';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently added';

  return date.toLocaleDateString('en-SA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function FleetOverviewPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [recentDrivers, setRecentDrivers] = useState<RecentDriver[]>([]);

  useEffect(() => {
    try {
      const storedTenant = window.localStorage.getItem('tenant');
      if (storedTenant) setTenant(JSON.parse(storedTenant) as Tenant);
    } catch {
      setTenant(null);
    }
  }, []);

  const loadDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const supabase = createClient();
      const monthStart = new Date();
      monthStart.setHours(0, 0, 0, 0);
      monthStart.setDate(1);
      const monthStartStr = monthStart.toISOString().slice(0, 10);

      const [driversRes, vehiclesRes, invoicesRes, expensesRes, recentRes] = await Promise.all([
        supabase
          .from('drivers')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null),
        supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null),
        supabase
          .from('invoices')
          .select('total')
          .is('deleted_at', null)
          .gte('issue_date', monthStartStr),
        supabase
          .from('expenses')
          .select('amount')
          .is('deleted_at', null)
          .gte('expense_date', monthStartStr),
        supabase
          .from('drivers')
          .select('id, full_name_en, full_name_ar, status, created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(4),
      ]);

      const queryError = [driversRes, vehiclesRes, invoicesRes, expensesRes, recentRes]
        .map((result) => result.error)
        .find(Boolean);

      if (queryError) throw queryError;

      const monthIncome = (invoicesRes.data ?? []).reduce(
        (sum, row: { total?: number | string | null }) => sum + (Number(row.total) || 0),
        0,
      );
      const monthExpenses = (expensesRes.data ?? []).reduce(
        (sum, row: { amount?: number | string | null }) => sum + (Number(row.amount) || 0),
        0,
      );

      setStats({
        drivers: driversRes.count ?? 0,
        vehicles: vehiclesRes.count ?? 0,
        monthIncome,
        monthExpenses,
      });
      setRecentDrivers((recentRes.data ?? []) as RecentDriver[]);
    } catch (cause) {
      console.error('Unable to load dashboard data:', cause);
      setError('We could not load your fleet data. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const netPosition = stats.monthIncome - stats.monthExpenses;
  const totalCashflow = stats.monthIncome + stats.monthExpenses;
  const incomeShare = totalCashflow > 0 ? (stats.monthIncome / totalCashflow) * 100 : 0;
  const expenseShare = totalCashflow > 0 ? (stats.monthExpenses / totalCashflow) * 100 : 0;

  const metrics = [
    {
      title: 'Revenue this month',
      value: formatSar(stats.monthIncome),
      icon: DollarSign,
      positive: true,
      helper: 'Issued invoices this month',
    },
    {
      title: 'Expenses this month',
      value: formatSar(stats.monthExpenses),
      icon: TrendingUp,
      positive: stats.monthExpenses <= stats.monthIncome,
      helper: 'Recorded expenses this month',
    },
    {
      title: 'Total drivers',
      value: stats.drivers.toLocaleString('en-SA'),
      icon: Users,
      positive: true,
      helper: 'Active driver records',
      href: '/drivers',
    },
    {
      title: 'Total vehicles',
      value: stats.vehicles.toLocaleString('en-SA'),
      icon: Truck,
      positive: true,
      helper: 'Active vehicle records',
      href: '/vehicles',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-72 rounded-xl bg-white/5" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-36 rounded-2xl border border-white/5 bg-white/5" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="h-72 rounded-2xl border border-white/5 bg-white/5" />
          <div className="h-72 rounded-2xl border border-white/5 bg-white/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Fleet overview</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Welcome back{tenant?.name ? `, ${tenant.name}` : ''}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Here is what is happening across your fleet this month.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </section>

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-lg bg-red-400/15 px-3 py-2 font-semibold text-red-100 transition hover:bg-red-400/25"
          >
            Try again
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const content = (
            <div className="h-full rounded-2xl border border-white/10 bg-slate-800/50 p-5 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-800/70">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10">
                  <Icon className="h-5 w-5 text-blue-300" />
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${metric.positive ? 'text-emerald-300' : 'text-red-300'}`}>
                  {metric.positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
              </div>
              <p className="mt-5 text-2xl font-bold tracking-tight text-white">{metric.value}</p>
              <p className="mt-1 text-sm font-medium text-white/75">{metric.title}</p>
              <p className="mt-1 text-xs text-white/40">{metric.helper}</p>
            </div>
          );

          return metric.href ? (
            <Link key={metric.title} href={metric.href} className="block focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 rounded-2xl">
              {content}
            </Link>
          ) : (
            <div key={metric.title}>{content}</div>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Latest drivers</h2>
              <p className="mt-1 text-sm text-white/50">Most recently added driver records</p>
            </div>
            <Link href="/drivers" className="text-sm font-semibold text-blue-300 transition hover:text-blue-200">
              View all
            </Link>
          </div>

          {recentDrivers.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center">
              <Users className="h-10 w-10 text-white/25" />
              <p className="mt-3 text-sm font-medium text-white/70">No drivers yet</p>
              <p className="mt-1 text-sm text-white/40">Add your first driver to begin managing your fleet.</p>
              <Link href="/drivers" className="mt-4 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">
                Add driver
              </Link>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {recentDrivers.map((driver) => (
                <div key={driver.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-sm font-bold text-blue-200">
                    {driverName(driver).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{driverName(driver)}</p>
                    <p className="mt-0.5 text-xs text-white/45">Added {formatDate(driver.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium capitalize text-blue-200">
                    {driver.status || 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur-sm">
          <div>
            <h2 className="text-lg font-semibold text-white">Net position</h2>
            <p className="mt-1 text-sm text-white/50">Income and expenses for the current month</p>
          </div>

          <div className="mt-7 flex items-end gap-2">
            <span className={`text-4xl font-bold tracking-tight ${netPosition >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {netPosition.toLocaleString('en-SA', { maximumFractionDigits: 0 })}
            </span>
            <span className="mb-1 text-sm font-medium text-white/45">SAR</span>
          </div>

          <div className="mt-7 space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                <span className="text-white/70">Income</span>
                <span className="font-semibold text-emerald-300">{formatSar(stats.monthIncome)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${incomeShare}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                <span className="text-white/70">Expenses</span>
                <span className="font-semibold text-red-300">{formatSar(stats.monthExpenses)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${expenseShare}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-7 rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/40">Monthly summary</p>
            <p className="mt-1 text-sm text-white/70">
              {netPosition >= 0
                ? 'Your income currently exceeds recorded expenses.'
                : 'Recorded expenses currently exceed issued-invoice revenue.'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
