import type { PrismaService } from '../../src/prisma/prisma.service';
import { TEST_RUN } from './app';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const uniqueBranchCode = (): string =>
  Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export const uniqueBranchName = (label = 'Sucursal'): string =>
  `Prueba ${TEST_RUN} ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export const branchFields = () => ({
  code: uniqueBranchCode(),
  name: uniqueBranchName(),
  department: 'Quetzaltenango' as const,
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
});

export function createTestBranch(prisma: PrismaService, overrides: { active?: boolean } = {}) {
  return prisma.branch.create({ data: { ...branchFields(), active: overrides.active ?? true } });
}
