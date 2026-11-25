import type { Request, Response } from 'express';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { verifyNotificationSignature, type MidtransNotification } from '../services/midtransService.js';
import { AppError } from '../utils/AppError.js';

export const paymentWebhookController = {
  /** POST /api/payments/midtrans/notification — dipanggil Midtrans, tanpa login. */
  async midtrans(req: Request, res: Response) {
    const n = req.body as Partial<MidtransNotification>;
    if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key || !n.transaction_status) {
      throw new AppError(400, 'Payload tidak valid.');
    }
    if (!verifyNotificationSignature(n as MidtransNotification)) {
      throw AppError.forbidden('Signature tidak valid.');
    }

    const outcome = await paymentRepository.applyNotification(n as MidtransNotification);
    if (outcome === 'late_payment' || outcome === 'amount_mismatch') {
      console.warn(`[midtrans] ${n.order_id}: ${outcome}. Periksa manual di dashboard Midtrans.`);
    }
    // Balas 200 agar Midtrans berhenti mengirim ulang.
    res.status(200).json({ success: true });
  },
};
