import type { INestApplication } from '@nestjs/common';
import { configureGateway } from './bootstrap';
import { GatewayConfig } from './config/gateway-config';
import { HttpExceptionFilter } from './errors/http-exception.filter';

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
