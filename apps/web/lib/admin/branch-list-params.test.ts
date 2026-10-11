import { readBranchListParams, writeBranchListParams } from './branch-list-params';

const read = (search: string) => readBranchListParams(new URLSearchParams(search));

it('shows the active branches unless the address says otherwise', () => {
  expect(read('')).toEqual({ status: 'active', page: 1, pageSize: 20 });
  expect(read('estado=inactivas')).toMatchObject({ status: 'inactive' });
  expect(read('estado=todas&buscar=Pet%C3%A9n&pagina=2')).toEqual({
    status: 'all',
    q: 'Petén',
    page: 2,
    pageSize: 20,
  });
  expect(read('estado=cerradas')).toMatchObject({ status: 'active' });
});

it('ignores a search longer than the API accepts', () => {
  expect(read(`buscar=${'x'.repeat(81)}`)).toEqual({ status: 'active', page: 1, pageSize: 20 });
});

it('keeps the default tab and page out of the address', () => {
  expect(writeBranchListParams({ status: 'active', page: 1, pageSize: 20 }).toString()).toBe('');
  expect(
    writeBranchListParams({ status: 'all', q: 'xela', page: 2, pageSize: 50 }).toString(),
  ).toBe('estado=todas&buscar=xela&pagina=2&mostrar=50');
});

it('gives back what it wrote', () => {
  const view = { status: 'inactive' as const, q: 'Cobán', page: 3, pageSize: 100 };

  expect(readBranchListParams(writeBranchListParams(view))).toEqual(view);
});
