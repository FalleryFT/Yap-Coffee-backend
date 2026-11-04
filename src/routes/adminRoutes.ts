import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuthController } from '../controllers/admin/adminAuthController.js';
import { adminHistoryController } from '../controllers/admin/adminHistoryController.js';
import { adminMenuController } from '../controllers/admin/adminMenuController.js';
import { adminOrderController } from '../controllers/admin/adminOrderController.js';
import { adminScheduleController } from '../controllers/admin/adminScheduleController.js';
import { requireAdminAuth } from '../middlewares/auth.js';
import { uploadMenuImage } from '../middlewares/uploadMenuImage.js';
import { validateBody } from '../middlewares/validateBody.js';
import { adminLoginSchema } from '../validators/authValidators.js';
import { createMenuSchema, updateMenuSchema } from '../validators/menuValidators.js';
import { cancelOrderSchema, updateOrderStatusSchema } from '../validators/orderValidators.js';
import { createScheduleSchema, updateScheduleSchema } from '../validators/scheduleValidators.js';

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

// Jadwal & sesi pre-order (halaman admin Pre-Order).
adminRoutes.get('/pre-order/schedules', requireAdminAuth, adminScheduleController.list);
adminRoutes.get('/pre-order/schedules/:id', requireAdminAuth, adminScheduleController.show);
adminRoutes.post(
  '/pre-order/schedules',
  requireAdminAuth,
  validateBody(createScheduleSchema),
  adminScheduleController.create,
);
adminRoutes.put(
  '/pre-order/schedules/:id',
  requireAdminAuth,
  validateBody(updateScheduleSchema),
  adminScheduleController.update,
);
adminRoutes.delete('/pre-order/schedules/:id', requireAdminAuth, adminScheduleController.remove);

// Pesanan (halaman admin Orders). Rute statis '/orders/stats' harus didaftarkan sebelum '/orders/:id'.
adminRoutes.get('/orders', requireAdminAuth, adminOrderController.list);
adminRoutes.get('/orders/stats', requireAdminAuth, adminOrderController.stats);
adminRoutes.get('/orders/:id', requireAdminAuth, adminOrderController.show);
adminRoutes.patch(
  '/orders/:id/status',
  requireAdminAuth,
  validateBody(updateOrderStatusSchema),
  adminOrderController.updateStatus,
);
adminRoutes.post(
  '/orders/:id/cancel',
  requireAdminAuth,
  validateBody(cancelOrderSchema),
  adminOrderController.cancel,
);

// Riwayat transaksi (halaman admin History). Rute statis harus didaftarkan sebelum '/history/:id/...'.
adminRoutes.get('/history', requireAdminAuth, adminHistoryController.list);
adminRoutes.get('/history/export', requireAdminAuth, adminHistoryController.export);
adminRoutes.get('/history/stats', requireAdminAuth, adminHistoryController.stats);
adminRoutes.get('/history/revenue', requireAdminAuth, adminHistoryController.revenue);
adminRoutes.get('/history/:id/receipt', requireAdminAuth, adminHistoryController.receipt);
