import { readUserListParams, writeUserListParams } from './user-list-params';

const branchId = '9b2c7a10-1111-4c4c-8888-123456789abc';
const read = (search: string) => readUserListParams(new URLSearchParams(search));

it('reads the filters the address carries', () => {
  expect(read('estado=pendientes&rol=cajero&buscar=Jos%C3%A9&pagina=2')).toEqual({
    status: 'PENDING',
    role: 'CASHIER',
    q: 'José',
    page: 2,
    pageSize: 20,
  });
  expect(read(`sucursal=${branchId}&mostrar=50`)).toEqual({ branchId, page: 1, pageSize: 50 });
});

it('knows every status and role by its Spanish word', () => {
  expect(read('estado=activos').status).toBe('ACTIVE');
  expect(read('estado=inactivos').status).toBe('INACTIVE');
  expect(read('rol=admin-sistema').role).toBe('SYSTEM_ADMIN');
  expect(read('rol=admin-sucursal').role).toBe('BRANCH_ADMIN');
  expect(read('rol=chofer').role).toBe('DRIVER');
  expect(read('rol=cliente').role).toBe('CLIENT');
});

it('ignores what it does not understand', () => {
  expect(read('estado=otro&rol=jefe&sucursal=no-es-uuid&buscar=')).toEqual({
    page: 1,
    pageSize: 20,
  });
});

it('ignores a search longer than the API accepts', () => {
  expect(read(`estado=activos&buscar=${'x'.repeat(81)}`)).toEqual({
    status: 'ACTIVE',
    page: 1,
    pageSize: 20,
  });
});

it('writes a clean address, without defaults', () => {
  expect(writeUserListParams({ page: 1, pageSize: 20 }).toString()).toBe('');
  expect(
    writeUserListParams({
      page: 3,
      pageSize: 50,
      status: 'ACTIVE',
      role: 'DRIVER',
      q: 'ana',
    }).toString(),
  ).toBe('estado=activos&rol=chofer&buscar=ana&pagina=3&mostrar=50');
});

it('gives back what it wrote', () => {
  const view = {
    status: 'INACTIVE' as const,
    role: 'BRANCH_ADMIN' as const,
    branchId,
    q: 'Pérez',
    page: 4,
    pageSize: 100 as const,
  };

  expect(readUserListParams(writeUserListParams(view))).toEqual(view);
});
