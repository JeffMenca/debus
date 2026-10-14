import { SEARCH_MAX_LENGTH } from '@debus/contracts';
import {
  RENTALS_TAB,
  isRentalsTab,
  readRentalListParams,
  writeRentalListParams,
} from './rental-list-params';

const read = (search: string) => readRentalListParams(new URLSearchParams(search));

it('asks for the pending rentals of the first page', () => {
  expect(read('pestana=alquileres')).toEqual({ status: 'PENDING', page: 1, pageSize: 20 });
});

it('reads the search and the page of the address and writes them back with the tab', () => {
  const view = read('pestana=alquileres&pagina=2&buscar=colegio');

  expect(view).toEqual({ status: 'PENDING', q: 'colegio', page: 2, pageSize: 20 });
  expect(writeRentalListParams(view).toString()).toBe('pestana=alquileres&buscar=colegio&pagina=2');
});

it('drops a search the service would refuse', () => {
  expect(read(`buscar=${'x'.repeat(SEARCH_MAX_LENGTH + 1)}`).q).toBeUndefined();
});

it('knows which tab the address asks for', () => {
  expect(isRentalsTab(new URLSearchParams(`pestana=${RENTALS_TAB}`))).toBe(true);
  expect(isRentalsTab(new URLSearchParams(''))).toBe(false);
  expect(isRentalsTab(new URLSearchParams('pestana=otra'))).toBe(false);
});
