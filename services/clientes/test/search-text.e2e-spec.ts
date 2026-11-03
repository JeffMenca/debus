import { foldSearchText } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { testProfiles } from './support/profiles';

describe('search_text of the client profiles', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let profiles: ReturnType<typeof testProfiles>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    profiles = testProfiles(prisma);
  });
  afterAll(async () => {
    await profiles.cleanUp();
    await app.close();
  });

  it('folds every Latin-1 and Latin Extended-A letter the same way as the application', async () => {
    const letters = Array.from({ length: 0x180 - 0x20 }, (_, i) => String.fromCodePoint(0x20 + i));
    const sample = `x ${letters.join(' ')} x`;

    const [row] = await prisma.$queryRaw<{ folded: string }[]>`
      SELECT fold_search_text(${sample}) AS folded`;

    expect(row?.folded).toBe(foldSearchText(sample));
  });

  it('holds the name, the email and the NIT with and without its hyphen', async () => {
    const userId = await profiles.create({ nit: '1234567K' });
    await prisma.clientProfile.update({
      where: { userId },
      data: { fullName: 'François Ågård' },
    });

    const { searchText, email } = await prisma.clientProfile.findUniqueOrThrow({
      where: { userId },
    });

    expect(searchText).toContain(foldSearchText('François Ågård'));
    expect(searchText).toContain(foldSearchText(email));
    expect(searchText).toContain('1234567k');
    expect(searchText).toContain('1234567-k');
  });
});
