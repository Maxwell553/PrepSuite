# Auth Production Troubleshooting

If **Google OAuth** or **email signup** fails in production, verify these settings. Most issues come from Supabase URL configuration or Google Cloud Console.

---

## Google OAuth: "Redirects to landing page" or session not established

### 1. Supabase Dashboard → Authentication → URL Configuration

| Setting | Production value |
|---------|------------------|
| **Site URL** | `https://prepsuite.ai` (no trailing slash) |
| **Redirect URLs** | Add both: `https://prepsuite.ai` and `https://prepsuite.ai/**` |

The `redirectTo` in code is `window.location.origin` (e.g. `https://prepsuite.ai`). It must EXACTLY match an entry in Redirect URLs. If it doesn't, Supabase may not append the auth code, and the session will not be established.

### 2. Google Cloud Console → APIs & Services → Credentials

For your OAuth 2.0 Client ID (Web application):

| Setting | Production value |
|---------|------------------|
| **Authorized JavaScript origins** | `https://prepsuite.ai` |
| **Authorized redirect URIs** | `https://[YOUR-PROJECT-ID].supabase.co/auth/v1/callback` |

Get the exact callback URL from Supabase: **Authentication → Providers → Google** → copy the **Callback URL** shown there.

### 3. Code fix (already applied)

When a user signs in via OAuth, the app now automatically dismisses the landing page and shows the dashboard (`SIGNED_IN` event → `setShowLandingPage(false)`).

---

## Email signup: Emails not sent or confirmation links broken

### 1. Custom SMTP (required for production)

Supabase's built-in email provider is limited to **3 emails per hour** and is for testing only. In production, configure custom SMTP:

**Supabase Dashboard → Project Settings → Auth → SMTP Settings**

- Enable custom SMTP
- Use Resend, Brevo, or SendGrid (see docs/DEPLOYMENT_SETUP.md for setup)
- Use a verified sender domain (e.g. `noreply@prepsuite.ai`)

### 2. Email redirect URL

The app now passes `emailRedirectTo: window.location.origin` to `signUp()`, so confirmation links redirect to the correct domain (e.g. `https://prepsuite.ai`).

### 3. Supabase URL Configuration

Same as above: **Site URL** and **Redirect URLs** must include your production domain so confirmation links work.

### 4. Check Auth logs

**Supabase Dashboard → Authentication → Logs**

Look for:
- Email send failures
- Template parsing errors
- Invalid redirect URL errors

---

## Quick checklist

- [ ] `Site URL` = `https://prepsuite.ai`
- [ ] `Redirect URLs` includes `https://prepsuite.ai` and `https://prepsuite.ai/**`
- [ ] Google Cloud: `Authorized JavaScript origins` includes `https://prepsuite.ai`
- [ ] Google Cloud: `Authorized redirect URIs` includes Supabase callback URL
