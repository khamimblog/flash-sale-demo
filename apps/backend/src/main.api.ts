import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ApiModule } from './api.module';
import { configureApiApp } from './app.setup';
import type { AppConfigService } from './common/config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(ApiModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  configureApiApp(app);
  app.enableShutdownHooks();

  const port = app.get<AppConfigService>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
