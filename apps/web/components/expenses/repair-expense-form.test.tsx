import { todayInGuatemala } from '@debus/contracts';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { useBusesPage } from '../../hooks/use-buses';
import { useExpenseCategoriesPage } from '../../hooks/use-expense-categories';
import { useCreateRepairExpense } from '../../hooks/use-repair-expenses';
import { CATEGORY_IDS, category, page, repairExpense } from '../../test-support/expenses';
import { bus, busPage } from '../../test-support/fleet';
import { RepairExpenseForm } from './repair-expense-form';

jest.mock('../../hooks/use-buses');
jest.mock('../../hooks/use-expense-categories');
jest.mock('../../hooks/use-own-branch', () => ({
  useOwnBranch: () => ({ id: 'br', name: 'Quetzaltenango' }),
}));
jest.mock('../../hooks/use-repair-expenses');
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const user = userEvent.setup({ applyAccept: false });
const BUS_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OFF_BUS_ID = '8d0f7780-8536-41ef-a55c-f18fd2a01bf8';
const EXPENSE_ID = '3d4e5f60-7182-4c93-8da4-b5c6d7e8f9a0';

const buses = [
  bus({ id: BUS_ID, plate: 'C482BTX' }),
  bus({ id: OFF_BUS_ID, plate: 'C055DFG', active: false, displayStatus: 'INACTIVE' }),
];
const categories = [
  category({ id: CATEGORY_IDS.engine, name: 'Motor' }),
  category({ id: CATEGORY_IDS.tires, name: 'Llantas' }),
];

function setup(create = jest.fn().mockResolvedValue(repairExpense())) {
  jest.mocked(useBusesPage).mockReturnValue({ data: busPage(buses) } as never);
  jest.mocked(useExpenseCategoriesPage).mockReturnValue({ data: page(categories) } as never);
  jest.mocked(useCreateRepairExpense).mockReturnValue({ mutateAsync: create } as never);
  render(<RepairExpenseForm />);
  return { create };
}

const choose = async (scope: HTMLElement, label: string, option: string | RegExp) => {
  await user.click(within(scope).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
};
const line = (position: number) => screen.getByRole('group', { name: `Línea ${position}` });
const type = (scope: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });

async function fillOneLine(amount = '5,200.00') {
  await choose(document.body, 'Bus', /C-482BTX/);
  await choose(line(1), 'Categoría', 'Motor');
  type(line(1), 'Monto (Q)', amount);
}
const save = () => user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

beforeEach(() => {
  push.mockReset();
  jest.mocked(toast.success).mockReset();
  jest.spyOn(crypto, 'randomUUID').mockReturnValue(EXPENSE_ID);
});
afterEach(() => jest.restoreAllMocks());

