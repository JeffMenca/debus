import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, mockClientesApi, profile } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { ProfileCard } from './profile-card';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

afterEach(() => jest.restoreAllMocks());

const renderCard = () => render(<ProfileCard />, { wrapper: queryWrapper().wrapper });

describe('ProfileCard', () => {
  it('shows who the person is and their data the way they write it', async () => {
    mockClientesApi({ 'GET /profile': () => Response.json(profile()) });
    renderCard();

    expect(await screen.findByText('Ana Méndez')).toBeInTheDocument();
    expect(screen.getByText('ana.mendez@correo.com')).toBeInTheDocument();
    expect(screen.getByText('AM')).toBeInTheDocument();
    expect(screen.getByText('4521837-6')).toBeInTheDocument();
    expect(screen.getByText('2734 51920 0901')).toBeInTheDocument();
    expect(screen.getByText('5512-3489')).toBeInTheDocument();
    expect(screen.getByText('Zona 3, Quetzaltenango')).toBeInTheDocument();
  });

  it('says which data is still missing', async () => {
    mockClientesApi({
      'GET /profile': () =>
        Response.json(profile({ nit: null, dpi: null, phone: null, address: null })),
    });
    renderCard();

    expect(await screen.findAllByText('Sin registrar')).toHaveLength(4);
  });

  it('edits the profile and shows the saved data', async () => {
    let sent: unknown;
    mockClientesApi({
      'GET /profile': () => Response.json(profile()),
      'PUT /profile': (init) => {
        sent = JSON.parse(String(init.body));
        return Response.json(profile({ nit: '1234567K', address: 'Zona 1' }));
      },
    });
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText(/NIT/));
    await userEvent.type(within(dialog).getByLabelText(/NIT/), '1234567-k');
    await userEvent.clear(within(dialog).getByLabelText(/Dirección/));
    await userEvent.type(within(dialog).getByLabelText(/Dirección/), 'Zona 1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent).toEqual({
      dpi: '2734519200901',
      phone: '55123489',
      nit: '1234567K',
      address: 'Zona 1',
    });
    expect(screen.getByText('1234567-K')).toBeInTheDocument();
  });

  it('points at the field the person must fix', async () => {
    mockClientesApi({
      'GET /profile': () => Response.json(profile()),
      'PUT /profile': () => apiError(409, 'Ese NIT ya está registrado en otra cuenta.'),
    });
    renderCard();

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('DPI'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByText('El DPI tiene 13 dígitos.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('DPI'), '2734519200901');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await within(dialog).findByText('Ese NIT ya está registrado en otra cuenta.'),
    ).toBeInTheDocument();
  });

  it('explains when the profile is not ready yet', async () => {
    mockClientesApi({
      'GET /profile': () => apiError(404, 'Estamos preparando tu cuenta.'),
    });
    renderCard();

    expect(await screen.findByText('Estamos preparando tu cuenta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });
});
