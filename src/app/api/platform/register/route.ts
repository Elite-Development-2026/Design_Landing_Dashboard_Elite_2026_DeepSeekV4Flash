import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendCompanyConfirmationEmail } from '@/lib/notifications/company-welcome-email';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { company_name, domain, email, password, logo_url, brand_colors } = body;

    if (!company_name || !domain || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const slug = company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const { data: existing } = await supabase.from('tenants').select('id').eq('domain', domain).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Domain already registered' }, { status: 409 });
    }

    // ── Email confirmation policy (step 3 of the flow: "if enabled") ──
    // Mirror the Supabase Auth project setting instead of hard-coding a
    // behavior, so enabling/disabling confirmation in the dashboard is the
    // only switch operators need to touch.
    let emailConfirmationEnabled = true;
    try {
      const settingsRes = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(6000),
      });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (typeof settings.mailer_autoconfirm === 'boolean') {
          emailConfirmationEnabled = !settings.mailer_autoconfirm;
        }
      }
    } catch {
      // Fail safe: keep the stricter default (send a confirmation link).
    }

    // Invite-provisioned user creation — direct signup is blocked by the auth trigger.
    // When confirmation is enabled the account starts unconfirmed so the user
    // must click the emailed link before signing in.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: !emailConfirmationEnabled,
      user_metadata: { _invite_provisioned: true, company_name, domain },
    });

    if (authError) {
      // FX-07 anti-enumeration: `admin.createUser` for an existing account
      // fails ("User already registered" …) and used to surface as a raw
      // error string. Existing and fresh emails must behave identically:
      // same status, same body. Details stay in server logs only.
      console.error('platform register: user create rejected:', authError.message);
      return NextResponse.json(
        { success: true, requires_confirmation: emailConfirmationEnabled },
        { status: 200 }
);
    }
    if (!authData.user) throw new Error('Failed to create user');

    // Provision the tenant + membership + role rows BEFORE returning, so the
    // workspace is fully ready the moment the user signs in.
    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: tenant, error: tenantError } = await supabase.from('tenants').insert({
      name_en: company_name,
      name_ar: company_name,
      slug,
      domain,
      logo_url: logo_url || null,
      brand_colors: { primary: brand_colors || '#1E5A99', secondary: '#E87D3E' },
      trial_ends_at: trialEnds,
      created_by: authData.user.id,
    }).select('id').single();

    if (tenantError) throw tenantError;

    const { error: userError } = await supabase.from('users').upsert({
      auth_user_id: authData.user.id,
      tenant_id: tenant.id,
      email,
      role: 'general_manager',
      status: 'active',
      must_change_password: false,
    }, { onConflict: 'auth_user_id' });
    if (userError) throw userError;

    const { data: pubUser } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (pubUser) {
      await supabase.from('tenant_memberships').upsert({ tenant_id: tenant.id, user_id: pubUser.id, is_primary: true });
    }

    // ── Confirmation step (only when the auth project requires it) ──
    if (emailConfirmationEnabled) {
      // Mint the same confirmation link Supabase would email, then send it
      // through Resend with the branded bilingual template.
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
      });

      if (linkError || !linkData?.properties?.action_link) {
        console.error('Confirmation link generation failed:', linkError);
        // Non-fatal: the user can still request a new link via forgot-password.
      } else {
        // Best-effort — never fail the registration over an email hiccup.
        await sendCompanyConfirmationEmail({
          email,
          companyName: company_name,
          confirmationUrl: linkData.properties.action_link,
        });
      }

      return NextResponse.json({ success: true, requires_confirmation: true });
    }

    // Email confirmation disabled → straight to sign-in with a success banner.
    return NextResponse.json({ success: true, requires_confirmation: false });
  } catch (error) {
    // FX-07: never relay raw error text — this catch previously returned
    // `error.message`, leaking PostgREST diagnostics (table/column names,
    // unique-violation details) to the client.
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
