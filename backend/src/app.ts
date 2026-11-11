
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { apiRouter } from './routes/api.routes';

export function createApp() {
  const app = express();

  // Allowed frontend origins
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://YOUR-PROJECT.vercel.app'
  ];

  // Production CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Request parsing
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({
    extended: true,
    limit: '25mb'
  }));

  app.use(cookieParser());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'ProtoNex Fabrication API',
      version: '2.0.0 (College Edition)',
      mode: 'Production'
    });
  });

  // API routes
  app.use('/api', apiRouter);

  // Serve uploaded files
  const uploadsDir = path.join(
    __dirname,
    '..',
    '..',
    'uploads'
  );

  app.use('/uploads', express.static(uploadsDir));

  // Serve frontend files (useful for local hosting)
  const frontendDir = path.join(
    __dirname,
    '..',
    '..',
    'frontend'
  );

  app.use(express.static(frontendDir));

  // Client-side routing fallback
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads')
    ) {
      return next();
    }

    const target = path.join(
      frontendDir,
      req.path.endsWith('.html')
        ? req.path
        : 'index.html'
    );

    res.sendFile(target, (err) => {
      if (err) {
        res.sendFile(
          path.join(frontendDir, 'index.html')
        );
      }
    });
  });

  // API 404 handler
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: {
        message: `Route ${req.method} ${req.path} not found`
      }
    });
  });

  // Global error handler
  app.use((
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled Server Error:', err);

    res.status(err.status || 500).json({
      error: {
        message: err.message || 'Internal Server Error'
      }
    });
  });

  return app;
}
