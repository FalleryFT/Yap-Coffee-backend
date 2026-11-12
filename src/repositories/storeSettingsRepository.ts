import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

export interface StoreSettings {
  outletName: string;
  whatsapp: string;
  instagram: string;
}

interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string;
}

export const storeSettingsRepository = {
  /** Nilai dari database; yang belum ada memakai nilai bawaan dari .env. */
  async get(): Promise<StoreSettings> {
    let rows: SettingRow[] = [];
    try {
      [rows] = await pool.query<SettingRow[]>('SELECT setting_key, setting_value FROM store_settings');
    } catch (err) {
      // Migrasi 002 belum dijalankan: tetap melayani Home dengan nilai .env, tetapi beri tahu di log.
      if ((err as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw err;
      console.warn('Tabel store_settings belum ada. Jalankan sql/migrations/002_store_settings_notifications.sql.');
    }
    const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
    return {
      outletName: map.get('outlet_name') ?? env.store.name,
      whatsapp: map.get('whatsapp') ?? env.store.whatsapp,
      instagram: map.get('instagram') ?? env.store.instagram,
    };
  },

  async save(values: StoreSettings): Promise<void> {
    await pool.query(
      `INSERT INTO store_settings (setting_key, setting_value) VALUES (?, ?), (?, ?), (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['outlet_name', values.outletName, 'whatsapp', values.whatsapp, 'instagram', values.instagram],
    );
  },
};
