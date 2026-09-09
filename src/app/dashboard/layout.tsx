'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar';
import Header from '@/components/dashboard/Header';

interface Tenant {
  id: string;
  name: string;
  logo_url?: string;
  brand_colors?: { primary?: string; secondary?: string };
  slug: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate the tenant from the server session (RLS-scoped), falling back
    // to any locally cached value for instant paint.
    let active = true;

    async function hydrateTenant() {
      const stored = localStorage.getItem('tenant');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Tenant;
          if (active) setTenant(parsed);
        } catch (e) {
          console.error('Failed to parse tenant:', e);
        }
      }

      try {
        const res = await fetch('/api/platform/me');
        if (!res.ok) throw new Error('unauthenticated');
        const data = (await res.json()) as { tenant: Tenant | null };
        if (data.tenant) {
          if (active) setTenant(data.tenant);
          localStorage.setItem('tenant', JSON.stringify(data.tenant));
        }
      } catch {
        // Keep the cached/localStorage value if any; the proxy guards the route.
      } finally {
        if (active) setLoading(false);
      }
    }

    void hydrateTenant();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const primaryColor = tenant?.brand_colors?.primary || '#3b82f6';
  const secondaryColor = tenant?.brand_colors?.secondary || '#8b5cf6';

  return (
    <div className="flex h-screen bg-slate-900" style={{ '--tenant-primary': primaryColor, '--tenant-secondary': secondaryColor } as React.CSSProperties}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header tenant={tenant} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
