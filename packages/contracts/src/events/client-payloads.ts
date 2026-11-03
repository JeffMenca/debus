import { z } from 'zod';
import { emailSchema, fullNameSchema } from '../api/auth';
import { distanceKmSchema } from '../api/fleet';
import { moneySchema } from '../api/settings';
import { isLaterInstant, isoDateSchema } from '../dates';

// The trip and the price both rental events carry.
const rentalTripFields = {
  originLabel: z.string().min(1).max(120),
  destinationLabel: z.string().min(1).max(120),
  departureAt: z.iso.datetime(),
  returnAt: z.iso.datetime().nullable(),
  passengers: z.number().int().positive().max(200),
  distanceKm: distanceKmSchema,
  price: moneySchema,
};

const returnAfterDeparture = <
  T extends z.ZodType<{ departureAt: string; returnAt: string | null }>,
>(
  schema: T,
) =>
  schema.refine((value) => !value.returnAt || isLaterInstant(value.returnAt, value.departureAt), {
    path: ['returnAt'],
    message: 'return must be after departure',
  });

// clientes publishes it when a confirmed rental is paid; viajes then waits for the branch admin to
// assign a bus and a driver. clientId is null for a walk-in client without an account.
export const rentalPaidPayloadSchema = returnAfterDeparture(
  z.object({
    rentalId: z.uuid(),
    branchId: z.uuid(),
    clientId: z.uuid().nullable(),
    nit: z.string().min(1).max(20),
    clientName: z.string().min(1).max(120),
    // Where the confirmation goes: the profile email, or the one taken at the counter (null if none).
    email: emailSchema.nullable(),
    ...rentalTripFields,
    paidOn: isoDateSchema,
  }),
);
export type RentalPaidPayload = z.infer<typeof rentalPaidPayloadSchema>;

// clientes publishes it when the branch admin confirms the price of an online rental or records a
// counter rental for a client, so notificaciones can tell the client it is ready to be paid.
export const rentalConfirmedPayloadSchema = returnAfterDeparture(
  z.object({
    rentalId: z.uuid(),
    branchId: z.uuid(),
    clientId: z.uuid(),
    email: emailSchema,
    clientName: z.string().min(1).max(120),
    ...rentalTripFields,
    confirmedAt: z.iso.datetime(),
  }),
);
export type RentalConfirmedPayload = z.infer<typeof rentalConfirmedPayloadSchema>;

// clientes publishes it when a profile is created or edited; ventas links the counter sales made
// with that NIT to the client. The NIT is normalized and null when the profile has none.
export const profileUpdatedPayloadSchema = z.object({
  clientId: z.uuid(),
  nit: z.string().min(1).max(20).nullable(),
  fullName: fullNameSchema,
  updatedAt: z.iso.datetime(),
});
export type ProfileUpdatedPayload = z.infer<typeof profileUpdatedPayloadSchema>;

export const WALLET_CREDIT_KINDS = ['TOP_UP', 'REFUND'] as const;

// clientes publishes it when money lands in a wallet (a top-up or the refund of a cancelled trip),
// once per movement; notificaciones tells the client.
export const walletCreditedPayloadSchema = z.object({
  movementId: z.uuid(),
  clientId: z.uuid(),
  email: emailSchema,
  fullName: fullNameSchema,
  kind: z.enum(WALLET_CREDIT_KINDS),
  amount: moneySchema,
  balanceAfter: moneySchema,
  description: z.string().min(1).max(200),
  occurredOn: isoDateSchema,
  creditedAt: z.iso.datetime(),
});
export type WalletCreditedPayload = z.infer<typeof walletCreditedPayloadSchema>;
