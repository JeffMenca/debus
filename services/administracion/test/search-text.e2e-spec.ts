import { testEmail } from '@debus/config/test-data';
import { foldSearchText } from '@debus/contracts';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './support/app';
import { createTestBranch } from './support/branches';
import { cleanTestData } from './support/cleanup';

describe('search_text', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await cleanTestData(prisma);
    } finally {
      await app?.close();
    }
  });

  it('folds the name and email of a user, on insert and on update', async () => {
    const user = await prisma.user.create({
      data: { email: testEmail('Search'), fullName: 'José Pérez Ñuñez', role: 'CASHIER' },
    });
    const inserted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(inserted.searchText).toBe(foldSearchText(`José Pérez Ñuñez ${user.email}`));

    await prisma.user.update({ where: { id: user.id }, data: { fullName: 'María Ángel' } });
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.searchText).toContain('maria angel');
  });

  it('folds the name, code and place of a branch', async () => {
    const branch = await createTestBranch(prisma, { department: 'Petén', municipality: 'Flores' });
    const row = await prisma.branch.findUniqueOrThrow({ where: { id: branch.id } });
    expect(row.searchText).toContain('peten');
    expect(row.searchText).toContain(foldSearchText(branch.code));
  });

  it('folds every Latin-1 and Latin Extended-A letter the same way as the application', async () => {
    const letters = Array.from({ length: 0x180 - 0x20 }, (_, i) => String.fromCodePoint(0x20 + i));
    const sample = `x ${letters.join(' ')} x`;

    const rows = await prisma.$queryRaw<{ folded: string }[]>`
      SELECT fold_search_text(${sample}) AS folded`;

    expect(rows[0]?.folded).toBe(foldSearchText(sample));
  });

  it('finds a user whose name carries an accent outside Spanish', async () => {
    const user = await prisma.user.create({
      data: { email: testEmail('François'), fullName: 'François Álvarez', role: 'CASHIER' },
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(row.searchText).toContain(foldSearchText('François Álvarez'));
    expect(row.searchText).toContain('francois alvarez');
  });
});
