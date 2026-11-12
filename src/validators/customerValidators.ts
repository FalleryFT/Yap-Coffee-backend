import { z } from 'zod';

const orderItemSchema = z.object({
  menuItemId: z
    .number({ error: 'Menu tidak valid.' })
    .int('Menu tidak valid.')
    .positive('Menu tidak valid.'),
  qty: z
    .number({ error: 'Jumlah harus berupa angka.' })
    .int('Jumlah harus bilangan bulat.')
    .min(1, 'Jumlah minimal 1.')
    .max(20, 'Jumlah maksimal 20 per menu.'),
  // Dicocokkan dengan pilihan di database (menu_sizes / sugar_levels) saat pesanan dibuat.
  size: z.string().trim().min(1).max(32, 'Ukuran tidak dikenal.').optional(),
  sugarLevel: z.string().trim().min(1).max(32, 'Tingkat manis tidak dikenal.').optional(),
  notes: z.string().trim().max(120, 'Catatan item maksimal 120 karakter.').optional(),
  addonIds: z.array(z.number().int().positive()).max(10, 'Maksimal 10 tambahan.').default([]),
});

/** POST /api/orders. Harga tidak diterima dari klien; server menghitungnya dari database. */
export const createOrderSchema = z.object({
  scheduleId: z
    .number({ error: 'Jadwal pengambilan wajib dipilih.' })
    .int('Jadwal tidak valid.')
    .positive('Jadwal tidak valid.'),
  note: z.string().trim().max(255, 'Catatan maksimal 255 karakter.').optional(),
  items: z
    .array(orderItemSchema, { error: 'Pesanan wajib berisi menu.' })
    .min(1, 'Keranjang masih kosong.')
    .max(30, 'Maksimal 30 baris menu per pesanan.'),
});

export const listMyOrdersQuerySchema = z.object({
  tab: z.enum(['active', 'history'], { error: 'Tab tidak dikenal.' }).default('active'),
});

// Nomor Indonesia dalam format internasional, sama dengan pendaftaran.
export const updateProfileSchema = z.object({
  name: z.string({ error: 'Nama lengkap wajib diisi.' }).trim().min(1, 'Nama lengkap wajib diisi.').max(191),
  phone: z
    .string({ error: 'Nomor ponsel wajib diisi.' })
    .regex(/^\+62\d{8,13}$/, 'Nomor ponsel belum benar. Gunakan format +62…'),
});

export const changePasswordSchema = z
  .object({
    current_password: z
      .string({ error: 'Sandi lama wajib diisi.' })
      .min(1, 'Sandi lama wajib diisi.'),
    password: z.string({ error: 'Kata sandi wajib diisi.' }).min(8, 'Kata sandi minimal 8 karakter.'),
    password_confirmation: z.string({ error: 'Konfirmasi sandi wajib diisi.' }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'Konfirmasi sandi tidak sama.',
    path: ['password_confirmation'],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
