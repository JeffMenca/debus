import { SettingsController } from './settings.controller';

const actor = {
  userId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'SYSTEM_ADMIN' as const,
  branchId: null,
};

describe('SettingsController', () => {
  const setup = () => {
    const settings = {
      overview: jest.fn().mockResolvedValue({ current: null, versions: [] }),
      create: jest.fn().mockResolvedValue({ id: 'v' }),
    };
    return { settings, controller: new SettingsController(settings as never) };
  };

  it('shows the overview', async () => {
    const { settings, controller } = setup();

    expect(await controller.overview()).toEqual({ current: null, versions: [] });
    expect(settings.overview).toHaveBeenCalledTimes(1);
  });

  it('schedules a version on behalf of the caller', async () => {
    const { settings, controller } = setup();
    const body = { depreciationPerKm: 1, rentalRatePerKm: 2, effectiveFrom: '2026-10-10' };

    expect(await controller.create(actor, body, 'c')).toEqual({ id: 'v' });
    expect(settings.create).toHaveBeenCalledWith(actor, body, 'c');
  });
});
