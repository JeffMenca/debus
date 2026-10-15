import { ProfilesController } from './profiles.controller';

const actor = {
  userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  role: 'CLIENT' as const,
  branchId: null,
};

describe('ProfilesController', () => {
  it('reads and edits only the profile of whoever is signed in', async () => {
    const profiles = { get: jest.fn().mockResolvedValue('profile'), update: jest.fn() };
    const controller = new ProfilesController(profiles as never);
    const body = { dpi: '2734519200901', phone: '55123489' };

    expect(await controller.get(actor)).toBe('profile');
    await controller.update(actor, body);

    expect(profiles.get).toHaveBeenCalledWith(actor.userId);
    expect(profiles.update).toHaveBeenCalledWith(actor.userId, body);
  });
});
