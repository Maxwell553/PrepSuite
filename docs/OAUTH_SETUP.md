# PrepSuite Authentication Setup Guide

To enable Google OAuth and Email/Password authentication in PrepSuite, follow these steps in your Supabase Dashboard:

> [!TIP]
> **Finding Providers**: Click on **Authentication** in the left sidebar (user icon), then look at the tabs at the top of the main area. Click on **Providers**.

## 1. Google OAuth Setup
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project (the one used for Gemini).
3. Go to **APIs & Services > OAuth consent screen**.
4. Set User Type to **External**, fill in the app details.
5. Go to **APIs & Services > Credentials**.
6. Click **Create Credentials > OAuth client ID**.
7. **Application type**: `Web application`.
8. **Authorized JavaScript origins**: `http://localhost:3002` (Update this if your port changes).
9. **Authorized redirect URIs**: 
   - Get this from Supabase Dashboard: **Authentication > Providers > Google**.
   - Look for the **Callback URL** in the Google configuration panel.
   - It usually looks like: `https://[PROJECT-ID].supabase.co/auth/v1/callback`
10. Copy the **Client ID** and **Client Secret**.
11. In Supabase Dashboard: Go to **Authentication > Providers > Google**, paste the credentials, and click **Save**.

## 2. Email Magic Link Setup (Default)
Supabase enables Email Magic Links by default with a built-in SMTP provider (limited to 3 emails per hour for testing).
1. In Supabase Dashboard, go to **Authentication > Providers > Email**.
2. Ensure **Enable Email provider** is ON.
3. Ensure **Confirm email** is ON (recommended).
4. Ensure **Secure password change** is ON.

## 3. URL Configuration (CRITICAL)
In Supabase Dashboard, go to **Authentication > URL Configuration** and ensure:

**For local development:**
- **Site URL**: `http://localhost:3002`
- **Redirect URLs**: Add `http://localhost:3002/**` to the list.

**For production (prepsuite.ai):**
- **Site URL**: `https://prepsuite.ai` (no trailing slash)
- **Redirect URLs**: Add `https://prepsuite.ai` and `https://prepsuite.ai/**` to the list.

**Google Cloud Console** (production): Add `https://prepsuite.ai` to Authorized JavaScript origins.

## Why These Methods?
- **Google**: Fastest login for most users, instantly links to their professional identity.
- **Email**: Minimalist and secure. No passwords to leak; users just click a link in their inbox.
