/**
 * Environment variable validation and configuration
 * Validates required environment variables and provides safe defaults
 */

interface EnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  isProduction: boolean;
  sentryDsn?: string;
}

class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates and retrieves environment variables
 * Throws descriptive errors if critical variables are missing
 */
export function getEnvConfig(): EnvConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isProduction = import.meta.env.PROD;

  const missing: string[] = [];

  if (!supabaseUrl || supabaseUrl === '') {
    missing.push('VITE_SUPABASE_URL');
  }

  if (!supabaseAnonKey || supabaseAnonKey === '') {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  if (missing.length > 0) {
    const errorMessage = `Missing required environment variables: ${missing.join(', ')}\n\n` +
      `Please create a .env.local file with:\n` +
      missing.map(v => `  ${v}=your_value_here`).join('\n');
    
    if (isProduction) {
      throw new EnvValidationError(errorMessage);
    } else {
      console.error('⚠️ Environment Configuration Error:', errorMessage);
      // In development, we'll use placeholders but warn the user
    }
  }

  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

  return {
    supabaseUrl: supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey: supabaseAnonKey || 'placeholder',
    isProduction,
    sentryDsn: sentryDsn || undefined,
  };
}

/**
 * DEPRECATED: Gemini API key is server-side only (pipeline service).
 * This function is kept for backward compatibility but should not be used.
 * All Gemini API calls go through the pipeline service.
 */
export function getGeminiApiKey(): string {
  throw new EnvValidationError(
    'Gemini API key is server-side only. The pipeline service handles all AI calls.'
  );
}

/**
 * Checks if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  const config = getEnvConfig();
  return config.supabaseUrl !== 'https://placeholder.supabase.co' && 
         config.supabaseAnonKey !== 'placeholder';
}
