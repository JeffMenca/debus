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

  expect(fetchMock).toHaveBeenCalledWith('/api/session/logout', expect.anything());
  expect(replace).toHaveBeenCalledWith('/login');
});

it('can be an icon-only button that keeps its name', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  render(<SignOutButton compact />);

  const button = screen.getByRole('button', { name: 'Cerrar sesión' });
  expect(button).toHaveTextContent('');

  await userEvent.click(button);

  expect(replace).toHaveBeenCalledWith('/login');
});
