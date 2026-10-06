import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { customerAuthController } from '../controllers/customerAuthController.js';
import { validateBody } from '../middlewares/validateBody.js';
import {
  customerLoginSchema,
  registerSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from '../validators/authValidators.js';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' },
});

// Lebih longgar dari loginLimiter, tapi tetap membatasi penyalahgunaan endpoint OTP.
// Jeda per email (60 detik) diatur terpisah di customerAuthController, bukan di sini.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.' },
});

export const authRoutes = Router();

authRoutes.post(
  '/login',
  loginLimiter,
  validateBody(customerLoginSchema),
  customerAuthController.login,
);

authRoutes.post('/register', validateBody(registerSchema), customerAuthController.register);

authRoutes.post(
  '/forgot-password/send-otp',
  otpLimiter,
  validateBody(sendOtpSchema),
  customerAuthController.sendOtp,
);

authRoutes.post(
  '/forgot-password/verify-otp',
  otpLimiter,
  validateBody(verifyOtpSchema),
  customerAuthController.verifyOtp,
);

authRoutes.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  customerAuthController.resetPassword,
);
