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

  async findById(id: number): Promise<AdminRow | null> {
    const [rows] = await pool.query<AdminRow[]>(
      'SELECT id, name, username, password_hash, role FROM admins WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  },
};
