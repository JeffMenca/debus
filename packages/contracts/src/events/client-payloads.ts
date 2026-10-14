import { z } from 'zod';
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
