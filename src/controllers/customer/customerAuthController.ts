import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { env } from '../../config/env.js';
import { customerRepository } from '../../repositories/customerRepository.js';
import { otpRepository } from '../../repositories/otpRepository.js';
import { AppError } from '../../utils/AppError.js';
import { removeImage, uploadImage } from '../../utils/cloudinary.js';
import { signToken } from '../../utils/jwt.js';
import { maskEmail } from '../../utils/logger.js';
import { sendOtpEmail } from '../../utils/mailer.js';
import { generateOtpCode, generateResetToken } from '../../utils/otp.js';
import { detectImageType } from '../../utils/uploads.js';
import { ok, created } from '../../utils/response.js';
import type { ChangePasswordInput, UpdateProfileInput } from '../../validators/customerValidators.js';

const PASSWORD_HASH_ROUNDS = 10;

function toPublicCustomer(row: {
  id: number;
  name: string;
  email: string;
  phone: string;
  created_at?: string;
  password_updated_at?: string | null;
  avatar?: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    // Tersedia pada /me; dipakai halaman Edit Profil ("Bergabung sejak ...").
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    passwordUpdatedAt: row.password_updated_at ?? null,
    // URL foto profil di Cloudinary; null = foto bawaan aplikasi.
    avatar: row.avatar ?? null,
  };
}

function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const OTP_WRONG = 'Kode OTP salah atau sudah kedaluwarsa.';

/**
 * Mengirim email OTP di latar belakang, tanpa ditunggu respons HTTP. Dua alasannya:
 * 1) lamanya SMTP tidak boleh membedakan email terdaftar dari yang tidak (celah waktu), dan
 * 2) galat SMTP tidak boleh membocorkan apakah email terdaftar.
 * Bila gagal, baris OTP dihapus supaya pengguna bisa langsung meminta ulang tanpa menunggu jeda.
 */
