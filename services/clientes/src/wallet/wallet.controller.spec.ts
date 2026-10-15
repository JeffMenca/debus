import { BadRequestException } from '@nestjs/common';
import { InternalWalletController } from './internal-wallet.controller';
import { WalletController } from './wallet.controller';

const actor = {
  userId: '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a',
  role: 'CLIENT' as const,
  branchId: null,
};
const key = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';
const walletService = () => ({
  get: jest.fn().mockResolvedValue('wallet'),
  topUp: jest.fn().mockResolvedValue('topped up'),
  movements: jest.fn().mockResolvedValue('page'),
  debit: jest.fn().mockResolvedValue('debited'),
});

describe('WalletController', () => {
  it('works only on the wallet of whoever is signed in', async () => {
    const wallet = walletService();
    const controller = new WalletController(wallet as never);
    const topUp = { amount: 100, paidOn: '2026-10-14' };
    const query = { kind: 'all' as const, page: 1, pageSize: 20 };

    expect(await controller.get(actor)).toBe('wallet');
    expect(await controller.topUp(actor, topUp, key)).toBe('topped up');
    expect(await controller.movements(actor, query)).toBe('page');

    expect(wallet.get).toHaveBeenCalledWith(actor.userId);
    expect(wallet.topUp).toHaveBeenCalledWith(actor.userId, key, topUp);
    expect(wallet.movements).toHaveBeenCalledWith(actor.userId, query);
  });

  it('refuses a top-up without a valid idempotency key', () => {
    const controller = new WalletController(walletService() as never);

    expect(() => controller.topUp(actor, { amount: 100, paidOn: '2026-10-14' })).toThrow(
      BadRequestException,
    );
  });
});

describe('InternalWalletController', () => {
  const debit = {
    clientId: actor.userId,
    amount: 30,
    kind: 'TICKET' as const,
    reference: key,
    description: 'Boleto',
    occurredOn: '2026-10-14',
  };

  it('debits with the key ventas sends', async () => {
    const wallet = walletService();

    expect(await new InternalWalletController(wallet as never).debit(debit, key)).toBe('debited');
    expect(wallet.debit).toHaveBeenCalledWith(key, debit);
  });

  it('refuses a debit without a valid idempotency key', () => {
    const controller = new InternalWalletController(walletService() as never);

    expect(() => controller.debit(debit, 'abc')).toThrow(BadRequestException);
  });
});
