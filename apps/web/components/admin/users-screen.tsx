'use client';

import type { ManagedUser, UserRole } from '@debus/contracts';
import { Info, Search, UserPlus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data/data-table';
import { StatusTabs } from '@/components/data/status-tabs';
import { ActiveToggleDialog } from '@/components/forms/active-toggle-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBranches } from '@/hooks/use-branches';
import { useResendInvitation, useSetUserActive, useUsers } from '@/hooks/use-users';
import { countUsersByTab, filterUsers, type UserTab } from '@/lib/admin/user-filters';
import { messageOf } from '@/lib/api/client';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/roles';
import { EditUserDialog } from './edit-user-dialog';
import { InviteUserDialog } from './invite-user-dialog';
import { useUserColumns } from './user-columns';

const EMPTY_USERS: ManagedUser[] = [];

export function UsersScreen() {
  const users = useUsers();
  const branches = useBranches({ includeInactive: true });
  const resend = useResendInvitation();
  const setActive = useSetUserActive();

  const [tab, setTab] = useState<UserTab>('all');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [branchId, setBranchId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [toggling, setToggling] = useState<{ user: ManagedUser; active: boolean } | null>(null);

  const all = users.data ?? EMPTY_USERS;
  const branchNames = useMemo(
    () => new Map((branches.data ?? []).map((branch) => [branch.id, branch.name])),
    [branches.data],
  );
  const activeBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => branch.active),
    [branches.data],
  );
  const visible = useMemo(
    () => filterUsers(all, { tab, role, branchId, search }),
    [all, tab, role, branchId, search],
  );
  const counts = countUsersByTab(all);

  const onResend = useCallback(
    async (user: ManagedUser) => {
      try {
        await resend.mutateAsync(user.id);
        toast.success(`Enviamos de nuevo la invitación a ${user.email}.`);
      } catch (error) {
        toast.error(messageOf(error));
      }
    },
    [resend],
  );
  const columns = useUserColumns({
    branchNames,
    onEdit: setEditing,
    onResend,
    onToggle: useCallback(
      (user: ManagedUser, active: boolean) => setToggling({ user, active }),
      [],
    ),
  });

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios"
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus aria-hidden strokeWidth={1.75} className="size-4.5" />
            Invitar usuario
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          label="Estado de las cuentas"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Todas', count: counts.all },
            { value: 'ACTIVE', label: 'Activas', count: counts.ACTIVE },
            { value: 'PENDING', label: 'Invitación enviada', count: counts.PENDING },
            { value: 'INACTIVE', label: 'Inactivas', count: counts.INACTIVE },
          ]}
        />
        <div className="w-48">
          <Select value={role} onValueChange={(value) => setRole(value as UserRole | 'all')}>
            <SelectTrigger aria-label="Rol" className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {STAFF_ROLES.map((staffRole) => (
                <SelectItem key={staffRole} value={staffRole}>
                  {ROLE_LABELS[staffRole]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger aria-label="Sucursal" className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {(branches.data ?? []).map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full flex-[0_1_320px]">
          <Input
            icon={Search}
            aria-label="Buscar usuario"
            placeholder="Buscar nombre o correo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-card"
          />
        </div>
      </div>

      <DataTable
        caption="Usuarios"
        columns={columns}
        data={visible}
        getRowId={(user) => user.id}
        isLoading={users.isPending}
        error={users.isError ? 'No pudimos cargar los usuarios.' : null}
        onRetry={() => void users.refetch()}
        emptyMessage="No hay usuarios con esos filtros."
        summary={`Mostrando ${visible.length} de ${all.length} usuarios`}
        footerNote={
          <span className="inline-flex items-center gap-1.5">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Las cuentas no se borran: se desactivan.
          </span>
        }
        minWidth={880}
      />

      <InviteUserDialog open={inviting} onOpenChange={setInviting} branches={activeBranches} />
      <EditUserDialog
        user={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        branches={activeBranches}
      />
      <ActiveToggleDialog
        pending={toggling}
        onClose={() => setToggling(null)}
        subject={`a ${toggling?.user.fullName}`}
        reactivateDescription="Podrá volver a iniciar sesión."
        deactivateDescription="No podrá iniciar sesión. Puedes reactivar su cuenta cuando quieras."
        onConfirm={async () => {
          if (!toggling) return;
          await setActive.mutateAsync({ id: toggling.user.id, active: toggling.active });
          toast.success(
            toggling.active
              ? `Reactivamos a ${toggling.user.fullName}.`
              : `Desactivamos a ${toggling.user.fullName}.`,
          );
        }}
      />
    </>
  );
}
