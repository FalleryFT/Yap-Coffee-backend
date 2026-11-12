import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { customerOrderRepository } from '../../repositories/customerOrderRepository.js';
import { AppError } from '../../utils/AppError.js';
import { toCustomerOrderDto } from '../../utils/customerOrderDto.js';
import { created, ok } from '../../utils/response.js';
import { listMyOrdersQuerySchema, type CreateOrderInput } from '../../validators/customerValidators.js';

/** Kode pesanan dari URL, contoh WK-8493. Bentuk lain dianggap tidak ditemukan. */
function parseCode(req: Request): string {
  const code = String(req.params.code ?? '').toUpperCase();
  if (!/^WK-\d{4,6}$/.test(code)) throw AppError.notFound('Pesanan tidak ditemukan.');
  return code;
}

async function loadOrder(customerId: number, code: string) {
  const row = await customerOrderRepository.findByCode(customerId, code);
  if (!row) throw AppError.notFound('Pesanan tidak ditemukan.');
  return toCustomerOrderDto(row, await customerOrderRepository.listItems([row.id]));
}

export const customerOrderController = {
  /** POST /api/orders — checkout. Mengembalikan pesanan beserta batas waktu bayarnya. */
  async create(req: Request, res: Response) {
    const customerId = req.customerId!;
    const code = await customerOrderRepository.create(customerId, req.body as CreateOrderInput);
    created(res, 'Pesanan berhasil dibuat. Selesaikan pembayaran sebelum waktunya habis.', await loadOrder(customerId, code));
  },

  /** GET /api/orders?tab=active|history */
  async list(req: Request, res: Response) {
    const { tab } = listMyOrdersQuerySchema.parse(req.query);
    await customerOrderRepository.expireOverdue();

    const rows = await customerOrderRepository.listByCustomer(req.customerId!, tab);
    const items = await customerOrderRepository.listItems(rows.map((r) => r.id));
    ok(res, 'OK', rows.map((row) => toCustomerOrderDto(row, items)));
  },

  /** GET /api/orders/:code */
  async show(req: Request, res: Response) {
    await customerOrderRepository.expireOverdue();
    ok(res, 'OK', await loadOrder(req.customerId!, parseCode(req)));
  },

  /**
   * POST /api/orders/:code/pay — pelunasan SIMULASI untuk uji coba (PAYMENT_SIMULATED=true).
   * Di produksi, pelunasan datang dari webhook penyedia pembayaran, bukan dari aplikasi.
   */
  async pay(req: Request, res: Response) {
    if (!env.payment.simulated) {
      throw AppError.forbidden('Pembayaran harus dilakukan lewat penyedia pembayaran.');
    }
    const customerId = req.customerId!;
    const code = parseCode(req);

    const outcome = await customerOrderRepository.markPaid(customerId, code);
    if (outcome === 'not_found') throw AppError.notFound('Pesanan tidak ditemukan.');
    if (outcome === 'expired') {
      await customerOrderRepository.expireOverdue();
      throw new AppError(409, 'Waktu pembayaran sudah habis. Pesanan dibatalkan.');
    }
    ok(res, 'Pembayaran berhasil.', await loadOrder(customerId, code));
  },

  /** POST /api/orders/:code/cancel — hanya untuk pesanan yang belum dibayar. */
  async cancel(req: Request, res: Response) {
    const customerId = req.customerId!;
    const code = parseCode(req);

    const outcome = await customerOrderRepository.cancelUnpaid(customerId, code);
    if (outcome === 'not_found') throw AppError.notFound('Pesanan tidak ditemukan.');
    if (outcome === 'not_allowed') {
      throw new AppError(409, 'Hanya pesanan yang belum dibayar yang bisa dibatalkan.');
    }
    ok(res, 'Pesanan dibatalkan.', await loadOrder(customerId, code));
  },
};
