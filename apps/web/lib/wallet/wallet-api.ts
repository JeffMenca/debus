import {
  type TopUpRequest,
  type Wallet,
  type WalletMovementListQuery,
  walletMovementPageSchema,
  walletSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const WALLET_PATH = '/api/clientes/wallet';
const BALANCE_KEY = ['wallet', 'balance'];

export function useWallet() {
  return useQuery({
    queryKey: BALANCE_KEY,
    queryFn: () => apiRequest(WALLET_PATH, walletSchema),
  });
}

export type MovementsQuery = Pick<WalletMovementListQuery, 'kind' | 'page' | 'pageSize'>;

// The server filters and pages; the previous page stays on screen while the next one arrives.
export function useWalletMovements(query: MovementsQuery) {
  return useQuery({
    queryKey: ['wallet', 'movements', query],
    queryFn: () =>
      apiRequest(
        `${WALLET_PATH}/movements?${toQueryString({ ...query })}`,
        walletMovementPageSchema,
      ),
    placeholderData: keepPreviousData,
  });
}

export interface TopUp {
  // One key per top-up: sending it again (a retry) never adds the money twice.
  key: string;
  request: TopUpRequest;
}

export function useTopUp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, request }: TopUp): Promise<Wallet> =>
      apiRequest(`${WALLET_PATH}/top-ups`, walletSchema, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'idempotency-key': key },
      }),
    onSuccess: (wallet) => {
      client.setQueryData(BALANCE_KEY, wallet);
      return client.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
