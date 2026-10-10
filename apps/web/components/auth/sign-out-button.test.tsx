import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from './sign-out-button';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const fetchMock = jest.fn();
beforeEach(() => {
  replace.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('closes the session and returns to the login', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  render(<SignOutButton />);

  await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

  expect(fetchMock).toHaveBeenCalledWith('/api/sesion/logout', expect.anything());
  expect(replace).toHaveBeenCalledWith('/login');
});
