import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/admin/settings-screen';

export const metadata: Metadata = { title: 'Configuración · debus' };

export default function SettingsPage() {
  return <SettingsScreen />;
}
