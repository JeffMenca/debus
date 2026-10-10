#!/usr/bin/env node
// Fails the deploy early, with variable names only, when a unit would start without its required values.
// Usage: [SMTP_USER SMTP_PASSWORD JWT_PRIVATE_KEY JWT_PUBLIC_KEY BOOTSTRAP_ADMIN_EMAIL] node scripts/check-release-env.mjs <unit>
import { missingAppValues, readAppSecrets } from '@debus/contracts';

const [unit] = process.argv.slice(2);
const missing = missingAppValues(unit, readAppSecrets(process.env));
if (missing.length > 0) {
  console.error(
    `${unit} cannot start without: ${missing.join(', ')}. Add them in GitHub (Settings > Secrets and variables > Actions) and run the deploy again.`,
  );
  process.exit(1);
}
