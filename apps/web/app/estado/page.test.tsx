import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import EstadoPage from './page';

it('renders the system status page', () => {
  jest.spyOn(global, 'fetch').mockReturnValue(new Promise(() => undefined));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EstadoPage />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeInTheDocument();
  expect(screen.getByLabelText('Cargando servicios')).toBeInTheDocument();
});
