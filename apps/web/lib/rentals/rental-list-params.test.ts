import { readBranchRentalParams, writeBranchRentalParams } from './rental-list-params';

const read = (search: string) => readBranchRentalParams(new URLSearchParams(search));

it('starts on the rentals waiting for their price', () => {
  expect(read('')).toEqual({ status: 'REQUESTED', page: 1, pageSize: 20 });
});

it('reads the state, the search, the days and the page, and writes them back in Spanish', () => {
  const view = read('estado=pagados&buscar=colegio&desde=2026-10-01&hasta=2026-10-31&pagina=2');

  expect(view).toEqual({
    status: 'PAID',
    q: 'colegio',
    from: '2026-10-01',
    to: '2026-10-31',
    page: 2,
    pageSize: 20,
  });
  expect(writeBranchRentalParams(view).toString()).toBe(
    'estado=pagados&buscar=colegio&desde=2026-10-01&hasta=2026-10-31&pagina=2',
  );
});

it('keeps every state and drops strange values', () => {
  expect(read('estado=todos').status).toBe('all');
  expect(writeBranchRentalParams(read('estado=todos')).toString()).toBe('estado=todos');
  expect(read('estado=otro&desde=ayer').status).toBe('REQUESTED');
  expect(read('desde=ayer').from).toBeUndefined();
  expect(writeBranchRentalParams(read('')).toString()).toBe('');
});
