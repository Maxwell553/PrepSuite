# Deployment Setup Guide

This guide walks you through setting up the CI/CD pipeline and deploying the production-ready RLS policies.

---

## 🏠 Local Development

To run the project locally with full analysis (player search → report generation):

1. **Supabase**: Create `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. **Pipeline Service**: The analysis pipeline runs in a **separate** Node service (it does not read from the project root `.env.local`). Start it first:
   ```bash
   cd pipeline-service
   cp .env.example .env
   # Edit pipeline-service/.env: set SUPABASE_JWT_SECRET, SUPABASE_URL, GEMINI_API_KEY
   npm install && npm run dev
   ```
3. **Frontend**: In another terminal, from the project root:
   ```bash
   npm run dev
   ```
   The Vite dev server proxies `/api/*` to the pipeline service at `http://localhost:8080`.

If the pipeline service is not running, player analysis will fail with **HTTP 404** on `/api/analyze`.

---

## 🔴 CRITICAL: What You Need to Do

### 1. Apply RLS Migration (CRITICAL - Do This First)

The production-ready RLS policies need to be applied to your Supabase database.

**Option A: Using Supabase CLI (Recommended)**

```bash
# Make sure you're logged in
supabase login

# Link to your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Apply the migration
supabase db push
```

**Option B: Using Supabase Dashboard**

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run migrations in order (oldest first):
   - `supabase/migrations/20250101_initial_schema.sql`
   - `supabase/migrations/20260203_production_rls_policies.sql`
   - `supabase/migrations/20260209_players_insert_rls_ensure.sql`
   - `supabase/migrations/20260216_players_insert_rls_fix.sql` (fixes 42501 RLS error on save)

**Verify the migration:**

```sql
-- Check that policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('players', 'scouting_reports')
ORDER BY tablename, policyname;
```

You should see:
- `players` table: 4 policies (read, insert, update, delete)
- `scouting_reports` table: 4 policies (read, insert, update, delete)

---

### 2. Fix Email Verification After Custom Domain Change

If you changed your Supabase custom domain and verification emails are no longer arriving or links are broken:

1. **Supabase Dashboard** → **Authentication** → **URL Configuration**
   - **Site URL**: Set to your production domain (e.g. `https://yourdomain.com`), not `localhost`
   - **Redirect URLs**: Add your production URL and any auth callback paths (e.g. `https://yourdomain.com/**`, `https://yourdomain.com/auth/callback`)

2. **Authentication** → **Email Templates**
   - Confirm the **Confirm signup** template uses `{{ .ConfirmationURL }}` (Supabase injects the correct domain)
   - If you edited templates, ensure no syntax errors — invalid variables cause fallback to defaults

3. **Custom SMTP (recommended for production)**
   - Supabase’s default email provider has strict limits and is for testing only
   - **Authentication** → **SMTP Settings** → Configure a provider. Best free options:
     - **Resend** – 3,000 emails/month free, simple setup, good Supabase docs. [resend.com](https://resend.com)
     - **Brevo** (Sendinblue) – 9,000 emails/month free (300/day), generous for low volume
     - **SendGrid** – 100 emails/day free (60-day trial)
   - Use a verified sender/domain that matches your custom domain
   - Check provider logs for delivery issues and spam filters

4. **Auth logs**
   - **Authentication** → **Logs** — look for email send errors or template parsing failures

---

### 3. Set Up GitHub Secrets (CRITICAL - Required for CI/CD)

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add the following secrets:

#### GCP Secrets (for Cloud Run deployment)
- `GCP_SA_KEY` - GCP service account JSON key (with Cloud Build + Cloud Run permissions)
- `GCP_PROJECT_ID` - GCP project ID (e.g., `prepsuite-ai`)

#### Supabase Secrets (Production)
- `VITE_SUPABASE_URL` - Production Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Production Supabase anon key
- `SUPABASE_PROJECT_REF` - Production Supabase project reference ID
- `SUPABASE_ACCESS_TOKEN` - Supabase access token (create in Supabase Dashboard → Account → Access Tokens)

#### Supabase Secrets (Staging - Optional but Recommended)
- `STAGING_VITE_SUPABASE_URL` - Staging Supabase URL
- `STAGING_VITE_SUPABASE_ANON_KEY` - Staging Supabase anon key
- `STAGING_SUPABASE_PROJECT_REF` - Staging Supabase project reference ID

#### Sentry Secrets (Optional)
- `VITE_SENTRY_DSN` - Production Sentry DSN
- `STAGING_VITE_SENTRY_DSN` - Staging Sentry DSN (optional)

---

### 4. Create Staging Environment (Recommended)

**Create a Staging Supabase Project:**

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project for staging
3. Copy the schema from production:
   ```bash
   # Export production schema
   supabase db dump --project-ref PRODUCTION_REF > schema.sql
   
   # Apply to staging
   supabase db push --project-ref STAGING_REF
   ```

**Set up Staging Cloud Run (optional):**

Staging and production both deploy to Cloud Run. Use different Supabase projects for staging vs production data. The same Cloud Run service is overwritten on each deploy.

---

### 5. Test the CI/CD Pipeline

**Test CI (on every PR):**

1. Create a test PR
2. The CI workflow should automatically run:
   - Unit tests
   - E2E tests
   - Build check
   - TypeScript check

**Test Deployment:**

1. **Staging Deployment (automatic on merge to main):**
   - Merge a PR to `main`
   - Check GitHub Actions → Deploy workflow
   - Verify staging site updates

2. **Production Deployment (manual or via tag):**
   - Create a git tag: `git tag v1.0.0 && git push origin v1.0.0`
   - Or use workflow_dispatch in GitHub Actions UI
   - Verify production site updates

---

## 📋 Deployment Checklist

### Before First Deployment

- [ ] RLS migration applied to production database
- [ ] All GitHub secrets configured
- [ ] GCP service account key added as secret
- [ ] Supabase access token created and added as secret
- [ ] Staging environment created (optional but recommended)
- [ ] Test CI pipeline with a PR
- [ ] Test staging deployment
- [ ] Test production deployment

### Before Each Production Deployment

- [ ] All tests passing in CI
- [ ] Code reviewed and approved
- [ ] Staging deployment tested
- [ ] Environment variables verified
- [ ] Database migrations tested in staging
- [ ] Edge functions tested in staging

---

## 🚀 Deployment Workflows

### Automatic Deployments

**Staging:** Automatically deploys when code is merged to `main` branch

**Production:** Automatically deploys when a version tag is pushed (e.g., `v1.0.0`)

### Manual Deployments

**Via GitHub Actions:**
1. Go to **Actions** → **Deploy** workflow
2. Click **Run workflow**
3. Select environment (staging or production)
4. Click **Run workflow**

**Via deploy.sh (local):**
```bash
export VITE_SUPABASE_URL=your_supabase_url
export VITE_SUPABASE_ANON_KEY=your_anon_key
./deploy.sh
```
Prerequisites: `gcloud auth login`, and Secret Manager secrets `supabase-jwt-secret`, `supabase-url`.

---

## 🔧 Troubleshooting

### CI Pipeline Fails

**Tests failing:**
- Check test output in GitHub Actions logs
- Run tests locally: `npm run test:all`
- Fix failing tests before merging

**Build failing:**
- Check build logs in GitHub Actions
- Verify environment variables are set
- Test build locally: `npm run build`

### Deployment Fails

**Cloud Run deployment fails:**
- Verify `GCP_SA_KEY` secret is valid JSON with Cloud Build and Cloud Run permissions
- Check `GCP_PROJECT_ID` matches your GCP project
- Ensure Secret Manager has `supabase-jwt-secret` and `supabase-url` secrets
- Enable Cloud Build API and Cloud Run API on the project

**Supabase deployment fails:**
- Verify `SUPABASE_ACCESS_TOKEN` is valid
- Check project reference ID is correct
- Ensure Supabase CLI is installed in workflow

**Migration fails:**
- Check migration SQL syntax
- Verify database permissions
- Test migration locally first: `supabase db push`

---

## 📝 Post-Deployment Verification

After deployment, verify:

1. **Application:**
   - Site loads correctly
   - Authentication works
   - Search functionality works
   - Report generation works

2. **Database:**
   - RLS policies are active
   - Users can only see their own data
   - Rate limiting is working

3. **Monitoring:**
   - Sentry errors are being tracked
   - Health check endpoint responds
   - No critical errors in logs

---

## 🔐 Security Notes

- **Never commit secrets** - Always use GitHub Secrets
- **Rotate secrets regularly** - Update GCP service account and Supabase tokens periodically
- **Review RLS policies** - Ensure policies match your security requirements
- **Monitor deployments** - Check logs after each deployment

---

## 🔧 Troubleshooting: Report Generation Fails (546 / WORKER_LIMIT)

If you see **"Function failed due to not having enough compute resources"** or status **546** when generating a report:

1. **Restart Supabase functions** – Stop `supabase functions serve` (Ctrl+C) and start it again.
2. **Use `oneshot` policy** – In `supabase/config.toml`, set `[edge_runtime] policy = "oneshot"` (avoids worker pool limits).
3. **Reduce game limit** – Lower the game limit (e.g. 500) in the search form to shrink the payload.
4. **Retry** – Wait a minute and try again; the error is often transient.

---

## 🔧 Troubleshooting: FIDE Request Timeout (Local Dev)

If FIDE profile/search requests fail with **"Request timeout"** when running the pipeline locally (but work in production):

1. **Use the proxy** – Set `PROXY_BASE_URL` in `pipeline-service/.env` to your deployed Cloud Run URL (e.g. `https://prepsuite-xxx.run.app`). FIDE requests will be routed through the deployed service, which has better connectivity to `ratings.fide.com`.
2. **Timeouts** – Dev and production now use the same longer timeouts (45s fetch, 25s body read).

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Last Updated:** February 3, 2026
