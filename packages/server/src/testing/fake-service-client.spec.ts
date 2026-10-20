import { z } from 'zod';
import { CircuitOpenError, ServiceUnavailableError } from '../service-client';
import { FakeServiceClient } from './fake-service-client';

const schema = z.object({ ok: z.boolean() });

describe('FakeServiceClient', () => {
  it('answers the registered response of a service and path, without the query', async () => {
    const fake = new FakeServiceClient();
    fake.respond('flota', 'GET', '/internal/availability', { ok: true });

    await expect(
      fake.get('flota', '/internal/availability?busId=1', schema, { correlationId: 'c' }),
    ).resolves.toEqual({ ok: true });
    expect(fake.calls).toEqual([
      {
        service: 'flota',
        method: 'GET',
        path: '/internal/availability?busId=1',
        body: undefined,
        options: { correlationId: 'c' },
      },
    ]);
  });

  it('throws the registered error, for a peer that does not answer', async () => {
    const fake = new FakeServiceClient();
    fake.respond('flota', 'GET', '/x', new ServiceUnavailableError());

    await expect(fake.get('flota', '/x', schema)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('records the body of a write and checks the answer against the schema', async () => {
    const fake = new FakeServiceClient();
    fake.respond('clientes', 'POST', '/wallet/debit', { ok: 'yes' });

    await expect(
      fake.post('clientes', '/wallet/debit', { amount: 5 }, schema, { idempotencyKey: 'k' }),
    ).rejects.toThrow();
    expect(fake.calls[0]).toMatchObject({
      method: 'POST',
      body: { amount: 5 },
      options: { idempotencyKey: 'k' },
    });
  });

  it('fails loudly when a call was not prepared', async () => {
    const fake = new FakeServiceClient();

    await expect(fake.get('flota', '/nope', schema)).rejects.toThrow(
      'No response registered for GET flota /nope',
    );
  });

  it('answers every call of an open circuit with a circuit error, without recording it as sent', async () => {
    const fake = new FakeServiceClient();
    fake.respond('flota', 'GET', '/x', { ok: true });
    fake.openCircuit('flota');

    expect(fake.isOpen('flota')).toBe(true);
    expect(fake.isOpen('viajes')).toBe(false);
    await expect(fake.get('flota', '/x', schema)).rejects.toBeInstanceOf(CircuitOpenError);
    await expect(fake.post('flota', '/x', {}, schema, {})).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fake.calls).toHaveLength(0);
  });

  it('has no circuits to report', () => {
    expect(new FakeServiceClient().circuits()).toEqual([]);
  });
});
