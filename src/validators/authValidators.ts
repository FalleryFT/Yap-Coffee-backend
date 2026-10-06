import { z } from 'zod';

const passwordRule = z
  .string({ error: 'Kata sandi wajib diisi.' })
  .min(8, 'Kata sandi minimal 8 karakter.');

// Nomor Indonesia dalam format internasional, contoh: +6281234567890
const phoneRule = z
  .string({ error: 'Nomor ponsel wajib diisi.' })
  .regex(/^\+62\d{8,13}$/, 'Nomor ponsel belum benar. Gunakan format +62…');

export const adminLoginSchema = z.object({
  username: z.string({ error: 'Username wajib diisi.' }).min(1, 'Username wajib diisi.'),
  password: z.string({ error: 'Kata sandi wajib diisi.' }).min(1, 'Kata sandi wajib diisi.'),
});

export const customerLoginSchema = z.object({
  email: z.email('Format email belum benar.'),
  password: z.string({ error: 'Kata sandi wajib diisi.' }).min(1, 'Kata sandi wajib diisi.'),
});

export const registerSchema = z
  .object({
    name: z.string({ error: 'Nama lengkap wajib diisi.' }).trim().min(1, 'Nama lengkap wajib diisi.'),
    email: z.email('Format email belum benar.'),
    phone: phoneRule,
    password: passwordRule,
    password_confirmation: z.string({ error: 'Konfirmasi sandi wajib diisi.' }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'Konfirmasi sandi tidak sama.',
    path: ['password_confirmation'],
  });

export const sendOtpSchema = z.object({
  email: z.email('Format email belum benar.'),
});

export const verifyOtpSchema = z.object({
  email: z.email('Format email belum benar.'),
  otp: z.string({ error: 'Kode OTP wajib diisi.' }).length(4, 'Kode OTP harus 4 digit.'),
});

export const resetPasswordSchema = z
  .object({
    reset_token: z.string({ error: 'Token reset tidak valid.' }).min(1, 'Token reset tidak valid.'),
    password: passwordRule,
    password_confirmation: z.string({ error: 'Konfirmasi sandi wajib diisi.' }),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'Konfirmasi sandi tidak sama.',
    path: ['password_confirmation'],
  });