function deliverOtp(log: Logger, otpId: number, to: string, name: string, code: string): void {
  sendOtpEmail({ to, name, code, ttlMinutes: env.otp.codeTtlMinutes })
    .then((sent) => {
      if (sent) log.info({ email: maskEmail(to) }, 'Email OTP diterima server SMTP.');
    })
    .catch((err: unknown) => {
      log.error({ err, email: maskEmail(to) }, 'Email OTP gagal dikirim.');
      return otpRepository.remove(otpId).catch((removeErr: unknown) => {
        log.error({ err: removeErr, otpId }, 'Gagal menghapus OTP yang emailnya tidak terkirim.');
      });
    });
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

  /** PUT /api/me — nama dan nomor ponsel. Email tidak bisa diubah di sini. */
  async updateMe(req: Request, res: Response) {
    const input = req.body as UpdateProfileInput;
    await customerRepository.updateProfile(req.customerId!, input);

    const customer = await customerRepository.findById(req.customerId!);
    if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');
    ok(res, 'Profil berhasil diperbarui.', toPublicCustomer(customer));
  },

  /** PUT /api/me/avatar — unggah foto profil (multipart, field "image"). */
  async setAvatar(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw AppError.validation({ image: ['Pilih foto terlebih dahulu.'] });

    const customerId = req.customerId!;
    if (!detectImageType(file.buffer)) {
      throw AppError.validation({ image: ['Berkas bukan foto JPG, PNG, atau WebP yang valid.'] });
    }

    const customer = await customerRepository.findById(customerId);
    if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');

    const url = await uploadImage(file.buffer, 'avatars');
    try {
      await customerRepository.setAvatar(customerId, url);
    } catch (err) {
      await removeImage(url);
      throw err;
    }
    await removeImage(customer.avatar);
    const updated = await customerRepository.findById(customerId);
    ok(res, 'Foto profil berhasil diperbarui.', toPublicCustomer(updated ?? { ...customer, avatar: url }));
  },

  /** DELETE /api/me/avatar — kembali ke foto bawaan. */
  async clearAvatar(req: Request, res: Response) {
    const customerId = req.customerId!;
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');
    await customerRepository.setAvatar(customerId, null);
    await removeImage(customer.avatar);
    ok(res, 'Foto profil dihapus.', toPublicCustomer({ ...customer, avatar: null }));
  },

  /** POST /api/me/change-password */
  async changePassword(req: Request, res: Response) {
    const { current_password: current, password } = req.body as ChangePasswordInput;

    const customer = await customerRepository.findById(req.customerId!);
    if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');

    if (!(await bcrypt.compare(current, customer.password_hash))) {
      throw AppError.validation({ current_password: ['Sandi lama salah.'] });
    }
    if (await bcrypt.compare(password, customer.password_hash)) {
      throw AppError.validation({ password: ['Sandi baru harus berbeda dari sandi lama.'] });
    }

    await customerRepository.updatePasswordById(
      customer.id,
      await bcrypt.hash(password, PASSWORD_HASH_ROUNDS),
    );
    ok(res, 'Kata sandi berhasil diubah.', null);
  },

  async sendOtp(req: Request, res: Response) {
    const { email } = req.body as { email: string };

    // Jeda kirim ulang dicek dari baris OTP terbaru untuk email ini. Email yang tidak terdaftar juga
    // meninggalkan baris (createDecoy di bawah), jadi jeda ini berlaku sama untuk semua email dan
    // tidak bisa dijadikan oracle untuk menebak email yang terdaftar.
    const latest = await otpRepository.findLatest(email);
    if (latest) {
      // age_seconds dihitung database, jadi tidak terpengaruh beda zona waktu Node dan MySQL.
      const remaining = env.otp.resendCooldownSeconds - (latest.age_seconds ?? Infinity);
      if (remaining > 0) {
        throw AppError.tooManyRequests(`Tunggu ${remaining} detik sebelum meminta kode baru.`);
      }
    }

    // Pesan ke klien selalu sama, terdaftar atau tidak, agar endpoint ini tidak bisa dipakai
    // untuk menebak email yang terdaftar.
    const customer = await customerRepository.findByEmail(email);
    if (customer) {
      const code = generateOtpCode();
      const otpId = await otpRepository.create(email, code);
      deliverOtp(req.log, otpId, customer.email, customer.name, code);
    } else {
      await otpRepository.createDecoy(email);
      req.log.info({ email: maskEmail(email) }, 'OTP diminta untuk email yang tidak terdaftar.');
    }

    ok(res, 'Jika email terdaftar, kode OTP sudah dikirim.', null);
  },

  async verifyOtp(req: Request, res: Response) {
    const { email, otp } = req.body as { email: string; otp: string };

    // Hanya satu OTP yang berlaku per email, dan tiap OTP dibatasi jumlah salah tebaknya,
    // sehingga 10.000 kemungkinan kode 4 digit tidak bisa ditebak habis walau ganti-ganti IP.
    const active = await otpRepository.findActive(email);
    if (!active) {
      throw AppError.validation({ otp: [OTP_WRONG] });
    }
    // Kesempatan dipakai lebih dulu (atomik), baru kode dibandingkan. Memeriksa `attempts` lalu
    // menambahnya terpisah akan membuka celah: permintaan paralel lolos sebelum hitungan naik.
    if (!(await otpRepository.useAttempt(active.id))) {
      req.log.warn({ email: maskEmail(email) }, 'Kesempatan tebak OTP habis.');
      throw AppError.validation({ otp: [OTP_WRONG] });
    }
    if (!sameCode(active.code, otp)) {
      req.log.warn({ email: maskEmail(email), attempt: active.attempts + 1 }, 'OTP salah.');
      throw AppError.validation({ otp: [OTP_WRONG] });
    }

    const resetToken = generateResetToken();
    await otpRepository.markVerified(active.id, resetToken);
    req.log.info({ email: maskEmail(email) }, 'OTP terverifikasi.');
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
    req.log.info({ email: maskEmail(row.email) }, 'Kata sandi direset lewat OTP.');

    ok(res, 'Kata sandi berhasil diubah.', null);
  },
};