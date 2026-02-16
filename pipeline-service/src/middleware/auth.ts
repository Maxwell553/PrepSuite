import { createMiddleware } from 'hono/factory';
import * as jose from 'jose';
import { logger } from '../lib/logger.js';

export interface AuthUser {
  sub: string;
  email?: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// Cache JWKS keyset to avoid re-fetching on every request
let cachedJWKS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof jose.createRemoteJWKSet> | null {
  if (cachedJWKS) return cachedJWKS;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return null;
  cachedJWKS = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  return cachedJWKS;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  // Try HS256 with secret first (production Supabase)
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    try {
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jose.jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });

      c.set('user', {
        sub: payload.sub as string,
        email: payload.email as string | undefined,
      });

      return next();
    } catch {
      // HS256 failed — fall through to JWKS
    }
  }

  // Try JWKS (local Supabase uses ES256)
  const jwks = getJWKS();
  if (jwks) {
    try {
      const { payload } = await jose.jwtVerify(token, jwks);

      c.set('user', {
        sub: payload.sub as string,
        email: payload.email as string | undefined,
      });

      return next();
    } catch (err) {
      logger.warn({ err }, 'JWT verification failed (JWKS)');
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
  }

  logger.error('No JWT verification method available (set SUPABASE_JWT_SECRET or SUPABASE_URL)');
  return c.json({ error: 'Server misconfigured' }, 500);
});
