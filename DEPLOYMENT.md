# Deployment Guide: PrepSuite to prepsuite.ai via Google Cloud (Firebase Hosting)

This guide will help you deploy your PrepSuite application to your custom domain `prepsuite.ai` using Firebase Hosting (part of Google Cloud).

## Prerequisites

1. Google account
2. Node.js installed locally
3. Domain `prepsuite.ai` purchased through Squarespace
4. Firebase CLI installed

## Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

This will open your browser to authenticate with your Google account.

## Step 3: Initialize Firebase in Your Project

```bash
firebase init hosting
```

When prompted:
- **Select "Use an existing project"** or create a new one
- **Public directory:** `dist` (this is where Vite builds your app)
- **Configure as a single-page app:** Yes
- **Set up automatic builds and deploys with GitHub:** No (we'll deploy manually for now)
- **Overwrite index.html:** No (we'll build it first)

## Step 4: Configure Firebase Hosting

Firebase will create a `firebase.json` file. Make sure it looks like this:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

## Step 5: Build Your App for Production

Before deploying, make sure you have your production environment variables set. Create a `.env.production` file:

```bash
VITE_SUPABASE_URL=your-production-supabase-url
VITE_SUPABASE_ANON_KEY=your-production-supabase-anon-key
```

**Note:** Don't commit `.env.production` to git. Add it to `.gitignore`.

Then build:

```bash
npm run build
```

This creates a `dist` folder with your production-ready app.

## Step 6: Deploy to Firebase

```bash
firebase deploy --only hosting
```

Your app will be deployed to a Firebase URL like: `https://your-project-id.web.app`

## Step 7: Connect Your Custom Domain (prepsuite.ai)

### Option A: Using Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Hosting** → **Add custom domain**
4. Enter `prepsuite.ai`
5. Firebase will provide you with DNS records to add

### Option B: Using Firebase CLI

```bash
firebase hosting:channel:deploy production --only hosting
```

Then add your domain in the Firebase Console.

## Step 8: Configure DNS in Squarespace

1. Log in to your Squarespace account
2. Go to **Settings** → **Domains** → **prepsuite.ai**
3. Click **DNS Settings** or **Advanced DNS**
4. Add the DNS records provided by Firebase:

### Required DNS Records:

**A Record:**
- Type: `A`
- Host: `@` (or leave blank)
- Value: `151.101.1.195` (Firebase will provide the actual IP)
- TTL: 3600

**A Record (if needed):**
- Type: `A`
- Host: `@`
- Value: `151.101.65.195` (Firebase may provide multiple IPs)

**CNAME Record:**
- Type: `CNAME`
- Host: `www`
- Value: `your-project-id.web.app` (or the Firebase hosting URL)

**Note:** Firebase will provide exact values when you add the domain. Use those values.

### Important DNS Settings:

- Remove any existing A records pointing to Squarespace (if you're not using Squarespace hosting)
- Make sure the CNAME for `www` points to Firebase
- Wait for DNS propagation (can take up to 48 hours, usually much faster)

## Step 9: SSL Certificate

Firebase automatically provisions SSL certificates for your custom domain. This happens automatically after DNS records are verified (usually within 24 hours).

## Step 10: Verify Deployment

1. Check DNS propagation: Use [whatsmydns.net](https://www.whatsmydns.net/) to verify DNS records
2. Once DNS is propagated, Firebase will automatically issue an SSL certificate
3. Visit `https://prepsuite.ai` to verify your site is live

## Step 11: Set Up Continuous Deployment (Optional)

### Using GitHub Actions:

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Firebase

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          channelId: live
          projectId: your-project-id
```

## Troubleshooting

### DNS Not Propagating
- Wait up to 48 hours for full propagation
- Clear your DNS cache: `sudo dscacheutil -flushcache` (Mac) or `ipconfig /flushdns` (Windows)
- Check DNS records are correct in Squarespace

### SSL Certificate Not Issuing
- Ensure DNS records are correct and propagated
- Wait up to 24 hours after DNS verification
- Check Firebase Console for any errors

### Build Errors
- Ensure all environment variables are set
- Check that `npm run build` works locally first
- Review build logs in Firebase Console

### App Not Loading
- Check browser console for errors
- Verify environment variables are set correctly
- Ensure Supabase edge functions are deployed
- Check Firebase Hosting logs

## Firebase Hosting Pricing

- **Free Tier:** 
  - 10 GB storage
  - 360 MB/day data transfer
  - Perfect for most small to medium sites

- **Blaze Plan (Pay as you go):**
  - $0.026/GB storage
  - $0.15/GB data transfer
  - Only pay for what you use

## Additional Resources

- [Firebase Hosting Documentation](https://firebase.google.com/docs/hosting)
- [Custom Domain Setup](https://firebase.google.com/docs/hosting/custom-domain)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

## Quick Deploy Commands

```bash
# Build and deploy
npm run build
firebase deploy --only hosting

# Deploy with preview channel
firebase hosting:channel:deploy preview

# View deployment history
firebase hosting:sites:list
```
