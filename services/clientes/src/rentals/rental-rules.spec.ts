import { Prisma } from '../generated/prisma/client';
import type { Rental as RentalRow } from '../generated/prisma/client';
import {
  cancelProblem,
  confirmProblem,
  departurePassed,
  historyWhere,
  paymentProblem,
  paymentReplayProblem,
  rentalPaymentDescription,
  rentalSearchText,
  toRentalConfirmed,
  toRentalPaid,
  visibleTo,
} from './rental-rules';

const NOW = new Date('2026-10-21T15:00:00.000Z');
const CLIENT = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';
const BRANCH = '9b2c7a10-1111-4c4c-8888-123456789abc';

const row = (over: Partial<RentalRow> = {}): RentalRow => ({
  id: '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c',
  channel: 'ONLINE',
  status: 'CONFIRMED',
  branchId: BRANCH,
  clientId: CLIENT,
  nit: '45218376',
  clientName: 'Ana López',
  email: 'ana.lopez@correo.com',
  originLabel: 'Quetzaltenango',
  destinationLabel: 'Panajachel',
  departureAt: new Date('2026-10-24T13:00:00.000Z'),
  returnAt: new Date('2026-10-24T23:00:00.000Z'),
  passengers: 35,
  distanceKm: new Prisma.Decimal(92),
  ratePerKm: new Prisma.Decimal(30),
  estimatedPrice: new Prisma.Decimal(2760),
  price: new Prisma.Decimal(2500),
  searchText: '',
  requestedAt: new Date('2026-10-20T15:00:00.000Z'),
  createdById: CLIENT,
  confirmedAt: new Date('2026-10-21T14:00:00.000Z'),
  confirmedById: null,
  paidOn: null,
  paidAt: null,
  cancelledAt: null,
  ...over,
});

const client = { userId: CLIENT, role: 'CLIENT' as const, branchId: null };
const admin = {
  userId: 'a0000000-0000-4000-8000-000000000001',
  role: 'BRANCH_ADMIN' as const,
  branchId: BRANCH,
};

