'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateExpenseCategoryRequest,
  EXPENSE_CATEGORY_NAME_MAX,
  type ExpenseCategory,
  createExpenseCategoryRequestSchema,
} from '@debus/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { useSaveExpenseCategory } from '@/hooks/use-expense-categories';
import { ApiError, messageOf } from '@/lib/api/client';
import { inputRules } from '@/lib/forms/input-rules';

const NAME_PROBLEM = `Escribe un nombre de 2 a ${EXPENSE_CATEGORY_NAME_MAX} caracteres.`;

interface ServerError {
  message: string;
  onName: boolean;
}

function nameErrorOf(invalid: boolean, serverError: ServerError | null): string | undefined {
  if (invalid) return NAME_PROBLEM;
  if (serverError?.onName) return serverError.message;
  return undefined;
}

function submitLabel(isSubmitting: boolean, category: ExpenseCategory | null): string {
  if (isSubmitting) return 'Guardando...';
  return category ? 'Guardar cambios' : 'Crear categoría';
}

function CategoryForm({
  category,
  onDone,
}: {
  category: ExpenseCategory | null;
  onDone: () => void;
}) {
  const save = useSaveExpenseCategory();
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateExpenseCategoryRequest>({
    resolver: zodResolver(createExpenseCategoryRequestSchema),
    defaultValues: { name: category?.name ?? '' },
  });

  const onSubmit = handleSubmit(async (request) => {
    setServerError(null);
    try {
      await save.mutateAsync(category ? { id: category.id, request } : { request });
    } catch (error) {
      // The only thing a category refuses is a name that already exists, so a 409 belongs to the name.
      const onName = error instanceof ApiError && error.status === 409;
      setServerError({ message: messageOf(error), onName });
      if (onName) setTimeout(() => setFocus('name'), 0);
      return;
    }
    toast.success(
      category
        ? `Guardamos el nuevo nombre: ${request.name}.`
        : `Creamos la categoría ${request.name}.`,
    );
    onDone();
  });

  const nameError = nameErrorOf(Boolean(errors.name), serverError);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {serverError && !serverError.onName && (
        <FormAlert tone="error">{serverError.message}</FormAlert>
      )}
      <Field id="category-name" label="Nombre" error={nameError}>
        <Input
          id="category-name"
          autoComplete="off"
          rule={inputRules.text(EXPENSE_CATEGORY_NAME_MAX)}
          {...invalidProps('category-name', nameError)}
          {...register('name')}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {submitLabel(isSubmitting, category)}
      </Button>
    </form>
  );
}

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The category being renamed; null creates a new one.
  category: ExpenseCategory | null;
}

export function CategoryDialog({ open, onOpenChange, category }: CategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Renombrar categoría' : 'Nueva categoría'}</DialogTitle>
          <DialogDescription>
            {category
              ? 'El nuevo nombre se verá también en los gastos que ya la usan.'
              : 'Las sucursales la podrán elegir al registrar un gasto de taller.'}
          </DialogDescription>
        </DialogHeader>
        <CategoryForm
          key={category?.id ?? 'new'}
          category={category}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
