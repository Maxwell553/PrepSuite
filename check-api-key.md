# How to Check/Set Your Gemini API Key

## Current Status
Your `GEMINI_API_KEY` secret is set in Supabase (you can see it in `supabase secrets list`), but Supabase doesn't allow viewing the actual value for security reasons.

## Option 1: Test if Current Key Works
The best way to verify your API key is correct is to test the function:
1. Run your app and try to search for a player
2. Check the browser console for errors
3. If the function works, your API key is correct

## Option 2: Get Your API Key from Google AI Studio
If you need to retrieve or get a new API key:

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key" or view existing keys
4. Copy the API key

## Option 3: Re-set the Secret
If you have your API key and want to update it:

```bash
supabase secrets set GEMINI_API_KEY=your-actual-api-key-here
```

**Important:** Replace `your-actual-api-key-here` with your actual key from Google AI Studio.

## Option 4: Check Your Local .env File
If you previously had the API key in your `.env.local` file, you can check there:

```bash
# View your .env.local file (if it exists)
cat .env.local | grep GEMINI
```

**Note:** The API key should NOT be in `.env.local` anymore since we moved it to Supabase Edge Functions for security.
