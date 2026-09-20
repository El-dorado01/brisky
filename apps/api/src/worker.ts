import './worker-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrapWorker() {
  process.env.IS_WORKER = 'true';
  const logger = new Logger('WorkerBootstrap');
  logger.log('Starting Brisky standalone BullMQ Indexing Worker...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.enableShutdownHooks();

  logger.log('Brisky BullMQ Indexing Worker is running and listening on indexing-queue.');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Gracefully stopping worker...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrapWorker().catch((err) => {
  console.error('Fatal error in worker bootstrap:', err);
  process.exit(1);
});
