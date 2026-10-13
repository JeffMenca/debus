'use client';

import type { Bus } from '@debus/contracts';
import { formatPlate } from '@/lib/format';
import { BusForm } from './bus-form';
import { FormSheet } from './form-sheet';

interface BusSheetProps {
  // The bus being edited; null registers a new one.
  bus: Bus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BusSheet({ bus, open, onOpenChange }: BusSheetProps) {
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={bus ? `Editar bus ${formatPlate(bus.plate)}` : 'Registrar bus'}
      description={
        bus ? 'Cambia lo que haga falta y guarda.' : 'Escribe los datos del bus y su foto.'
      }
    >
      <BusForm key={bus?.id ?? 'new'} bus={bus ?? undefined} onDone={() => onOpenChange(false)} />
    </FormSheet>
  );
}
