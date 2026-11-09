import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import pinoHttp from 'pino-http';
import path from 'path';
import { env, isProd } from './config/env';
import { logger } from './utils/logger';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.routes';
import { projectsRouter } from './routes/projects.routes';
import { cadFilesRouter } from './routes/cadFiles.routes';
import { quotesRouter } from './routes/quotes.routes';
import { ordersRouter } from './routes/orders.routes';
import { adminRouter } from './routes/admin.routes';
import { pricingRouter } from './routes/pricing.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // needed for correct req.ip / rate limiting behind Vercel/Railway/etc.

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false, // frontend team can tighten CSP per-deploy
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: env.APP_URL,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' })); // CAD bytes never go through JSON bodies — presigned upload only
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    next();
  });
  app.use(pinoHttp({ logger, genReqId: (req) => (req as any).id }));
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ProtoNex API', version: '2.0.0' }));

  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/cad-files', cadFilesRouter);
  app.use('/api/quotes', quotesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/pricing', pricingRouter);

  // Preserve the existing premium static ProtoNex frontend — served as-is.
  const frontendDir = path.join(__dirname, '..', '..', 'frontend');
  app.use(express.static(frontendDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}
