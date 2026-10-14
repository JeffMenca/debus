'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateRouteRequest,
  type Route,
  type UpdateRouteRequest,
  createRouteRequestSchema,
  updateRouteRequestSchema,
} from '@debus/contracts';
import { useState } from 'react';
import { type UseFormRegisterReturn, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranchOptions } from '@/hooks/use-branches';
import { useSaveRoute } from '@/hooks/use-routes';
import { messageOf } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session-store';
import { routeClashField } from '@/lib/fleet/route-clash';

type CreateInput = z.input<typeof createRouteRequestSchema>;
type EditInput = z.input<typeof updateRouteRequestSchema>;

const MESSAGES = {
  destinationBranchId: 'Elige la sucursal de destino.',
  distanceKm: 'Escribe la distancia en kilómetros, con un decimal como máximo.',
  ticketPrice: 'Escribe el precio del boleto en quetzales, con hasta dos decimales.',
} as const;

interface NumberFieldsProps {
  distance: UseFormRegisterReturn;
  price: UseFormRegisterReturn;
  distanceError?: string;
  priceError?: string;
}

// Distance and price are the two numbers of a route, whether it is being created or edited.
function NumberFields({ distance, price, distanceError, priceError }: NumberFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field id="route-distance" label="Distancia (km)" error={distanceError}>
        <Input
          id="route-distance"
          type="number"
          step="0.1"
          inputMode="decimal"
          autoComplete="off"
          className="font-mono tabular-nums"
          {...invalidProps('route-distance', distanceError)}
          {...distance}
        />
      </Field>
      <Field id="route-price" label="Precio del boleto (Q)" error={priceError}>
        <Input
          id="route-price"
          type="number"
          step="0.01"
          inputMode="decimal"
          autoComplete="off"
          className="font-mono tabular-nums"
          {...invalidProps('route-price', priceError)}
          {...price}
        />
      </Field>
    </div>
  );
}

function CreateRouteForm({ onDone }: { onDone: () => void }) {
  const save = useSaveRoute();
  const ownBranchId = useSession()?.user.branchId;
  const branches = useBranchOptions({ status: 'active' }).data ?? [];
  const [serverError, setServerError] = useState<{
    message: string;
    onDestination: boolean;
  } | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<CreateInput, unknown, CreateRouteRequest>({
    resolver: zodResolver(createRouteRequestSchema),
  });
  const destinationId = useWatch({ control, name: 'destinationBranchId' });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    try {
      await save.mutateAsync({ input });
      const destination = branches.find((branch) => branch.id === input.destinationBranchId);
      toast.success(`Creamos la ruta a ${destination?.name ?? 'ese destino'}.`);
      onDone();
    } catch (error) {
      const message = messageOf(error);
      const onDestination = routeClashField(message) === 'destination';
      setServerError({ message, onDestination });
      // A select is not a registered field, so its trigger is focused directly.
      if (onDestination) document.getElementById('route-destination')?.focus();
    }
  });
  function destinationErrorOf(): string | undefined {
    if (errors.destinationBranchId) return MESSAGES.destinationBranchId;
    if (serverError?.onDestination) return serverError.message;
    return undefined;
  }
  const destinationError = destinationErrorOf();

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && !serverError.onDestination && (
        <FormAlert tone="error">{serverError.message}</FormAlert>
      )}
      <Field id="route-destination" label="Destino" error={destinationError}>
        <Select
          value={destinationId ?? ''}
          onValueChange={(value) =>
            setValue('destinationBranchId', value, { shouldValidate: isSubmitted })
          }
        >
          <SelectTrigger
            id="route-destination"
            {...invalidProps('route-destination', destinationError)}
          >
            <SelectValue placeholder="Elige la sucursal de destino" />
          </SelectTrigger>
          <SelectContent>
            {branches
              .filter((branch) => branch.id !== ownBranchId)
              .map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <NumberFields
        distance={register('distanceKm', { valueAsNumber: true })}
        price={register('ticketPrice', { valueAsNumber: true })}
        distanceError={errors.distanceKm ? MESSAGES.distanceKm : undefined}
        priceError={errors.ticketPrice ? MESSAGES.ticketPrice : undefined}
      />
      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? 'Guardando...' : 'Crear ruta'}
      </Button>
    </form>
  );
}

function EditRouteForm({ route, onDone }: { route: Route; onDone: () => void }) {
  const save = useSaveRoute();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditInput, unknown, UpdateRouteRequest>({
    resolver: zodResolver(updateRouteRequestSchema),
    defaultValues: {
      distanceKm: route.distanceKm,
      ticketPrice: route.ticketPrice,
      active: route.active,
    },
  });
  const active = useWatch({ control, name: 'active' });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    try {
      await save.mutateAsync({ id: route.id, input });
      toast.success(`Guardamos los cambios de la ruta a ${route.destinationName}.`);
      onDone();
    } catch (error) {
      setServerError(messageOf(error));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
      <NumberFields
        distance={register('distanceKm', { valueAsNumber: true })}
        price={register('ticketPrice', { valueAsNumber: true })}
        distanceError={errors.distanceKm ? MESSAGES.distanceKm : undefined}
        priceError={errors.ticketPrice ? MESSAGES.ticketPrice : undefined}
      />
      <div className="flex items-center gap-3">
        <Checkbox
          id="route-active"
          checked={active ?? false}
          onCheckedChange={(value) => setValue('active', value === true)}
        />
        <Label htmlFor="route-active" className="text-sm text-foreground">
          Aceptar viajes nuevos
        </Label>
      </div>
      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  );
}

interface RouteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The route being edited; null creates a new one.
  route: Route | null;
}

export function RouteDialog({ open, onOpenChange, route }: RouteDialogProps) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {route ? `Editar ruta a ${route.destinationName}` : 'Nueva ruta'}
          </DialogTitle>
          <DialogDescription>
            {route
              ? 'Cambia la distancia o el precio. Los viajes ya programados conservan su precio.'
              : 'Elige a dónde llega la ruta y cuánto cuesta el boleto.'}
          </DialogDescription>
        </DialogHeader>
        {route ? (
          <EditRouteForm key={route.id} route={route} onDone={close} />
        ) : (
          <CreateRouteForm onDone={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
