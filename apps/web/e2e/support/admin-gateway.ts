import { randomUUID } from 'node:crypto';
import {
  type Branch,
  type BranchWithAdmins,
  type ManagedUser,
  type SettingsVersion,
  type UserRole,
  branchListQuerySchema,
  createBranchRequestSchema,
  createSettingsRequestSchema,
  createUserRequestSchema,
  effectiveVersion,
  foldSearchText,
  pageArgs,
  settingsListQuerySchema,
  toPage,
  todayInGuatemala,
  updateBranchRequestSchema,
  updateUserRequestSchema,
  userListQuerySchema,
} from '@debus/contracts';
import type { Page, Route } from '@playwright/test';
import { fulfillJson } from './session';

export interface AdminSeed {
  branches?: Branch[];
  users?: ManagedUser[];
  versions?: SettingsVersion[];
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

const INVALID = 'Revisa los datos marcados e intenta de nuevo.';
const NEEDS_ADMIN = 'Para reactivar la sucursal, primero reactiva o invita a su administrador.';
const LAST_ADMIN = 'La sucursal debe conservar al menos un administrador.';

// Plays the administracion API with state: what a screen creates shows up in the next listing,
// and the main rules answer with the same status codes and texts as the real service.
export async function mockAdminGateway(page: Page, seed: AdminSeed = {}) {
  // The seed is shared by every test of a worker and the handlers change what they hold.
  const { branches = [], users = [], versions = [] } = structuredClone(seed);
  const requests: RecordedRequest[] = [];

  const adminsOf = (branchId: string) =>
    users
      .filter((user) => user.role === 'BRANCH_ADMIN' && user.branchId === branchId)
      .map(({ id, fullName, email, status }) => ({ id, fullName, email, status }));
  const withAdmins = (branch: Branch): BranchWithAdmins => ({
    ...branch,
    admins: adminsOf(branch.id),
  });
  // Like the service: only a branch admin may join a branch that is closed.
  const mayJoin = (branchId: string, role: UserRole) => {
    const target = branches.find((branch) => branch.id === branchId);
    return target !== undefined && (target.active || role === 'BRANCH_ADMIN');
  };
  const error = (route: Route, status: number, message: string) =>
    fulfillJson(route, status, { statusCode: status, message });
  const byName =
    <T extends { id: string }>(name: (item: T) => string) =>
    (a: T, b: T) =>
      name(a).localeCompare(name(b)) || a.id.localeCompare(b.id);

  await page.route('**/api/administracion/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/administracion', '');
    const method = request.method();
    const body: unknown = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ method, path, query: url.search, body });
    const [, resource, id, action] = path.split('/');

    if (resource === 'branches') {
      if (method === 'GET' && !id) {
        // Same contract as the service: the query is validated and the page is cut here.
        const parsed = branchListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const { status, q, ...paging } = parsed.data;
        const matching = branches.filter(
          (branch) =>
            !q ||
            foldSearchText(
              `${branch.name} ${branch.code} ${branch.municipality} ${branch.department}`,
            ).includes(q),
        );
        const shown = matching
          .filter((branch) => status === 'all' || branch.active === (status === 'active'))
          .sort(byName((branch) => branch.name));
        const { skip, take } = pageArgs(paging);
        const active = matching.filter((branch) => branch.active).length;
        return fulfillJson(route, 200, {
          ...toPage(shown.slice(skip, skip + take).map(withAdmins), shown.length, paging),
          summary: { statusCounts: { active, inactive: matching.length - active } },
        });
      }
      if (method === 'GET') {
        const branch = branches.find((item) => item.id === id);
        return branch
          ? fulfillJson(route, 200, withAdmins(branch))
          : error(route, 404, 'No encontramos esa sucursal.');
      }
      if (method === 'POST' && !id) {
        const parsed = createBranchRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const { admin, ...fields } = parsed.data;
        if (branches.some((branch) => branch.code === fields.code)) {
          return error(route, 409, 'Ya existe una sucursal con ese código.');
        }
        if (branches.some((branch) => branch.name === fields.name)) {
          return error(route, 409, 'Ya existe una sucursal con ese nombre.');
        }
        if (users.some((user) => user.email === admin.email)) {
          return error(route, 409, 'Ya existe una cuenta con ese correo.');
        }
        const branch = { id: randomUUID(), ...fields, active: true, version: 1 };
        branches.push(branch);
        users.push({
          id: randomUUID(),
          fullName: admin.fullName,
          email: admin.email,
          role: 'BRANCH_ADMIN',
          branchId: branch.id,
          status: 'PENDING',
        });
        return fulfillJson(route, 201, withAdmins(branch));
      }
      const branch = branches.find((item) => item.id === id);
      if (!branch) return error(route, 404, 'No encontramos esa sucursal.');
      if (method === 'PATCH') {
        const parsed = updateBranchRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        if (parsed.data.code && branches.some((b) => b.id !== id && b.code === parsed.data.code)) {
          return error(route, 409, 'Ya existe una sucursal con ese código.');
        }
        if (parsed.data.name && branches.some((b) => b.id !== id && b.name === parsed.data.name)) {
          return error(route, 409, 'Ya existe una sucursal con ese nombre.');
        }
        Object.assign(branch, parsed.data, { version: branch.version + 1 });
        return fulfillJson(route, 200, withAdmins(branch));
      }
      if (method === 'POST' && (action === 'deactivate' || action === 'reactivate')) {
        const active = action === 'reactivate';
        const hasAdmin = adminsOf(branch.id).some((admin) => admin.status !== 'INACTIVE');
        if (active && !branch.active && !hasAdmin) return error(route, 409, NEEDS_ADMIN);
        if (branch.active !== active)
          Object.assign(branch, { active, version: branch.version + 1 });
        return fulfillJson(route, 204);
      }
    }

    if (resource === 'users') {
      if (method === 'GET' && !id) {
        const parsed = userListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const { status, role, branchId, group, q, ...paging } = parsed.data;
        // The tab counts ignore the status filter, like the service.
        const matching = users.filter(
          (user) =>
            (!role || user.role === role) &&
            (!group || (group === 'staff') === (user.role !== 'CLIENT')) &&
            (!branchId || user.branchId === branchId) &&
            (!q || foldSearchText(`${user.fullName} ${user.email}`).includes(q)),
        );
        const shown = matching
          .filter((user) => !status || user.status === status)
          .sort(byName((user) => user.fullName));
        const { skip, take } = pageArgs(paging);
        const statusCounts = { PENDING: 0, ACTIVE: 0, INACTIVE: 0 };
        for (const user of matching) statusCounts[user.status] += 1;
        const items = shown.slice(skip, skip + take).map((user) => ({
          ...user,
          branchName: branches.find((branch) => branch.id === user.branchId)?.name ?? null,
        }));
        return fulfillJson(route, 200, {
          ...toPage(items, shown.length, paging),
          summary: { statusCounts },
        });
      }
      if (method === 'POST' && !id) {
        const parsed = createUserRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        if (users.some((user) => user.email === parsed.data.email)) {
          return error(route, 409, 'Ya existe una cuenta con ese correo.');
        }
        if (parsed.data.branchId && !mayJoin(parsed.data.branchId, parsed.data.role)) {
          return error(route, 400, 'Elige una sucursal activa.');
        }
        const user: ManagedUser = {
          id: randomUUID(),
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          role: parsed.data.role,
          branchId: parsed.data.branchId ?? null,
          status: 'PENDING',
        };
        users.push(user);
        return fulfillJson(route, 201, user);
      }
      const user = users.find((item) => item.id === id);
      if (!user) return error(route, 404, 'No encontramos esa cuenta.');
      if (method === 'PATCH') {
        const parsed = updateUserRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        const peers = users.filter(
          (other) =>
            other.id !== user.id &&
            other.role === 'BRANCH_ADMIN' &&
            other.branchId === user.branchId &&
            other.status !== 'INACTIVE',
        );
        if (parsed.data.branchId && parsed.data.branchId !== user.branchId) {
          if (user.role === 'SYSTEM_ADMIN' || user.role === 'CLIENT') {
            return error(route, 400, 'Este rol no pertenece a una sucursal.');
          }
          if (!mayJoin(parsed.data.branchId, user.role)) {
            return error(route, 400, 'Elige una sucursal activa.');
          }
          if (user.role === 'BRANCH_ADMIN' && user.status !== 'INACTIVE' && peers.length === 0) {
            return error(route, 409, LAST_ADMIN);
          }
        }
        Object.assign(user, parsed.data);
        return fulfillJson(route, 200, user);
      }
      if (method === 'POST' && action === 'deactivate') {
        const peers = users.filter(
          (other) =>
            other.id !== user.id &&
            other.role === 'BRANCH_ADMIN' &&
            other.branchId === user.branchId &&
            other.status !== 'INACTIVE',
        );
        const branchIsActive = branches.find((branch) => branch.id === user.branchId)?.active;
        if (
          user.role === 'BRANCH_ADMIN' &&
          user.status !== 'INACTIVE' &&
          branchIsActive &&
          peers.length === 0
        ) {
          return error(route, 409, LAST_ADMIN);
        }
        user.status = 'INACTIVE';
        return fulfillJson(route, 204);
      }
      if (method === 'POST' && action === 'reactivate') {
        if (user.status === 'INACTIVE') user.status = 'ACTIVE';
        return fulfillJson(route, 204);
      }
      if (method === 'POST' && action === 'invitation') {
        if (user.status === 'ACTIVE')
          return error(route, 409, 'Esta cuenta ya creó su contraseña.');
        if (user.status === 'INACTIVE') {
          return error(route, 409, 'Esta cuenta está desactivada. Reactívala primero.');
        }
        return fulfillJson(route, 202, { message: 'Enviamos de nuevo la invitación.' });
      }
    }

    if (resource === 'settings') {
      if (method === 'GET') {
        const parsed = settingsListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return error(route, 400, INVALID);
        const ordered = [...versions].sort(
          (a, b) =>
            b.effectiveFrom.localeCompare(a.effectiveFrom) ||
            b.createdAt.localeCompare(a.createdAt),
        );
        const today = todayInGuatemala();
        const upcoming = ordered.filter((version) => version.effectiveFrom > today).at(-1) ?? null;
        const { skip, take } = pageArgs(parsed.data);
        return fulfillJson(route, 200, {
          ...toPage(ordered.slice(skip, skip + take), ordered.length, parsed.data),
          summary: { current: effectiveVersion(ordered, today), upcoming },
        });
      }
      if (method === 'POST') {
        const parsed = createSettingsRequestSchema.safeParse(body);
        if (!parsed.success) return error(route, 400, INVALID);
        if (parsed.data.effectiveFrom < todayInGuatemala()) {
          return error(route, 400, 'La fecha de vigencia no puede ser anterior a hoy.');
        }
        const version: SettingsVersion = {
          id: randomUUID(),
          ...parsed.data,
          createdAt: new Date().toISOString(),
          createdByName: 'Marta Ruiz',
        };
        versions.push(version);
        return fulfillJson(route, 201, version);
      }
    }

    return error(route, 404, 'No encontramos lo que buscas.');
  });

  return { requests, branches, users, versions };
}

