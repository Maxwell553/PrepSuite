/**
 * Sentry error tracking and performance monitoring configuration
 */

import * as Sentry from '@sentry/react';
import { getEnvConfig } from './env';

/**
 * Initialize Sentry for error tracking and performance monitoring
 * Only initializes in production or when SENTRY_DSN is provided
 */
export function initSentry() {
  const config = getEnvConfig();
  const dsn = config.sentryDsn;
  
  // Only initialize Sentry if DSN is provided and we're in production
  if (!dsn || !config.isProduction) {
    console.log('[Sentry] Not initialized - DSN not provided or not in production');
    return;
  }

  Sentry.init({
    dsn,
    environment: config.isProduction ? 'production' : 'development',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: config.isProduction ? 0.1 : 1.0, // 10% of transactions in production
    // Session Replay
    replaysSessionSampleRate: config.isProduction ? 0.1 : 1.0, // 10% of sessions in production
    replaysOnErrorSampleRate: 1.0, // Always record sessions with errors
    
    // Filter out known non-critical errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'atomicFindClose',
      // Network errors that are handled gracefully
      'NetworkError',
      'Failed to fetch',
      // Supabase specific
      'JWTExpired',
    ],
    
    beforeSend(event, hint) {
      // Don't send events in development unless explicitly testing
      if (!config.isProduction && !import.meta.env.VITE_SENTRY_ENABLE_DEV) {
        return null;
      }
      
      // Filter out sensitive data
      if (event.request) {
        // Remove sensitive headers
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['apikey'];
        }
      }
      
      return event;
    },
  });

  console.log('[Sentry] Initialized successfully');
}

/**
 * Set user context for Sentry
 */
export function setSentryUser(user: { id: string; email?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
}

/**
 * Clear user context
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}
