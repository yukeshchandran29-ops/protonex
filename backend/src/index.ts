import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log('\n======================================================');
  console.log(`   ProtoNex — Fabrication & Instant CAD Quoting       `);
  console.log(`======================================================`);
  console.log(`  🚀 Server running at: http://localhost:${env.PORT}`);
  console.log(`  📂 Static frontend:   Serving /frontend`);
  console.log(`  📦 Local uploads:     Serving /uploads`);
  console.log(`  📧 Email mode:        ${env.SMTP_USER ? 'Custom SMTP (' + env.SMTP_USER + ')' : 'Ethereal Test Inbox (Instant Preview Links)'}`);
  console.log(`======================================================\n`);
});

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
