import { correlationIdFor } from './correlation-id';

// Credentials must never reach the logs: tokens, cookies and the platform's own credential.
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-serverless-authorization"]',
  'res.headers["set-cookie"]',
];

// Shared pino-http options so every service logs the same way and hides the same secrets.
export function httpLoggerOptions() {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    genReqId: correlationIdFor,
    redact: { paths: [...REDACTED_PATHS], censor: '[redacted]' },
  };
}
