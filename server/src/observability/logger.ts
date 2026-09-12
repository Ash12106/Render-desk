export type LogFields = Record<string, string | number | boolean | null | undefined>;

function write(level: 'info' | 'warn' | 'error', event: string, fields: LogFields = {}) {
  // JSON logs are easy to search in Render and other managed log platforms.
  // Request bodies, authorization headers, and password-reset tokens are never logged.
  console[level](
    JSON.stringify({
      level,
      event,
      timestamp: new Date().toISOString(),
      ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    }),
  );
}

export const logger = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
};
