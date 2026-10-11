import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowActions } from './row-actions';

describe('RowActions', () => {
  const setup = () => {
    const edit = jest.fn();
    const remove = jest.fn();
    render(
      <RowActions
        label="Ana López"
        actions={[
          { label: 'Editar', onSelect: edit },
          { label: 'Reenviar invitación', onSelect: jest.fn(), hidden: true },
          { label: 'Desactivar', onSelect: remove, tone: 'danger' },
        ]}
      />,
    );
    return { edit, remove };
  };

  it('names the menu button after the row', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Acciones de Ana López' })).toBeInTheDocument();
  });

  it('lists only the visible actions and paints the dangerous one', async () => {
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Ana López' }));

    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reenviar invitación' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toHaveClass('text-rose-700');
  });

  it('runs the chosen action', async () => {
    const { edit, remove } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Ana López' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));

    expect(edit).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
});
