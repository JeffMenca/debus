import { render, waitFor } from '@testing-library/react';
import { clearSession, getSession, setSession } from '@/lib/auth/session-store';
import { installFakeBroadcastChannel, otherTab } from '@/test-support/fake-tabs';
import { SessionBootstrap } from './session-bootstrap';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => clearSession());

describe('SessionBootstrap', () => {
  it('restores the session once when there is none', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    render(<SessionBootstrap />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/session/refresh');
  });

  it('does nothing when the session is already there', () => {
    setSession({
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Ana',
        email: 'a@b.com',
        role: 'CLIENT',
        branchId: null,
      },
    });

    render(<SessionBootstrap />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows the other tabs while mounted and stops when unmounted', async () => {
    const restore = installFakeBroadcastChannel();
    const session = {
      accessToken: 'a',
      accessExpiresIn: 900,
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        fullName: 'Ana',
        email: 'a@b.com',
        role: 'CLIENT' as const,
        branchId: null,
      },
    };
    setSession(session);
    const { unmount } = render(<SessionBootstrap />);
    const other = otherTab();
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    other.post({ type: 'signed-out' });
    await tick();
    expect(getSession()).toBeNull();

    setSession(session);
    unmount();
    other.post({ type: 'signed-out' });
    await tick();
    expect(getSession()).not.toBeNull();

    other.close();
    restore();
  });
});
