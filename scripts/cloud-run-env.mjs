#!/usr/bin/env node
// Prints the --set-env-vars value for one unit, using | as delimiter so values may contain commas.
// Usage: GCP_PROJECT_ID GCP_PROJECT_NUMBER GCP_REGION MEDIA_BUCKET [SMTP_USER SMTP_PASSWORD JWT_PRIVATE_KEY JWT_PUBLIC_KEY BOOTSTRAP_ADMIN_EMAIL DOCS_PASSWORD] node scripts/cloud-run-env.mjs <unit> production
import { cloudRunEnv, readAppSecrets } from '@debus/contracts';

const [unit, env] = process.argv.slice(2);
const settings = {
  projectId: process.env.GCP_PROJECT_ID,
  projectNumber: process.env.GCP_PROJECT_NUMBER,
  region: process.env.GCP_REGION,
  mediaBucket: process.env.MEDIA_BUCKET ?? '',
  appSecrets: readAppSecrets(process.env),
};
const vars = Object.entries(cloudRunEnv(unit, env, settings)).map(
  ([key, value]) => `${key}=${value}`,
);
process.stdout.write(`^|^${vars.join('|')}`);
