'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Mail, MapPin } from 'lucide-react';

const platformLinks = [
  { href: '#driver360', label: 'السائقون' },
  { href: '#fleet', label: 'الأسطول' },
  { href: '#payroll', label: 'الرواتب' },
  { href: '#operations', label: 'العمليات' },
  { href: '#reports', label: 'التقارير' },
];

const companyLinks = [
  { href: '/platform', label: 'المنصة' },
  { href: '/platform/register', label: 'سجّل شركتك' },
  { href: '/auth/sign-in', label: 'تسجيل الدخول' },
];

const resourceLinks = [
  { href: '/help', label: 'المساعدة والدعم' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
  { href: '/driver-registration', label: 'تسجيل السائقين' },
];

const legalLinks = [
  { href: '/privacy', label: 'سياسة الخصوصية' },
  { href: '/terms', label: 'شروط الخدمة' },
];

function FlagEn() {
  return (
    <span className="inline-block h-4 w-6 shrink-0 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-black/10" role="img" aria-label="en">
      <svg viewBox="0 0 90 60" className="h-full w-full" aria-hidden="true">
        <rect width="90" height="60" fill="#012169"></rect>
        <path d="M-8 -10 L64 52" stroke="#ffffff" strokeWidth="10"></path>
        <path d="M98 -10 L26 52" stroke="#ffffff" strokeWidth="10"></path>
        <path d="M-8 -10 L64 52" stroke="#C8102E" strokeWidth="5"></path>
        <path d="M98 -10 L26 52" stroke="#C8102E" strokeWidth="5"></path>
        <rect x="38" y="-10" width="14" height="80" fill="#ffffff"></rect>
        <rect x="-10" y="23" width="110" height="14" fill="#ffffff"></rect>
        <rect x="41" y="-10" width="8" height="80" fill="#C8102E"></rect>
        <rect x="-10" y="26" width="110" height="8" fill="#C8102E"></rect>
      </svg>
    </span>
  );
}

function LinkColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link href={link.href} className="text-[13px] text-muted-foreground transition-colors hover:text-elite-blue-600 dark:hover:text-elite-blue-300">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  function toggleLocale() {
    try {
      const current = localStorage.getItem('elite-locale') === 'en' ? 'en' : 'ar';
      const next = current === 'ar' ? 'en' : 'ar';
      localStorage.setItem('elite-locale', next);
      window.location.reload();
    } catch {
      /* noop */
    }
  }

  return (
    <footer className="border-t border-border/40 bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-6">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-elite-blue-500 via-elite-blue-400 to-elite-orange-500 shadow-lg shadow-elite-blue-500/20" style={{ width: 34, height: 34 }}>
                <Image alt="Elite Development" width={34} height={34} className="rounded-2xl object-cover" style={{ width: 34, height: 34 }} src="/logo.png" />
              </div>
              <div className="leading-tight">
                <p className="font-bold text-foreground">نخبة التطوير</p>
                <p className="text-[11px] text-muted-foreground">Elite Development</p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">نظام التشغيل للعملية اللوجستية.</p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                القصيم، المملكة العربية السعودية
              </p>
              <a href="mailto:support@elite-dev.com" className="flex w-fit items-center gap-2 transition-colors hover:text-elite-blue-600 dark:hover:text-elite-blue-300">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                support@elite-dev.com
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
            <LinkColumn title="المنصة" links={platformLinks} />
            <LinkColumn title="الشركة" links={companyLinks} />
            <LinkColumn title="الموارد" links={resourceLinks} />
            <LinkColumn title="قانوني" links={legalLinks} />
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} نخبة التطوير — جميع الحقوق محفوظة.</p>
          <button
            onClick={toggleLocale}
            className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 rounded-md px-3 gap-2 font-semibold"
            aria-label="Toggle language"
          >
            <FlagEn />
            English
            <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </button>
        </div>
      </div>
    </footer>
  );
}

export default LandingFooter;
