import { SaleStatusController } from './sale-status.controller';

describe('SaleStatusController', () => {
  it('answers with the sale status of the trip', async () => {
    const answer = { tripId: 't', open: false, reason: 'NOT_FOUND' };
    const status = { of: jest.fn().mockResolvedValue(answer) };

    const result = await new SaleStatusController(status as never).saleStatus('t');

    expect(result).toBe(answer);
    expect(status.of).toHaveBeenCalledWith('t');
  });
});
