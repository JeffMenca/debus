import type { z } from 'zod';
import { accountLinkSentPayloadSchema, userRegisteredPayloadSchema } from './account-payloads';
import { branchChangedPayloadSchema, settingsUpdatedPayloadSchema } from './admin-payloads';
import { CLIENT_PAYLOAD_SCHEMAS } from './client-examples';
import { probeEmittedPayloadSchema } from './envelope';
import { repairExpenseAddedPayloadSchema } from './expense-payloads';
import { FLEET_PAYLOAD_SCHEMAS } from './fleet-examples';
import type { EventType } from './registry';
import { TRIP_PAYLOAD_SCHEMAS } from './trip-examples';

// The contract of every payload, by event type. TicketSold and RefundRequested get theirs with the
// sales pack; until then nothing checks them.
export const EVENT_PAYLOAD_SCHEMAS: Partial<Record<EventType, z.ZodType>> = {
  BranchCreated: branchChangedPayloadSchema,
  BranchUpdated: branchChangedPayloadSchema,
  SettingsUpdated: settingsUpdatedPayloadSchema,
  UserRegistered: userRegisteredPayloadSchema,
  AccountLinkSent: accountLinkSentPayloadSchema,
  RepairExpenseAdded: repairExpenseAddedPayloadSchema,
  ...FLEET_PAYLOAD_SCHEMAS,
  ...TRIP_PAYLOAD_SCHEMAS,
  ...CLIENT_PAYLOAD_SCHEMAS,
  ProbeSent: probeEmittedPayloadSchema,
};

export type PayloadCheck = { valid: true } | { valid: false; reason: string };

export function validateEventPayload(type: EventType, payload: unknown): PayloadCheck {
  const result = EVENT_PAYLOAD_SCHEMAS[type]?.safeParse(payload);
  if (!result || result.success) return { valid: true };
  const reason = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(payload)'}: ${issue.message}`)
    .join('; ');
  return { valid: false, reason };
}
