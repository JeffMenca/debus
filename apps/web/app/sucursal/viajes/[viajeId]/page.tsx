import type { Metadata } from 'next';
import { RoleGate } from '@/components/auth/role-gate';
import { TripDetailScreen } from '@/components/trips/trip-detail-screen';

export const metadata: Metadata = { title: 'Viaje · debus' };

export default async function TripPage({ params }: PageProps<'/sucursal/viajes/[viajeId]'>) {
  const { viajeId } = await params;
  return (
    <RoleGate allowed={['BRANCH_ADMIN']}>
      <TripDetailScreen tripId={viajeId} audience="branch" />
    </RoleGate>
  );
}
