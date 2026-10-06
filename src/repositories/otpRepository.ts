import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import type { OtpRow } from '../types/db.js';

export const otpRepository = {
  /** Baris OTP terbaru untuk email ini, dipakai untuk memeriksa jeda kirim ulang. */
  async findLatest(email: string): Promise<OtpRow | null> {
    const [rows] = await pool.query<OtpRow[]>(
      'SELECT * FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      [email],
    );
    return rows[0] ?? null;
  },

  async create(email: string, code: string): Promise<void> {
    await pool.query<ResultSetHeader>(
      `INSERT INTO otp_codes (email, code, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [email, code, env.otp.codeTtlMinutes],
    );
  },

  /** Baris OTP yang masih berlaku dan belum terpakai, dicocokkan di sisi SQL agar waktu memakai jam server DB. */
  async findValidByEmailAndCode(email: string, code: string): Promise<OtpRow | null> {
    const [rows] = await pool.query<OtpRow[]>(
      `SELECT * FROM otp_codes
       WHERE email = ? AND code = ? AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, code],
    );
    return rows[0] ?? null;
  },

  /** Menandai OTP terpakai dan menerbitkan reset_token yang berlaku sebentar untuk langkah ganti sandi. */
  async markVerified(id: number, resetToken: string): Promise<void> {
    await pool.query(
      `UPDATE otp_codes
       SET consumed_at = NOW(), reset_token = ?,
           reset_token_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
       WHERE id = ?`,
      [resetToken, env.otp.resetTokenTtlMinutes, id],
    );
  },

  async findValidByResetToken(resetToken: string): Promise<OtpRow | null> {
    const [rows] = await pool.query<OtpRow[]>(
      `SELECT * FROM otp_codes
       WHERE reset_token = ? AND reset_token_expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [resetToken],
    );
    return rows[0] ?? null;
  },

  /** Mencegah reset_token dipakai dua kali untuk mengganti sandi. */
  async invalidateResetToken(id: number): Promise<void> {
    await pool.query('UPDATE otp_codes SET reset_token = NULL WHERE id = ?', [id]);
  },
};
