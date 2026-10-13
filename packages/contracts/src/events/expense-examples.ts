import { EXAMPLE_IDS } from './fleet-examples';
import type { RepairExpenseAddedPayload } from './expense-payloads';

export const exampleRepairExpenseAdded: RepairExpenseAddedPayload = {
  expenseId: '5d4e3f2a-8b7c-4d6e-9f0a-1b2c3d4e5f6a',
  branchId: EXAMPLE_IDS.branch,
  busId: EXAMPLE_IDS.bus,
  serviceDate: '2026-10-15',
  total: 2850,
  lines: [
    {
      categoryId: '6e5f4a3b-9c8d-4e7f-8a0b-2c3d4e5f6a7b',
      categoryName: 'Llantas',
      kind: 'PART',
      description: 'Dos llantas delanteras',
      amount: 2400,
    },
    {
      categoryId: '7f6a5b4c-0d9e-4f8a-9b1c-3d4e5f6a7b8c',
      categoryName: 'Cambio de aceite',
      kind: 'LABOR',
      description: 'Cambio de aceite y filtro',
      amount: 450,
    },
  ],
};
