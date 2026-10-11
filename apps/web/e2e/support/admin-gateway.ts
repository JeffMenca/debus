import { randomUUID } from 'node:crypto';
import {
  type Branch,
  type BranchWithAdmins,
  type ManagedUser,
  type SettingsVersion,
  type UserRole,
  createBranchRequestSchema,
  createSettingsRequestSchema,
  createUserRequestSchema,
  effectiveVersion,
  todayInGuatemala,
  updateBranchRequestSchema,
  updateUserRequestSchema,
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

  await page.route('**/api/administracion/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return fulfillJson(route, 204);

    const url = new URL(request.url());
    const path = url.pathname.replace('/api/administracion', '');
    const method = request.method();
    const body: unknown = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ method, path, body });
    const [, resource, id, action] = path.split('/');

    if (resource === 'branches') {
      if (method === 'GET' && !id) {
        const all = url.searchParams.get('includeInactive') === 'true';
        return fulfillJson(
          route,
          200,
          [...branches]
            .filter((branch) => all || branch.active)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(withAdmins),
        );
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
      if (method === 'GET' && !id) return fulfillJson(route, 200, users);
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
        const ordered = [...versions].sort(
          (a, b) =>
            b.effectiveFrom.localeCompare(a.effectiveFrom) ||
            b.createdAt.localeCompare(a.createdAt),
        );
        return fulfillJson(route, 200, {
          current: effectiveVersion(ordered, todayInGuatemala()),
          versions: ordered,
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
