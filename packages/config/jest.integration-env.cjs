// Integration tests publish to a Pub/Sub project of their own. The services running on this machine
// read the project in their .env, so nothing a test publishes ever reaches them; otherwise their
// databases receive test events long after the cleanup has run.
process.env.PUBSUB_PROJECT_ID = process.env.TEST_PUBSUB_PROJECT_ID ?? 'debus-test';

// Local .env wins; .env.example supplies defaults so tests run on a fresh clone.
require('dotenv').config({ path: ['.env', '.env.example'], quiet: true });
