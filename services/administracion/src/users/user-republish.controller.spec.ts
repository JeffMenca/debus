import { UserRepublishController } from './user-republish.controller';

describe('UserRepublishController', () => {
  it('republishes the branch admins, of one branch if asked, with the correlation id', async () => {
    const republish = { republish: jest.fn().mockResolvedValue({ republished: 3 }) };
    const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';

    const result = await new UserRepublishController(republish as never).republish(
      { branchId },
      'c-9',
    );

    expect(result).toEqual({ republished: 3 });
    expect(republish.republish).toHaveBeenCalledWith(branchId, 'c-9');
  });
});