// Sample data for the screens that need a branch or a person to start from.
export const SAMPLE_BRANCH_ID = '9b2c7a10-1111-4c4c-8888-123456789abc';
export const sampleBranch = (overrides: Partial<Branch> = {}) => ({
  id: SAMPLE_BRANCH_ID,
  code: 'XEL',
  name: 'Quetzaltenango',
  department: 'Quetzaltenango' as const,
  municipality: 'Quetzaltenango',
  address: '4a calle 12-30 zona 1',
  phone: '77612233',
  latitude: 14.8347,
  longitude: -91.5181,
  active: true,
  version: 1,
  ...overrides,
});
export const sampleUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: randomUUID(),
  fullName: 'Ana Sic',
  email: 'ana@correo.com',
  role: 'CASHIER',
  branchId: SAMPLE_BRANCH_ID,
  status: 'ACTIVE',
  ...overrides,
});

// Enough people, or branches, to need several pages. Names sort in the order they are numbered.
const numbered = (index: number) => String(index + 1).padStart(3, '0');
export const manyUsers = (count: number, overrides: Partial<ManagedUser> = {}): ManagedUser[] =>
  Array.from({ length: count }, (_, index) =>
    sampleUser({
      fullName: `Persona ${numbered(index)}`,
      email: `persona${numbered(index)}@correo.com`,
      ...overrides,
    }),
  );
// Branch codes are three to five letters: AAA, AAB, AAC...
const letters = (index: number) =>
  [index % 26, Math.floor(index / 26) % 26, Math.floor(index / 676)]
    .map((digit) => String.fromCharCode(65 + digit))
    .reverse()
    .join('');
export const manyBranches = (count: number): Branch[] =>
  Array.from({ length: count }, (_, index) =>
    sampleBranch({
      id: randomUUID(),
      code: letters(index),
      name: `Sucursal ${numbered(index)}`,
    }),
  );
export const manyVersions = (count: number): SettingsVersion[] =>
  Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    depreciationPerKm: 1 + index / 100,
    rentalRatePerKm: 12,
    effectiveFrom: `2020-01-${String(index + 1).padStart(2, '0')}`,
    createdAt: `2020-01-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
    createdByName: 'Marta Ruiz',
  }));
