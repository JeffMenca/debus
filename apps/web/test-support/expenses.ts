import type { ExpenseCategory, RepairExpense } from '@debus/contracts';
import { BRANCH_ID } from './fleet';

export const CATEGORY_IDS = {
  engine: '1b2c3d4e-5f60-4a71-8b82-93a4b5c6d7e8',
  tires: '2c3d4e5f-6071-4b82-9c93-a4b5c6d7e8f9',
} as const;

export const category = (over: Partial<ExpenseCategory> = {}): ExpenseCategory => ({
  id: CATEGORY_IDS.engine,
  name: 'Motor',
  active: true,
  inUse: false,
  ...over,
});

export const repairExpense = (over: Partial<RepairExpense> = {}): RepairExpense => ({
  id: '3d4e5f60-7182-4c93-8da4-b5c6d7e8f9a0',
  branchId: BRANCH_ID,
  busId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  busPlate: 'C482BTX',
  serviceDate: '2026-10-20',
  total: 5200,
  laborTotal: 1200,
  partsTotal: 4000,
  lines: [
    {
      categoryId: CATEGORY_IDS.engine,
      categoryName: 'Motor',
      kind: 'LABOR',
      description: 'Cambio de bomba',
      amount: 1200,
    },
    {
      categoryId: CATEGORY_IDS.tires,
      categoryName: 'Llantas',
      kind: 'PART',
      description: 'Dos llantas traseras',
      amount: 4000,
    },
  ],
  ...over,
});

export const page = <T>(items: T[], over: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  ...over,
});
