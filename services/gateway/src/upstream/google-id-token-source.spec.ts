import { googleIdTokenSource } from './identity-tokens';

const fetchIdToken = jest.fn().mockResolvedValue('token');
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn(() => ({
    getIdTokenClient: jest.fn().mockResolvedValue({ idTokenProvider: { fetchIdToken } }),
  })),
}));

describe('googleIdTokenSource', () => {
  it('asks Google for an identity token for the audience', async () => {
    await expect(googleIdTokenSource().fetchIdToken('https://flota')).resolves.toBe('token');
    expect(fetchIdToken).toHaveBeenCalledWith('https://flota');
  });
});
