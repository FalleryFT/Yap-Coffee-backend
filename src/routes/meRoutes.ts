import { Router } from 'express';
import { customerAuthController } from '../controllers/customer/customerAuthController.js';
import { customerHomeController } from '../controllers/customer/customerHomeController.js';
import { uploadAvatar } from '../middlewares/uploadAvatar.js';
import { customerNotificationController } from '../controllers/customer/customerNotificationController.js';
import { customerMenuController } from '../controllers/customer/customerMenuController.js';
import { customerOrderController } from '../controllers/customer/customerOrderController.js';
import { requireCustomerAuth } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validateBody.js';
import {
  changePasswordSchema,
  createOrderSchema,
  updateProfileSchema,
} from '../validators/customerValidators.js';
import { setNotificationsSchema } from '../validators/settingsValidators.js';

/** Semua rute di sini khusus pelanggan yang sudah login (dipasang di /api). */
export const meRoutes = Router();

// Profil
meRoutes.get('/me', requireCustomerAuth, customerAuthController.me);
meRoutes.put('/me', requireCustomerAuth, validateBody(updateProfileSchema), customerAuthController.updateMe);
meRoutes.post(
  '/me/change-password',
  requireCustomerAuth,
  validateBody(changePasswordSchema),
  customerAuthController.changePassword,
);

// Halaman Home: sapaan, pesanan siap ambil, dan menu favorit dalam satu permintaan
meRoutes.get('/home', requireCustomerAuth, customerHomeController.overview);

// Katalog dan jadwal pengambilan
meRoutes.get('/menu', requireCustomerAuth, customerMenuController.catalog);
meRoutes.get('/schedules', requireCustomerAuth, customerMenuController.schedules);

// Pesanan milik pelanggan
meRoutes.post('/orders', requireCustomerAuth, validateBody(createOrderSchema), customerOrderController.create);
meRoutes.get('/orders', requireCustomerAuth, customerOrderController.list);
meRoutes.get('/orders/:code', requireCustomerAuth, customerOrderController.show);
meRoutes.post('/orders/:code/pay', requireCustomerAuth, customerOrderController.pay);
meRoutes.post('/orders/:code/cancel', requireCustomerAuth, customerOrderController.cancel);

// Notifikasi dalam aplikasi: daftar, tandai dibaca, dan saklar nyala/mati
meRoutes.get('/notifications', requireCustomerAuth, customerNotificationController.list);
meRoutes.put(
  '/notifications/settings',
  requireCustomerAuth,
  validateBody(setNotificationsSchema),
  customerNotificationController.setEnabled,
);
meRoutes.post('/notifications/read', requireCustomerAuth, customerNotificationController.readAll);
meRoutes.post('/notifications/:id/read', requireCustomerAuth, customerNotificationController.readOne);

// Foto profil: unggah (multipart, field "image") dan hapus
meRoutes.put('/me/avatar', requireCustomerAuth, uploadAvatar, customerAuthController.setAvatar);
meRoutes.delete('/me/avatar', requireCustomerAuth, customerAuthController.clearAvatar);
