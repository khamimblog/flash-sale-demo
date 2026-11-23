import path from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** HTTP app configuration shared by `main.api.ts` and the integration tests. */
export function configureApiApp(app: NestFastifyApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Product images. Stand-in for an object store + CDN (e.g. S3 + CloudFront).
  app.useStaticAssets({ root: path.join(__dirname, '..', 'assets'), prefix: '/static/' });
  app.enableCors();
}
