import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const config = new ConfigService({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' });

  it('requires DATABASE_URL', () => {
    expect(() => new PrismaService(new ConfigService({}))).toThrow();
  });

  it('disconnects when the module is destroyed', async () => {
    const service = new PrismaService(config);
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
