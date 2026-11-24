import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env.js';
import { requireAdminAuth, requireCustomerAuth } from './middlewares/auth.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { chatRoutes } from './routes/chatRoutes.js';
import { meRoutes } from './routes/meRoutes.js';
import { clearCacheAfterWrite, responseCache } from './utils/responseCache.js';

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Izinkan request tanpa origin (seperti curl, mobile app native)
      if (!origin) return callback(null, true);
      if (
        env.corsOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());

// Format ringkas di terminal, dan sengaja tidak mencatat body (berisi sandi/token).
app.use(morgan('dev'));

// Foto menu yang sudah diunggah, contoh: GET /uploads/menu/<nama-berkas>.jpg
app.use(
  '/uploads',
  express.static(env.upload.dir, {
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } });
});

// ── Cache respons ──
// Setiap permintaan tulis (POST/PUT/PATCH/DELETE) mengosongkan seluruh cache.
app.use('/api', clearCacheAfterWrite);

// Saat cache kosong, permintaan diteruskan (next) ke handler aslinya di rute di bawah.
app.get('/api/admin/menu', requireAdminAuth, responseCache(30_000));
app.get('/api/admin/menu/categories', requireAdminAuth, responseCache(60_000));
app.get('/api/admin/settings', requireAdminAuth, responseCache(60_000));
app.get('/api/admin/history/stats', requireAdminAuth, responseCache(120_000));
app.get('/api/admin/history/revenue', requireAdminAuth, responseCache(120_000));
app.get('/api/menu', requireCustomerAuth, responseCache(15_000)); // katalog pelanggan

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', meRoutes);
app.use('/api', chatRoutes);

app.use(notFoundHandler);
app.use(errorHandler);