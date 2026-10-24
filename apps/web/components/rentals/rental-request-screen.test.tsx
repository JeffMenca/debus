import { render, screen } from '@testing-library/react';
import { RentalRequestScreen } from './rental-request-screen';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/alquiler',
  useSearchParams: () => new URLSearchParams('pagina=2'),
}));
jest.mock('./rental-request-card', () => ({ RentalRequestCard: () => <p>formulario</p> }));
jest.mock('./rental-history', () => ({
  RentalHistory: ({ query }: { query: { page: number } }) => <p>historial página {query.page}</p>,
}));

it('puts the request next to the history, which pages from the address', () => {
  render(<RentalRequestScreen />);

  expect(screen.getByRole('heading', { name: 'Alquila un bus' })).toBeInTheDocument();
  expect(screen.getByText('formulario')).toBeInTheDocument();
  expect(screen.getByText('historial página 2')).toBeInTheDocument();
});
