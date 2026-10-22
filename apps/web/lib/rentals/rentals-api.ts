import {
  type ConfirmRentalRequest,
  type CounterRentalRequest,
  type PageQuery,
  type Rental,
  type RentalRequest,
  rentalEstimateSchema,
  rentalPageSchema,
  rentalSchema,
  rentalToAssignSchema,
} from '@debus/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';
import type { BranchRentalQuery } from './rental-list-params';

const RENTALS_PATH = '/api/clientes/rentals';
const BRANCH_RENTALS_PATH = '/api/clientes/branch-rentals';
// A paid rental is cancelled by viajes, which knows whether its trip already left.
const PAID_RENTALS_PATH = '/api/viajes/rental-requests';
const RENTALS_KEY = ['rentals'];

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

// The price of a distance with the rate in force; nothing is asked until the distance is valid.
export function useRentalEstimate(distanceKm: number | null) {
  return useQuery({
    queryKey: [...RENTALS_KEY, 'estimate', distanceKm],
    queryFn: () =>
      apiRequest(
        `${RENTALS_PATH}/estimate?${toQueryString({ distanceKm: distanceKm ?? 0 })}`,
        rentalEstimateSchema,
      ),
    enabled: distanceKm !== null,
    placeholderData: keepPreviousData,
  });
}

export function useMyRentals(query: PageQuery) {
  return useQuery({
    queryKey: [...RENTALS_KEY, 'mine', query],
    queryFn: () =>
      apiRequest(`${RENTALS_PATH}/mine?${toQueryString({ ...query })}`, rentalPageSchema),
    placeholderData: keepPreviousData,
  });
}

export function useBranchRentals(query: BranchRentalQuery) {
  return useQuery({
    queryKey: [...RENTALS_KEY, 'branch', query],
    queryFn: () =>
      apiRequest(`${BRANCH_RENTALS_PATH}?${toQueryString({ ...query })}`, rentalPageSchema),
    placeholderData: keepPreviousData,
  });
}

function useRentalChange<V>(send: (value: V) => Promise<unknown>, alsoRefresh: string[][] = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () =>
      Promise.all(
        [RENTALS_KEY, ...alsoRefresh].map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  });
}

export const useRequestRental = () =>
  useRentalChange((request: RentalRequest) =>
    apiRequest(RENTALS_PATH, rentalSchema, post(request)),
  );

export interface RentalPayment {
  id: string;
  paidOn: string;
}

// The rental id is the key: paying again (a retry) never charges twice.
export const usePayRental = () =>
  useRentalChange(
    ({ id, paidOn }: RentalPayment): Promise<Rental> =>
      apiRequest(`${RENTALS_PATH}/${id}/pay`, rentalSchema, {
        ...post({ paidOn }),
        headers: { 'idempotency-key': id },
      }),
    [['wallet']],
  );

export const useCancelRental = () =>
  useRentalChange((id: string) => apiRequest(`${RENTALS_PATH}/${id}/cancel`, rentalSchema, post()));

export const useCancelPaidRental = () =>
  useRentalChange(
    (id: string) => apiRequest(`${PAID_RENTALS_PATH}/${id}/cancel`, rentalToAssignSchema, post()),
    [['rental-requests'], ['trips']],
  );

export const useConfirmRental = () =>
  useRentalChange(({ id, request }: { id: string; request: ConfirmRentalRequest }) =>
    apiRequest(`${BRANCH_RENTALS_PATH}/${id}/confirm`, rentalSchema, post(request)),
  );

export const useRegisterCounterRental = () =>
  useRentalChange((request: CounterRentalRequest) =>
    apiRequest(BRANCH_RENTALS_PATH, rentalSchema, post(request)),
  );
