import { EXPENSE_CATEGORY_NAME_MAX } from '@debus/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useSaveExpenseCategory } from '../../hooks/use-expense-categories';
import { category } from '../../test-support/expenses';
import { CategoryDialog } from './category-dialog';

jest.mock('../../hooks/use-expense-categories');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const user = userEvent.setup({ applyAccept: false });

function setup(
  existing: ReturnType<typeof category> | null = null,
  mutateAsync = jest.fn().mockResolvedValue(category()),
) {
  jest.mocked(useSaveExpenseCategory).mockReturnValue({ mutateAsync } as never);
  const onOpenChange = jest.fn();
  render(<CategoryDialog open onOpenChange={onOpenChange} category={existing} />);
  return { mutateAsync, onOpenChange };
}

beforeEach(() => jest.mocked(toast.success).mockReset());

describe('creating a category', () => {
  it('asks for the name only and saves it', async () => {
    const { mutateAsync, onOpenChange } = setup();

    expect(screen.getByRole('dialog', { name: 'Nueva categoría' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre'), 'Turbo');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ request: { name: 'Turbo' } }));
    expect(toast.success).toHaveBeenCalledWith('Creamos la categoría Turbo.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('limits the name to what the service accepts', () => {
    setup();

    expect(screen.getByLabelText('Nombre')).toHaveAttribute(
      'maxlength',
      String(EXPENSE_CATEGORY_NAME_MAX),
    );
  });

  it('says what is wrong with the name before asking the service and focuses it', async () => {
    const { mutateAsync } = setup();

    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(await screen.findByText('Escribe un nombre de 2 a 40 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows a repeated name next to the field and focuses it', async () => {
    const { onOpenChange } = setup(
      null,
      jest.fn().mockRejectedValue(new ApiError(409, 'Ya existe una categoría con ese nombre.')),
    );

    await user.type(screen.getByLabelText('Nombre'), 'Motor');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(await screen.findByText('Ya existe una categoría con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeInvalid();
    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveFocus());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('shows any other failure on top of the form', async () => {
    setup(
      null,
      jest.fn().mockRejectedValue(new ApiError(503, 'El servicio no respondió. Intenta de nuevo.')),
    );

    await user.type(screen.getByLabelText('Nombre'), 'Turbo');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no respondió.');
  });
});

describe('renaming a category', () => {
  it('starts on the current name and saves the new one', async () => {
    const { mutateAsync, onOpenChange } = setup(category({ id: 'c1', name: 'Motor' }));

    expect(screen.getByRole('dialog', { name: 'Renombrar categoría' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Motor');
    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Motor y turbo');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ id: 'c1', request: { name: 'Motor y turbo' } }),
    );
    expect(toast.success).toHaveBeenCalledWith('Guardamos el nuevo nombre: Motor y turbo.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
