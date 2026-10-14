import { EXAMPLE_IDS } from './fleet-examples';
import {
  type RefundRequestedPayload,
  type TicketSoldPayload,
  refundRequestedPayloadSchema,
  ticketSoldPayloadSchema,
} from './sales-payloads';
import { exampleTripScheduled } from './trip-examples';

export const SALES_EXAMPLE_IDS = {
  ticket: '8e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b',
  counterTicket: '9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c',
  client: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
} as const;

const trip = {
  tripId: EXAMPLE_IDS.trip,
  routeId: EXAMPLE_IDS.route,
  branchId: EXAMPLE_IDS.branch,
  busId: EXAMPLE_IDS.bus,
  originLabel: exampleTripScheduled.originLabel,
  destinationLabel: exampleTripScheduled.destinationLabel,
  departureAt: exampleTripScheduled.departureAt,
};

export const exampleTicketSold: TicketSoldPayload = {
  ...trip,
  ticketId: SALES_EXAMPLE_IDS.ticket,
  channel: 'ONLINE',
  clientId: SALES_EXAMPLE_IDS.client,
  nit: '12345678',
  buyerName: 'Ana López',
  email: 'ana.lopez@debus.test',
  seats: [12, 13],
  unitPrice: 85,
  total: 170,
  paidOn: '2026-10-13',
  soldAt: '2026-10-13T15:20:00.000Z',
};

export const exampleCounterTicketSold: TicketSoldPayload = {
  ...trip,
  ticketId: SALES_EXAMPLE_IDS.counterTicket,
  channel: 'COUNTER',
  clientId: null,
  nit: 'CF',
  buyerName: 'Consumidor final',
  email: null,
  seats: [20],
  unitPrice: 85,
  total: 85,
  paidOn: '2026-10-13',
  soldAt: '2026-10-13T16:05:00.000Z',
};

export const exampleRefundRequested: RefundRequestedPayload = {
  ticketId: SALES_EXAMPLE_IDS.ticket,
  tripId: EXAMPLE_IDS.trip,
  clientId: SALES_EXAMPLE_IDS.client,
  nit: exampleTicketSold.nit,
  seats: exampleTicketSold.seats,
  amount: exampleTicketSold.total,
  reason: 'TRIP_DELETED',
  originLabel: trip.originLabel,
  destinationLabel: trip.destinationLabel,
  departureAt: trip.departureAt,
  requestedAt: '2026-10-15T09:00:00.000Z',
};

export const SALES_PAYLOAD_SCHEMAS = {
  TicketSold: ticketSoldPayloadSchema,
  RefundRequested: refundRequestedPayloadSchema,
} as const;

export const SALES_EXAMPLES: Record<string, unknown> = {
  TicketSold: exampleTicketSold,
  'TicketSold at the counter': exampleCounterTicketSold,
  RefundRequested: exampleRefundRequested,
};
