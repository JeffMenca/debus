import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { clearSession, setSession } from '@/lib/auth/session-store';
import { useBranchOptions } from '../../hooks/use-branches';
import { useSaveRoute } from '../../hooks/use-routes';
import { BRANCH_ID, OTHER_BRANCH_ID, route } from '../../test-support/fleet';
import { RouteDialog } from './route-dialog';

jest.mock('../../hooks/use-branches');
jest.mock('../../hooks/use-routes');
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const PETEN_ID = '5d5d5d5d-5555-4555-8555-555555555555';

function setup({
  existing,
  save = jest.fn().mockResolvedValue(route()),
}: { existing?: ReturnType<typeof route>; save?: jest.Mock } = {}) {
  act(() =>
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Luis Ramírez',
        email: 'l@b.com',
        role: 'BRANCH_ADMIN',
        branchId: BRANCH_ID,
      },
    }),
  );
  jest.mocked(useSaveRoute).mockReturnValue({ mutateAsync: save } as never);
  jest.mocked(useBranchOptions).mockReturnValue({
    data: [
      { id: BRANCH_ID, name: 'Quetzaltenango', active: true },
      { id: OTHER_BRANCH_ID, name: 'Guatemala', active: true },
      { id: PETEN_ID, name: 'Flores', active: true },
    ],
  } as never);
  const onOpenChange = jest.fn();
  render(<RouteDialog open route={existing ?? null} onOpenChange={onOpenChange} />);
  return { save, onOpenChange };
}
const submit = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const chooseDestination = async (name: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: 'Destino' }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

beforeEach(() => jest.mocked(toast.success).mockReset());
afterEach(() => act(() => clearSession()));

describe('creating a route', () => {
  it('does not offer the own branch as destination', async () => {
    setup();

    await userEvent.click(screen.getByRole('combobox', { name: 'Destino' }));

    expect(await screen.findByRole('option', { name: 'Guatemala' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Flores' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Quetzaltenango' })).not.toBeInTheDocument();
    expect(useBranchOptions).toHaveBeenCalledWith({ status: 'active' });
  });

  it('sends the destination, distance and price as numbers', async () => {
    const { save, onOpenChange } = setup();
    await chooseDestination('Guatemala');
    await userEvent.type(screen.getByLabelText('Distancia (km)'), '206.5');
    await userEvent.type(screen.getByLabelText('Precio del boleto (Q)'), '85');

    await submit('Crear ruta');

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(save).toHaveBeenCalledWith({
      input: { destinationBranchId: OTHER_BRANCH_ID, distanceKm: 206.5, ticketPrice: 85 },
    });
    expect(toast.success).toHaveBeenCalledWith('Creamos la ruta a Guatemala.');
  });

  it('says what is missing and sends nothing', async () => {
    const { save } = setup();

    await submit('Crear ruta');

    expect(await screen.findByText('Elige la sucursal de destino.')).toBeInTheDocument();
    expect(
      screen.getByText('Escribe la distancia en kilómetros, con un decimal como máximo.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Escribe el precio del boleto en quetzales, con hasta dos decimales.'),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('stops the distance at one decimal while typing', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Distancia (km)'), '206.55');

    expect(screen.getByLabelText('Distancia (km)')).toHaveValue('206.5');
  });

  it('shows a repeated pair next to the destination', async () => {
    setup({
      save: jest
        .fn()
        .mockRejectedValue(
          new ApiError(
            409,
            'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
          ),
        ),
    });
    await chooseDestination('Guatemala');
    await userEvent.type(screen.getByLabelText('Distancia (km)'), '206.5');
    await userEvent.type(screen.getByLabelText('Precio del boleto (Q)'), '85');

    await submit('Crear ruta');

    expect(
      await screen.findByText(
        'Ya existe una ruta hacia esa sucursal. Edítala en lugar de crear otra.',
      ),
    ).toHaveAttribute('id', 'route-destination-error');
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveFocus();
  });

  it('shows a failure of the own branch at the top, not on the destination', async () => {
    setup({ save: jest.fn().mockRejectedValue(new ApiError(409, 'Tu sucursal no está activa.')) });
    await chooseDestination('Guatemala');
    await userEvent.type(screen.getByLabelText('Distancia (km)'), '206.5');
    await userEvent.type(screen.getByLabelText('Precio del boleto (Q)'), '85');

    await submit('Crear ruta');

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sucursal no está activa.');
    expect(screen.getByRole('combobox', { name: 'Destino' })).not.toBeInvalid();
  });

  it('points the destination at the message that explains its error', async () => {
    setup();

    await submit('Crear ruta');

    const message = await screen.findByText('Elige la sucursal de destino.');
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveAttribute(
      'aria-describedby',
      message.id,
    );
  });

  it('shows any other failure at the top', async () => {
    setup({ save: jest.fn().mockRejectedValue(new ApiError(0, 'No pudimos conectarnos.')) });
    await chooseDestination('Guatemala');
    await userEvent.type(screen.getByLabelText('Distancia (km)'), '206.5');
    await userEvent.type(screen.getByLabelText('Precio del boleto (Q)'), '85');

    await submit('Crear ruta');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos.');
  });
});

describe('editing a route', () => {
  it('starts from the saved route and keeps the destination fixed', () => {
    setup({ existing: route() });

    expect(screen.getByRole('dialog', { name: 'Editar ruta a Guatemala' })).toBeInTheDocument();
    expect(screen.getByLabelText('Distancia (km)')).toHaveValue('206.5');
    expect(screen.getByLabelText('Precio del boleto (Q)')).toHaveValue('85');
    expect(screen.getByRole('checkbox', { name: 'Aceptar viajes nuevos' })).toBeChecked();
    expect(screen.queryByRole('combobox', { name: 'Destino' })).not.toBeInTheDocument();
  });

  it('saves the new price and distance', async () => {
    const { save } = setup({ existing: route() });
    await userEvent.clear(screen.getByLabelText('Precio del boleto (Q)'));
    await userEvent.type(screen.getByLabelText('Precio del boleto (Q)'), '90');

    await submit('Guardar cambios');

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        id: route().id,
        input: { distanceKm: 206.5, ticketPrice: 90, active: true },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Guardamos los cambios de la ruta a Guatemala.');
  });

  it('stops accepting new trips when the box is cleared', async () => {
    const { save } = setup({ existing: route() });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Aceptar viajes nuevos' }));

    await submit('Guardar cambios');

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].input.active).toBe(false);
  });

  it('shows a failure at the top', async () => {
    setup({
      existing: route(),
      save: jest.fn().mockRejectedValue(new ApiError(404, 'No encontramos esa ruta.')),
    });

    await submit('Guardar cambios');

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos esa ruta.');
  });
});
