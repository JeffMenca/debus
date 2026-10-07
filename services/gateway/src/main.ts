import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureGateway } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureGateway(app);
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('gateway').setVersion('1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();
