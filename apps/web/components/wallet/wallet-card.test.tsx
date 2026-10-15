import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiError, mockClientesApi, wallet } from '../../test-support/account';
import { queryWrapper } from '../../test-support/query-wrapper';
import { WalletCard } from './wallet-card';

afterEach(() => jest.restoreAllMocks());

const renderCard = () => render(<WalletCard />, { wrapper: queryWrapper().wrapper });

describe('WalletCard', () => {
  it('shows the available balance in quetzales', async () => {
    mockClientesApi({ 'GET /wallet': () => Response.json(wallet({ balance: 340 })) });
    renderCard();

    expect(await screen.findByText(/Q\s?340\.00/, { selector: '.sr-only' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cartera digital' })).toBeInTheDocument();
    expect(screen.getByText('Saldo disponible')).toBeInTheDocument();
  });

  it('explains when the account is still being prepared and lets the person retry', async () => {
    let calls = 0;
    mockClientesApi({
      'GET /wallet': () => {
        calls += 1;
        return calls === 1
          ? apiError(404, 'Estamos preparando tu cuenta. Vuelve a intentar en unos segundos.')
          : Response.json(wallet({ balance: 0 }));
      },
    });
    renderCard();

    expect(await screen.findByText(/preparando tu cuenta/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(/Q\s?0\.00/, { selector: '.sr-only' })).toBeInTheDocument();
  });
});
