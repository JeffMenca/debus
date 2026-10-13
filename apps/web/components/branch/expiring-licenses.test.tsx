import { todayInGuatemala } from '@debus/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useExpiringDrivers } from '../../hooks/use-drivers';
import { driver, driverPage } from '../../test-support/fleet';
import { ExpiringLicenses } from './expiring-licenses';

jest.mock('../../hooks/use-drivers');

const TODAY = '2026-10-12';
const plusDays = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const drivers = [
  driver({ id: 'a', fullName: 'Edgar Tzul', licenseType: 'A', licenseExpiresOn: plusDays(3) }),
  driver({ id: 'b', fullName: 'Rosa Ixcot', licenseType: 'B', licenseExpiresOn: plusDays(15) }),
  driver({ id: 'c', fullName: 'Marta Coyoy', licenseType: 'C', licenseExpiresOn: plusDays(30) }),
  driver({ id: 'd', fullName: 'Julio Pérez', licenseType: 'E', licenseExpiresOn: plusDays(-2) }),
];

function setup(
  state: { items?: unknown[]; total?: number; pending?: boolean; error?: boolean } = {},
) {
  const refetch = jest.fn();
  const items = (state.items ?? drivers) as never[];
  jest.mocked(useExpiringDrivers).mockReturnValue({
    data:
      state.pending || state.error
        ? undefined
        : driverPage(items, { total: state.total ?? items.length }),
    isPending: Boolean(state.pending),
    isError: Boolean(state.error),
    refetch,
  } as never);
  render(<ExpiringLicenses today={TODAY} />);
  return { refetch };
}

it('looks at the licences that expire within 30 days', () => {
  setup();

  expect(useExpiringDrivers).toHaveBeenCalledWith(30);
});

it('lists each driver with the days left, the type of licence and the date it expires', () => {
  setup();

  const edgar = screen.getByRole('listitem', { name: /Edgar Tzul/ });
  expect(edgar).toHaveTextContent('3');
  expect(edgar).toHaveTextContent('días');
  expect(edgar).toHaveTextContent('Licencia A · vence 15 oct');
  expect(screen.getByRole('listitem', { name: /Marta Coyoy/ })).toHaveTextContent('30');
});

it('says a licence is already expired instead of counting negative days', () => {
  setup();

  const julio = screen.getByRole('listitem', { name: /Julio Pérez/ });
  expect(julio).toHaveTextContent('Vencida');
  expect(julio).toHaveTextContent('Licencia E · venció 10 oct');
});

it('tints each driver by how close the date is', () => {
  setup();

  expect(screen.getByRole('listitem', { name: /Edgar Tzul/ })).toHaveClass('bg-coral-100');
  expect(screen.getByRole('listitem', { name: /Rosa Ixcot/ })).toHaveClass('bg-coral-100');
  expect(screen.getByRole('listitem', { name: /Marta Coyoy/ })).toHaveClass('bg-mango-100');
});

it('shows five at most and tells how many more there are', () => {
  setup({ items: [...drivers, ...drivers.map((d) => ({ ...d, id: `${d.id}2` }))], total: 8 });

  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('Y 3 más. Revísalas en Choferes.')).toBeInTheDocument();
});

it('sends to the drivers screen to review their data', () => {
  setup();

  expect(screen.getByRole('link', { name: 'Choferes' })).toHaveAttribute(
    'href',
    '/sucursal/choferes',
  );
  expect(screen.getByText(/Revisa sus datos en/)).toBeInTheDocument();
});

it('says so when no licence is about to expire', () => {
  setup({ items: [] });

  expect(screen.getByText('Ninguna licencia vence en los próximos 30 días.')).toBeInTheDocument();
});

it('shows a loading state while the drivers arrive', () => {
  setup({ pending: true });

  expect(screen.getByLabelText('Cargando')).toBeInTheDocument();
});

it('shows a friendly error with a retry', async () => {
  const { refetch } = setup({ error: true });

  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las licencias.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

  expect(refetch).toHaveBeenCalled();
});

it('counts from the day of Guatemala when none is given', () => {
  jest.mocked(useExpiringDrivers).mockReturnValue({
    data: driverPage([driver({ licenseExpiresOn: todayInGuatemala() })]),
    isPending: false,
    isError: false,
  } as never);
  render(<ExpiringLicenses />);

  expect(screen.getByRole('listitem')).toHaveTextContent('0');
});
