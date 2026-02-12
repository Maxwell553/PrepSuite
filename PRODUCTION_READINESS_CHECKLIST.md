# Production Readiness Checklist

**Last Updated:** January 26, 2026  
**Status:** Pre-Production - Critical fixes in progress

This checklist outlines the steps needed to get PrepSuite production-ready. Items are prioritized by criticality.

---

## 🔴 CRITICAL (Must Complete Before Production)

### 1. Security & Database

#### ✅ Already Completed:
- [x] API keys moved to Supabase Edge Functions
- [x] RLS policies tightened (migrations created)
- [x] Input validation with Zod schemas added
- [x] CORS restricted to allowed origins

#### 🔲 Still Required:

**1.1 Apply Latest Database Migration**
```bash
# Apply the RLS fix migration
supabase db push

# Verify migration applied
supabase db diff
```

**1.2 Verify Edge Functions Are Deployed**
```bash
# Check functions are deployed
supabase functions list

# Deploy if needed
supabase functions deploy gemini-identity
supabase functions deploy gemini-report
supabase functions deploy delete-user

# Verify secrets are set
supabase secrets list
# Should show: GEMINI_API_KEY and optionally ALLOWED_ORIGINS
```

**1.3 Set Production Secrets**
```bash
# Set production allowed origins
supabase secrets set ALLOWED_ORIGINS="https://prepsuite.ai,https://www.prepsuite.ai"

# Verify GEMINI_API_KEY is set (should already be set)
supabase secrets list
```

**1.4 Verify No API Keys in Production Build**
```bash
# Build for production
npm run build

# Check for exposed keys
grep -r "GEMINI_API_KEY\|AIza" dist/ || echo "✅ No API keys found"
```

**1.5 Add Rate Limiting**
- [ ] Implement rate limiting per user/IP in edge functions
- [ ] Add database-level rate limiting (optional but recommended)
- [ ] Set up usage quotas per user tier

---

### 2. Error Tracking & Monitoring

**2.1 Set Up Error Tracking (Sentry)**
```bash
# Install Sentry
npm install @sentry/react @sentry/tracing

# Create sentry.config.ts (see below)
# Add Sentry initialization to index.tsx
```

**2.2 Set Up Application Performance Monitoring**
- [ ] Configure Sentry Performance Monitoring
- [ ] Set up error alerts
- [ ] Create error tracking dashboard

**2.3 Replace Console Logging**
- [ ] Replace `console.log` with structured logging
- [ ] Add log levels (debug, info, warn, error)
- [ ] Remove sensitive data from logs
- [ ] Set up log aggregation (optional: LogRocket, Datadog)

**2.4 Add Health Check Endpoint**
- [ ] Create `/health` endpoint in edge function
- [ ] Check database connectivity
- [ ] Check external API availability
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)

---

### 3. Testing Infrastructure

**3.1 Set Up Testing Framework**
```bash
# Install Vitest (recommended for Vite)
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom

# Create vitest.config.ts
# Add test scripts to package.json
```

**3.2 Write Critical Tests**
- [ ] Unit tests for services (identity, gameAnalysis, playerRepository)
- [ ] Integration tests for critical flows (search → analysis → save)
- [ ] Edge function tests
- [ ] Achieve minimum 70% code coverage

**3.3 Set Up E2E Testing (Optional but Recommended)**
```bash
# Install Playwright
npm install -D @playwright/test

# Create E2E tests for:
# - User registration/login
# - Player search and report generation
# - Report saving and retrieval
```

---

### 4. CI/CD Pipeline

**4.1 Set Up GitHub Actions**
```bash
# Create .github/workflows/ci.yml
# Create .github/workflows/deploy.yml
```

**4.2 Configure CI Pipeline**
- [ ] Run tests on every PR
- [ ] Run linting and type checking
- [ ] Build production bundle
- [ ] Run security scans (optional)

**4.3 Configure CD Pipeline**
- [ ] Deploy to staging on merge to `develop`
- [ ] Deploy to production on merge to `main`
- [ ] Add manual approval for production
- [ ] Set up rollback capability

**4.4 Set Up Staging Environment**
- [ ] Create staging Supabase project
- [ ] Configure staging Firebase hosting
- [ ] Set up staging environment variables
- [ ] Test deployments in staging first

---

### 5. Database & Infrastructure

**5.1 Set Up Database Backups**
- [ ] Enable automated Supabase backups
- [ ] Document recovery procedures
- [ ] Test restore process
- [ ] Set up point-in-time recovery (if needed)

**5.2 Verify Production Environment Variables**
```bash
# Create .env.production (DO NOT COMMIT)
VITE_SUPABASE_URL=your-production-supabase-url
VITE_SUPABASE_ANON_KEY=your-production-supabase-anon-key

# Verify .env.production is in .gitignore
```

**5.3 Set Up Monitoring Dashboards**
- [ ] Create Supabase Analytics dashboard
- [ ] Set up API usage tracking
- [ ] Monitor edge function performance
- [ ] Track error rates and trends

---

## 🟡 HIGH PRIORITY (Should Complete Soon)

### 6. Performance Optimization

