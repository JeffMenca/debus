import type { Metadata } from 'next';
import { RoleGate } from '@/components/auth/role-gate';
import { RepairExpenseForm } from '@/components/expenses/repair-expense-form';

export const metadata: Metadata = { title: 'Nuevo gasto de taller · debus' };

export default function NewExpensePage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <RepairExpenseForm />
    </RoleGate>
  );
}
