import { z } from 'zod';

/** 'YYYY-MM' (bulan 01-12) atau 'semua' — sama dengan nilai filter bulan di frontend. */
const monthSchema = z
  .string()
  .trim()
  .regex(/^(semua|\d{4}-(0[1-9]|1[0-2]))$/, 'Bulan harus berformat YYYY-MM atau "semua".')
  .default('semua');

/** Nilai status mengikuti dropdown frontend (constants/history.ts → statusOptions). */
export const HISTORY_STATUS_FILTERS = ['semua', 'selesai', 'batal'] as const;

/**
 * Query GET /api/admin/history. Semua nilai datang sebagai string dari URL, jadi angka di-coerce.
 * `limit` bawaan 8 mengikuti PAGE_SIZE di frontend.
 */
export const listHistoryQuerySchema = z.object({
  status: z.enum(HISTORY_STATUS_FILTERS, { error: 'Status tidak dikenal.' }).default('semua'),
  month: monthSchema,
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
    .default(8),
});

/** Query GET /api/admin/history/export: filter yang sama dengan daftar, tanpa halaman. */
export const exportHistoryQuerySchema = z.object({
  status: listHistoryQuerySchema.shape.status,
  month: monthSchema,
  q: listHistoryQuerySchema.shape.q,
  format: z.enum(['csv', 'xlsx'], { error: 'Format harus csv atau xlsx.' }).default('csv'),
});

/** Query GET /api/admin/history/stats dan /api/admin/history/revenue. */
export const historyPeriodQuerySchema = z.object({
  month: monthSchema,
});

export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
export type ExportHistoryQuery = z.infer<typeof exportHistoryQuerySchema>;
export type HistoryPeriodQuery = z.infer<typeof historyPeriodQuerySchema>;
