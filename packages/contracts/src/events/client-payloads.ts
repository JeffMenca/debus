import { z } from 'zod';
import { fullNameSchema } from '../api/auth';
import { distanceKmSchema } from '../api/fleet';
import { moneySchema } from '../api/settings';
import { isLaterInstant, isoDateSchema } from '../dates';

// clientes publishes it when a confirmed rental is paid; viajes then waits for the branch admin to
// assign a bus and a driver. clientId is null for a walk-in client without an account.
export const rentalPaidPayloadSchema = z
  .object({
    rentalId: z.uuid(),
    branchId: z.uuid(),
    clientId: z.uuid().nullable(),
    nit: z.string().min(1).max(20),
    clientName: z.string().min(1).max(120),
    originLabel: z.string().min(1).max(120),
    destinationLabel: z.string().min(1).max(120),
    departureAt: z.iso.datetime(),
    returnAt: z.iso.datetime().nullable(),
    passengers: z.number().int().positive().max(200),
    distanceKm: distanceKmSchema,
    price: moneySchema,
    paidOn: isoDateSchema,
  })
  .refine((value) => !value.returnAt || isLaterInstant(value.returnAt, value.departureAt), {
    path: ['returnAt'],
    message: 'return must be after departure',
  });
export type RentalPaidPayload = z.infer<typeof rentalPaidPayloadSchema>;

// clientes publishes it when a profile is created or edited; ventas links the counter sales made
// with that NIT to the client. The NIT is normalized and null when the profile has none.
export const profileUpdatedPayloadSchema = z.object({
  clientId: z.uuid(),
  nit: z.string().min(1).max(20).nullable(),
  fullName: fullNameSchema,
  updatedAt: z.iso.datetime(),
});
export type ProfileUpdatedPayload = z.infer<typeof profileUpdatedPayloadSchema>;
