import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import type { OtpRow } from '../types/db.js';

export const otpRepository = {
  /**
   * Baris OTP terbaru untuk email ini, dipakai untuk memeriksa jeda kirim ulang.
   * `age_seconds` dihitung oleh database sehingga tidak bergantung pada zona waktu Node.
   */
  async findLatest(email: string): Promise<OtpRow | null> {
    const [rows] = await pool.query<OtpRow[]>(
      `SELECT *, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_seconds
       FROM otp_codes WHERE email = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  },

  /**
   * OTP baru membuat OTP lama yang belum terpakai hangus, jadi hanya satu kode yang berlaku.
   * Mengembalikan id baris baru.
   */
  async create(email: string, code: string): Promise<number> {
    await pool.query(
      'UPDATE otp_codes SET consumed_at = NOW() WHERE email = ? AND consumed_at IS NULL',
      [email],
    );
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO otp_codes (email, code, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [email, code, env.otp.codeTtlMinutes],
    );
    return result.insertId;
  },

  /**
   * Baris pencatat untuk email yang tidak terdaftar: langsung berstatus terpakai sehingga tidak pernah
   * bisa diverifikasi, tetapi tetap dihitung oleh findLatest. Dengan begitu jeda kirim ulang berlaku sama
   * untuk email terdaftar maupun tidak, dan respons endpoint tidak bisa dipakai menebak email terdaftar.
   */
  async createDecoy(email: string): Promise<void> {
    await pool.query(
      `INSERT INTO otp_codes (email, code, expires_at, consumed_at)
       VALUES (?, '0000', NOW(), NOW())`,
      [email],
    );
  },

  /** Menghapus baris OTP, dipakai saat email gagal terkirim agar pengguna tidak terkena jeda kirim ulang. */
  async remove(id: number): Promise<void> {
    await pool.query('DELETE FROM otp_codes WHERE id = ?', [id]);
  },

  /** Membuang baris OTP yang sudah lebih dari sehari. Mengembalikan jumlah baris yang dihapus. */
  async purgeOld(): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM otp_codes WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)',
    );
    return result.affectedRows;
  },

  /** OTP yang sedang berlaku untuk email ini (belum terpakai dan belum kedaluwarsa). */
  async findActive(email: string): Promise<OtpRow | null> {
    const [rows] = await pool.query<OtpRow[]>(
      `SELECT * FROM otp_codes
       WHERE email = ? AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  },

  /**
   * Memakai satu kesempatan tebak SEBELUM kode dibandingkan, dalam satu pernyataan atomik.
   * Dengan cara ini permintaan paralel tidak bisa menebak lebih dari env.otp.maxAttempts kali.
   * Mengembalikan false bila kesempatan sudah habis atau OTP sudah terpakai.
   */
  async useAttempt(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      'UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND consumed_at IS NULL',
      [id, env.otp.maxAttempts],
    );
    return result.affectedRows === 1;
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
