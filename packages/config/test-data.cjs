// Rows that tests write to a real database are marked with these values, so they can be found and
// removed afterwards. The .test top-level domain is reserved (RFC 2606): no real person owns it.
const { randomUUID } = require('node:crypto');

const TEST_EMAIL_DOMAIN = 'debus.test';
const TEST_BRANCH_PREFIX = 'Prueba ';
// Jest gives every test file its own module registry, so each file gets its own run id and can
// remove exactly what it created.
const TEST_RUN = randomUUID().slice(0, 8);

// A test that needs a database of its own (it changes what is global to the database) works in a
// schema like this one, and drops it when it ends. The name carries the second the run started, so
// `pnpm test:clean` without --run drops only the schemas a dead run left (older than
// STALE_SCHEMA_SECONDS) and never one that an integration run in progress is using.
const TEST_SCHEMA_PREFIX = 'test_run_';
const STALE_SCHEMA_SECONDS = 3600;
const TEST_STARTED_AT = Math.floor(Date.now() / 1000);
const testSchema = (label) => `${TEST_SCHEMA_PREFIX}${TEST_RUN}_${TEST_STARTED_AT}_${label}`;

const testEmail = (label) =>
  `${label}-${TEST_RUN}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@${TEST_EMAIL_DOMAIN}`;

module.exports = {
  TEST_EMAIL_DOMAIN,
  TEST_BRANCH_PREFIX,
  TEST_SCHEMA_PREFIX,
  STALE_SCHEMA_SECONDS,
  TEST_RUN,
  testEmail,
  testSchema,
};
