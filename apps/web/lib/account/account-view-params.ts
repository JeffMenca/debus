import type { PageQuery, WalletMovementListQuery } from '@debus/contracts';
import { enumParam, readPage, writePage } from '@/lib/list/page-params';

export type AccountTab = 'TICKETS' | 'RENTALS' | 'MOVEMENTS';
export type MovementKindFilter = WalletMovementListQuery['kind'];

export interface AccountView extends PageQuery {
  tab: AccountTab;
  kind: MovementKindFilter;
}

const DEFAULT_TAB: AccountTab = 'TICKETS';
const DEFAULT_KIND: MovementKindFilter = 'all';
const TAB = enumParam<AccountTab>({
  TICKETS: 'boletos',
  RENTALS: 'alquileres',
  MOVEMENTS: 'movimientos',
});
const KIND = enumParam<MovementKindFilter>({
  all: '',
  TOP_UP: 'recargas',
  TICKET: 'boletos',
  RENTAL: 'alquileres',
  REFUND: 'reembolsos',
});

export function readAccountView(search: URLSearchParams): AccountView {
  return {
    tab: TAB.read(search.get('pestana')) ?? DEFAULT_TAB,
    kind: KIND.read(search.get('tipo')) ?? DEFAULT_KIND,
    ...readPage(search),
  };
}

export function writeAccountView(view: AccountView): URLSearchParams {
  const params = new URLSearchParams();
  if (view.tab !== DEFAULT_TAB) params.set('pestana', TAB.write(view.tab) ?? '');
  if (view.kind !== DEFAULT_KIND) params.set('tipo', KIND.write(view.kind) ?? '');
  writePage(params, view);
  return params;
}
