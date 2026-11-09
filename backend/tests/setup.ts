import { beforeEach } from 'vitest';
import { prisma } from '../src/db/prisma';

// Truncate all tables between tests so each test starts from a clean slate.
// Order matters for FK constraints — children before parents.
beforeEach(async () => {
  const tables = [
    'AuditLog',
    'EmailLog',
    'Notification',
    'QuoteStatusHistory',
    'OrderItem',
    'Order',
    'QuoteItem',
    'Quote',
    'DFMAnalysis',
    'GeometryAnalysis',
    'CADFile',
    'Project',
    'RefreshToken',
    'User',
    'Company',
  ];
  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`);
  }
});
