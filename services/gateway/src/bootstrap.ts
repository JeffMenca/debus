import { CORRELATION_HEADER } from '@debus/contracts';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { GatewayConfig } from './config/gateway-config';
import { HttpExceptionFilter } from './errors/http-exception.filter';

export function configureGateway(app: INestApplication): void {
  const config = app.get(GatewayConfig);
  app.enableCors({ origin: [...config.corsOrigins], exposedHeaders: [CORRELATION_HEADER] });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
