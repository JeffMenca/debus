import {
  type LinkStatus,
  type SetPasswordRequest,
  type SignupRequest,
  acceptedResponseSchema,
  linkStatusSchema,
} from '@debus/contracts';
import { z } from 'zod';
import { apiRequest } from '@/lib/api/client';

const AUTH = '/api/administracion/auth';
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const signUp = (input: SignupRequest) =>
  apiRequest(`${AUTH}/signup`, acceptedResponseSchema, post(input));
export const forgotPassword = (email: string) =>
  apiRequest(`${AUTH}/password/forgot`, acceptedResponseSchema, post({ email }));
export const linkStatus = (token: string): Promise<LinkStatus> =>
  apiRequest(`${AUTH}/links/status`, linkStatusSchema, post({ token }));
export const renewLink = (token: string) =>
  apiRequest(`${AUTH}/links/renew`, acceptedResponseSchema, post({ token }));
export const setPassword = async (input: SetPasswordRequest): Promise<void> => {
  await apiRequest(`${AUTH}/password`, z.null(), post(input));
};
