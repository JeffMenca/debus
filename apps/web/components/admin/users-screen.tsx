'use client';

import {
  type ManagedUser,
  SEARCH_MAX_LENGTH,
  type UserListItem,
  type UserRole,
  type UserStatus,
} from '@debus/contracts';
import { Info, Search, UserPlus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, tablePagination } from '@/components/data/data-table';
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
import { useBranchOptions } from '@/hooks/use-branches';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useUrlQuery } from '@/hooks/use-url-query';
import { useUrlSearch } from '@/hooks/use-url-search';
import { useResendInvitation, useSetUserActive, useUsersPage } from '@/hooks/use-users';
import { readUserListParams, writeUserListParams } from '@/lib/admin/user-list-params';
import { messageOf } from '@/lib/api/client';
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/roles';
import { EditUserDialog } from './edit-user-dialog';
import { InviteUserDialog } from './invite-user-dialog';
import { useUserColumns } from './user-columns';

type UserTab = 'all' | UserStatus;

const EMPTY_BRANCHES: { id: string; name: string; active: boolean }[] = [];

export function UsersScreen() {
  const [query, update] = useUrlQuery(readUserListParams, writeUserListParams);
  const users = useUsersPage(query);
  const branches = useBranchOptions({ status: 'all' });
  const resend = useResendInvitation();
  const setActive = useSetUserActive();

  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [toggling, setToggling] = useState<{ user: UserListItem; active: boolean } | null>(null);

  const [search, setSearch] = useUrlSearch(query.q, update);
  usePageInRange(users.data, update);

  const counts = users.data?.summary.statusCounts;
  const allBranches = branches.data ?? EMPTY_BRANCHES;

  const onResend = useCallback(
    async (user: UserListItem) => {
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
    onEdit: setEditing,
    onResend,
    onToggle: useCallback(
      (user: UserListItem, active: boolean) => setToggling({ user, active }),
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
        <StatusTabs<UserTab>
          label="Estado de las cuentas"
          value={query.status ?? 'all'}
          onChange={(tab) => update({ status: tab === 'all' ? undefined : tab })}
          options={[
            {
              value: 'all',
              label: 'Todos',
              count: counts && counts.ACTIVE + counts.PENDING + counts.INACTIVE,
            },
            { value: 'ACTIVE', label: 'Activos', count: counts?.ACTIVE },
            { value: 'PENDING', label: 'Invitación enviada', count: counts?.PENDING },
            { value: 'INACTIVE', label: 'Inactivos', count: counts?.INACTIVE },
          ]}
        />
        <div className="w-48">
          <Select
            value={query.role ?? 'all'}
            onValueChange={(value) =>
              update({ role: value === 'all' ? undefined : (value as UserRole) })
            }
          >
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
          <Select
            value={query.branchId ?? 'all'}
            onValueChange={(value) => update({ branchId: value === 'all' ? undefined : value })}
          >
            <SelectTrigger aria-label="Sucursal" className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sucursales</SelectItem>
              {allBranches.map((branch) => (
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
            maxLength={SEARCH_MAX_LENGTH}
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
        data={users.data?.items ?? []}
        getRowId={(user) => user.id}
        isLoading={users.isPending}
        isRefreshing={users.isPlaceholderData}
        error={users.isError ? 'No pudimos cargar los usuarios.' : null}
        onRetry={() => void users.refetch()}
        emptyMessage="No hay usuarios con esos filtros."
        pagination={tablePagination(query, users.data?.total, update)}
        footerNote={
          <span className="inline-flex items-center gap-1.5">
            <Info aria-hidden strokeWidth={1.75} className="size-4" />
            Las cuentas no se borran: se desactivan.
          </span>
        }
        minWidth={880}
      />

      <InviteUserDialog open={inviting} onOpenChange={setInviting} branches={allBranches} />
      <EditUserDialog
        user={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        branches={allBranches}
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
