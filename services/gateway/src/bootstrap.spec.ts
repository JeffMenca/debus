import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { configureDocs, configureGateway } from './bootstrap';
import { GatewayConfig } from './config/gateway-config';
import { DocsService } from './docs/docs.service';
import { HttpExceptionFilter } from '@debus/server';

describe('configureGateway', () => {
  it('enables CORS for the configured origins and installs the error filter', () => {
    const app = {
      get: jest.fn().mockReturnValue({ corsOrigins: ['http://localhost:3000'] }),
      enableCors: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalPipes: jest.fn(),
    };

    configureGateway(app as unknown as INestApplication);

    expect(app.get).toHaveBeenCalledWith(GatewayConfig);
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://localhost:3000'],
      exposedHeaders: ['x-correlation-id'],
    });
    expect(app.useGlobalFilters).toHaveBeenCalledWith(expect.any(HttpExceptionFilter));
  });
});

describe('configureDocs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('hands the gateway document to the docs service and points the UI at the combined one', () => {
    const document = { openapi: '3.0.0', info: {}, paths: {} };
    const create = jest.spyOn(SwaggerModule, 'createDocument').mockReturnValue(document as never);
    const setup = jest.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
    const docs = { useGatewayDocument: jest.fn() };
    const app = { get: jest.fn().mockReturnValue(docs) };

    configureDocs(app as unknown as INestApplication);

    expect(create).toHaveBeenCalledWith(app, expect.objectContaining({ info: expect.any(Object) }));
    expect(app.get).toHaveBeenCalledWith(DocsService);
    expect(docs.useGatewayDocument).toHaveBeenCalledWith(document);
    expect(setup).toHaveBeenCalledWith('docs', app, document, {
      jsonDocumentUrl: 'docs/gateway-json',
      swaggerOptions: { url: '/docs-json', spec: {} },
    });
  });
});
