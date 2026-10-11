'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Branch,
  type CreateUserRequest,
  type UserRole,
  createUserRequestSchema,
  isBranchRole,
} from '@debus/contracts';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { useInviteUser } from '@/hooks/use-users';
import { messageOf } from '@/lib/api/client';
import { UserRoleFields } from './user-role-fields';

type FormInput = z.input<typeof createUserRequestSchema>;

const MESSAGES = {
  fullName: 'Escribe su nombre completo.',
  email: 'Escribe un correo válido.',
  role: 'Elige un rol.',
  branchId: 'Elige una sucursal.',
} as const;

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Pick<Branch, 'id' | 'name'>[];
}

function InviteForm({
  branches,
  onDone,
}: {
  branches: InviteUserDialogProps['branches'];
  onDone: () => void;
}) {
  const invite = useInviteUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<FormInput, unknown, CreateUserRequest>({
    resolver: zodResolver(createUserRequestSchema),
  });
  const role = useWatch({ control, name: 'role' }) as UserRole | undefined;
  const branchId = useWatch({ control, name: 'branchId' }) as string | undefined;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await invite.mutateAsync(values);
      toast.success(`Le enviamos un correo a ${values.email} para que cree su contraseña.`);
      onDone();
    } catch (error) {
      setServerError(messageOf(error));
    }
  });
  const error = (name: keyof typeof MESSAGES) => (errors[name] ? MESSAGES[name] : undefined);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
      <Field id="invite-fullName" label="Nombre completo" error={error('fullName')}>
        <Input
          id="invite-fullName"
          autoComplete="off"
          {...invalidProps('invite-fullName', error('fullName'))}
          {...register('fullName')}
        />
      </Field>
      <Field id="invite-email" label="Correo" error={error('email')}>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="persona@correo.com"
          {...invalidProps('invite-email', error('email'))}
          {...register('email')}
        />
      </Field>
      <UserRoleFields
        idPrefix="invite"
        role={role}
        branchId={branchId}
        branches={branches}
        roleError={error('role')}
        branchError={error('branchId')}
        onRoleChange={(next) => {
          setValue('role', next, { shouldValidate: isSubmitted });
          // A role without a branch must not keep one picked for the previous role.
          if (!isBranchRole(next)) setValue('branchId', undefined);
        }}
        onBranchChange={(id) => setValue('branchId', id, { shouldValidate: isSubmitted })}
      />
      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? 'Enviando...' : 'Enviar invitación'}
      </Button>
    </form>
  );
}

export function InviteUserDialog({ open, onOpenChange, branches }: InviteUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Le enviaremos un correo para que cree su contraseña.
          </DialogDescription>
        </DialogHeader>
        <InviteForm branches={branches} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
