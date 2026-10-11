import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { DesignSystemShowcase } from './design-system-showcase';

jest.mock('sonner', () => ({ toast: { success: jest.fn() }, Toaster: () => null }));

describe('DesignSystemShowcase', () => {
  beforeEach(() => jest.mocked(toast.success).mockReset());

  it('shows every base piece in its own section', () => {
    render(<DesignSystemShowcase />);

    for (const name of [
      'Botones',
      'Campos',
      'Estados',
      'Indicadores',
      'Pestañas',
      'Tabla',
      'Diálogo',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sistema de diseño' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de pago')).toHaveAttribute('type', 'date');
    expect(screen.getByRole('table', { name: 'Buses de ejemplo' })).toBeInTheDocument();
  });

  it('has a single primary button, labeled as such', () => {
    render(<DesignSystemShowcase />);

    expect(screen.getByRole('button', { name: 'Primario' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Primario/ })).toHaveLength(1);
  });

  it('lists the five status tones', () => {
    render(<DesignSystemShowcase />);
    const states = screen.getByRole('region', { name: 'Estados' });

    for (const label of ['Disponible', 'En tránsito', 'En taller', 'Programado', 'Inactivo']) {
      expect(within(states).getByText(label)).toBeInTheDocument();
    }
  });

  it('opens the confirmation example with its check', async () => {
    render(<DesignSystemShowcase />);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir diálogo de ejemplo' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('checkbox')).toBeInTheDocument();
  });

  it('shows a notice', async () => {
    render(<DesignSystemShowcase />);

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar aviso' }));

    expect(toast.success).toHaveBeenCalledWith('Guardamos los cambios.');
  });

  it('switches the example tabs', async () => {
    render(<DesignSystemShowcase />);

    await userEvent.click(screen.getByRole('tab', { name: /Inactivos/ }));

    expect(screen.getByRole('tab', { name: /Inactivos/ })).toHaveAttribute('aria-selected', 'true');
  });
});
