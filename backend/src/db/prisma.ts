import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env';

// Prevent multiple PrismaClient instances during ts-node/tsx watch reloads.
declare global {
  // eslint-disable-next-line no-var
  var __protonexPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__protonexPrisma ??
  new PrismaClient({
    log: isProd ? ['error', 'warn'] : ['error', 'warn', 'query'],
  });

if (!isProd) global.__protonexPrisma = prisma;
