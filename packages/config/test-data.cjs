// Rows that tests write to a real database are marked with these values, so they can be found and
// removed afterwards. The .test top-level domain is reserved (RFC 2606): no real person owns it.
const { randomUUID } = require('node:crypto');

const TEST_EMAIL_DOMAIN = 'debus.test';
const TEST_BRANCH_PREFIX = 'Prueba ';
// Jest gives every test file its own module registry, so each file gets its own run id and can
// remove exactly what it created.
const TEST_RUN = randomUUID().slice(0, 8);

const testEmail = (label) =>
  `${label}-${TEST_RUN}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@${TEST_EMAIL_DOMAIN}`;

module.exports = { TEST_EMAIL_DOMAIN, TEST_BRANCH_PREFIX, TEST_RUN, testEmail };
