import { type RentalPaidPayload, rentalPaidPayloadSchema } from './client-payloads';
import { EXAMPLE_IDS } from './fleet-examples';

export const exampleRentalPaid: RentalPaidPayload = {
  rentalId: EXAMPLE_IDS.rental,
  branchId: EXAMPLE_IDS.branch,
  clientId: null,
  nit: '1234567-8',
  clientName: 'Colegio San José',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: '2026-10-24T23:00:00.000Z',
  passengers: 35,
  distanceKm: 92,
  price: 2760,
  paidOn: '2026-10-21',
};

export const CLIENT_EXAMPLES = { RentalPaid: exampleRentalPaid } as const;
export const CLIENT_PAYLOAD_SCHEMAS = { RentalPaid: rentalPaidPayloadSchema } as const;
