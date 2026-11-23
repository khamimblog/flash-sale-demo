import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  // No HTTP server: the worker only consumes from the queue.
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  // Lets in-flight messages finish on SIGTERM before connections close.
  app.enableShutdownHooks();
  await app.init();
}

void bootstrap();
