import { CORRELATION_HEADER } from '@debus/contracts';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GatewayConfig } from './config/gateway-config';
import { DocsService } from './docs/docs.service';
import { HttpExceptionFilter } from '@debus/server';

export function configureGateway(app: INestApplication): void {
  const config = app.get(GatewayConfig);
  app.enableCors({ origin: [...config.corsOrigins], exposedHeaders: [CORRELATION_HEADER] });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}

export function configureDocs(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('debus API').setVersion('1.0').addBearerAuth().build(),
  );
  app.get(DocsService).useGatewayDocument(document);
  // The UI reads the combined document; the gateway-only JSON moves out of the way of /docs-json.
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/gateway-json',
    swaggerOptions: { url: '/docs-json' },
  });
}