describe('RepairExpenseForm', () => {
  it('starts with the date of today, editable, and one line to fill', () => {
    setup();

    expect(screen.getByLabelText('Fecha del servicio')).toHaveValue(todayInGuatemala());
    expect(screen.getByLabelText('Fecha del servicio')).toHaveAttribute('max', todayInGuatemala());
    expect(screen.getAllByRole('group', { name: /Línea/ })).toHaveLength(1);
  });

  it('offers the buses of the branch, even a deactivated one but disabled, and the active categories', async () => {
    setup();

    expect(useBusesPage).toHaveBeenCalledWith({ status: 'all', page: 1, pageSize: 100 });
    expect(useExpenseCategoriesPage).toHaveBeenCalledWith({
      status: 'active',
      page: 1,
      pageSize: 100,
    });
    await user.click(screen.getByRole('combobox', { name: 'Bus' }));
    expect(await screen.findByRole('option', { name: 'C-482BTX' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'C-055DFG (desactivado)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('adds a line and removes it, but never the only one', async () => {
    setup();

    expect(within(line(1)).getByRole('button', { name: 'Quitar línea 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    expect(screen.getAllByRole('group', { name: /Línea/ })).toHaveLength(2);

    await user.click(within(line(2)).getByRole('button', { name: 'Quitar línea 2' }));

    expect(screen.getAllByRole('group', { name: /Línea/ })).toHaveLength(1);
  });

  it('stacks the fields of a line on a phone', () => {
    setup();

    expect(within(line(1)).getByTestId('line-fields')).toHaveClass('grid-cols-1');
  });

  it('adds up labour and parts while typing', async () => {
    setup();

    await user.click(screen.getByRole('button', { name: 'Agregar línea' }));
    type(line(1), 'Monto (Q)', '1200');
    type(line(2), 'Monto (Q)', '4,000.50');
    await choose(line(2), 'Tipo', 'Repuesto');

    const totals = screen.getByRole('status', { name: 'Total del gasto' });
    expect(totals).toHaveTextContent(/Mano de obra\s*Q\s?1,200\.00/);
    expect(totals).toHaveTextContent(/Repuestos\s*Q\s?4,000\.50/);
    expect(totals).toHaveTextContent(/Total\s*Q\s?5,200\.50/);
  });

  it('marks what is missing, focuses the first thing and sends nothing', async () => {
    const { create } = setup();

    await save();

    expect(screen.getByText('Elige el bus.')).toBeInTheDocument();
    expect(screen.getByText('Elige la categoría.')).toBeInTheDocument();
    expect(
      screen.getByText('Escribe el monto en quetzales, mayor que cero y con hasta dos decimales.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
  });

  it('says the total is too large and focuses the first amount, sending nothing', async () => {
    const { create } = setup();
    await fillOneLine('600,000');
    await user.click(screen.getByRole('button', { name: /Agregar línea/ }));
    await choose(line(2), 'Categoría', 'Llantas');
    type(line(2), 'Monto (Q)', '400,000.01');

    await save();

    expect(screen.getByRole('alert')).toHaveTextContent(/El total del gasto no puede pasar de/);
    expect(within(line(1)).getByLabelText('Monto (Q)')).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
  });

  it('marks the category of a line when only the bus is chosen', async () => {
    setup();

    await choose(document.body, 'Bus', /C-482BTX/);
    await save();

    expect(within(line(1)).getByRole('combobox', { name: 'Categoría' })).toHaveFocus();
  });

  it('sends the expense with the id it generated and goes back to the list', async () => {
    const { create } = setup();

    await fillOneLine();
    await user.type(within(line(1)).getByLabelText(/Descripción/), 'Cambio de bomba');
    await save();

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        id: EXPENSE_ID,
        busId: BUS_ID,
        serviceDate: todayInGuatemala(),
        lines: [
          {
            categoryId: CATEGORY_IDS.engine,
            kind: 'LABOR',
            description: 'Cambio de bomba',
            amount: 5200,
          },
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Gasto registrado.');
    expect(push).toHaveBeenCalledWith('/sucursal/gastos');
  });

  it('sends the same id again when a failed save is retried', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'El servicio no respondió. Intenta de nuevo.'))
      .mockResolvedValue(repairExpense());
    setup(create);

    await fillOneLine();
    await save();
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no respondió.');
    await save();

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0]?.[0].id).toBe(EXPENSE_ID);
    expect(create.mock.calls[1]?.[0].id).toBe(EXPENSE_ID);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/sucursal/gastos');
  });

  it('sends one expense when the button is pressed twice in a row', async () => {
    const create = jest.fn(() => new Promise(() => undefined));
    setup(create);

    await fillOneLine();
    await user.dblClick(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled();
  });

  it('shows a refused bus next to its field', async () => {
    setup(jest.fn().mockRejectedValue(new ApiError(409, 'Ese bus está desactivado.')));

    await fillOneLine();
    await save();

    expect(await screen.findByText('Ese bus está desactivado.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Bus' })).toHaveFocus());
    expect(push).not.toHaveBeenCalled();
  });

  it('shows any other refusal on top of the form', async () => {
    setup(
      jest
        .fn()
        .mockRejectedValue(
          new ApiError(409, 'Una de las categorías está desactivada. Elige otra.'),
        ),
    );

    await fillOneLine();
    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Una de las categorías está desactivada.',
    );
  });

  it('leads back to the list from the cancel link', () => {
    setup();

    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
      'href',
      '/sucursal/gastos',
    );
  });
});
