import type { BusDisplayStatus } from '@debus/contracts';
import type { BusTone } from '@/components/brand/bus';
import type { StatusTone } from '@/components/brand/status-dot';
import type { KpiTone } from '@/components/data/kpi-card';

export const BUS_STATUS_LABELS: Record<BusDisplayStatus, { label: string; tone: KpiTone }> = {
  IN_TRANSIT: { label: 'En camino', tone: 'mint' },
  AVAILABLE: { label: 'Disponible', tone: 'indigo' },
  IN_WORKSHOP: { label: 'En taller', tone: 'mango' },
  INACTIVE: { label: 'Inactivo', tone: 'coral' },
};

// The illustration of a bus wears the color of its state wherever there is no photo.
export const BUS_ART_TONES: Record<BusDisplayStatus, BusTone> = {
  IN_TRANSIT: 'teal',
  AVAILABLE: 'indigo',
  IN_WORKSHOP: 'mango',
  INACTIVE: 'coral',
};

export const BUS_DOT_TONES: Record<BusDisplayStatus, StatusTone> = {
  IN_TRANSIT: 'mint',
  AVAILABLE: 'indigo',
  IN_WORKSHOP: 'mango',
  INACTIVE: 'muted',
};
