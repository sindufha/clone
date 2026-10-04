import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { config } from './config.js';
import { requireOrigin } from './auth.js';
import { authRouter } from './routes/auth.js';
import { assignmentsRouter } from './routes/assignments.js';
import { coursesRouter } from './routes/courses.js';
import { dashboardRouter } from './routes/dashboard.js';
import { integrationRouter } from './routes/integration.js';
import { pushRouter } from './routes/push.js';

export function createApp(serveStatic = config.production) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"],
    'connect-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'font-src': ["'self'"], 'worker-src': ["'self'"],
    'upgrade-insecure-requests': config.production ? [] : null } },
    strictTransportSecurity: config.production ? undefined : false }));
  app.use(cors({ origin: new URL(config.appUrl).origin, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use(express.json({ limit: '12kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok', service: 'nexus-api' }));
  app.use('/api', requireOrigin);
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { success: false, error: 'Terlalu banyak percobaan masuk. Coba kembali 15 menit lagi.' } }));
  app.use('/api/auth', authRouter); app.use('/api/courses', coursesRouter);
  app.use('/api/assignments', assignmentsRouter); app.use('/api/dashboard', dashboardRouter);
  app.use('/api/integration', integrationRouter); app.use('/api/push', pushRouter);
  app.use('/api', (_req, res) => res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan.' }));
  if (serveStatic) {
    const dist = path.resolve(process.env.STATIC_DIR || 'dist');
    app.use(express.static(dist, { setHeaders(res, file) {
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
    } }));
    app.get('/{*path}', (req, res, next) => {
      if (path.extname(req.path)) { next(); return; }
      res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((_req, res) => res.status(404).json({ success: false, error: 'Halaman tidak ditemukan.' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const code = (error as { status?: number }).status;
    res.status(code === 413 ? 413 : code === 400 ? 400 : 500).json({ success: false,
      error: code === 413 ? 'Data permintaan terlalu besar.' : code === 400 ? 'Permintaan tidak valid.' : 'Server belum dapat memproses permintaan. Coba kembali.' });
    console.error('Permintaan API gagal.', { status: res.statusCode });
  });
  return app;
}
