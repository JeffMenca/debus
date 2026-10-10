import { render } from '@testing-library/react';
import { act } from 'react';
import { clearSession } from '@/lib/auth/session-store';
import AdminPage from './page';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/admin',
}));

it('is only for system administrators', () => {
  act(() => clearSession());
  render(<AdminPage />);

  expect(replace).toHaveBeenCalledWith('/login?siguiente=%2Fadmin');
});