**6.1 Implement Code Splitting**
- [ ] Add React.lazy() for route-based splitting
- [ ] Lazy load heavy components (ReportDashboard, AnalysisBoard)
- [ ] Dynamic imports for large dependencies (Stockfish, Recharts)

**6.2 Add Request Caching**
- [ ] Cache player profiles (Redis or Supabase cache)
- [ ] Cache game data with TTL (24 hours)
- [ ] Implement stale-while-revalidate pattern

**6.3 Optimize Bundle Size**
```bash
# Install bundle analyzer
npm install -D rollup-plugin-visualizer

# Analyze bundle
npm run build -- --analyze
```

**6.4 Add Pagination**
- [ ] Implement pagination for game fetching
- [ ] Process games in batches
- [ ] Add "Load More" functionality

---

### 7. Documentation

**7.1 Update README**
- [ ] Add project description
- [ ] Document setup process
- [ ] List environment variables
- [ ] Add troubleshooting section

**7.2 Create Operations Runbook**
- [ ] Document common issues and solutions
- [ ] Document how to handle API outages
- [ ] Document scaling procedures
- [ ] Add incident response procedures

**7.3 API Documentation**
- [ ] Document edge function endpoints
- [ ] Document request/response formats
- [ ] Add example requests

---

## 🟢 MEDIUM PRIORITY (Nice to Have)

### 8. Code Quality

**8.1 Type Safety**
- [ ] Remove all `any` types
- [ ] Enable strict TypeScript mode
- [ ] Add proper null checks

**8.2 Code Organization**
- [ ] Refactor large files (SearchScreen.tsx)
- [ ] Extract reusable logic
- [ ] Add code organization guidelines

**8.3 Accessibility**
- [ ] Add ARIA labels
- [ ] Keyboard navigation support
- [ ] Screen reader testing
- [ ] Color contrast checks

---

## 📋 Quick Start: Minimum Viable Production

**To get to a basic production-ready state, complete these items:**

### Week 1: Critical Security & Monitoring
1. ✅ Apply database migrations (`supabase db push`)
2. ✅ Verify edge functions deployed
3. ✅ Set up Sentry error tracking
4. ✅ Replace console logging with structured logging
5. ✅ Add health check endpoint

### Week 2: Testing & CI/CD
1. Set up Vitest
2. Write critical unit tests (70% coverage)
3. Set up GitHub Actions CI
4. Create staging environment
5. Set up automated deployments

### Week 3: Performance & Documentation
1. Implement code splitting
2. Add request caching
3. Optimize bundle size
4. Update README
5. Create operations runbook

---

## 🚀 Deployment Steps

### Pre-Deployment Checklist

- [ ] All critical security items completed
- [ ] Tests passing
- [ ] Production build successful
- [ ] No API keys in build
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Edge functions deployed
- [ ] Error tracking configured
- [ ] Monitoring dashboards set up

### Deployment Process

1. **Build Production Bundle**
   ```bash
   npm run build
   ```

2. **Verify Build**
   ```bash
   # Check for errors
   # Verify no API keys exposed
   grep -r "AIza\|GEMINI_API_KEY" dist/ || echo "✅ Clean"
   ```

3. **Deploy to Firebase**
   ```bash
   firebase deploy --only hosting
   ```

4. **Verify Deployment**
   - Check site loads at `https://prepsuite.ai`
   - Test critical flows (search, generate report)
   - Check error tracking (Sentry)
   - Monitor edge function logs

---

## 📊 Progress Tracking

### Critical Items: 5/10 Complete (50%)
- [x] API keys secured
- [x] RLS policies tightened
- [x] Input validation added
- [x] CORS restricted
- [ ] Error tracking (Sentry)
- [ ] Testing infrastructure
- [ ] CI/CD pipeline
- [ ] Database backups
- [ ] Monitoring dashboards
- [ ] Health checks

### High Priority Items: 0/4 Complete (0%)
- [ ] Code splitting
- [ ] Request caching
- [ ] Bundle optimization
- [ ] Pagination

---

## 🎯 Recommended Timeline

**Minimum Viable Production (MVP):** 2-3 weeks
- Week 1: Security & Monitoring
- Week 2: Testing & CI/CD
- Week 3: Performance & Polish

**Full Production Ready:** 6-8 weeks
- Includes all critical, high, and medium priority items

---

## 📝 Notes

- **Current Status:** Many critical security fixes have been completed. Focus now on monitoring, testing, and CI/CD.
- **Priority Order:** Security → Monitoring → Testing → CI/CD → Performance → Documentation
- **Risk Assessment:** The app is currently suitable for beta testing with limited users, but needs monitoring and testing before public release.

---

## 🔗 Related Documentation

- `PRODUCTION_READINESS_ANALYSIS.md` - Detailed analysis of all issues
- `DEPLOYMENT.md` - Firebase hosting deployment guide
- `SETUP_CHECKLIST.md` - Edge functions setup guide
- `SECURITY_FIXES_SUMMARY.md` - Summary of security fixes completed

---

**Next Steps:**
1. Review this checklist
2. Prioritize items based on your timeline
3. Start with Critical items (Week 1)
4. Set up staging environment for testing
5. Deploy to production once critical items are complete
