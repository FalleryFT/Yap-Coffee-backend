import { pool } from '../config/db.js';
import type { AdminRow } from '../types/db.js';

export const adminRepository = {
  async findByUsername(username: string): Promise<AdminRow | null> {
    const [rows] = await pool.query<AdminRow[]>(
      'SELECT id, name, username, password_hash, role FROM admins WHERE username = ? LIMIT 1',
      [username],
    );
    return rows[0] ?? null;
  },

  async updateName(id: number, name: string): Promise<void> {
    await pool.query('UPDATE admins SET name = ? WHERE id = ?', [name, id]);
  },

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await pool.query('UPDATE admins SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  },

  async findById(id: number): Promise<AdminRow | null> {
    const [rows] = await pool.query<AdminRow[]>(
      'SELECT id, name, username, password_hash, role FROM admins WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  },
};
