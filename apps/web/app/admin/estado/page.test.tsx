import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import StatusPage from './page';

it('renders the system status page', () => {
  expect(StatusPage.name).toBe('StatusPage');
  jest.spyOn(global, 'fetch').mockReturnValue(new Promise(() => undefined));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StatusPage />
    </QueryClientProvider>,
  );

  expect(screen.getByRole('heading', { level: 1, name: 'Estado del sistema' })).toBeInTheDocument();
  expect(screen.getByLabelText('Cargando servicios')).toBeInTheDocument();
});
