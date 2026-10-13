'use client';

import type { Driver } from '@debus/contracts';
import { DriverForm } from './driver-form';
import { FormSheet } from './form-sheet';

interface DriverSheetProps {
  // The driver being edited; null registers a new one.
  driver: Driver | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriverSheet({ driver, open, onOpenChange }: DriverSheetProps) {
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={driver ? `Editar a ${driver.fullName}` : 'Registrar chofer'}
      description={
        driver
          ? 'Cambia lo que haga falta y guarda.'
          : 'Le enviaremos un correo para que cree su contraseña.'
      }
    >
      <DriverForm
        key={driver?.id ?? 'new'}
        driver={driver ?? undefined}
        onDone={() => onOpenChange(false)}
      />
    </FormSheet>
  );
}
