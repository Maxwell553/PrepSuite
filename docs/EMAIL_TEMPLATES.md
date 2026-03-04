# Email Templates with Prepsuite.ai Logo

Auth emails (signup confirmation, password reset, magic link, etc.) use custom templates that include the `NewLogo.jpg` logo.

## How It Works

The logo is loaded from `{{ .SiteURL }}/NewLogo.jpg`, where `SiteURL` is your app URL configured in Supabase (e.g. `https://prepsuite.ai`). The image is served from `public/NewLogo.jpg` when users visit your deployed app.

**Important:** Ensure your Supabase **Site URL** (Authentication → URL Configuration) matches your production domain so the logo loads correctly in emails.

## Local Development (Supabase CLI)

Templates are configured in `supabase/config.toml`. After editing templates:

```bash
supabase stop && supabase start
```

## Hosted Supabase (Dashboard)

For hosted projects, templates are managed in the Dashboard, not via config files.

1. Go to **Authentication** → **Email Templates**
2. For each template (Confirm signup, Reset password, Magic link, etc.), paste the HTML from the corresponding file in `supabase/templates/`
3. The logo will display as long as `Site URL` is set to your app domain (e.g. `https://prepsuite.ai`)

## Template Files

- `confirmation.html` — Signup confirmation
- `recovery.html` — Password reset
- `magic_link.html` — Magic link sign-in
- `email_change.html` — Email change confirmation
- `invite.html` — User invitation
