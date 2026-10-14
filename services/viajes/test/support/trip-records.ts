import { randomUUID } from 'node:crypto';

// The departure and the arrival of a trip, as the rows the cycle writes, for tests that need a trip
// already on the road or already arrived. Nested in a trip: `{ departure: { create: departureOf() } }`.
export const departureOf = (over: { departedAt?: Date; startMileageKm?: number } = {}) => ({
  departedAt: new Date('2030-01-01T12:05:00Z'),
  startMileageKm: 1000,
  recordedById: randomUUID(),
  recordedByRole: 'BRANCH_ADMIN' as const,
  ...over,
});

export const arrivalOf = (over: { arrivedAt?: Date } = {}) => ({
  arrivedAt: new Date('2030-01-01T16:10:00Z'),
  endMileageKm: 1200,
  fuelCost: 900,
  distanceKm: 200,
  depreciationPerKm: 0.85,
  depreciationAmount: 170,
  driverPay: 300,
  settingsVersionId: randomUUID(),
  recordedById: randomUUID(),
  recordedByRole: 'DRIVER' as const,
  ...over,
});
