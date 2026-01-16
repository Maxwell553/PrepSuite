/**
 * Environment variable validation and configuration
 * Validates required environment variables and provides safe defaults
 */

interface EnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
  isProduction: boolean;
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
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY;
  const isProduction = import.meta.env.PROD;

  const missing: string[] = [];

  if (!supabaseUrl || supabaseUrl === '') {
    missing.push('VITE_SUPABASE_URL');
  }

  if (!supabaseAnonKey || supabaseAnonKey === '') {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  if (!geminiApiKey || geminiApiKey === '') {
    missing.push('VITE_GEMINI_API_KEY or GEMINI_API_KEY');
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

  return {
    supabaseUrl: supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey: supabaseAnonKey || 'placeholder',
    geminiApiKey: geminiApiKey || '',
    isProduction
  };
}

/**
 * Gets the Gemini API key with validation
 */
export function getGeminiApiKey(): string {
  const config = getEnvConfig();
  if (!config.geminiApiKey || config.geminiApiKey === '') {
    throw new EnvValidationError(
      'Gemini API key is required. Please set VITE_GEMINI_API_KEY in your .env.local file.'
    );
  }
  return config.geminiApiKey;
}

/**
 * Checks if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  const config = getEnvConfig();
  return config.supabaseUrl !== 'https://placeholder.supabase.co' && 
         config.supabaseAnonKey !== 'placeholder';
}
