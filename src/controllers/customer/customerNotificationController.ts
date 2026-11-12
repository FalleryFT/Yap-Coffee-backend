import type { Request, Response } from 'express';
import { customerRepository } from '../../repositories/customerRepository.js';
import { notificationRepository, type NotificationRow } from '../../repositories/notificationRepository.js';
import { AppError } from '../../utils/AppError.js';
import { ok } from '../../utils/response.js';
import type { SetNotificationsInput } from '../../validators/settingsValidators.js';

const LIST_LIMIT = 50;

function toDto(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    // order_ready → kode pesanan; new_menu → id menu.
    ref: row.ref ?? undefined,
    read: row.read_at !== null,
    createdAt: row.created_at, // 'YYYY-MM-DD HH:mm:ss'
  };
}

async function isEnabled(customerId: number): Promise<boolean> {
  const customer = await customerRepository.findById(customerId);
  if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');
  return customer.notifications_enabled === 1;
}

export const customerNotificationController = {
  /** GET /api/notifications — notifikasi terbaru, jumlah yang belum dibaca, dan status saklar. */
  async list(req: Request, res: Response) {
    const customerId = req.customerId!;
    const [rows, unreadCount, enabled] = await Promise.all([
      notificationRepository.listForCustomer(customerId, LIST_LIMIT),
      notificationRepository.countUnread(customerId),
      isEnabled(customerId),
    ]);
    ok(res, 'OK', { enabled, unreadCount, items: rows.map(toDto) });
  },

  /** POST /api/notifications/read — tandai semua sudah dibaca. */
  async readAll(req: Request, res: Response) {
    await notificationRepository.markAllRead(req.customerId!);
    ok(res, 'OK', { unreadCount: 0 });
  },

  /** POST /api/notifications/:id/read */
  async readOne(req: Request, res: Response) {
    const customerId = req.customerId!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('Notifikasi tidak ditemukan.');
    await notificationRepository.markRead(customerId, id);
    ok(res, 'OK', { unreadCount: await notificationRepository.countUnread(customerId) });
  },

  /** PUT /api/notifications/settings — saklar Notifikasi di halaman Profil. */
  async setEnabled(req: Request, res: Response) {
    const { enabled } = req.body as SetNotificationsInput;
    await customerRepository.setNotificationsEnabled(req.customerId!, enabled);
    ok(res, enabled ? 'Notifikasi diaktifkan.' : 'Notifikasi dimatikan.', { enabled });
  },
};
