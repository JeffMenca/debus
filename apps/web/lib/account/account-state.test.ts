import { ApiError } from '@/lib/api/client';
import { isAccountPending } from './account-state';

describe('isAccountPending', () => {
  it('reads a 404 from clientes as an account that is still being prepared', () => {
    expect(isAccountPending(new ApiError(404, 'Estamos preparando tu cuenta.'))).toBe(true);
    expect(isAccountPending(new ApiError(503, 'El servicio no respondió.'))).toBe(false);
    expect(isAccountPending(new Error('x'))).toBe(false);
    expect(isAccountPending(null)).toBe(false);
  });
});
