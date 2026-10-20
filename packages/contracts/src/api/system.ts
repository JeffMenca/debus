import { z } from 'zod';
import { BACKEND_SERVICES, DEBUS_ENVIRONMENTS, DEPLOY_UNITS } from '../topology';

export const CIRCUIT_STATES = ['closed', 'open', 'half-open'] as const;
export type CircuitState = (typeof CIRCUIT_STATES)[number];

// The state of the connection of one service towards a peer it calls.
export const circuitSchema = z.object({
  target: z.enum(BACKEND_SERVICES),
  state: z.enum(CIRCUIT_STATES),
  failures: z.number().int().nonnegative(),
  retryAt: z.iso.datetime().nullable(),
});
export type Circuit = z.infer<typeof circuitSchema>;

// What every service answers on /health.
export const serviceHealthSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(BACKEND_SERVICES),
  circuits: z.array(circuitSchema),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const unitHealthSchema = z.object({
  unit: z.enum(DEPLOY_UNITS),
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nonnegative(),
  circuits: z.array(circuitSchema).optional(),
});
export type UnitHealth = z.infer<typeof unitHealthSchema>;

export const systemStatusSchema = z.object({
  environment: z.enum(DEBUS_ENVIRONMENTS),
  checkedAt: z.iso.datetime(),
  units: z.array(unitHealthSchema),
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const probeCreatedSchema = z.object({ probeId: z.uuid() });
export type ProbeCreated = z.infer<typeof probeCreatedSchema>;

export const probeDeliverySchema = z.object({
  service: z.enum(BACKEND_SERVICES),
  state: z.enum(['received', 'pending', 'unreachable']),
  receivedAt: z.iso.datetime().optional(),
});
export type ProbeDelivery = z.infer<typeof probeDeliverySchema>;
export type ProbeDeliveryState = ProbeDelivery['state'];

export const probeStatusSchema = z.object({
  probeId: z.uuid(),
  services: z.array(probeDeliverySchema),
});
export type ProbeStatus = z.infer<typeof probeStatusSchema>;
