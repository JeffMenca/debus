import { apiPdf } from './api-pdf';

class Controller {
  @apiPdf()
  download(): void {}
}

describe('apiPdf', () => {
  const method = Controller.prototype.download;

  it('documents an application/pdf answer', () => {
    expect(Reflect.getMetadata('swagger/apiProduces', method)).toEqual(['application/pdf']);
  });

  it('describes the body as a binary file', () => {
    expect(Reflect.getMetadata('swagger/apiResponse', method)).toMatchObject({
      200: { content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
    });
  });
});
