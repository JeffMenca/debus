import { RouteRepublishController } from './route-republish.controller';

describe('RouteRepublishController', () => {
  it('republishes the routes with the correlation id of the call', async () => {
    const republish = { republish: jest.fn().mockResolvedValue({ republished: 3 }) };

    const result = await new RouteRepublishController(republish as never).republish(
      { branchId: 'branch' },
      'c-9',
    );

    expect(result).toEqual({ republished: 3 });
    expect(republish.republish).toHaveBeenCalledWith('branch', 'c-9');
  });
});
