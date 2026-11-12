import { z } from 'zod';
import { normalizeInstagram, normalizeWhatsapp } from '../utils/storeContact.js';

/** PUT /api/admin/settings. Nilai yang lolos sudah dalam bentuk baku (lihat utils/storeContact.ts). */
export const updateStoreSettingsSchema = z.object({
  outletName: z
    .string({ error: 'Nama outlet wajib diisi.' })
    .trim()
    .min(1, 'Nama outlet wajib diisi.')
    .max(64, 'Nama outlet maksimal 64 karakter.'),
  whatsapp: z
    .string({ error: 'Nomor WhatsApp wajib diisi.' })
    .trim()
    .refine((v) => normalizeWhatsapp(v) !== null, {
      message: 'Nomor WhatsApp belum benar. Contoh: 081234567890 atau +6281234567890.',
    })
    .transform((v) => normalizeWhatsapp(v) as string),
  instagram: z
    .string({ error: 'Akun Instagram wajib diisi.' })
    .trim()
    .refine((v) => normalizeInstagram(v) !== null, {
      message: 'Akun Instagram belum benar. Tempel tautan profil, contoh: https://www.instagram.com/yap_coffee_/',
    })
    .transform((v) => normalizeInstagram(v) as string),
});

/** PUT /api/admin/me — mengganti nama tampilan admin. */
export const updateAdminProfileSchema = z.object({
  name: z
    .string({ error: 'Nama wajib diisi.' })
    .trim()
    .min(1, 'Nama wajib diisi.')
    .max(100, 'Nama maksimal 100 karakter.'),
});

/** POST /api/admin/me/change-password */
export const changeAdminPasswordSchema = z
  .object({
    current_password: z
      .string({ error: 'Kata sandi saat ini wajib diisi.' })
      .min(1, 'Kata sandi saat ini wajib diisi.'),
    // bcrypt hanya membaca 72 byte pertama, jadi batas atas dipasang agar tidak menyesatkan.
    password: z
      .string({ error: 'Kata sandi baru wajib diisi.' })
      .min(8, 'Kata sandi baru minimal 8 karakter.')
      .max(72, 'Kata sandi baru maksimal 72 karakter.'),
    password_confirmation: z.string({ error: 'Konfirmasi kata sandi wajib diisi.' }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ['password_confirmation'],
    message: 'Konfirmasi kata sandi tidak sama.',
  });

export const setNotificationsSchema = z.object({
  enabled: z.boolean({ error: 'Nilai enabled harus true atau false.' }),
});

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;
export type UpdateAdminProfileInput = z.infer<typeof updateAdminProfileSchema>;
export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;
export type SetNotificationsInput = z.infer<typeof setNotificationsSchema>;
