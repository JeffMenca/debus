import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pinDate } from '../../test-support/fake-clock';
import { queryWrapper } from '../../test-support/query-wrapper';
import { availableTrip, availableTripPage } from '../../test-support/tickets';
import { CounterTrips } from './counter-trips';

const replace = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sucursal/ventanilla',
  useSearchParams: () => new URLSearchParams(search),
}));

// The fixtures and the chosen day are written for this date.
beforeEach(() => pinDate('2026-10-20T18:00:00.000Z'));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  replace.mockClear();
  search = '';
});

function setup(items = [availableTrip()]) {
  const asked: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    asked.push(String(input));
    return Response.json(availableTripPage(items));
  });
  const onChoose = jest.fn();
  render(<CounterTrips onChoose={onChoose} />, { wrapper: queryWrapper().wrapper });
  return { asked, onChoose };
}

describe('CounterTrips', () => {
  it('lists the trips of the branch on sale with their free seats', async () => {
    setup();

    const row = await screen.findByRole('row', { name: /Quetzaltenango/ });
    expect(within(row).getByText(/Guatemala/)).toBeInTheDocument();
    expect(within(row).getByText('37')).toBeInTheDocument();
    expect(within(row).getByText(/Q\s?85\.00/)).toBeInTheDocument();
  });

  it('opens the sale of the trip the person chooses', async () => {
    const { onChoose } = setup();

    await userEvent.click(await screen.findByRole('button', { name: /Vender Quetzaltenango/ }));

    expect(onChoose).toHaveBeenCalledWith(availableTrip().tripId);
  });

  it('shows a full trip as sold out, with nothing to sell', async () => {
    setup([availableTrip({ freeSeats: 0 })]);

    expect(await screen.findByText('Agotado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vender/ })).not.toBeInTheDocument();
  });

  it('says so when no trip leaves from the branch', async () => {
    setup([]);

    expect(
      await screen.findByText('No hay viajes a la venta desde tu sucursal a partir de ese día.'),
    ).toBeInTheDocument();
  });

  it('asks the server for the day and the search the address carries', async () => {
    search = 'desde=2026-10-25&buscar=xela';
    const { asked } = setup();

    await waitFor(() => expect(asked[0]).toContain('from=2026-10-25'));
    expect(asked[0]).toContain('q=xela');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-25');
  });

  it('keeps the chosen day in the address', async () => {
    setup();

    // A day that is never today, since choosing the day already shown changes nothing.
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2030-01-15' } });

    expect(replace).toHaveBeenCalledWith('/sucursal/ventanilla?desde=2030-01-15', {
      scroll: false,
    });
  });

  it('offers to try again when the trips cannot be loaded', async () => {
    let calls = 0;
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ statusCode: 503, message: 'caído' }, { status: 503 })
        : Response.json(availableTripPage([availableTrip()]));
    });
    render(<CounterTrips onChoose={jest.fn()} />, { wrapper: queryWrapper().wrapper });

    expect(await screen.findByText('No pudimos cargar los viajes.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('row', { name: /Quetzaltenango/ })).toBeInTheDocument();
  });
});
