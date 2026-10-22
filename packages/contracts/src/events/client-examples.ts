import {
  type ProfileUpdatedPayload,
  type RentalPaidPayload,
  type WalletCreditedPayload,
  profileUpdatedPayloadSchema,
  rentalPaidPayloadSchema,
  walletCreditedPayloadSchema,
} from './client-payloads';
import { EXAMPLE_IDS } from './fleet-examples';

export const exampleRentalPaid: RentalPaidPayload = {
  rentalId: EXAMPLE_IDS.rental,
  branchId: EXAMPLE_IDS.branch,
  clientId: null,
  nit: '1234567-8',
  clientName: 'Colegio San José',
  email: 'reservas@colegio.edu.gt',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: '2026-10-24T13:00:00.000Z',
  returnAt: '2026-10-24T23:00:00.000Z',
  passengers: 35,
  distanceKm: 92,
  price: 2760,
  paidOn: '2026-10-21',
};

export const exampleProfileUpdated: ProfileUpdatedPayload = {
  clientId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  nit: '45218376',
  fullName: 'Ana Méndez',
  updatedAt: '2026-10-18T15:30:00.000Z',
};

export const exampleWalletCredited: WalletCreditedPayload = {
  movementId: '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b',
  clientId: exampleProfileUpdated.clientId,
  email: 'ana.mendez@correo.com',
  fullName: 'Ana Méndez',
  kind: 'TOP_UP',
  amount: 100,
  balanceAfter: 135.5,
  description: 'Recarga de saldo',
  occurredOn: '2026-10-21',
  creditedAt: '2026-10-21T16:05:00.000Z',
};

export const CLIENT_EXAMPLES = {
  RentalPaid: exampleRentalPaid,
  ProfileUpdated: exampleProfileUpdated,
  WalletCredited: exampleWalletCredited,
} as const;
export const CLIENT_PAYLOAD_SCHEMAS = {
  RentalPaid: rentalPaidPayloadSchema,
  ProfileUpdated: profileUpdatedPayloadSchema,
  WalletCredited: walletCreditedPayloadSchema,
} as const;
