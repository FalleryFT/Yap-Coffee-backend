import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import type { CustomerRow } from '../types/db.js';

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
}

const COLUMNS =
  'id, name, email, phone, password_hash, created_at, password_updated_at, notifications_enabled, avatar';

export const customerRepository = {
  async findByEmail(email: string): Promise<CustomerRow | null> {
    const [rows] = await pool.query<CustomerRow[]>(
      `SELECT ${COLUMNS} FROM customers WHERE email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  },

  async findById(id: number): Promise<CustomerRow | null> {
    const [rows] = await pool.query<CustomerRow[]>(
      `SELECT ${COLUMNS} FROM customers WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateCustomerInput): Promise<CustomerRow> {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [input.name, input.email, input.phone, input.passwordHash],
    );
    // Dibaca ulang supaya created_at berasal dari database, bukan jam Node.
    const created = await this.findById(result.insertId);
    return created as CustomerRow;
  },

  /** Ganti sandi lewat alur lupa sandi (dicari dari email). */
  async updatePassword(email: string, passwordHash: string): Promise<void> {
    await pool.query(
      'UPDATE customers SET password_hash = ?, password_updated_at = NOW() WHERE email = ?',
      [passwordHash, email],
    );
  },

  /** Ganti sandi dari halaman profil (dicari dari id). */
  async updatePasswordById(id: number, passwordHash: string): Promise<void> {
    await pool.query(
      'UPDATE customers SET password_hash = ?, password_updated_at = NOW() WHERE id = ?',
      [passwordHash, id],
    );
  },

  /** Nama berkas foto profil; null menghapus foto (kembali ke foto bawaan). */
  async setAvatar(id: number, filename: string | null): Promise<void> {
    await pool.query('UPDATE customers SET avatar = ? WHERE id = ?', [filename, id]);
  },

  /** Saklar Notifikasi di halaman Profil. */
  async setNotificationsEnabled(id: number, enabled: boolean): Promise<void> {
    await pool.query('UPDATE customers SET notifications_enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  },

  /** Email sengaja tidak bisa diubah di sini: perubahan email perlu verifikasi tersendiri. */
  async updateProfile(id: number, input: { name: string; phone: string }): Promise<void> {
    await pool.query('UPDATE customers SET name = ?, phone = ? WHERE id = ?', [
      input.name,
      input.phone,
      id,
    ]);
  },
};
