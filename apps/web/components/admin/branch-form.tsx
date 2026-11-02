'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Branch,
  type BranchFields,
  type CreateBranchRequest,
  type UpdateBranchRequest,
  branchFieldsSchema,
  createBranchRequestSchema,
  FULL_NAME_MAX,
} from '@debus/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type ReactNode, useState } from 'react';
import {
  type FieldErrors,
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Field, invalidProps } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useCreateBranch, useUpdateBranch } from '@/hooks/use-branches';
import { messageOf } from '@/lib/api/client';
import { formatPhone } from '@/lib/format';
import { inputRules } from '@/lib/forms/input-rules';
import {
  BRANCH_FIELD_MESSAGES,
  type BranchFieldName,
  BranchFormFields,
} from './branch-form-fields';

type CreateInput = z.input<typeof createBranchRequestSchema>;
type EditInput = z.input<typeof branchFieldsSchema>;

const FIELD_NAMES = Object.keys(BRANCH_FIELD_MESSAGES) as BranchFieldName[];

const ADMIN_MESSAGES = {
  fullName: 'Escribe su nombre completo.',
  email: 'Escribe un correo válido.',
} as const;

function fieldErrors(errors: FieldErrors<EditInput>): Partial<Record<BranchFieldName, string>> {
  return Object.fromEntries(
    FIELD_NAMES.filter((name) => errors[name]).map((name) => [name, BRANCH_FIELD_MESSAGES[name]]),
  );
}

// The service answers a 409 with a sentence about the field that clashed; the focus goes there.
function clashingField(message: string): 'code' | 'name' | 'admin.email' | undefined {
  if (/código/i.test(message)) return 'code';
  if (/nombre/i.test(message)) return 'name';
  if (/correo/i.test(message)) return 'admin.email';
  return undefined;
}

// Both forms hold every branch field, so the shared cards wire themselves to the enclosing form.
function ConnectedBranchFields() {
  const { register, control, setValue } = useFormContext<EditInput>();
  const { errors, isSubmitted } = useFormState({ control });
  const department = useWatch({ control, name: 'department' });
  const latitude = useWatch({ control, name: 'latitude' });
  const longitude = useWatch({ control, name: 'longitude' });

  return (
    <BranchFormFields
      field={(name) =>
        register(name, name === 'latitude' || name === 'longitude' ? { valueAsNumber: true } : {})
      }
      errors={fieldErrors(errors)}
      department={department}
      onDepartmentChange={(value) =>
        setValue('department', value as EditInput['department'], { shouldValidate: isSubmitted })
      }
      latitude={latitude}
      longitude={longitude}
      onLocationChange={(point) => {
        setValue('latitude', point.latitude, { shouldValidate: isSubmitted });
        setValue('longitude', point.longitude, { shouldValidate: isSubmitted });
      }}
    />
  );
}

interface BranchFormLayoutProps {
  onSubmit: ComponentProps<'form'>['onSubmit'];
  serverError: string | null;
  submitting: boolean;
  submitLabel: string;
  // Sections that only one of the forms has, placed after the shared cards.
  children?: ReactNode;
}

function BranchFormLayout({
  onSubmit,
  serverError,
  submitting,
  submitLabel,
  children,
}: BranchFormLayoutProps) {
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      {serverError && <FormAlert tone="error">{serverError}</FormAlert>}
      <div className="grid items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
        <ConnectedBranchFields />
        {children}
        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : submitLabel}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/sucursales">Cancelar</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}

function CreateBranchForm() {
  const router = useRouter();
  const create = useCreateBranch();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<CreateInput, unknown, CreateBranchRequest>({
    mode: 'onTouched',
    resolver: zodResolver(createBranchRequestSchema),
  });
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await create.mutateAsync(values);
      toast.success(
        `Creamos la sucursal ${values.name} y enviamos la invitación a ${values.admin.email}.`,
      );
      router.push('/admin/sucursales');
    } catch (error) {
      const message = messageOf(error);
      setServerError(message);
      const field = clashingField(message);
      if (field) setFocus(field);
    }
  });
  const adminError = (name: keyof typeof ADMIN_MESSAGES) =>
    errors.admin?.[name] ? ADMIN_MESSAGES[name] : undefined;

  return (
    <FormProvider {...form}>
      <BranchFormLayout
        onSubmit={onSubmit}
        serverError={serverError}
        submitting={isSubmitting}
        submitLabel="Crear sucursal"
      >
        <section
          aria-labelledby="branch-admin"
          className="flex flex-col gap-4 rounded-[26px] bg-indigo-100 p-6 lg:col-span-2"
        >
          <h2 id="branch-admin" className="font-display text-xl font-bold text-indigo-700">
            Primer administrador
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="admin-fullName" label="Nombre completo" error={adminError('fullName')}>
              <Input
                id="admin-fullName"
                rule={inputRules.text(FULL_NAME_MAX)}
                autoComplete="off"
                {...invalidProps('admin-fullName', adminError('fullName'))}
                {...register('admin.fullName')}
              />
            </Field>
            <Field id="admin-email" label="Correo" error={adminError('email')}>
              <Input
                id="admin-email"
                type="email"
                rule={inputRules.email}
                autoComplete="off"
                {...invalidProps('admin-email', adminError('email'))}
                {...register('admin.email')}
              />
            </Field>
          </div>
          <p className="text-sm text-indigo-700">
            Le enviaremos un correo para que cree su contraseña. Toda sucursal necesita al menos un
            administrador.
          </p>
        </section>
      </BranchFormLayout>
    </FormProvider>
  );
}

function EditBranchForm({ branch }: { branch: Branch }) {
  const update = useUpdateBranch(branch.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<EditInput, unknown, BranchFields>({
    mode: 'onTouched',
    resolver: zodResolver(branchFieldsSchema),
    defaultValues: {
      name: branch.name,
      code: branch.code,
      department: branch.department,
      municipality: branch.municipality,
      address: branch.address,
      phone: formatPhone(branch.phone),
      latitude: branch.latitude,
      longitude: branch.longitude,
    },
  });
  const {
    handleSubmit,
    setFocus,
    formState: { isSubmitting },
  } = form;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // Only what changed travels; the service refuses an empty change.
    const changed = Object.fromEntries(
      FIELD_NAMES.filter((name) => values[name] !== branch[name]).map((name) => [
        name,
        values[name],
      ]),
    ) as UpdateBranchRequest;
    try {
      if (Object.keys(changed).length > 0) await update.mutateAsync(changed);
      toast.success('Guardamos los cambios.');
    } catch (error) {
      const message = messageOf(error);
      setServerError(message);
      const field = clashingField(message);
      if (field === 'code' || field === 'name') setFocus(field);
    }
  });

  return (
    <FormProvider {...form}>
      <BranchFormLayout
        onSubmit={onSubmit}
        serverError={serverError}
        submitting={isSubmitting}
        submitLabel="Guardar cambios"
      />
    </FormProvider>
  );
}

type BranchFormProps = { mode: 'create' } | { mode: 'edit'; branch: Branch };

export function BranchForm(props: BranchFormProps) {
  return props.mode === 'create' ? (
    <CreateBranchForm />
  ) : (
    <EditBranchForm key={props.branch.version} branch={props.branch} />
  );
}
