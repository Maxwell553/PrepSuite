import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'production'
    ? {
        // Cloud Logging structured format
        messageKey: 'message',
        formatters: {
          level(label: string) {
            // Map pino levels to Cloud Logging severity
            const severityMap: Record<string, string> = {
              trace: 'DEBUG',
              debug: 'DEBUG',
              info: 'INFO',
              warn: 'WARNING',
              error: 'ERROR',
              fatal: 'CRITICAL',
            };
            return { severity: severityMap[label] || 'DEFAULT' };
          },
        },
      }
    : {
        transport: { target: 'pino/file', options: { destination: 1 } },
      }),
});
