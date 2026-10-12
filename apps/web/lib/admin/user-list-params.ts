import type { PageQuery, UserRole, UserStatus } from '@debus/contracts';
import { enumParam, readPage, readSearch, writePage } from '@/lib/list/page-params';

// What the users screen asks the API for. The search text goes as typed: the server folds it.
export interface UserListView extends PageQuery {
  status?: UserStatus;
  role?: UserRole;
  branchId?: string;
  q?: string;
}

const STATUS = enumParam<UserStatus>({
  ACTIVE: 'activos',
  PENDING: 'pendientes',
  INACTIVE: 'inactivos',
});
const ROLE = enumParam<UserRole>({
  SYSTEM_ADMIN: 'admin-sistema',
  BRANCH_ADMIN: 'admin-sucursal',
  CASHIER: 'cajero',
  DRIVER: 'chofer',
  CLIENT: 'cliente',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readUserListParams(search: URLSearchParams): UserListView {
  const branchId = search.get('sucursal');
  const q = readSearch(search.get('buscar'));
  const status = STATUS.read(search.get('estado'));
  const role = ROLE.read(search.get('rol'));
  return {
    ...readPage(search),
    ...(status && { status }),
    ...(role && { role }),
    ...(branchId && UUID.test(branchId) && { branchId }),
    ...(q && { q }),
  };
}

export function writeUserListParams(view: UserListView): URLSearchParams {
  const params = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ['estado', STATUS.write(view.status)],
    ['rol', ROLE.write(view.role)],
    ['sucursal', view.branchId],
    ['buscar', view.q],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  writePage(params, view);
  return params;
}
