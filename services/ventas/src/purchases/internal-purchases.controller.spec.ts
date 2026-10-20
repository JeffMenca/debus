import { PubSubPushGuard } from '@debus/messaging';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { InternalPurchasesController } from './internal-purchases.controller';

describe('InternalPurchasesController', () => {
  it('runs the recovery and answers what it did', async () => {
    const result = { resumed: 2, stillPending: 1, releasedCounterTickets: 0 };
    const recovery = { recover: jest.fn().mockResolvedValue(result) };

    const answer = await new InternalPurchasesController(recovery as never).recover();

    expect(answer).toBe(result);
    expect(recovery.recover).toHaveBeenCalledTimes(1);
  });

  it('is only for the scheduler: guarded by its identity and left out of the documentation', () => {
    const { recover } = InternalPurchasesController.prototype;

    expect(Reflect.getMetadata(GUARDS_METADATA, recover)).toEqual([PubSubPushGuard]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, recover)).toBe(200);
    expect(
      Reflect.getMetadata(DECORATORS.API_EXCLUDE_CONTROLLER, InternalPurchasesController),
    ).toEqual([true]);
  });
});
