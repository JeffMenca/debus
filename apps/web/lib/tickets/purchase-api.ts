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

export const isTripCancelled = (purchase: Purchase | null | undefined): boolean =>
  purchase?.status === 'FAILED' && purchase.failure === 'TRIP_CANCELLED';

// A settled purchase moved money (or gave it back) and took seats (or freed them). A cancelled trip
// no longer has a seat map, so only the lists are asked for again.
function refreshSettled(client: QueryClient, purchase: Purchase): Promise<unknown> {
  const onSale = isTripCancelled(purchase)
    ? [
        [...ON_SALE_KEY, 'trips'],
        [...ON_SALE_KEY, 'places'],
      ]
    : [ON_SALE_KEY];
  return refresh(client, [WALLET_KEY, MY_TICKETS_KEY, ...onSale]);
}

const purchasePath = (ticketId: string) => `${VENTAS_PATH}/purchases/${ticketId}`;

// Errors carry only a message, so a 409 is told apart by the purchase it left: a trip deleted during
// the payment leaves it FAILED with TRIP_CANCELLED; a seat sold before the payment leaves none.
async function cancelledPurchase(ticketId: string): Promise<Purchase | null> {
  const stored = await apiRequest(purchasePath(ticketId), purchaseSchema).catch(() => null);
  return isTripCancelled(stored) ? stored : null;
}

export interface PurchaseOrder {
  // The id of the new ticket: sending it again (a retry) never charges twice.
  key: string;
  request: PurchaseTicketRequest;
}

// Answers 201 with the confirmed purchase or 202 while the payment is still being confirmed, and
// ends with the failed purchase when the trip was cancelled during the payment.
export function usePurchaseTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, request }: PurchaseOrder): Promise<Purchase> => {
      try {
        return await apiRequest(`${VENTAS_PATH}/purchases`, purchaseSchema, {
          method: 'POST',
          body: JSON.stringify(request),
          headers: { 'idempotency-key': key },
        });
      } catch (error) {
        const cancelled =
          error instanceof ApiError && error.status === 409 ? await cancelledPurchase(key) : null;
        if (cancelled) return cancelled;
        throw error;
      }
    },
    onSuccess: (purchase) =>
      purchase.status === 'PENDING' ? undefined : refreshSettled(client, purchase),
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
    queryFn: () => apiRequest(purchasePath(pending?.ticketId ?? ''), purchaseSchema),
    enabled: pending !== null,
    initialData: pending ?? undefined,
    // The answer of the POST is fresh: the first question waits a whole interval.
    staleTime: PURCHASE_POLL_MS,
    refetchInterval: (current) =>
      polling && current.state.data?.status === 'PENDING' ? PURCHASE_POLL_MS : false,
  });
  const settled = query.data?.status === 'PENDING' ? undefined : query.data;
  useEffect(() => {
    if (settled) void refreshSettled(client, settled);
  }, [settled, client]);
  return query;
}
