import { GatewayError } from './gateway-client';
import { pendingCopy, untilRegistered } from './retry';

const pending = () =>
  new GatewayError(
    409,
    'Estamos terminando de registrar ese bus. Intenta de nuevo en unos segundos.',
  );

describe('untilRegistered', () => {
  it('returns the result of the first attempt when it works', async () => {
    const work = jest.fn().mockResolvedValue('ok');
    await expect(untilRegistered(work, { delayMs: 0 })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('retries while the copy is still being registered', async () => {
    const work = jest
      .fn()
      .mockRejectedValueOnce(pending())
      .mockRejectedValueOnce(pending())
      .mockResolvedValue('ok');
    await expect(untilRegistered(work, { delayMs: 0 })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('gives up with the last error after the attempts run out', async () => {
    const work = jest.fn().mockRejectedValue(pending());
    await expect(untilRegistered(work, { attempts: 3, delayMs: 0 })).rejects.toThrow(
      'Estamos terminando de registrar',
    );
    expect(work).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['another 409', new GatewayError(409, 'Ya existe un bus con esa placa.')],
    ['a 500', new GatewayError(500, 'Estamos terminando de registrar')],
    ['a plain error', new Error('Estamos terminando de registrar')],
  ])('does not retry %s', async (_label, error) => {
    const work = jest.fn().mockRejectedValue(error);
    await expect(untilRegistered(work, { delayMs: 0 })).rejects.toBe(error);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('waits the delay between attempts', async () => {
    const work = jest.fn().mockRejectedValueOnce(pending()).mockResolvedValue('ok');
    const started = Date.now();
    await untilRegistered(work, { delayMs: 30 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });
});

describe('pendingCopy', () => {
  const isPending = pendingCopy('Elige otra sucursal', 'Aún no tenemos');

  it('matches a 409 that starts with one of the messages', () => {
    expect(isPending(new GatewayError(409, 'Elige otra sucursal activa como destino.'))).toBe(true);
    expect(isPending(new GatewayError(409, 'Aún no tenemos el salario de ese chofer.'))).toBe(true);
  });

  it('does not match other statuses, other messages or other errors', () => {
    expect(isPending(new GatewayError(400, 'Elige otra sucursal activa como destino.'))).toBe(
      false,
    );
    expect(isPending(new GatewayError(409, 'Ya existe una ruta.'))).toBe(false);
    expect(isPending(new Error('Elige otra sucursal'))).toBe(false);
  });

  it('lets untilRegistered retry what it matches', async () => {
    const work = jest
      .fn()
      .mockRejectedValueOnce(new GatewayError(409, 'Aún no tenemos el salario de ese chofer.'))
      .mockResolvedValue('ok');
    await expect(untilRegistered(work, { delayMs: 0, isPending })).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(2);
  });
});
