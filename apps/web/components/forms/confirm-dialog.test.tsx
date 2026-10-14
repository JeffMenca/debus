import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('requires the check before confirming and closes when done', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    const onOpenChange = jest.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Registrar la llegada?"
        description="No se podrá cambiar después."
        confirmLabel="Registrar llegada"
        checkLabel="Revisé los datos y son correctos"
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Registrar llegada' });

    expect(confirm).toBeDisabled();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Revisé los datos y son correctos' }),
    );
    await userEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the details the person is about to confirm', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="¿Registrar la salida?"
        description="No se podrá cambiar después."
        confirmLabel="Registrar salida"
        details={<dl aria-label="Resumen">resumen de la salida</dl>}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Resumen')).toHaveTextContent('resumen de la salida');
  });

  it('keeps the dialog open with a friendly message when it fails', async () => {
    const onConfirm = jest
      .fn()
      .mockRejectedValue(
        new ApiError(409, 'La sucursal debe conservar al menos un administrador.'),
      );
    const onOpenChange = jest.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Desactivar a Luis?"
        description=""
        confirmLabel="Desactivar"
        tone="danger"
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La sucursal debe conservar al menos un administrador.',
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeEnabled();
  });

  it('says it is saving while the action runs', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <ConfirmDialog
        open
        onOpenChange={jest.fn()}
        title="¿Guardar?"
        description="Cambia la sucursal."
        confirmLabel="Guardar"
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    finish();
  });

  it('cancels without running the action', async () => {
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Salir?"
        description=""
        confirmLabel="Salir"
        onConfirm={onConfirm}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('starts clean every time it opens', async () => {
    const onConfirm = jest.fn().mockRejectedValue(new ApiError(409, 'No se puede.'));
    const props = {
      onOpenChange: jest.fn(),
      title: '¿Desactivar?',
      description: '',
      confirmLabel: 'Desactivar',
      checkLabel: 'Entiendo',
      onConfirm,
    };
    const { rerender } = render(<ConfirmDialog open {...props} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Entiendo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(<ConfirmDialog open={false} {...props} />);
    rerender(<ConfirmDialog open {...props} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Entiendo' })).not.toBeChecked();
  });
});
