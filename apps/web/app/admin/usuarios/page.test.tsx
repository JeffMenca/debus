import { render, screen } from '@testing-library/react';
import UsersPage, { metadata } from './page';

jest.mock('../../../components/admin/users-screen', () => ({
  UsersScreen: () => <p>lista de usuarios</p>,
}));

it('shows the users list', () => {
  render(<UsersPage />);

  expect(screen.getByText('lista de usuarios')).toBeInTheDocument();
  expect(metadata.title).toBe('Usuarios · debus');
});
