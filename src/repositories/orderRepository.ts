import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import type { OrderItemRow, OrderRow, OrderStatusDb } from '../types/db.js';
import { ACTIVE_STATUSES, FINISHED_STATUSES, FINISHED_VISIBLE_DAYS } from '../utils/orderStatus.js';

// Pesanan aktif selalu terlihat; yang selesai/dibatalkan hanya sampai FINISHED_VISIBLE_DAYS hari
// sejak updated_at (waktu status terakhir berubah).
const VISIBLE = '(o.status IN (?) OR o.updated_at >= NOW() - INTERVAL ? DAY)';

const SELECT_ORDERS = `
  SELECT o.id, o.code, o.status, o.note,
         o.subtotal, o.tax, o.service_fee, o.packaging_fee, o.total, o.created_at,
         c.name  AS customer_name,
         c.phone AS customer_phone,
         s.name  AS schedule_name,
         s.date  AS schedule_date,
         s.location, s.location_detail, s.maps_url, s.pickup_start, s.pickup_end,
         p.channel AS pay_channel,
         p.status  AS pay_status
  FROM orders o
  JOIN customers c        ON c.id = o.customer_id
  JOIN pickup_schedules s ON s.id = o.schedule_id
  LEFT JOIN payments p    ON p.order_id = o.id`;

export interface OrderListFilter {
  statuses: OrderStatusDb[];
  /** Cocok dengan nama pelanggan atau kode pesanan. */
  search?: string;
  limit: number;
  offset: number;
}

/** Karakter khusus LIKE (% _ \) di input pengguna dianggap huruf biasa. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface StatusCountRow extends RowDataPacket {
  status: OrderStatusDb;
  total: number;
}

export const orderRepository = {
  async list(filter: OrderListFilter): Promise<{ rows: OrderRow[]; total: number }> {
    const conditions = ['o.status IN (?)', VISIBLE];
    const params: unknown[] = [filter.statuses, ACTIVE_STATUSES, FINISHED_VISIBLE_DAYS];

    if (filter.search) {
      conditions.push('(c.name LIKE ? OR o.code LIKE ?)');
      const pattern = likePattern(filter.search);
      params.push(pattern, pattern);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    // Antrean aktif: yang masuk lebih dulu dikerjakan lebih dulu. Selesai/batal: terbaru di atas.
    // Campuran (tanpa filter status): antrean aktif dulu, lalu yang berakhir dari yang terbaru.
    const activeOnly = filter.statuses.every((s) => ACTIVE_STATUSES.includes(s));
    const finishedOnly = filter.statuses.every((s) => FINISHED_STATUSES.includes(s));
    const isFinished = `o.status IN ('selesai', 'dibatalkan')`;
    const orderBy = activeOnly
      ? 'o.created_at ASC, o.id ASC'
      : finishedOnly
        ? 'o.updated_at DESC, o.id DESC'
        : `${isFinished} ASC,
           IF(${isFinished}, -UNIX_TIMESTAMP(o.updated_at), UNIX_TIMESTAMP(o.created_at)) ASC,
           o.id ASC`;

    const [rows] = await pool.query<OrderRow[]>(
      `${SELECT_ORDERS} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, filter.limit, filter.offset],
    );
    const [[count]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ${where}`,
      params,
    );
    return { rows, total: count?.total ?? 0 };
  },

  async findById(id: number): Promise<OrderRow | null> {
    const [rows] = await pool.query<OrderRow[]>(`${SELECT_ORDERS} WHERE o.id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  /** Semua item untuk sekumpulan pesanan sekaligus (menghindari query per pesanan). */
  async listItems(orderIds: number[]): Promise<OrderItemRow[]> {
    if (orderIds.length === 0) return [];
    const [rows] = await pool.query<OrderItemRow[]>(
      `SELECT id, order_id, item_name, unit_price, qty, size, sugar_level, notes
       FROM order_items WHERE order_id IN (?) ORDER BY id`,
      [orderIds],
    );
    return rows;
  },

  /** Jumlah seluruh pesanan yang terlihat di daftar tanpa filter (aktif + selesai/dibatalkan yang belum lewat batas). */
  async countVisible(): Promise<number> {
    const [[row]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM orders o WHERE ${VISIBLE}`,
      [ACTIVE_STATUSES, FINISHED_VISIBLE_DAYS],
    );
    return row?.total ?? 0;
  },

  /** Jumlah pesanan aktif per status (untuk kartu statistik dan badge tab). */
  async countActiveByStatus(): Promise<Partial<Record<OrderStatusDb, number>>> {
    const [rows] = await pool.query<StatusCountRow[]>(
      'SELECT status, COUNT(*) AS total FROM orders WHERE status IN (?) GROUP BY status',
      [ACTIVE_STATUSES],
    );
    return Object.fromEntries(rows.map((r) => [r.status, r.total]));
  },

  /**
   * Pesanan yang masuk pada hari ini dikurangi `daysAgo` hari, di luar yang dibatalkan.
   * Hari mengikuti zona waktu server database (CURDATE()).
   */
  async countCreatedDaysAgo(daysAgo: number): Promise<number> {
    const [[row]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total FROM orders
       WHERE DATE(created_at) = CURDATE() - INTERVAL ? DAY AND status <> 'dibatalkan'`,
      [daysAgo],
    );
    return row?.total ?? 0;
  },

  /** Ubah status kecuali pesanan sudah dibatalkan. false = tidak ada baris yang berubah. */
  async updateStatus(id: number, status: OrderStatusDb): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE orders SET status = ? WHERE id = ? AND status <> 'dibatalkan'`,
      [status, id],
    );
    return result.affectedRows > 0;
  },

  /** Batalkan hanya bila pesanan belum selesai/dibatalkan (cek dan ubah dalam satu query). */
  async cancel(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE orders SET status = 'dibatalkan' WHERE id = ? AND status NOT IN ('selesai', 'dibatalkan')`,
      [id],
    );
    return result.affectedRows > 0;
  },
};
