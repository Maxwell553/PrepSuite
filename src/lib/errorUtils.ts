/**
 * Utility functions for error handling and user-friendly error messages
 */

export interface ErrorContext {
  operation: string;
  source?: string;
  statusCode?: number;
}

/**
 * Converts various error types into user-friendly messages
 */
export function getUserFriendlyError(error: unknown, context?: ErrorContext): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const operation = context?.operation || 'operation';

    // Abort/timeout (e.g. AbortSignal.timeout, user abort)
    if (error.name === 'AbortError' || message.includes('aborted')) {
      return `Request timed out. The ${operation} is taking longer than expected. Please try again with fewer games.`;
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
      return `Network error. Please check your internet connection and try again.`;
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return `Request timed out. The ${operation} is taking longer than expected. Please try again.`;
    }

    // Backend AI service auth (Vertex/Gemini) - not user login
    if (message.includes('gemini api error: 401') || message.includes('ai service error: 401')) {
      return `AI service temporarily unavailable. Please try again in a moment.`;
    }

    // User authentication errors (Supabase)
    if (message.includes('401') || message.includes('unauthorized') || message.includes('authentication')) {
      return `Authentication failed. Please log in again.`;
    }

    if (message.includes('403') || message.includes('forbidden') || message.includes('permission')) {
      return `Permission denied. You don't have access to perform this ${operation}.`;
    }

    // Rate limiting / Resource exhausted
    if (message.includes('429') || message.includes('quota') || message.includes('rate limit') || 
        message.includes('resource exhausted') || message.includes('resource_exhausted')) {
      return `API rate limit exceeded. The request was too large or you've made too many requests. Please wait a few minutes and try again, or try with fewer games.`;
    }

    // Server errors
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return `Server error. The service is temporarily unavailable. Please try again later.`;
    }

    // Database/RLS errors
    if (message.includes('rls') || message.includes('row level security')) {
      return `Database permission error. Please check your account permissions.`;
    }

    // Not found errors
    if (message.includes('404') || message.includes('not found')) {
      return `The requested resource was not found.`;
    }

    // API key errors
    if (message.includes('api key') || message.includes('api_key') || message.includes('invalid key')) {
      return `API configuration error. Please check your API key settings.`;
    }

    // Return the original message if it's already user-friendly
    if (error.message.length < 100 && !error.message.includes('at ') && !error.message.includes('Error:')) {
      return error.message;
    }
  }

  // Fallback for unknown error types
  return `An unexpected error occurred${context ? ` during ${context.operation}` : ''}. Please try again.`;
}

/**
 * Logs error with context for debugging
 */
export function logError(error: unknown, context?: ErrorContext) {
  const contextStr = context 
    ? `[${context.operation}${context.source ? ` - ${context.source}` : ''}]`
    : '';
  
  console.error(`${contextStr} Error:`, error);
  
  if (error instanceof Error && error.stack) {
    console.error('Stack trace:', error.stack);
  }
}

/**
 * Checks if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('fetch') || 
           message.includes('failed to fetch') ||
           message.includes('networkerror');
  }
  return false;
}

/**
 * Checks if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors, timeouts, aborts, and 5xx errors are retryable
    return isNetworkError(error) ||
           error.name === 'AbortError' ||
           message.includes('aborted') ||
           message.includes('timeout') ||
           message.includes('500') ||
           message.includes('502') ||
           message.includes('503') ||
           message.includes('504');
  }
  return false;
}
