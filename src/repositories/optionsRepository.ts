import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

export interface SizeOptionRow extends RowDataPacket {
  id: number;
  label: string;
  detail: string;
  extra_price: number;
  is_default: number;
}

export interface SugarOptionRow extends RowDataPacket {
  id: number;
  label: string;
  is_default: number;
}

export interface SizeInput {
  label: string;
  detail: string;
  extraPrice: number;
  isDefault: boolean;
}

export interface SugarInput {
  label: string;
  isDefault: boolean;
}

export const optionsRepository = {
  async listSizes(): Promise<SizeOptionRow[]> {
    const [rows] = await pool.query<SizeOptionRow[]>(
      'SELECT id, label, detail, extra_price, is_default FROM menu_sizes ORDER BY sort_order, id',
    );
    return rows;
  },

  async listSugarLevels(): Promise<SugarOptionRow[]> {
    const [rows] = await pool.query<SugarOptionRow[]>(
      'SELECT id, label, is_default FROM sugar_levels ORDER BY sort_order, id',
    );
    return rows;
  },

  /**
   * Mengganti seluruh daftar sekaligus (urutan di layar = urutan tersimpan). Pesanan menyimpan namanya
   * sebagai teks, jadi mengganti id di sini tidak mempengaruhi pesanan yang sudah ada.
   */
  async replaceAll(sizes: SizeInput[], sugarLevels: SugarInput[]): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM menu_sizes');
      await conn.query('DELETE FROM sugar_levels');
      await conn.query(
        'INSERT INTO menu_sizes (label, detail, extra_price, is_default, sort_order) VALUES ?',
        [sizes.map((s, i) => [s.label, s.detail, s.extraPrice, s.isDefault ? 1 : 0, i + 1])],
      );
      await conn.query('INSERT INTO sugar_levels (label, is_default, sort_order) VALUES ?', [
        sugarLevels.map((s, i) => [s.label, s.isDefault ? 1 : 0, i + 1]),
      ]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};
