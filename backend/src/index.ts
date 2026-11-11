import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(
  env.PORT,
  '0.0.0.0',
  () => {
    console.log(`ProtoNex server running on port ${env.PORT}`);
  }
);

function shutdown(signal: string) {
  console.log(`\n${signal} received. Closing server...`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
