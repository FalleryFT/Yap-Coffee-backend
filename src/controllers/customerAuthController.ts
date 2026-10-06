import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { customerRepository } from '../repositories/customerRepository.js';
import { otpRepository } from '../repositories/otpRepository.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { generateOtpCode, generateResetToken } from '../utils/otp.js';
import { ok, created } from '../utils/response.js';

const PASSWORD_HASH_ROUNDS = 10;

function toPublicCustomer(row: { id: number; name: string; email: string; phone: string }) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone };
}

export const customerAuthController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body as { email: string; password: string };

    const customer = await customerRepository.findByEmail(email);
    if (!customer || !(await bcrypt.compare(password, customer.password_hash))) {
      throw AppError.unauthorized('Email atau kata sandi salah.');
    }

    const token = signToken({ sub: customer.id, role: 'customer' });
    ok(res, 'Login berhasil.', { token, user: toPublicCustomer(customer) });
  },

  async register(req: Request, res: Response) {
    const { name, email, phone, password } = req.body as {
      name: string;
      email: string;
      phone: string;
      password: string;
    };

    const existing = await customerRepository.findByEmail(email);
    if (existing) {
      throw AppError.validation({ email: ['Email sudah terdaftar.'] });
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    const customer = await customerRepository.create({ name, email, phone, passwordHash });

    const token = signToken({ sub: customer.id, role: 'customer' });
    created(res, 'Pendaftaran berhasil.', { token, user: toPublicCustomer(customer) });
  },

  async me(req: Request, res: Response) {
    const customer = await customerRepository.findById(req.customerId!);
    if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');
    ok(res, 'OK', toPublicCustomer(customer));
  },

  async sendOtp(req: Request, res: Response) {
    const { email } = req.body as { email: string };

    // Jeda kirim ulang dicek dari baris OTP mana pun untuk email ini, bukan hanya baris akun terdaftar,
    // supaya endpoint ini tidak bisa dijadikan oracle untuk menebak email yang terdaftar.
    const latest = await otpRepository.findLatest(email);
    if (latest) {
      const elapsedMs = Date.now() - new Date(latest.created_at).getTime();
      const remaining = env.otp.resendCooldownSeconds - Math.floor(elapsedMs / 1000);
      if (remaining > 0) {
        throw AppError.tooManyRequests(`Tunggu ${remaining} detik sebelum meminta kode baru.`);
      }
    }

    // Baris OTP hanya dibuat jika emailnya benar-benar terdaftar, tetapi pesan ke klien
    // selalu sama agar endpoint ini tidak bisa dipakai untuk menebak email yang terdaftar.
    const customer = await customerRepository.findByEmail(email);
    if (customer) {
      const code = generateOtpCode();
      await otpRepository.create(email, code);
      // Pengiriman email sungguhan ada di luar cakupan proyek ini (lihat README backend-api).
      console.log(`[OTP] Kode untuk ${email}: ${code}`);
    }

    ok(res, 'Jika email terdaftar, kode OTP sudah dikirim.', null);
  },

  async verifyOtp(req: Request, res: Response) {
    const { email, otp } = req.body as { email: string; otp: string };

    const row = await otpRepository.findValidByEmailAndCode(email, otp);
    if (!row) {
      throw AppError.validation({ otp: ['Kode OTP salah atau sudah kedaluwarsa.'] });
    }

    const resetToken = generateResetToken();
    await otpRepository.markVerified(row.id, resetToken);
    ok(res, 'OTP terverifikasi.', { reset_token: resetToken });
  },

  async resetPassword(req: Request, res: Response) {
    const { reset_token: resetToken, password } = req.body as {
      reset_token: string;
      password: string;
    };

    const row = await otpRepository.findValidByResetToken(resetToken);
    if (!row) {
      throw AppError.unauthorized('Token reset tidak valid atau sudah kedaluwarsa. Ulangi dari awal.');
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    await customerRepository.updatePassword(row.email, passwordHash);
    await otpRepository.invalidateResetToken(row.id);

    ok(res, 'Kata sandi berhasil diubah.', null);
  },
};
