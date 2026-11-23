import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import type { PickupScheduleRow } from '../types/db.js';
import { resolveCoordinates } from '../utils/mapsCoordinates.js';
import type { CreateScheduleInput, UpdateScheduleInput } from '../validators/scheduleValidators.js';

/** Status tampilan, dihitung dari tanggal pengambilan terhadap hari ini (jam database). */
export type ScheduleDisplayStatus = 'aktif' | 'mendatang' | 'berakhir';
export type ScheduleRow = PickupScheduleRow & { display_status: ScheduleDisplayStatus };

/** Jadwal otomatis hilang dari daftar admin mulai H+3 dari tanggal pengambilan. */
const HIDE_AFTER_DAYS = 3;

// aktif = tanggal pengambilan hari ini, mendatang = tanggal ke depan, berakhir = sudah lewat.
const SELECT_COLUMNS = `
  SELECT id, name, date, location, location_detail, maps_url, latitude, longitude,
         pickup_start, pickup_end, cut_off_time, status,
         CASE
           WHEN date = CURDATE() THEN 'aktif'
           WHEN date > CURDATE() THEN 'mendatang'
           ELSE 'berakhir'
         END AS display_status
  FROM pickup_schedules`;

export const scheduleRepository = {
  /**
   * Jadwal untuk tabel admin: aktif, mendatang, dan yang baru berakhir.
   * Yang sudah lewat HIDE_AFTER_DAYS hari tidak ditampilkan lagi (datanya tidak dihapus,
   * karena pesanan lama merujuk ke jadwal itu).
   */
  async listOpen(): Promise<ScheduleRow[]> {
    const [rows] = await pool.query<ScheduleRow[]>(
      `${SELECT_COLUMNS}
       WHERE status <> 'selesai' AND date > DATE_SUB(CURDATE(), INTERVAL ${HIDE_AFTER_DAYS} DAY)
       ORDER BY date, pickup_start, id`,
    );
    return rows;
  },

  /**
   * Jadwal yang masih menerima pesanan: aktif dan belum lewat batas pemesanan (jam database).
   * Cut-off berlaku H-1, yaitu jam cut-off pada hari sebelum tanggal pengambilan.
   */
  async listOrderable(): Promise<ScheduleRow[]> {
    const [rows] = await pool.query<ScheduleRow[]>(
      `${SELECT_COLUMNS}
       WHERE status = 'aktif' AND TIMESTAMP(DATE_SUB(date, INTERVAL 1 DAY), cut_off_time) > NOW()
       ORDER BY date, pickup_start, id`,
    );
    return rows;
  },

  async findById(id: number): Promise<ScheduleRow | null> {
    const [rows] = await pool.query<ScheduleRow[]>(`${SELECT_COLUMNS} WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  /** Jadwal baru langsung berstatus 'aktif' (tombol "Simpan & Buka Jadwal"). */
  async create(input: CreateScheduleInput): Promise<number> {
    const point = resolveCoordinates(input);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO pickup_schedules
         (name, date, location, location_detail, maps_url, latitude, longitude, pickup_start, pickup_end, cut_off_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif')`,
      [
        input.name,
        input.date,
        input.location,
        input.locationDetail || null,
        input.mapsUrl,
        point?.latitude ?? null,
        point?.longitude ?? null,
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
      latitude: input.latitude,
      longitude: input.longitude,
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