import { z } from 'zod';
import { ApiError, FRIENDLY_NETWORK_MESSAGE, apiRequest } from './client';

const schema = z.object({ ok: z.boolean() });

describe('apiRequest', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls the gateway and validates the response', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ ok: true }));

    await expect(apiRequest('/api/sistema/estado', schema)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/sistema/estado',
      expect.objectContaining({ headers: expect.objectContaining({ accept: 'application/json' }) }),
    );
  });

  it('turns network failures into a friendly error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/x', schema)).rejects.toEqual(
      new ApiError(0, FRIENDLY_NETWORK_MESSAGE),
    );
  });

  it('keeps the gateway message and correlation id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json(
        {
          statusCode: 502,
          error: 'Bad Gateway',
          message: 'El servicio no respondió.',
          correlationId: 'c',
        },
        { status: 502 },
      ),
    );

    const error = await apiRequest('/x', schema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      message: 'El servicio no respondió.',
      correlationId: 'c',
    });
  });

  it('uses the friendly message when the error body is unknown', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('oops', { status: 500 }));

    await expect(apiRequest('/x', schema)).rejects.toMatchObject({
      status: 500,
      message: FRIENDLY_NETWORK_MESSAGE,
    });
  });
});
