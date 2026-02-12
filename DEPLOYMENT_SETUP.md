# Deployment Setup Guide

This guide walks you through setting up the CI/CD pipeline and deploying the production-ready RLS policies.

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
3. Copy the contents of `supabase/migrations/20260203_production_rls_policies.sql`
4. Paste and run the SQL in the SQL Editor

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

### 2. Set Up GitHub Secrets (CRITICAL - Required for CI/CD)

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add the following secrets:

#### Firebase Secrets
- `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON (download from Firebase Console)
- `FIREBASE_PROJECT_ID` - Your Firebase project ID

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

### 3. Create Staging Environment (Recommended)

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

**Set up Staging Firebase Hosting:**

1. Create a staging site in Firebase Hosting
2. Configure custom domain: `staging.prepsuite.ai` (or use Firebase subdomain)
3. Add staging secrets to GitHub (see step 2)

---

### 4. Test the CI/CD Pipeline

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
- [ ] Firebase service account JSON added as secret
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

You can manually trigger deployments from GitHub Actions UI:

1. Go to **Actions** → **Deploy** workflow
2. Click **Run workflow**
3. Select environment (staging or production)
4. Click **Run workflow**

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

**Firebase deployment fails:**
- Verify `FIREBASE_SERVICE_ACCOUNT` secret is valid JSON
- Check Firebase project ID is correct
- Ensure Firebase CLI is authenticated

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
- **Rotate secrets regularly** - Update Firebase service account and Supabase tokens periodically
- **Review RLS policies** - Ensure policies match your security requirements
- **Monitor deployments** - Check logs after each deployment

---

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Last Updated:** February 3, 2026
