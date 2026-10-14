import type { Metadata } from 'next';
import { TripDetailScreen } from '@/components/trips/trip-detail-screen';

export const metadata: Metadata = { title: 'Viaje · debus' };

// The layout of /chofer already keeps everyone but drivers out.
export default async function DriverTripPage({ params }: PageProps<'/chofer/viajes/[viajeId]'>) {
  const { viajeId } = await params;
  return <TripDetailScreen tripId={viajeId} audience="driver" />;
}
