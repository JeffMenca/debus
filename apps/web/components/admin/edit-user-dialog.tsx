'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ManagedUser, fullNameSchema, isBranchRole } from '@debus/contracts';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { useUpdateUser } from '@/hooks/use-users';
import type { BranchOption } from '@/lib/admin/branch-options';
import { messageOf } from '@/lib/api/client';
import { UserRoleFields } from './user-role-fields';

const editSchema = z.object({ fullName: fullNameSchema, branchId: z.string().optional() });
type EditValues = z.infer<typeof editSchema>;

interface EditUserDialogProps {
  user: ManagedUser | null;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
}

function EditForm({
  user,
  branches,
  onDone,
}: {
  user: ManagedUser;
  branches: EditUserDialogProps['branches'];
  onDone: () => void;
}) {
  const update = useUpdateUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: user.fullName, branchId: user.branchId ?? undefined },
  });

  const branchId = useWatch({ control, name: 'branchId' });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // Only what changed travels: the service refuses an empty change but accepts a partial one.
    const input = {
      ...(values.fullName !== user.fullName && { fullName: values.fullName }),
      ...(values.branchId && values.branchId !== user.branchId && { branchId: values.branchId }),
    };
    if (Object.keys(input).length === 0) return onDone();
    try {
      await update.mutateAsync({ id: user.id, input });
      toast.success('Guardamos los cambios.');
      onDone();
    } catch (error) {
      setServerError(messageOf(error));
    }
  });
  const nameError = errors.fullName ? 'Escribe su nombre completo.' : undefined;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
      <Field id="edit-fullName" label="Nombre completo" error={nameError}>
        <Input
          id="edit-fullName"
          autoComplete="off"
          {...invalidProps('edit-fullName', nameError)}
          {...register('fullName')}
        />
      </Field>
      <UserRoleFields
        idPrefix="edit"
        role={isBranchRole(user.role) ? user.role : undefined}
        branchId={branchId}
        branches={branches}
        onBranchChange={(id) => setValue('branchId', id)}
      />
      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  );
}

export function EditUserDialog({ user, onOpenChange, branches }: EditUserDialogProps) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent>
        {user && (
          <>
            <DialogHeader>
              <DialogTitle>Editar a {user.fullName}</DialogTitle>
              <DialogDescription>Cambia el nombre o la sucursal de esta cuenta.</DialogDescription>
            </DialogHeader>
            <EditForm user={user} branches={branches} onDone={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
