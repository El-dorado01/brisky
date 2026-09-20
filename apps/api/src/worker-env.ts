// Ensures IS_WORKER is set before any static imports (e.g. AppModule -> QueueModule) are evaluated
process.env.IS_WORKER = 'true';
