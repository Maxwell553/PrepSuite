/**
 * CORS configuration for Supabase Edge Functions
 * Restricts origins to production domain and localhost for development
 */

function getAllowedOrigins(): string[] {
  // Get allowed origins from environment variable or use defaults
  const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
  const isProduction = Deno.env.get('ENVIRONMENT') === 'production';
  
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim());
  }
  
  // Production: strict origin list only
  if (isProduction) {
    return [
      'https://prepsuite.ai',
      'https://www.prepsuite.ai',
    ];
  }
  
  // Development: allow localhost for development (any port)
  const defaultOrigins = [
    'http://localhost:*',  // Allow any localhost port for development
    'http://127.0.0.1:*',  // Allow any 127.0.0.1 port for development
  ];
  
  return defaultOrigins;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  
  // If no origin provided (e.g., same-origin request or server-side)
  if (!origin) {
    const isDevelopment = Deno.env.get('ENVIRONMENT') !== 'production';
    // In production, never allow wildcard - use first allowed origin
    // In development, allow wildcard for local testing
    return {
      'Access-Control-Allow-Origin': isDevelopment ? '*' : (allowedOrigins[0] || 'https://prepsuite.ai'),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400', // 24 hours
    };
  }
  
  // Always allow localhost for development (even when ENVIRONMENT=production on deployed functions)
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  if (isLocalhost) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    };
  }

  // Check if origin is allowed
  const isAllowed = allowedOrigins.some(allowed => {
    // Exact match
    if (origin === allowed) return true;
    // Wildcard match (e.g., http://localhost:* or *.prepsuite.ai)
    if (allowed.includes('*')) {
      const escaped = allowed
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^:]*');
      try {
        return new RegExp(`^${escaped}$`).test(origin);
      } catch (e) {
        console.error('[CORS] Regex error for pattern:', allowed, e);
        return false;
      }
    }
    return false;
  });

  const isDevelopment = Deno.env.get('ENVIRONMENT') !== 'production';
  
  // Return allowed origin or fallback
  let allowedOrigin: string;
  if (isAllowed) {
    allowedOrigin = origin;
  } else {
    // Production: never use wildcard, use first allowed origin
    // Development: use wildcard for convenience
    allowedOrigin = isDevelopment ? '*' : (allowedOrigins[0] || 'https://prepsuite.ai');
  }
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

export function getCorsHeadersForRequest(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  return getCorsHeaders(origin);
}

// For backward compatibility, export default headers (will use first allowed origin)
export const corsHeaders = getCorsHeaders(null);
