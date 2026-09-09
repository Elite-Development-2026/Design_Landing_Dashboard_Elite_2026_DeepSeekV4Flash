'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  logo_url?: string;
  brand_colors?: { primary?: string; secondary?: string };
  slug: string;
}

interface Company {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  slug: string | null;
  status: string | null;
  plan: string | null;
  billing_status?: string | null;
  created_at: string | null;
  users_count: number;
}

interface PlatformUser {
  id: string;
  email: string | null;
  full_name_en: string | null;
  full_name_ar: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
  last_login_at: string | null;
  company_name: string | null;
}

interface DashboardStats {
  companies: number;
  activeCompanies: number;
  users: number;
  activeUsers: number;
}

const INITIAL_STATS: DashboardStats = {
  companies: 0,
  activeCompanies: 0,
  users: 0,
  activeUsers: 0,
};

function companyName(company: Company) {
  return company.name_en || company.name_ar || 'Unnamed company';
}

function userName(user: PlatformUser) {
  return user.full_name_en || user.full_name_ar || user.email || 'Unnamed user';
}

function formatDate(value: string | null) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('en-SA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [recentCompanies, setRecentCompanies] = useState<Company[]>([]);
  const [recentUsers, setRecentUsers] = useState<PlatformUser[]>([]);

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
      // Confirm the session is alive (RLS-scoped), then load the
      // customers-and-users overview from the platform admin API.
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('unauthenticated');

      const [companiesRes, usersRes] = await Promise.all([
        fetch('/api/platform/admin/companies'),
        fetch('/api/platform/admin/users'),
      ]);

      if (!companiesRes.ok || !usersRes.ok) {
        throw new Error('forbidden');
      }

      const companiesData = (await companiesRes.json()) as { companies: Company[] };
      const usersData = (await usersRes.json()) as { users: PlatformUser[] };

      const companies = companiesData.companies ?? [];
      const users = usersData.users ?? [];

      setStats({
        companies: companies.length,
        activeCompanies: companies.filter((c) => c.status === 'active').length,
        users: users.length,
        activeUsers: users.filter((u) => u.status === 'active').length,
      });
      setRecentCompanies(companies.slice(0, 5));
      setRecentUsers(users.slice(0, 5));
    } catch (cause) {
      console.error('Unable to load dashboard data:', cause);
      setError(
        cause instanceof Error && cause.message === 'unauthenticated'
          ? 'Your session has expired. Please sign in again.'
          : 'We could not load the customers and users overview. You may not have platform admin access, or the service is unavailable.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const metrics = [
    {
      title: 'Total companies',
      value: stats.companies.toLocaleString('en-SA'),
      icon: Building2,
      positive: true,
      helper: `${stats.activeCompanies} active`,
      href: '/platform/admin',
    },
    {
      title: 'Total users',
      value: stats.users.toLocaleString('en-SA'),
      icon: Users,
      positive: true,
      helper: `${stats.activeUsers} active`,
      href: '/platform/admin',
    },
    {
      title: 'Active companies',
      value: stats.activeCompanies.toLocaleString('en-SA'),
      icon: ShieldCheck,
      positive: true,
      helper: 'Currently subscribed customers',
    },
    {
      title: 'Active users',
      value: stats.activeUsers.toLocaleString('en-SA'),
      icon: UserPlus,
      positive: true,
      helper: 'Users who can sign in today',
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
          <p className="text-sm font-medium text-blue-300">Customers &amp; users</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            Welcome back{tenant?.name ? `, ${tenant.name}` : ''}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Here is what is happening across your customers and their users.
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
                <ArrowUpRight className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-5 text-2xl font-bold tracking-tight text-white">{metric.value}</p>
              <p className="mt-1 text-sm font-medium text-white/75">{metric.title}</p>
              <p className="mt-1 text-xs text-white/40">{metric.helper}</p>
            </div>
          );

          return metric.href ? (
            <Link key={metric.title} href={metric.href} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950">
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
              <h2 className="text-lg font-semibold text-white">Latest companies</h2>
              <p className="mt-1 text-sm text-white/50">Most recently onboarded customers</p>
            </div>
            <Link href="/platform/admin" className="text-sm font-semibold text-blue-300 transition hover:text-blue-200">
              View all
            </Link>
          </div>

          {recentCompanies.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center">
              <Building2 className="h-10 w-10 text-white/25" />
              <p className="mt-3 text-sm font-medium text-white/70">No companies yet</p>
              <p className="mt-1 text-sm text-white/40">Onboard your first customer to get started.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {recentCompanies.map((company) => (
                <div key={company.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-sm font-bold text-blue-200">
                    {companyName(company).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{companyName(company)}</p>
                    <p className="mt-0.5 text-xs text-white/45">
                      Added {formatDate(company.created_at)} · {company.users_count} user{company.users_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium capitalize text-blue-200">
                    {company.status || 'pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Latest users</h2>
              <p className="mt-1 text-sm text-white/50">Most recently created accounts</p>
            </div>
            <Link href="/platform/admin" className="text-sm font-semibold text-blue-300 transition hover:text-blue-200">
              View all
            </Link>
          </div>

          {recentUsers.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center">
              <Users className="h-10 w-10 text-white/25" />
              <p className="mt-3 text-sm font-medium text-white/70">No users yet</p>
              <p className="mt-1 text-sm text-white/40">Invite the first user to begin collaborating.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {recentUsers.map((user) => (
                <div key={user.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-200">
                    {userName(user).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{userName(user)}</p>
                    <p className="mt-0.5 truncate text-xs text-white/45">
                      {user.company_name ?? '—'} · {formatDate(user.created_at)}
                    </p>
                  </div>
                  <span className="max-w-32 truncate rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-200">
                    {(user.role || 'member').replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
