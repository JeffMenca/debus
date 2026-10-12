import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureDocs, configureGateway } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureGateway(app);
  app.enableShutdownHooks();

  configureDocs(app);

  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();
