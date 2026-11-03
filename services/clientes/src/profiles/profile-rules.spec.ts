import { profileUpdatedPayloadSchema } from '@debus/contracts';
import { toProfileRow, toProfileUpdated, toRecoveredProfileRow } from './profile-rules';

const base = {
  userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  email: 'ana@correo.com',
  fullName: 'Ana Méndez',
  branchId: null,
};

describe('toProfileRow', () => {
  it('copies what the client entered when signing up', () => {
    const profile = { dpi: '2734519200901', phone: '55123489', nit: '45218376', address: null };

    expect(toProfileRow({ ...base, role: 'CLIENT', profile })).toEqual({
      userId: base.userId,
      email: base.email,
      fullName: base.fullName,
      role: 'CLIENT',
      ...profile,
      accountVersion: 0,
    });
  });

  it('leaves the client fields empty for staff, who sign up without them', () => {
    expect(toProfileRow({ ...base, role: 'CASHIER', profile: null })).toMatchObject({
      role: 'CASHIER',
      dpi: null,
      phone: null,
      nit: null,
      address: null,
    });
  });
});

it('starts at the version of the registration', () => {
  expect(toProfileRow({ ...base, role: 'CASHIER', profile: null, version: 4 })).toMatchObject({
    accountVersion: 4,
  });
});

describe('toRecoveredProfileRow', () => {
  const account = {
    ...base,
    role: 'CASHIER' as const,
    branchId: '3f2e1d0c-9b8a-4c7d-8e6f-5a4b3c2d1e0f',
    active: true,
    version: 3,
  };

  it('rebuilds the profile of an active account without the client fields', () => {
    expect(toRecoveredProfileRow(account)).toEqual({
      userId: base.userId,
      email: base.email,
      fullName: base.fullName,
      role: 'CASHIER',
      dpi: null,
      phone: null,
      nit: null,
      address: null,
      accountVersion: 0,
    });
  });

  it('holds a row for a deactivated account too, without taking its version yet', () => {
    expect(toRecoveredProfileRow({ ...account, active: false })).toMatchObject({
      userId: base.userId,
      accountVersion: 0,
    });
  });
});

describe('toProfileUpdated', () => {
  it('tells ventas the NIT the profile holds now, as the contract expects', () => {
    const payload = toProfileUpdated({
      userId: base.userId,
      fullName: base.fullName,
      nit: '45218376',
      updatedAt: new Date('2026-10-18T15:30:00.000Z'),
    });

    expect(payload).toEqual({
      clientId: base.userId,
      nit: '45218376',
      fullName: base.fullName,
      updatedAt: '2026-10-18T15:30:00.000Z',
    });
    expect(profileUpdatedPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
