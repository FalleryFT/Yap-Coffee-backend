import { z } from 'zod';
import { ALL_LABELS, FLOW_LABELS } from '../utils/orderStatus.js';

/**
 * Query GET /api/admin/orders. Semua nilai datang sebagai string dari URL, jadi angka di-coerce.
 * Tanpa `status`, yang dikembalikan adalah pesanan aktif plus yang selesai/dibatalkan belum lewat 14 hari.
 */
export const listOrdersQuerySchema = z.object({
  status: z.enum(ALL_LABELS, { error: 'Status tidak dikenal.' }).optional(),
  q: z.string().trim().max(100, 'Kata kunci maksimal 100 karakter.').optional(),
  page: z.coerce
    .number({ error: 'Halaman harus berupa angka.' })
    .int('Halaman harus bilangan bulat.')
    .min(1, 'Halaman minimal 1.')
    .default(1),
  limit: z.coerce
    .number({ error: 'Batas data harus berupa angka.' })
    .int('Batas data harus bilangan bulat.')
    .min(1, 'Batas data minimal 1.')
    .max(100, 'Batas data maksimal 100.')
    .default(20),
});

/** PATCH /api/admin/orders/:id/status — memajukan (atau memilih) fase pesanan. */
export const updateOrderStatusSchema = z.object({
  status: z.enum(FLOW_LABELS, { error: 'Status tidak valid.' }),
});

/** POST /api/admin/orders/:id/cancel — field mengikuti CancelOrderModal di frontend. */
export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(191, 'Alasan maksimal 191 karakter.').optional(),
  note: z.string().trim().max(255, 'Catatan maksimal 255 karakter.').optional(),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
