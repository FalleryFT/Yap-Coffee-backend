import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import type { PickupScheduleRow } from '../types/db.js';
import type { CreateScheduleInput, UpdateScheduleInput } from '../validators/scheduleValidators.js';

const SELECT_COLUMNS = `
  SELECT id, name, date, location, location_detail, maps_url,
         pickup_start, pickup_end, cut_off_time, status
  FROM pickup_schedules`;

export const scheduleRepository = {
  /** Jadwal yang belum selesai (aktif + mendatang), urut tanggal lalu jam mulai. */
  async listOpen(): Promise<PickupScheduleRow[]> {
    const [rows] = await pool.query<PickupScheduleRow[]>(
      `${SELECT_COLUMNS} WHERE status <> 'selesai' ORDER BY date, pickup_start, id`,
    );
    return rows;
  },

  async findById(id: number): Promise<PickupScheduleRow | null> {
    const [rows] = await pool.query<PickupScheduleRow[]>(`${SELECT_COLUMNS} WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  /** Jadwal baru langsung berstatus 'aktif' (tombol "Simpan & Buka Jadwal"). */
  async create(input: CreateScheduleInput): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO pickup_schedules
         (name, date, location, location_detail, maps_url, pickup_start, pickup_end, cut_off_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')`,
      [
        input.name,
        input.date,
        input.location,
        input.locationDetail || null,
        input.mapsUrl,
        `${input.pickupStart}:00`,
        `${input.pickupEnd}:00`,
        `${input.cutOffTime}:00`,
      ],
    );
    return result.insertId;
  },

  /** Hanya kolom yang dikirim yang diubah (undefined dilewati). */
  async update(id: number, input: UpdateScheduleInput): Promise<void> {
    const columns: Record<string, unknown> = {
      name: input.name,
      location: input.location,
      location_detail:
        input.locationDetail === undefined ? undefined : input.locationDetail || null,
    };
    const entries = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return;

    const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
    await pool.query(`UPDATE pickup_schedules SET ${setClause} WHERE id = ?`, [
      ...entries.map(([, value]) => value),
      id,
    ]);
  },

  async remove(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>('DELETE FROM pickup_schedules WHERE id = ?', [id]);
    return result.affectedRows > 0;
  },
};
