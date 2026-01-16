# How to Find Your Supabase Project Reference ID

Your project reference ID (project ref) is needed to link your local Supabase CLI to your Supabase project.

## Quick Methods

### Method 1: Project Settings (Easiest)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **Settings** (⚙️ icon in left sidebar)
4. Click **General**
5. Find **Reference ID** - copy this string (looks like `abcdefghijklmnop`)

### Method 2: From Browser URL
1. Go to https://supabase.com/dashboard
2. Select your project
3. Look at the URL bar - it shows:
   ```
   https://supabase.com/dashboard/project/YOUR_PROJECT_REF
   ```
4. Copy the part after `/project/`

### Method 3: From API Settings
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Look at **Project URL** - it shows:
   ```
   https://YOUR_PROJECT_REF.supabase.co
   ```
5. Copy the part before `.supabase.co`

## Visual Guide

```
Dashboard → Your Project → Settings → General
                                    ↓
                            Reference ID: abcdefghijklmnop
```

## Example

If your project ref is `abcdefghijklmnop`, you would run:

```bash
supabase link --project-ref abcdefghijklmnop
```

## Don't Have a Project Yet?

1. Go to https://supabase.com/dashboard
2. Click **New Project**
3. Fill in:
   - **Name**: Your project name (e.g., "PrepSuite")
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
4. Click **Create new project**
5. Wait 1-2 minutes for setup
6. Once ready, use Method 1 above to find your Reference ID

## Still Can't Find It?

- Make sure you're logged into the correct Supabase account
- Check that you've selected the right project
- The Reference ID is always 20 characters long
- It's different from your Project ID (which is a UUID)
