'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ClientProfile,
  type UpdateProfileRequest,
  updateProfileRequestSchema,
} from '@debus/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatDpi, formatNit } from '@/lib/account/formats';
import { useUpdateProfile } from '@/lib/account/profile-api';
import { ApiError, messageOf } from '@/lib/api/client';
import { FIELD_MESSAGES } from '@/lib/auth/form-messages';
import { formatPhone } from '@/lib/format';

type FormInput = z.input<typeof updateProfileRequestSchema>;
type FieldName = keyof FormInput;

interface ServerError {
  message: string;
  // The only conflict a profile has is a NIT that belongs to another account.
  onNit: boolean;
}

function ProfileForm({ profile, onDone }: { profile: ClientProfile; onDone: () => void }) {
  const update = useUpdateProfile();
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, UpdateProfileRequest>({
    resolver: zodResolver(updateProfileRequestSchema),
    defaultValues: {
      // Written as the card shows them; the schema drops the separators again when saving.
      dpi: profile.dpi ? formatDpi(profile.dpi) : '',
      phone: profile.phone ? formatPhone(profile.phone) : '',
      nit: profile.nit ? formatNit(profile.nit) : '',
      address: profile.address ?? '',
    },
  });

  const onSubmit = handleSubmit(async (request) => {
    setServerError(null);
    try {
      await update.mutateAsync(request);
    } catch (error) {
      const onNit = error instanceof ApiError && error.status === 409;
      setServerError({ message: messageOf(error), onNit });
      if (onNit) setTimeout(() => setFocus('nit'), 0);
      return;
    }
    toast.success('Guardamos tu perfil.');
    onDone();
  });

  const error = (name: FieldName): string | undefined => {
    if (errors[name]) return FIELD_MESSAGES[name];
    if (name === 'nit' && serverError?.onNit) return serverError.message;
    return undefined;
  };
  const props = (name: FieldName) => ({
    id: `profile-${name}`,
    ...invalidProps(`profile-${name}`, error(name)),
    ...register(name),
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && !serverError.onNit && (
        <FormAlert tone="error">{serverError.message}</FormAlert>
      )}
      <Field id="profile-nit" label="NIT" optional error={error('nit')}>
        <Input {...props('nit')} autoComplete="off" className="font-mono" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="profile-dpi" label="DPI" error={error('dpi')}>
          <Input {...props('dpi')} inputMode="numeric" autoComplete="off" className="font-mono" />
        </Field>
        <Field id="profile-phone" label="Teléfono" error={error('phone')}>
          <Input {...props('phone')} inputMode="numeric" autoComplete="tel" className="font-mono" />
        </Field>
      </div>
      <Field id="profile-address" label="Dirección" optional error={error('address')}>
        <Input {...props('address')} autoComplete="street-address" />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  );
}

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ClientProfile;
}

export function ProfileDialog({ open, onOpenChange, profile }: ProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
          <DialogDescription>
            Usamos tu NIT para tus facturas y para unir a tu cuenta lo que compres en ventanilla.
          </DialogDescription>
        </DialogHeader>
        <ProfileForm key={profile.updatedAt} profile={profile} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
