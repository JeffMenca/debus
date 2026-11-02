import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, mockClientesApi, wallet } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { TopUpCard } from './top-up-card';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
const { toast } = jest.requireMock<{ toast: { success: jest.Mock } }>('sonner');

afterEach(() => jest.clearAllMocks());

const TODAY = '2026-10-14';
const renderCard = () => render(<TopUpCard today={TODAY} />, { wrapper: queryWrapper().wrapper });

function captureTopUps(answer: () => Response = () => Response.json(wallet(), { status: 201 })) {
  const sent: { key: string; body: unknown }[] = [];
  mockClientesApi({
    'GET /wallet': () => Response.json(wallet()),
    'POST /wallet/top-ups': (init) => {
      const headers = init.headers as Record<string, string>;
      sent.push({ key: headers['idempotency-key']!, body: JSON.parse(String(init.body)) });
      return answer();
    },
  });
  return sent;
}

describe('TopUpCard', () => {
  it('starts on Q 100 and today, and names the amount on the button', () => {
    captureTopUps();
    renderCard();

    expect(screen.getByRole('button', { name: /Q\s?100$/, pressed: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Monto')).toHaveValue('100');
    expect(screen.getByLabelText('Fecha de recarga')).toHaveValue(TODAY);
    expect(screen.getByRole('button', { name: /Recargar Q\s?100\.00/ })).toBeInTheDocument();
  });

  it('picks a suggested amount and sends it with the chosen day and a key', async () => {
    const sent = captureTopUps();
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: /Q\s?200$/ }));
    await userEvent.clear(screen.getByLabelText('Fecha de recarga'));
    await userEvent.type(screen.getByLabelText('Fecha de recarga'), '2026-10-10');
    await userEvent.click(screen.getByRole('button', { name: /Recargar Q\s?200\.00/ }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.body).toEqual({ amount: 200, paidOn: '2026-10-10' });
    expect(sent[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Recargaste Q\s?200\.00/));
  });

  it('waits for the account to be ready before letting the person top up', async () => {
    mockClientesApi({ 'GET /wallet': () => apiError(404, 'Estamos preparando tu cuenta.') });
    renderCard();

    expect(
      await screen.findByText(/Podrás recargar en cuanto tu cuenta esté lista/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recargar Q/ })).toBeDisabled();
  });

  it('asks for a valid amount before sending anything', async () => {
    const sent = captureTopUps();
    renderCard();

    await userEvent.clear(screen.getByLabelText('Monto'));
    await userEvent.type(screen.getByLabelText('Monto'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }));

    expect(screen.getByText(/Escribe un monto/)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('retries a failed top-up with the same key and uses a new one after a success', async () => {
    let fail = true;
    const sent = captureTopUps(() =>
      fail
        ? apiError(503, 'El servicio no respondió. Intenta de nuevo en unos segundos.')
        : Response.json(wallet(), { status: 201 }),
    );
    renderCard();
    const submit = () => userEvent.click(screen.getByRole('button', { name: /Recargar Q/ }));

    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no respondió');
    fail = false;
    await submit();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    await submit();

    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[1]!.key).toBe(sent[0]!.key);
    expect(sent[2]!.key).not.toBe(sent[1]!.key);
  });

  it('uses a new key when the amount changes after a failure', async () => {
    const sent = captureTopUps(() => apiError(503, 'El servicio no respondió.'));
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: /Recargar Q/ }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /Q\s?50$/ }));
    await userEvent.click(screen.getByRole('button', { name: /Recargar Q/ }));

    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.key).not.toBe(sent[0]!.key);
  });
});
