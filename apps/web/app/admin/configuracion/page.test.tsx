import { render, screen } from '@testing-library/react';
import SettingsPage, { metadata } from './page';

jest.mock('../../../components/admin/settings-screen', () => ({
  SettingsScreen: () => <p>pantalla de configuración</p>,
}));

it('shows the settings screen', () => {
  render(<SettingsPage />);

  expect(screen.getByText('pantalla de configuración')).toBeInTheDocument();
  expect(metadata.title).toBe('Configuración · debus');
});
