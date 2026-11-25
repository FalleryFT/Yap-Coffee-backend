import { Router } from 'express';
import { paymentWebhookController } from '../controllers/paymentWebhookController.js';

/** Rute publik untuk penyedia pembayaran (dipasang di /api/payments). */
export const paymentRoutes = Router();

paymentRoutes.post('/midtrans/notification', paymentWebhookController.midtrans);
