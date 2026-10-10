import { forgotPassword, linkStatus, renewLink, setPassword, signUp } from './auth-api';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const accepted = () => Response.json({ message: 'ok' }, { status: 202 });
const lastCall = () => ({
  url: fetchMock.mock.calls.at(-1)[0],
  body: JSON.parse(fetchMock.mock.calls.at(-1)[1].body),
});

describe('account api', () => {
  it('posts each action to the gateway', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(accepted()));

    await signUp({ fullName: 'Ana', email: 'a@b.com', dpi: '2345678901234', phone: '55554444' });
    expect(lastCall().url).toBe('http://localhost:4000/api/administracion/auth/signup');
    await forgotPassword('a@b.com');
    expect(lastCall()).toEqual({
      url: 'http://localhost:4000/api/administracion/auth/password/forgot',
      body: { email: 'a@b.com' },
    });
    await renewLink('t');
    expect(lastCall().url).toContain('/auth/links/renew');
  });

  it('reads the link status', async () => {
    fetchMock.mockResolvedValue(Response.json({ state: 'expired', purpose: 'ACTIVATION' }));

    expect(await linkStatus('t')).toEqual({ state: 'expired', purpose: 'ACTIVATION' });
    expect(lastCall().body).toEqual({ token: 't' });
  });

  it('sets the password', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(setPassword({ token: 't', password: 'clave-segura-1' })).resolves.toBeUndefined();
    expect(lastCall().url).toBe('http://localhost:4000/api/administracion/auth/password');
  });
});
