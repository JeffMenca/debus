#!/usr/bin/env node
// Creates or updates Pub/Sub topics, filtered push subscriptions and dead-letters from the event registry.
// Usage: DEBUS_ENV=local|staging|production PUBSUB_PROJECT_ID=<id> [GCP_PROJECT_NUMBER GCP_REGION] node scripts/provision-pubsub.mjs
import { planInputFromEnv, provisionPubSub } from '@debus/messaging';

const input = planInputFromEnv(process.env);
if (input.env === 'local') process.env.PUBSUB_EMULATOR_HOST ??= 'localhost:8085';
await provisionPubSub(input);
