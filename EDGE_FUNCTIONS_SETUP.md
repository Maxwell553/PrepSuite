# Supabase Edge Functions Setup Guide

This guide explains how to set up the Supabase Edge Functions to securely handle Gemini API calls.

## Prerequisites

1. Supabase CLI installed:
   - **macOS/Linux**: `brew install supabase/tap/supabase`
   - **Windows**: `scoop install supabase` (after adding supabase bucket)
   - Or download from: https://github.com/supabase/cli/releases
2. Supabase project created
3. Gemini API key from Google AI Studio

## Setup Steps

### 1. Initialize Supabase Functions (if not already done)

```bash
supabase init
```

### 2. Link to Your Supabase Project

```bash
supabase link --project-ref your-project-ref
```

### 3. Set the Gemini API Key Secret

Set the Gemini API key as a secret in Supabase:

```bash
supabase secrets set GEMINI_API_KEY=your-gemini-api-key-here
```

**Important**: Never commit your API key to version control. Use Supabase secrets.

### 4. Deploy the Edge Functions

Deploy all functions:

```bash
# Deploy identity resolution function
supabase functions deploy gemini-identity

# Deploy report generation function
supabase functions deploy gemini-report

# Deploy user deletion function
supabase functions deploy delete-user
```

### 5. Verify Deployment

Check that functions are deployed:

```bash
supabase functions list
```

## Edge Functions Overview

### `gemini-identity`
- **Purpose**: Handles username discovery via web search
- **Endpoint**: `/functions/v1/gemini-identity`
- **Input**: `{ prompt: string }`
- **Output**: `{ text: string }`
- **Features**: Includes Google Search Retrieval for finding Chess.com/Lichess profiles

### `gemini-report`
- **Purpose**: Generates scouting reports with structured JSON output
- **Endpoint**: `/functions/v1/gemini-report`
- **Input**: `{ prompt: string | Array, responseSchema: object }`
- **Output**: `{ data: ScoutingReport }`
- **Features**: Uses JSON schema for structured responses

### `delete-user`
- **Purpose**: Handles user account deletion and data cleanup
- **Endpoint**: `/functions/v1/delete-user`
- **Input**: None (uses Authorization header for authentication)
- **Output**: `{ success: boolean, message: string }`
- **Features**: 
  - Requires authenticated user (JWT token)
  - Deletes all user's scouting reports
  - Permanently deletes user account from auth.users
  - Uses Supabase Admin API for account deletion

## Environment Variables

The Edge Functions use Supabase secrets for sensitive data:

- `GEMINI_API_KEY`: Your Google Gemini API key (set via `supabase secrets set`)

**Note**: The `delete-user` function uses Supabase's automatically available environment variables:
- `SUPABASE_URL`: Automatically provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Automatically provided by Supabase (for admin operations)
- `SUPABASE_ANON_KEY`: Automatically provided by Supabase

## Testing Locally

You can test Edge Functions locally:

```bash
# Start local Supabase
supabase start

# Test identity function
curl -X POST http://localhost:54321/functions/v1/gemini-identity \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Find Chess.com username for Max Ingargiola"}'

# Test report function
curl -X POST http://localhost:54321/functions/v1/gemini-report \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze chess games...", "responseSchema": {...}}'
```

## Security Notes

1. **API Key Protection**: The Gemini API key is stored as a Supabase secret and never exposed to the client
2. **CORS**: Functions include CORS headers for cross-origin requests
3. **Authentication**: Functions can be protected with RLS policies if needed
4. **Rate Limiting**: Consider adding rate limiting in production

## Troubleshooting

### Function Not Found
- Ensure functions are deployed: `supabase functions list`
- Check function names match exactly

### API Key Error
- Verify secret is set: `supabase secrets list`
- Ensure secret name is `GEMINI_API_KEY` (case-sensitive)

### CORS Issues
- Check that CORS headers are included in responses
- Verify request includes proper headers

## Migration from Client-Side API Calls

The client code has been updated to use Edge Functions instead of direct API calls:

- `services/identity.ts`: Now uses `geminiService.generateContentWithSearch()`
- `components/SearchScreen.tsx`: Now uses `geminiService.generateContentWithSchema()`
- `lib/env.ts`: No longer needs `VITE_GEMINI_API_KEY` (can be removed from `.env.local`)

## Next Steps

1. Remove `VITE_GEMINI_API_KEY` from your `.env.local` file
2. Deploy functions to production
3. Update your Supabase project settings if needed
4. Test the functions in production environment
