import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuthController } from '../controllers/adminAuthController.js';
import { requireAdminAuth } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validateBody.js';
import { adminLoginSchema } from '../validators/authValidators.js';

// Maksimal 10 percobaan login per 15 menit per IP, mencegah tebak-sandi brutal.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' },
});

export const adminRoutes = Router();

adminRoutes.post(
  '/auth/login',
  loginLimiter,
  validateBody(adminLoginSchema),
  adminAuthController.login,
);

adminRoutes.get('/me', requireAdminAuth, adminAuthController.me);
