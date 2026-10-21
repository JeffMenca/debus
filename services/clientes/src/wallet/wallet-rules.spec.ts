import {
  isSameIntent,
  movementFingerprint,
  paymentWindowClosed,
  refundAmount,
  refundDescription,
  signedAmount,
} from './wallet-rules';

const topUp = { kind: 'TOP_UP' as const, amount: 100.1, occurredOn: '2026-10-14', reference: null };
const key = '3f2e4d1c-8b0a-4f8e-9d6c-5b4a3f2e4d1c';

describe('wallet rules', () => {
  it('fingerprints a movement by what it does, in cents, so floats never differ', () => {
    expect(movementFingerprint(topUp)).toBe('TOP_UP|10010|2026-10-14|');
    expect(movementFingerprint({ ...topUp, amount: 0.1 + 0.2 })).toBe(
      movementFingerprint({ ...topUp, amount: 0.3 }),
    );
    expect(movementFingerprint({ ...topUp, kind: 'TICKET', reference: key })).toBe(
      `TICKET|10010|2026-10-14|${key}`,
    );
  });

  it('lets a repeated request through only when it asks for the same thing', () => {
    const fingerprint = movementFingerprint(topUp);

    expect(isSameIntent({ fingerprint }, fingerprint)).toBe(true);
    expect(isSameIntent({ fingerprint }, movementFingerprint({ ...topUp, amount: 200 }))).toBe(
      false,
    );
  });

  it('credits top-ups and refunds and debits tickets and rentals', () => {
    expect(signedAmount('TOP_UP', 50)).toBe(50);
    expect(signedAmount('REFUND', 50)).toBe(50);
    expect(signedAmount('TICKET', 50)).toBe(-50);
    expect(signedAmount('RENTAL', 50)).toBe(-50);
  });

  it('closes the payment window only after the moment it names', () => {
    const payBy = '2026-10-19T16:40:00.000Z';

    expect(paymentWindowClosed(payBy, new Date('2026-10-19T16:39:59.999Z'))).toBe(false);
    expect(paymentWindowClosed(payBy, new Date('2026-10-19T16:40:00.000Z'))).toBe(false);
    expect(paymentWindowClosed(payBy, new Date('2026-10-19T16:40:00.001Z'))).toBe(true);
  });

  it('never closes the window of a debit that sets no deadline', () => {
    expect(paymentWindowClosed(undefined, new Date('2999-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('describes a refund with the description of the debit it returns', () => {
    expect(refundDescription('Boleto Quetzaltenango - Guatemala, asiento 5')).toBe(
      'Devolución: Boleto Quetzaltenango - Guatemala, asiento 5',
    );
    expect(refundDescription('x'.repeat(200))).toHaveLength(200);
  });

  it('returns exactly what the debit took from the wallet', () => {
    expect(refundAmount(-85)).toBe(85);
    expect(refundAmount(-0.1 - 0.2)).toBe(0.3);
  });
});
