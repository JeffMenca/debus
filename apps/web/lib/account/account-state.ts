import { ApiError } from '@/lib/api/client';

// clientes answers 404 until UserRegistered creates the profile and the wallet: a short wait, not a failure.
export const isAccountPending = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 404;
