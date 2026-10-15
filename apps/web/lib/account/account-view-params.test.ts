import { readAccountView, writeAccountView } from './account-view-params';

const read = (search: string) => readAccountView(new URLSearchParams(search));

describe('account view params', () => {
  it('opens on the tickets tab, every kind of movement and the first page', () => {
    expect(read('')).toEqual({ tab: 'TICKETS', kind: 'all', page: 1, pageSize: 20 });
  });

  it('reads the tab, the kind of movement and the page in Spanish', () => {
    expect(read('pestana=movimientos&tipo=recargas&pagina=3&mostrar=50')).toEqual({
      tab: 'MOVEMENTS',
      kind: 'TOP_UP',
      page: 3,
      pageSize: 50,
    });
    expect(read('pestana=alquileres&tipo=reembolsos')).toMatchObject({
      tab: 'RENTALS',
      kind: 'REFUND',
    });
  });

  it('sends strange values back to their defaults', () => {
    expect(read('pestana=otra&tipo=x&pagina=-1')).toEqual({
      tab: 'TICKETS',
      kind: 'all',
      page: 1,
      pageSize: 20,
    });
  });

  it('writes only what differs from the defaults', () => {
    expect(
      writeAccountView({ tab: 'TICKETS', kind: 'all', page: 1, pageSize: 20 }).toString(),
    ).toBe('');
    expect(
      writeAccountView({ tab: 'MOVEMENTS', kind: 'TICKET', page: 2, pageSize: 20 }).toString(),
    ).toBe('pestana=movimientos&tipo=boletos&pagina=2');
  });
});
