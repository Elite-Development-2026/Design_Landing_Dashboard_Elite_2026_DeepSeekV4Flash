import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'دخول الشركات | نخبة التطوير',
  robots: { index: false, follow: false },
};

// Unified sign-in: every company login goes through the main app sign-in page
// (shared Supabase browser client, MFA step-up, safe returnTo handling),
// then lands on the multi-tenant /dashboard. This page previously kept its own
// raw supabase-js client whose session was invisible to the dashboard client,
// forcing users to sign in repeatedly.
export default function PlatformLoginPage() {
  redirect('/auth/sign-in');
}
