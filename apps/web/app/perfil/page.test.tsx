import { render, screen } from '@testing-library/react';
import ProfilePage, { metadata } from './page';

jest.mock('../../components/account/profile-card', () => ({
  ProfileCard: () => <p>tarjeta de perfil</p>,
}));

it('shows the profile of the person under its title', () => {
  render(<ProfilePage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeInTheDocument();
  expect(screen.getByText('tarjeta de perfil')).toBeInTheDocument();
  expect(metadata.title).toBe('Mi perfil · debus');
});
