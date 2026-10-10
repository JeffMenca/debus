import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetPasswordScreen } from './set-password-screen';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('shows the form for a valid link and the link problem if saving finds it expired', async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ state: 'valid', purpose: 'PASSWORD_RESET' }))
    .mockResolvedValueOnce(
      Response.json(
        { statusCode: 410, error: 'Gone', message: 'Este enlace ya venció.' },
        { status: 410 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ state: 'expired', purpose: 'PASSWORD_RESET' }));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SetPasswordScreen token="t" purpose="PASSWORD_RESET" />
    </QueryClientProvider>,
  );

  await userEvent.type(await screen.findByLabelText('Contraseña'), 'clave-segura-1');
  await userEvent.type(screen.getByLabelText('Repite tu contraseña'), 'clave-segura-1');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

  expect(await screen.findByRole('heading', { name: 'Este enlace ya venció' })).toBeInTheDocument();
});
