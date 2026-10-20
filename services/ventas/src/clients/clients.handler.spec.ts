import { createEnvelope, exampleProfileUpdated } from '@debus/contracts';
import { ClientsHandler } from './clients.handler';

const envelope = createEnvelope('ProfileUpdated', exampleProfileUpdated, 'c');
const sqlClient = (copied = 1) => ({
  $executeRawUnsafe: jest.fn().mockResolvedValueOnce(copied).mockResolvedValue(2),
  $queryRawUnsafe: jest.fn(),
});

describe('ClientsHandler', () => {
  it('keeps the newest NIT of the client and links the counter sales made with it', async () => {
    const tx = sqlClient();

    await new ClientsHandler({} as never).profileUpdated(exampleProfileUpdated, envelope, tx);

    const [[copySql, ...copyValues], [linkSql, ...linkValues]] = tx.$executeRawUnsafe.mock.calls;
    expect(copySql).toContain('ON CONFLICT (client_id) DO UPDATE');
    expect(copySql).toContain('WHERE client_nits.updated_at < EXCLUDED.updated_at');
    expect(copyValues).toEqual([
      exampleProfileUpdated.clientId,
      '45218376',
      'Ana Méndez',
      exampleProfileUpdated.updatedAt,
    ]);
    expect(linkSql).toContain("channel = 'COUNTER'");
    expect(linkSql).toContain('client_id IS NULL');
    expect(linkValues).toEqual([exampleProfileUpdated.clientId, '45218376']);
  });

  it('links nothing when the event is older than the copy', async () => {
    const tx = sqlClient(0);

    await new ClientsHandler({} as never).profileUpdated(exampleProfileUpdated, envelope, tx);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('links nothing for a profile without NIT', async () => {
    const tx = sqlClient();
    const payload = { ...exampleProfileUpdated, nit: null };

    await new ClientsHandler({} as never).profileUpdated(payload, envelope, tx);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('uses the service client when the inbox gives no transaction', async () => {
    const prisma = sqlClient();

    await new ClientsHandler(prisma as never).profileUpdated(exampleProfileUpdated, envelope);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed payload before writing', async () => {
    const tx = sqlClient();

    await expect(
      new ClientsHandler({} as never).profileUpdated({ clientId: 'x' }, envelope, tx),
    ).rejects.toThrow();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
