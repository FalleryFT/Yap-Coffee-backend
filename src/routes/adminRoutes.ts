import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuthController } from '../controllers/admin/adminAuthController.js';
import { adminMenuController } from '../controllers/admin/adminMenuController.js';
import { requireAdminAuth } from '../middlewares/auth.js';
import { uploadMenuImage } from '../middlewares/uploadMenuImage.js';
import { validateBody } from '../middlewares/validateBody.js';
import { adminLoginSchema } from '../validators/authValidators.js';
import { createMenuSchema, updateMenuSchema } from '../validators/menuValidators.js';

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

// Kelola menu (semua rute di bawah wajib login admin). Rute statis '/menu/categories'
// harus didaftarkan sebelum '/menu/:id' agar tidak dianggap sebagai id.
adminRoutes.get('/menu', requireAdminAuth, adminMenuController.list);
adminRoutes.get('/menu/categories', requireAdminAuth, adminMenuController.categories);
adminRoutes.post('/menu/image', requireAdminAuth, uploadMenuImage, adminMenuController.uploadImage);
adminRoutes.get('/menu/:id', requireAdminAuth, adminMenuController.show);
adminRoutes.post('/menu', requireAdminAuth, validateBody(createMenuSchema), adminMenuController.create);
adminRoutes.put('/menu/:id', requireAdminAuth, validateBody(updateMenuSchema), adminMenuController.update);
adminRoutes.delete('/menu/:id', requireAdminAuth, adminMenuController.remove);
