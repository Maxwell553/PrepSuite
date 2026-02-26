/**
 * Structured logger for frontend.
 * Use instead of console.log for consistent formatting and future log aggregation.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation: string;
  message?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

function formatEntry(entry: LogEntry): string {
  const parts = [`[${entry.timestamp}]`, `[${entry.level.toUpperCase()}]`, `[${entry.service}]`, entry.operation];
  if (entry.message) parts.push(entry.message);
  if (entry.durationMs != null) parts.push(`(${entry.durationMs}ms)`);
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    parts.push(JSON.stringify(entry.metadata));
  }
  if (entry.error) parts.push(`Error: ${entry.error.message}`);
  return parts.join(' ');
}

function createEntry(level: LogLevel, service: string, operation: string, opts?: Partial<LogEntry>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    service,
    operation,
    ...opts,
  };
}

function log(level: LogLevel, service: string, operation: string, opts?: Partial<LogEntry>): void {
  const entry = createEntry(level, service, operation, opts);
  const formatted = formatEntry(entry);
  switch (level) {
    case 'debug':
      if (import.meta.env.DEV) console.debug(formatted);
      break;
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      if (opts?.error?.stack && import.meta.env.DEV) console.error(opts.error.stack);
      break;
  }
}

export const logger = {
  debug: (service: string, operation: string, opts?: Partial<LogEntry>) => log('debug', service, operation, opts),
  info: (service: string, operation: string, opts?: Partial<LogEntry>) => log('info', service, operation, opts),
  warn: (service: string, operation: string, opts?: Partial<LogEntry>) => log('warn', service, operation, opts),
  error: (service: string, operation: string, opts?: Partial<LogEntry>) => log('error', service, operation, opts),
};
