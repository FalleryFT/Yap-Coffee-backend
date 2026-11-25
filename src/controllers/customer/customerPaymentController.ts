import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { customerOrderRepository } from '../../repositories/customerOrderRepository.js';
import { paymentRepository, type PayableRow } from '../../repositories/paymentRepository.js';
import { createSnapTransaction, MidtransError, type SnapItem } from '../../services/midtransService.js';
import { syncOrderPayment } from '../../services/paymentSync.js';
import { AppError } from '../../utils/AppError.js';
import { ok } from '../../utils/response.js';

function parseCode(req: Request): string {
  const code = String(req.params.code ?? '').toUpperCase();
  if (!/^WK-\d{4,6}$/.test(code)) throw AppError.notFound('Pesanan tidak ditemukan.');
  return code;
}

/** Mencegah pemanggilan beruntun ke Midtrans untuk pesanan yang sama (minimal 3 detik). */
const lastSync = new Map<string, number>();
function shouldSync(code: string): boolean {
  const now = Date.now();
  if (now - (lastSync.get(code) ?? 0) < 3000) return false;
  if (lastSync.size > 500) lastSync.clear();
  lastSync.set(code, now);
  return true;
}

function toResponse(ctx: PayableRow) {
  return {
    snapToken: ctx.snap_token!,
    redirectUrl: ctx.redirect_url!,
    finishUrl: env.midtrans.finishUrl,
    secondsLeft: Math.max(0, ctx.seconds_left),
  };
}

export const customerPaymentController = {
  /**
   * Dipasang sebelum customerOrderController.show pada GET /api/orders/:code.
   * Bila pesanan masih menunggu dan sudah punya sesi Snap, statusnya dicocokkan dulu dengan
   * Midtrans, sehingga pembayaran yang webhook-nya tidak sampai tetap tercatat lunas.
   * Tidak pernah menggagalkan permintaan: galat hanya dicatat di log lalu lanjut ke show.
   */
  async reconcile(req: Request, _res: Response, next: NextFunction) {
    try {
      const code = String(req.params.code ?? '').toUpperCase();
      if (/^WK-\d{4,6}$/.test(code)) {
        const ctx = await paymentRepository.findPayable(req.customerId!, code);
        const open =
          ctx && ctx.status === 'menunggu' && ctx.pay_status === 'belum_dibayar' && ctx.snap_token;
        if (open && shouldSync(code)) {
          const outcome = await syncOrderPayment(code);
          if (outcome === 'paid' || outcome === 'cancelled') {
            console.log(`[midtrans] ${code}: status disinkronkan dari Midtrans (${outcome}).`);
          }
        }
      }
    } catch (err) {
      console.error('[midtrans] gagal sinkron status:', (err as Error).message);
    }
    next();
  },

  /**
   * POST /api/orders/:code/snap
   * Membuat transaksi Snap (sekali saja per pesanan) dan mengembalikan redirect_url untuk WebView.
   * Dipanggil ulang akan mengembalikan token yang sama selama pesanan belum kedaluwarsa.
   */
  async createSnap(req: Request, res: Response) {
    const customerId = req.customerId!;
    const code = parseCode(req);
    await customerOrderRepository.expireOverdue();

    let ctx = await paymentRepository.findPayable(customerId, code);
    if (!ctx) throw AppError.notFound('Pesanan tidak ditemukan.');
    if (ctx.status !== 'menunggu' || ctx.pay_status !== 'belum_dibayar') {
      throw new AppError(409, 'Pesanan ini tidak bisa dibayar lagi.');
    }

    if (!ctx.snap_token) {
      // Jendela bayar Midtrans dibuat sama dengan batas di database: dimulai saat pesanan
      // dibuat dan berlangsung selama paymentWindowMinutes, sehingga keduanya habis bersamaan.
      if (ctx.seconds_left < 60) {
        throw new AppError(409, 'Waktu pembayaran hampir habis. Buat pesanan baru.');
      }
      const orderItems = await customerOrderRepository.listItems([ctx.id]);
      const full = await customerOrderRepository.findByCode(customerId, code);
      const items: SnapItem[] = orderItems.map((it, i) => ({
        id: `item-${i + 1}`,
        price: it.unit_price,
        quantity: it.qty,
        name: `${it.item_name}${it.size ? ` (${it.size})` : ''}`.slice(0, 50),
      }));
      if (full && full.tax > 0) items.push({ id: 'tax', price: full.tax, quantity: 1, name: 'Pajak' });
      if (full && full.service_fee > 0) items.push({ id: 'service', price: full.service_fee, quantity: 1, name: 'Biaya layanan' });
      if (full && full.packaging_fee > 0) items.push({ id: 'packaging', price: full.packaging_fee, quantity: 1, name: 'Biaya kemasan' });

      try {
        const snap = await createSnapTransaction({
          orderId: ctx.code,
          grossAmount: ctx.total,
          items,
          expiryStart: new Date(
            Date.now() + ctx.seconds_left * 1000 - env.order.paymentWindowMinutes * 60_000,
          ),
          expiryMinutes: env.order.paymentWindowMinutes,
        });
        await paymentRepository.saveSnap(ctx.id, snap.token, snap.redirectUrl);
      } catch (err) {
        if (!(err instanceof MidtransError)) throw err;
        // Permintaan ganda bersamaan: pemanggil lain mungkin sudah membuat token.
        const again = await paymentRepository.findPayable(customerId, code);
        if (!again?.snap_token) {
          console.error('[midtrans] gagal membuat Snap:', err.message);
          throw new AppError(502, 'Gagal menghubungi penyedia pembayaran. Coba lagi sebentar.');
        }
      }
      ctx = (await paymentRepository.findPayable(customerId, code))!;
    }

    ok(res, 'OK', toResponse(ctx));
  },
};