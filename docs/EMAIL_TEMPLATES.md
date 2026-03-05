# Email Templates with Prepsuite.ai Logo

Auth emails (signup confirmation, password reset, magic link, etc.) use custom templates that include the `EmailLogo.jpg` logo (purple on white, optimized for email).

## How It Works

The logo is loaded from `{{ .SiteURL }}/EmailLogo.jpg`, where `SiteURL` is your app URL configured in Supabase (e.g. `https://prepsuite.ai`). The image is served from `public/EmailLogo.jpg` when your app is deployed.

**Important:** Ensure your Supabase **Site URL** (Authentication → URL Configuration) matches your production domain **exactly** so the logo loads correctly in emails.

## Logo Not Loading? Troubleshooting

1. **Verify Site URL in Supabase Dashboard**
   - Go to **Authentication** → **URL Configuration** → **Site URL**
   - Set it to your app's URL (e.g. `https://www.prepsuite.ai` or `https://prepsuite.ai`)
   - Use the same URL your app is deployed at (including www if applicable)
   - Do **not** use a trailing slash

2. **Verify the image is deployed**
   - `public/EmailLogo.jpg` must exist in your repo
   - After build, it should be at `dist/EmailLogo.jpg` and served at the root
   - Test: open `https://your-app-domain.com/EmailLogo.jpg` in a new tab — it should load the image (not redirect to the app)
   - **If it redirects to the landing page:** Your deployment may be serving `index.html` for all routes. The `vercel.json` in this repo excludes static assets (including `EmailLogo.jpg`) from the SPA rewrite. For Netlify, add to `_redirects`: `/* /index.html 200` but ensure static files are served first (they usually are by default).

3. **Email client behavior**
   - Some clients block external images by default; users may need to click "Display images"
   - Gmail may proxy images through googleusercontent.com — this is normal

**With Resend SMTP:** Resend only delivers the email. The logo is fetched by the recipient's email client from your app URL when they open the email. No special Resend configuration is needed.

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

## Resend SMTP Setup

1. In Supabase Dashboard → **Project Settings** → **Auth** → **SMTP Settings**
2. Enable custom SMTP and enter your Resend credentials
3. The email templates (with the logo) work the same—Resend delivers the HTML; the logo loads from your app URL

## Template Files

- `confirmation.html` — Signup confirmation
- `recovery.html` — Password reset
- `magic_link.html` — Magic link sign-in
- `email_change.html` — Email change confirmation
- `invite.html` — User invitation
