if (process.argv.includes('--help')) {
  console.log('Brisky workers: run pnpm dev:worker from the repository root. Startup consumes queued jobs. --faces-only consumes local face work without indexing/AI jobs.');
  process.exit(0);
}
// Set the role before loading modules: QueueModule chooses its providers at import time.
process.env.IS_WORKER = 'true';
process.env.RUN_WORKER_IN_API = 'false';
// Defer queue consumers until connectors and startup reconciliation are ready.
process.env.BRISKY_MANUAL_QUEUE_REGISTRATION = 'true';
if(process.argv.includes('--faces-only'))process.env.FACE_ONLY_WORKER='true';
const { createRequire } = require('node:module');
// Processing modules and their dependencies remain shared with the engine package.
const engineRequire = createRequire(require.resolve('@brisky/api/package.json'));
require(engineRequire.resolve('reflect-metadata'));
const { NestFactory } = engineRequire('@nestjs/core');
const { AppModule } = engineRequire('./dist/app.module');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const { BullRegistrar } = engineRequire('@nestjs/bullmq');
  app.get(BullRegistrar).register();
  app.enableShutdownHooks();
  console.log(process.env.FACE_ONLY_WORKER==='true'?'Brisky face worker ready; indexing consumers off, no HTTP listener.':'Brisky workers ready; no HTTP listener.');
}

if (process.argv.includes('--check')) {
  console.log('Worker runtime resolved; no queue consumer or HTTP server started.');
} else bootstrap().catch(() => {
  console.error('Worker startup failed. Check database/Redis configuration and engine build.');
  process.exitCode = 1;
});
