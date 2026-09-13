import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import fastifyMultipart from '@fastify/multipart';

async function bootstrap() {
  const logger = new Logger('Bootstrap'); // reload config with gemini-3.6-flash
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.register(fastifyMultipart as never, {
    limits: {
      fileSize: 500 * 1024 * 1024,
    },
  });

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  logger.log(`Brisky API is running on http://${host}:${port}/api/v1`);
  logger.log(`Health endpoint: http://${host}:${port}/api/v1/health`);
}

bootstrap();
