import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRentalRequestsPage } from '../../hooks/use-rental-requests';
import { rentalRequest } from '../../test-support/trips';
import { RentalRequestsTab } from './rental-requests-tab';

jest.mock('../../hooks/use-rental-requests');
jest.mock('./assign-rental-dialog', () => ({
  AssignRentalDialog: ({ request }: { request: { clientName: string } | null }) =>
    request ? (
      <div role="dialog" aria-label="Asignar bus y chofer">
        {request.clientName}
      </div>
    ) : null,
}));
const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/viajes',
  useSearchParams: () => new URLSearchParams(search),
}));

const rentals = [
  rentalRequest({ id: 'r1' }),
  rentalRequest({
    id: 'r2',
    clientName: 'Excursiones Atitlán',
    nit: '9876543-2',
    originLabel: 'Quetzaltenango',
    destinationLabel: 'Panajachel',
    // 21:15 on the 24th in Guatemala, the 25th in UTC
    departureAt: '2026-10-25T03:15:00.000Z',
    returnAt: null,
    passengers: 22,
    price: 2400,
  }),
];

function setup({
  address = 'pestana=alquileres',
  items = rentals,
  total = items.length,
  error = false,
}: { address?: string; items?: unknown[]; total?: number; error?: boolean } = {}) {
  search = address;
  const refetch = jest.fn();
  jest.mocked(useRentalRequestsPage).mockReturnValue(
    (error
      ? { data: undefined, isPending: false, isError: true, isPlaceholderData: false, refetch }
      : {
          data: { items, total, page: 1, pageSize: 20 },
          isPending: false,
          isError: false,
          isPlaceholderData: false,
          refetch,
        }) as never,
  );
  render(<RentalRequestsTab />);
  return { refetch };
}

const lastAddress = () => {
  const [url] = replace.mock.calls.at(-1) as [string];
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

beforeEach(() => replace.mockReset());

it('asks for the pending rentals', () => {
  setup();

  expect(useRentalRequestsPage).toHaveBeenCalledWith({
    status: 'PENDING',
    page: 1,
    pageSize: 20,
  });
});

it('lists the client, NIT, route, departure, passengers and price of each rental', () => {
  setup();

  const first = screen.getByRole('row', { name: /Colegio San José/ });
  expect(first).toHaveTextContent('1234567-8');
  expect(first).toHaveTextContent('Quetzaltenango');
  expect(first).toHaveTextContent('Antigua Guatemala');
  expect(first).toHaveTextContent('06:00');
  expect(first).toHaveTextContent('24 oct');
  expect(first).toHaveTextContent('38');
  expect(first).toHaveTextContent(/Q\s?6,300\.00/);
});

it('shows the Guatemalan day when UTC is already the next one', () => {
  setup();

  const second = screen.getByRole('row', { name: /Excursiones Atitlán/ });
  expect(second).toHaveTextContent('21:15');
  expect(second).toHaveTextContent('24 oct');
});

it('opens the assignment of the rental that was chosen', async () => {
  setup();

  await userEvent.click(
    screen.getByRole('button', { name: 'Asignar bus y chofer a Excursiones Atitlán' }),
  );

  expect(screen.getByRole('dialog', { name: 'Asignar bus y chofer' })).toHaveTextContent(
    'Excursiones Atitlán',
  );
});

it('reads the page and the search from the address', () => {
  setup({ address: 'pestana=alquileres&pagina=2&buscar=colegio' });

  expect(useRentalRequestsPage).toHaveBeenCalledWith({
    status: 'PENDING',
    q: 'colegio',
    page: 2,
    pageSize: 20,
  });
  expect(screen.getByRole('textbox', { name: 'Buscar alquiler' })).toHaveValue('colegio');
});

it('writes the search in the address, with the tab, 300 ms after the last key', async () => {
  setup();

  await userEvent.type(screen.getByRole('textbox', { name: 'Buscar alquiler' }), 'colegio');

  await waitFor(() => expect(lastAddress().params.get('buscar')).toBe('colegio'));
  expect(lastAddress().params.get('pestana')).toBe('alquileres');
});

it('pages in the address and counts the rentals', async () => {
  setup({ total: 45, address: 'pestana=alquileres&pagina=2' });

  expect(screen.getByText(/de 45/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

  expect(lastAddress().params.get('pagina')).toBe('3');
  expect(lastAddress().params.get('pestana')).toBe('alquileres');
});

it('says nothing is waiting when there are no rentals', () => {
  setup({ items: [], total: 0 });

  expect(screen.getByText('No hay alquileres esperando bus y chofer.')).toBeInTheDocument();
});

it('says so when a search finds none', () => {
  setup({ items: [], total: 0, address: 'pestana=alquileres&buscar=zzz' });

  expect(screen.getByText('No hay alquileres con esa búsqueda.')).toBeInTheDocument();
});

it('shows a friendly error with a retry', async () => {
  const { refetch } = setup({ error: true });

  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los alquileres.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

  expect(refetch).toHaveBeenCalled();
});
