import { branchChangedPayloadSchema, settingsUpdatedPayloadSchema } from './admin-payloads';

describe('admin payloads', () => {
  it('describes a branch snapshot with its version', () => {
    const payload = {
      branchId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      code: 'XEL',
      name: 'Quetzaltenango',
      department: 'Quetzaltenango',
      municipality: 'Quetzaltenango',
      address: '4a calle 12-30 zona 1',
      phone: '77612233',
      latitude: 14.8347,
      longitude: -91.5181,
      active: true,
      version: 1,
    };
    expect(branchChangedPayloadSchema.parse(payload)).toEqual(payload);
    expect(branchChangedPayloadSchema.safeParse({ ...payload, version: 0 }).success).toBe(false);
  });

  it('describes a settings version', () => {
    const payload = {
      versionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      depreciationPerKm: 1.25,
      rentalRatePerKm: 12,
      effectiveFrom: '2026-10-10',
      createdAt: '2026-10-10T15:00:00.000Z',
    };
    expect(settingsUpdatedPayloadSchema.parse(payload)).toEqual(payload);
  });
});
