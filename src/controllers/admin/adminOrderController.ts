import type { Request, Response } from 'express';
import { notificationRepository } from '../../repositories/notificationRepository.js';
import { orderRepository } from '../../repositories/orderRepository.js';
import { AppError } from '../../utils/AppError.js';
import { toOrderDto } from '../../utils/orderDto.js';
import { ALL_STATUSES, STATUS_FROM_LABEL, STATUS_LABEL } from '../../utils/orderStatus.js';
import { ok } from '../../utils/response.js';
import { listOrdersQuerySchema, type UpdateOrderStatusInput } from '../../validators/orderValidators.js';

/** Id dari URL harus bilangan bulat positif; selain itu dianggap tidak ditemukan. */
function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('Pesanan tidak ditemukan.');
  return id;
}

async function loadOrder(id: number) {
  const row = await orderRepository.findById(id);
  if (!row) throw AppError.notFound('Pesanan tidak ditemukan.');
  return toOrderDto(row, await orderRepository.listItems([id]));
}

export const adminOrderController = {
  /**
   * GET /api/admin/orders?status=&q=&page=&limit=
   * Tanpa `status`: pesanan aktif plus yang selesai/dibatalkan dalam FINISHED_VISIBLE_DAYS hari terakhir.
   * `status` memakai label frontend, contoh "Siap Ambil".
   */
  async list(req: Request, res: Response) {
    const query = listOrdersQuerySchema.parse(req.query);
    const statuses = query.status ? [STATUS_FROM_LABEL[query.status]] : ALL_STATUSES;

    const { rows, total } = await orderRepository.list({
      statuses,
      // Kode pesanan sering diketik dengan "#" di depan (placeholder kolom cari di frontend).
      search: query.q?.replace(/^#/, '').trim() || undefined,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    const items = await orderRepository.listItems(rows.map((r) => r.id));

    ok(res, 'OK', {
      items: rows.map((row) => toOrderDto(row, items)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  },

  /** GET /api/admin/orders/stats — kartu statistik dan badge tab di halaman Orders. */
  async stats(_req: Request, res: Response) {
    const [byStatus, visible, today, lastWeek] = await Promise.all([
      orderRepository.countActiveByStatus(),
      orderRepository.countVisible(),
      orderRepository.countCreatedDaysAgo(0),
      orderRepository.countCreatedDaysAgo(7),
    ]);

    const baruMasuk = byStatus.menunggu ?? 0;
    const diproses = byStatus.meramu ?? 0;
    const siapAmbil = byStatus.siap_ambil ?? 0;

    ok(res, 'OK', {
      today: {
        count: today,
        // Dibanding hari yang sama minggu lalu; null bila minggu lalu kosong (tidak bisa dibagi nol).
        lastWeekCount: lastWeek,
        changePercent: lastWeek === 0 ? null : Math.round(((today - lastWeek) / lastWeek) * 1000) / 10,
      },
      // `semua` = isi tab "Semua" (termasuk selesai/dibatalkan yang masih terlihat), bukan hanya yang aktif.
      active: { semua: visible, baruMasuk, diproses, siapAmbil },
    });
  },

  /** GET /api/admin/orders/:id */
  async show(req: Request, res: Response) {
    ok(res, 'OK', await loadOrder(parseId(req)));
  },

  /** PATCH /api/admin/orders/:id/status — dropdown status di baris tabel. */
  async updateStatus(req: Request, res: Response) {
    const id = parseId(req);
    const { status } = req.body as UpdateOrderStatusInput;
    const next = STATUS_FROM_LABEL[status];

    const existing = await orderRepository.findById(id);
    if (!existing) throw AppError.notFound('Pesanan tidak ditemukan.');
    if (existing.status === 'dibatalkan') {
      throw new AppError(409, 'Pesanan yang sudah dibatalkan tidak bisa diubah statusnya.');
    }

    if (existing.status === 'selesai' && next !== 'selesai') {
      throw new AppError(409, 'Pesanan yang sudah selesai tidak bisa dikembalikan ke status sebelumnya.');
    }

    if (existing.status !== next) {
      const changed = await orderRepository.updateStatus(id, next);
      if (!changed) throw new AppError(409, 'Status pesanan baru saja berubah. Muat ulang lalu coba lagi.');

      // Gagal membuat notifikasi tidak boleh menggagalkan perubahan status yang sudah tersimpan.
      if (next === 'siap_ambil') {
        await notificationRepository.createOrderReady(id).catch((err: unknown) => {
          console.error('Gagal membuat notifikasi pesanan siap ambil:', err);
        });
      }
    }
    ok(res, 'Status pesanan berhasil diperbarui.', await loadOrder(id));
  },

  /**
   * POST /api/admin/orders/:id/cancel — tombol "Ya, Batalkan & Refund".
   * `reason` dan `note` divalidasi (cancelOrderSchema) tetapi belum disimpan: tabel orders belum punya kolomnya.
   * Pengembalian dana QRIS juga belum diproses di sini; status pembayaran tidak diubah.
   */
  async cancel(req: Request, res: Response) {
    const id = parseId(req);

    const existing = await orderRepository.findById(id);
    if (!existing) throw AppError.notFound('Pesanan tidak ditemukan.');

    const cancelled = await orderRepository.cancel(id);
    if (!cancelled) {
      throw new AppError(409, 'Pesanan yang sudah selesai atau dibatalkan tidak bisa dibatalkan.');
    }
    ok(res, 'Pesanan berhasil dibatalkan.', await loadOrder(id));
  },
};
