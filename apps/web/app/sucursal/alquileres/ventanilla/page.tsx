import type { Metadata } from 'next';
import { RoleGate } from '@/components/auth/role-gate';
import { CounterRentalScreen } from '@/components/rentals/counter-rental-screen';

export const metadata: Metadata = { title: 'Alquiler de ventanilla · debus' };

export default function CounterRentalPage() {
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <CounterRentalScreen />
    </RoleGate>
  );
}
