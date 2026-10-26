import { PubSubPushGuard } from '@debus/messaging';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { InternalEmailsController } from './internal-emails.controller';

describe('InternalEmailsController', () => {
  it('flushes the queue and answers what it sent', async () => {
    const queue = { flush: jest.fn().mockResolvedValue({ sent: 2, failed: 1 }) };

    expect(await new InternalEmailsController(queue as never).flush()).toEqual({
      sent: 2,
      failed: 1,
    });
  });

  it('is only for the scheduler: guarded by its identity and left out of the documentation', () => {
    const { flush } = InternalEmailsController.prototype;

    expect(Reflect.getMetadata(GUARDS_METADATA, flush)).toEqual([PubSubPushGuard]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, flush)).toBe(200);
    expect(
      Reflect.getMetadata(DECORATORS.API_EXCLUDE_CONTROLLER, InternalEmailsController),
    ).toEqual([true]);
  });
});
