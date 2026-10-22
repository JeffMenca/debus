import { exampleWalletCredited } from '@debus/contracts';
import { walletCreditedEmail } from './wallet-emails';

describe('wallet emails', () => {
  it('confirms a top-up with the amount, the new balance and the date', () => {
    const message = walletCreditedEmail(exampleWalletCredited);

    expect(message.to).toBe('ana.mendez@correo.com');
    expect(message.subject).toMatch(/^Recargaste Q\s?100\.00 a tu saldo$/);
    expect(message.text).toMatch(/Q\s?135\.50/);
    expect(message.text).toContain('21 de octubre de 2026');
    expect(message.text).toContain('Si no reconoces esta recarga');
  });

  it('confirms a refund with what was returned', () => {
    const message = walletCreditedEmail({
      ...exampleWalletCredited,
      kind: 'REFUND',
      amount: 85,
      description: 'Devolución: Boleto Quetzaltenango - Guatemala, asiento 5',
    });

    expect(message.subject).toMatch(/^Te devolvimos Q\s?85\.00 a tu saldo$/);
    expect(message.text).toContain('Devolución: Boleto Quetzaltenango - Guatemala, asiento 5');
    expect(message.text).not.toContain('Si no reconoces esta recarga');
  });
});
