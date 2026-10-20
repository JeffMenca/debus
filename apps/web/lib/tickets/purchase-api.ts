import { type Purchase, type PurchaseTicketRequest, purchaseSchema } from '@debus/contracts';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, apiRequest } from '@/lib/api/client';
import { PURCHASE_POLL_MS } from './purchase';
import { MY_TICKETS_KEY } from './my-tickets-api';
import { ON_SALE_KEY, VENTAS_PATH } from './trips-api';

const WALLET_KEY = ['wallet'];

const refresh = (client: QueryClient, keys: string[][]) =>
  Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));

// A settled purchase moved money (or gave it back) and took seats (or freed them).
const refreshSettled = (client: QueryClient) =>
  refresh(client, [WALLET_KEY, MY_TICKETS_KEY, ON_SALE_KEY]);

export interface PurchaseOrder {
  // The id of the new ticket: sending it again (a retry) never charges twice.
  key: string;
  request: PurchaseTicketRequest;
}

// Answers 201 with the confirmed purchase or 202 while the payment is still being confirmed.
export function usePurchaseTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, request }: PurchaseOrder): Promise<Purchase> =>
      apiRequest(`${VENTAS_PATH}/purchases`, purchaseSchema, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'idempotency-key': key },
      }),
    onSuccess: (purchase) => (purchase.status === 'CONFIRMED' ? refreshSettled(client) : undefined),
    // A seat sold in the meantime or a short balance: the map and the balance changed. A 503 charged
    // nothing and a lost answer changed nothing on screen, so both leave it as it is.
    onError: (error) =>
      error instanceof ApiError && (error.status === 409 || error.status === 422)
        ? refresh(client, [WALLET_KEY, ON_SALE_KEY])
        : undefined,
  });
}

// Follows a purchase answered with 202 until it is confirmed or fails, while `polling` holds.
export function usePurchase(pending: Purchase | null, polling: boolean) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['purchase', pending?.ticketId],
    queryFn: () => apiRequest(`${VENTAS_PATH}/purchases/${pending?.ticketId}`, purchaseSchema),
    enabled: pending !== null,
    initialData: pending ?? undefined,
    // The answer of the POST is fresh: the first question waits a whole interval.
    staleTime: PURCHASE_POLL_MS,
    refetchInterval: (current) =>
      polling && current.state.data?.status === 'PENDING' ? PURCHASE_POLL_MS : false,
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status === 'CONFIRMED' || status === 'FAILED') void refreshSettled(client);
  }, [status, client]);
  return query;
}
