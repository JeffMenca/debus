import { RENTAL_STATUSES } from '@debus/contracts';
import { rental } from '../../test-support/rentals';
import { rentalPriceShown, rentalStatusView } from './rental-status';

it('names every state for the client and for the branch, with its color', () => {
  expect(RENTAL_STATUSES.map((status) => rentalStatusView(status))).toEqual([
    { client: 'Esperando precio', branch: 'Por confirmar', tone: 'mango' },
    { client: 'Precio listo, falta pagar', branch: 'Esperando pago', tone: 'sky' },
    { client: 'Pagado', branch: 'Pagado', tone: 'mint' },
    { client: 'Cancelado', branch: 'Cancelado', tone: 'rose' },
  ]);
});

it('shows the confirmed price, or the estimate while there is none', () => {
  expect(rentalPriceShown(rental())).toEqual({ amount: 2500, estimated: false });
  expect(rentalPriceShown(rental({ status: 'REQUESTED', price: null }))).toEqual({
    amount: 2760,
    estimated: true,
  });
});
