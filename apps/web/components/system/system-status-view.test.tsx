import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemStatusView } from './system-status-view';

const status = {
  environment: 'production',
  checkedAt: '2026-10-06T12:00:00.000Z',
  units: [
    { unit: 'gateway', status: 'up', latencyMs: 0 },
    { unit: 'flota', status: 'down', latencyMs: 10000 },
  ],
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SystemStatusView />
    </QueryClientProvider>,
  );
}

describe('SystemStatusView', () => {
  beforeEach(() => {
    window.__DEBUS_ENV__ = { apiUrl: 'http://gw', appEnv: 'production' };
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete window.__DEBUS_ENV__;
  });

  it('lists every unit with a plain-language status and the environment', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(status));
    renderView();

    expect(await screen.findByText('Entrada principal')).toBeInTheDocument();
    expect(screen.getByText('En línea')).toBeInTheDocument();
    expect(screen.getByText('Sin respuesta')).toBeInTheDocument();
    expect(screen.getByText('Entorno: Producción')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows a friendly error with a way to retry', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('x'))
      .mockResolvedValue(Response.json(status));
    renderView();

    await userEvent.click(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

    expect(await screen.findByText('Entrada principal')).toBeInTheDocument();
  });

  it('sends a test notice and shows who received it', async () => {
    const probeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith('/api/sistema/estado')) return Promise.resolve(Response.json(status));
      if (init?.method === 'POST') {
        return Promise.resolve(Response.json({ probeId }, { status: 202 }));
      }
      return Promise.resolve(
        Response.json({ probeId, services: [{ service: 'flota', state: 'received' }] }),
      );
    });
    renderView();

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de prueba' }));

    expect(await screen.findByText('Recibido')).toBeInTheDocument();
  });
});
