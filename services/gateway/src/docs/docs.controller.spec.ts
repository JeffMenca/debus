import { DocsController } from './docs.controller';

describe('DocsController', () => {
  it('serves the combined document for the request correlation id', async () => {
    const docs = { document: jest.fn().mockResolvedValue({ openapi: '3.0.0' }) };

    expect(await new DocsController(docs as never).document('c')).toEqual({ openapi: '3.0.0' });
    expect(docs.document).toHaveBeenCalledWith('c');
  });
});
