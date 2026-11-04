import { z } from 'zod';

/**
 * Query GET /api/admin/dashboard. Nilai datang sebagai string dari URL, jadi angka di-coerce.
 * `queueLimit` membatasi jumlah baris pada tabel antrean pesanan hari ini.
 */
export const dashboardQuerySchema = z.object({
  q: z.string().trim().max(100, 'Kata kunci maksimal 100 karakter.').optional(),
  queueLimit: z.coerce
    .number({ error: 'Batas antrean harus berupa angka.' })
    .int('Batas antrean harus bilangan bulat.')
    .min(1, 'Batas antrean minimal 1.')
    .max(50, 'Batas antrean maksimal 50.')
    .default(10),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
