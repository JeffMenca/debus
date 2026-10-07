import type { Metadata } from 'next';
import { SystemStatusView } from '@/components/system/system-status-view';

export const metadata: Metadata = { title: 'Estado del sistema · debus' };

export default function EstadoPage() {
  return <SystemStatusView />;
}
