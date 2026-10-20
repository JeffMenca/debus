import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useOwnBranch } from '../../hooks/use-own-branch';
import { CounterScreen } from './counter-screen';

jest.mock('../../hooks/use-own-branch');
jest.mock('./counter-trips', () => ({
  CounterTrips: ({ onChoose }: { onChoose: (tripId: string) => void }) => (
    <button onClick={() => onChoose('trip-1')}>elegir viaje</button>
  ),
}));
jest.mock('./counter-sale', () => ({
  CounterSale: ({ tripId, onBack }: { tripId: string; onBack: () => void }) => (
    <button onClick={onBack}>volver de {tripId}</button>
  ),
}));
const push = jest.fn();
let search = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/sucursal/ventanilla',
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  push.mockClear();
  jest.mocked(useOwnBranch).mockReturnValue({ name: 'Quetzaltenango' } as never);
});

describe('CounterScreen', () => {
  it('starts with the trips and opens the chosen one in the address, keeping the list state', async () => {
    search = 'desde=2026-10-25&pagina=2';
    render(<CounterScreen />);

    expect(screen.getByRole('heading', { name: 'Ventanilla' })).toBeInTheDocument();
    expect(screen.getByText('Operación · Quetzaltenango')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'elegir viaje' }));

    expect(push).toHaveBeenCalledWith(
      '/sucursal/ventanilla?desde=2026-10-25&pagina=2&viaje=trip-1',
      { scroll: false },
    );
  });

  it('sells the trip in the address and goes back to the same list', async () => {
    search = 'desde=2026-10-25&viaje=trip-1';
    render(<CounterScreen />);

    await userEvent.click(screen.getByRole('button', { name: 'volver de trip-1' }));

    expect(push).toHaveBeenCalledWith('/sucursal/ventanilla?desde=2026-10-25', { scroll: false });
  });

  it('names the screen without the branch while it loads', () => {
    jest.mocked(useOwnBranch).mockReturnValue(undefined);
    search = '';
    render(<CounterScreen />);

    expect(screen.getByText('Operación')).toBeInTheDocument();
  });
});
