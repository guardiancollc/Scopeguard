# ScopeGuard Beta v0.7.3

Adds secure per-user Gmail OAuth for invoice sending on top of v0.7.2.

## Before live Gmail sending
1. Run `supabase/migrations/009_email_connections.sql` in the ScopeGuard Supabase project.
2. In Google Cloud, create an OAuth Web application and enable the Gmail API.
3. Add this authorized redirect URI: `https://YOUR-DOMAIN.vercel.app/api/email-callback`.
4. Add the Vercel environment variables listed in `.env.example`.
5. Deploy, sign in, then open Menu → Email Settings → Connect Gmail.

Refresh tokens are encrypted server-side before storage. Gmail passwords are never stored by ScopeGuard.

## v0.7.4
Invoice emails now include a PDF attachment rendered in the approved clean professional master invoice style.
