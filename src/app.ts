import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { meRoutes } from './routes/meRoutes.js';

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

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'OK', data: { uptime: process.uptime() } });
});

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', meRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
