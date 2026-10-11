#!/usr/bin/env node
// Sends one real test email with the same settings and mailer as the notifications service and prints a
// summary for the team. It never prints credentials or full addresses. Exits with 1 when the send fails.
// Usage: pnpm turbo run build --filter=@debus/notificaciones && [DEBUS_ENV SMTP_USER SMTP_PASSWORD BOOTSTRAP_ADMIN_EMAIL SMTP_HOST SMTP_PORT] node scripts/send-test-email.mjs
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  escapeWorkflowCommand,
  runSmtpCheck,
} = require('../services/notificaciones/dist/mail/smtp-check.js');

const { ok, message } = await runSmtpCheck(process.env);

const summary = `smtp-check: ${ok ? 'OK' : 'FALLO'}. ${message}`;
console.log(summary);
if (!ok) console.log(`::error title=smtp-check::${escapeWorkflowCommand(message)}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
process.exitCode = ok ? 0 : 1;