describe('rental rules', () => {
  it('searches by client, NIT, origin and destination without accents', () => {
    expect(
      rentalSearchText({
        clientName: 'Colegio San José',
        nit: 'CF',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Panajachel',
      }),
    ).toBe('colegio san jose cf quetzaltenango panajachel');
  });

  it('knows when the departure already passed', () => {
    expect(departurePassed(new Date('2026-10-21T14:59:59.000Z'), NOW)).toBe(true);
    expect(departurePassed(new Date('2026-10-21T15:00:01.000Z'), NOW)).toBe(false);
  });

  describe('visibleTo', () => {
    it('shows a client only their own online rentals and an admin those of their branch', () => {
      expect(visibleTo(row(), client)).toBe(true);
      expect(visibleTo(row({ clientId: null, channel: 'COUNTER' }), client)).toBe(false);
      expect(visibleTo(row(), admin)).toBe(true);
      expect(visibleTo(row({ branchId: CLIENT }), admin)).toBe(false);
      expect(visibleTo(row(), { ...admin, role: 'CASHIER' })).toBe(false);
    });
  });

  describe('confirmProblem', () => {
    it('confirms only a rental still waiting for its price', () => {
      expect(confirmProblem(row({ status: 'REQUESTED', price: null }))).toBeNull();
      expect(confirmProblem(row())).toBe('rentalNotRequested');
      expect(confirmProblem(row({ status: 'CANCELLED' }))).toBe('rentalCancelled');
    });
  });

  describe('paymentProblem', () => {
    it('lets the client pay a confirmed online rental before it leaves', () => {
      expect(paymentProblem(row(), client, NOW)).toBeNull();
    });

    it('lets the branch admin take the cash of a confirmed counter rental', () => {
      const counter = row({ channel: 'COUNTER', clientId: null });
      expect(paymentProblem(counter, admin, NOW)).toBeNull();
    });

    it('leaves an online rental to its client', () => {
      expect(paymentProblem(row(), admin, NOW)).toBe('rentalPaidByClient');
    });

    it('refuses a cancelled rental, one without price and one that already left', () => {
      expect(paymentProblem(row({ status: 'CANCELLED' }), client, NOW)).toBe('rentalCancelled');
      expect(paymentProblem(row({ status: 'REQUESTED', price: null }), client, NOW)).toBe(
        'rentalNotConfirmed',
      );
      expect(
        paymentProblem(row({ departureAt: new Date('2026-10-21T10:00:00Z') }), client, NOW),
      ).toBe('departurePassed');
    });

    it('lets a paid rental through, for the retry to answer what was recorded', () => {
      const paid = row({ status: 'PAID', departureAt: new Date('2026-10-21T10:00:00Z') });
      expect(paymentProblem(paid, client, NOW)).toBeNull();
    });
  });

  describe('paymentReplayProblem', () => {
    it('repeats a payment of the same day and refuses one of another day', () => {
      const paid = row({ status: 'PAID', paidOn: new Date('2026-10-21T00:00:00Z'), paidAt: NOW });
      expect(paymentReplayProblem(paid, '2026-10-21')).toBeNull();
      expect(paymentReplayProblem(paid, '2026-10-20')).toBe('keyReused');
    });
  });

  describe('cancelProblem', () => {
    it('cancels what is not paid yet, and a cancelled one again changes nothing', () => {
      expect(cancelProblem(row({ status: 'REQUESTED', price: null }))).toBeNull();
      expect(cancelProblem(row())).toBeNull();
      expect(cancelProblem(row({ status: 'CANCELLED' }))).toBeNull();
      expect(cancelProblem(row({ status: 'PAID' }))).toBe('rentalAlreadyPaid');
    });
  });

  describe('historyWhere', () => {
    it('adds the counter rentals made with the NIT of the profile', () => {
      expect(historyWhere({ userId: CLIENT, nit: '45218376' })).toEqual({
        OR: [{ clientId: CLIENT }, { clientId: null, nit: '45218376' }],
      });
    });

    it('lists only the own rentals without a NIT or with the final consumer', () => {
      expect(historyWhere({ userId: CLIENT, nit: null })).toEqual({ clientId: CLIENT });
      expect(historyWhere({ userId: CLIENT, nit: 'CF' })).toEqual({ clientId: CLIENT });
    });
  });

  it('describes the wallet debit with the trip', () => {
    expect(rentalPaymentDescription(row())).toBe('Alquiler Quetzaltenango - Panajachel');
    expect(rentalPaymentDescription(row({ originLabel: 'x'.repeat(250) }))).toHaveLength(200);
  });

  describe('toRentalPaid', () => {
    it('announces the paid rental with the email that confirms it', () => {
      const paid = row({ status: 'PAID', paidOn: new Date('2026-10-21T00:00:00Z'), paidAt: NOW });
      expect(toRentalPaid(paid)).toEqual({
        rentalId: paid.id,
        branchId: BRANCH,
        clientId: CLIENT,
        nit: '45218376',
        clientName: 'Ana López',
        email: 'ana.lopez@correo.com',
        originLabel: 'Quetzaltenango',
        destinationLabel: 'Panajachel',
        departureAt: '2026-10-24T13:00:00.000Z',
        returnAt: '2026-10-24T23:00:00.000Z',
        passengers: 35,
        distanceKm: 92,
        price: 2500,
        paidOn: '2026-10-21',
      });
    });

    it('carries a counter rental without account or email', () => {
      const paid = row({
        channel: 'COUNTER',
        clientId: null,
        nit: 'CF',
        email: null,
        returnAt: null,
        status: 'PAID',
        paidOn: new Date('2026-10-21T00:00:00Z'),
        paidAt: NOW,
      });
      expect(toRentalPaid(paid)).toMatchObject({ clientId: null, email: null, returnAt: null });
    });
  });

  it('announces the confirmed price of an online rental', () => {
    expect(toRentalConfirmed(row())).toEqual({
      rentalId: row().id,
      branchId: BRANCH,
      clientId: CLIENT,
      email: 'ana.lopez@correo.com',
      clientName: 'Ana López',
      originLabel: 'Quetzaltenango',
      destinationLabel: 'Panajachel',
      departureAt: '2026-10-24T13:00:00.000Z',
      returnAt: '2026-10-24T23:00:00.000Z',
      passengers: 35,
      distanceKm: 92,
      price: 2500,
      confirmedAt: '2026-10-21T14:00:00.000Z',
    });
  });
});
