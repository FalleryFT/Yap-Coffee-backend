import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import type { OrderItemRow, OrderStatusDb } from '../types/db.js';
import type { HistoryOrderRow } from '../types/db.history.js';
import { FINISHED_STATUSES } from '../utils/orderStatus.js';

// Riwayat memakai created_at sebagai tanggal pesanan, sama dengan tanggal yang tampil di tabel frontend.
const SELECT_HISTORY = `
  SELECT o.id, o.code, o.status, o.note,
         o.subtotal, o.tax, o.service_fee, o.packaging_fee, o.total, o.created_at,
         o.customer_id,
         c.name  AS customer_name,
         c.phone AS customer_phone,
         s.name  AS schedule_name,
         s.date  AS schedule_date,
         s.location, s.location_detail, s.maps_url, s.pickup_start, s.pickup_end,
         p.channel AS pay_channel,
         p.status  AS pay_status,
         p.rrn     AS pay_rrn
  FROM orders o
  JOIN customers c        ON c.id = o.customer_id
  JOIN pickup_schedules s ON s.id = o.schedule_id
  LEFT JOIN payments p    ON p.order_id = o.id`;

export interface HistoryListFilter {
  statuses: OrderStatusDb[];
  /** 'YYYY-MM' atau 'semua'. */
  month: string;
  /** Cocok dengan kode/nomor order, nama pelanggan, atau nama menu. */
  search?: string;
  limit: number;
  offset: number;
}

export interface HistoryStatsRow {
  completed: number;
  cancelled: number;
  revenue: number;
}

export interface TopMenu {
  name: string;
  qty: number;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface StatsRow extends RowDataPacket {
  completed: string | number | null;
  cancelled: string | number | null;
  revenue: string | number | null;
}

interface TopMenuRow extends RowDataPacket {
  name: string;
  qty: string | number;
}

interface MonthRevenueRow extends RowDataPacket {
  ym: string;
  revenue: string | number;
}

interface YearRevenueRow extends RowDataPacket {
  y: number;
  revenue: string | number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 'YYYY-MM' → rentang [from, to) berupa tanggal. Dipakai alih-alih DATE_FORMAT() di WHERE
 * supaya indeks pada created_at tetap bisa dipakai. 'semua' → null (tanpa batas).
 */
function monthRange(month: string): { from: string; to: string } | null {
  if (month === 'semua') return null;
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const next = mon === 12 ? { y: year + 1, m: 1 } : { y: year, m: mon + 1 };
  return { from: `${year}-${pad(mon)}-01`, to: `${next.y}-${pad(next.m)}-01` };
}

/** Karakter khusus LIKE (% _ \) di input pengguna dianggap huruf biasa. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&')}%`;
}

const num = (value: string | number | null | undefined): number => Number(value ?? 0);

/** Klausa WHERE untuk daftar riwayat; parameter berurutan sesuai tanda tanya. */
function buildListWhere(filter: Pick<HistoryListFilter, 'statuses' | 'month' | 'search'>) {
  const conditions = ['o.status IN (?)'];
  const params: unknown[] = [filter.statuses.length > 0 ? filter.statuses : FINISHED_STATUSES];

  const range = monthRange(filter.month);
  if (range) {
    conditions.push('o.created_at >= ? AND o.created_at < ?');
    params.push(range.from, range.to);
  }

  if (filter.search) {
    // Nomor order di frontend tampil sebagai "#ORD-9024"; angkanya adalah id pesanan.
    const idMatch = /^(?:ORD-?)?(\d+)$/i.exec(filter.search);
    const pattern = likePattern(filter.search);
    const parts = [
      'c.name LIKE ?',
      'o.code LIKE ?',
      'EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.item_name LIKE ?)',
    ];
    params.push(pattern, pattern, pattern);
    if (idMatch) {
      parts.push('o.id = ?');
      params.push(Number(idMatch[1]));
    }
    conditions.push(`(${parts.join(' OR ')})`);
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

export const historyRepository = {
  async list(filter: HistoryListFilter): Promise<{ rows: HistoryOrderRow[]; total: number }> {
    const { where, params } = buildListWhere(filter);

    // Terbaru di atas, sama dengan urutan data di frontend.
    const [rows] = await pool.query<HistoryOrderRow[]>(
      `${SELECT_HISTORY} ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
      [...params, filter.limit, filter.offset],
    );
    const [[count]] = await pool.query<(CountRow)[]>(
      `SELECT COUNT(*) AS total
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ${where}`,
      params,
    );
    return { rows, total: count?.total ?? 0 };
  },

  /** Satu pesanan yang sudah berakhir (selesai/dibatalkan); pesanan aktif tidak termasuk riwayat. */
  async findFinishedById(id: number): Promise<HistoryOrderRow | null> {
    const [rows] = await pool.query<HistoryOrderRow[]>(
      `${SELECT_HISTORY} WHERE o.id = ? AND o.status IN (?) LIMIT 1`,
      [id, FINISHED_STATUSES],
    );
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

  /** Jumlah pesanan selesai, dibatalkan, dan pendapatan (hanya pesanan selesai) pada periode. */
  async stats(month: string): Promise<HistoryStatsRow> {
    const range = monthRange(month);
    const [[row]] = await pool.query<StatsRow[]>(
      `SELECT SUM(o.status = 'selesai')    AS completed,
              SUM(o.status = 'dibatalkan') AS cancelled,
              SUM(CASE WHEN o.status = 'selesai' THEN o.total ELSE 0 END) AS revenue
       FROM orders o
       WHERE o.status IN (?) ${range ? 'AND o.created_at >= ? AND o.created_at < ?' : ''}`,
      range ? [FINISHED_STATUSES, range.from, range.to] : [FINISHED_STATUSES],
    );
    return {
      completed: num(row?.completed),
      cancelled: num(row?.cancelled),
      revenue: num(row?.revenue),
    };
  },

  /** Menu paling banyak terjual (jumlah cup/porsi) dari pesanan selesai pada periode. */
  async topMenu(month: string): Promise<TopMenu | null> {
    const range = monthRange(month);
    const [[row]] = await pool.query<TopMenuRow[]>(
      `SELECT oi.item_name AS name, SUM(oi.qty) AS qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'selesai' ${range ? 'AND o.created_at >= ? AND o.created_at < ?' : ''}
       GROUP BY oi.item_name
       ORDER BY qty DESC, oi.item_name ASC
       LIMIT 1`,
      range ? [range.from, range.to] : [],
    );
    return row ? { name: row.name, qty: num(row.qty) } : null;
  },

  /**
   * Pendapatan per bulan untuk satu tahun, plus Desember tahun sebelumnya
   * (pembanding tren untuk Januari). Kunci hasil: 'YYYY-MM'. Bulan tanpa pesanan selesai tidak ada di hasil.
   */
  async revenueByMonth(year: number): Promise<Record<string, number>> {
    const [rows] = await pool.query<MonthRevenueRow[]>(
      `SELECT DATE_FORMAT(o.created_at, '%Y-%m') AS ym, SUM(o.total) AS revenue
       FROM orders o
       WHERE o.status = 'selesai' AND o.created_at >= ? AND o.created_at < ?
       GROUP BY ym`,
      [`${year - 1}-12-01`, `${year + 1}-01-01`],
    );
    return Object.fromEntries(rows.map((r) => [r.ym, num(r.revenue)]));
  },

  /** Pendapatan per tahun untuk seluruh data. Kunci hasil: tahun. */
  async revenueByYear(): Promise<Record<number, number>> {
    const [rows] = await pool.query<YearRevenueRow[]>(
      `SELECT YEAR(o.created_at) AS y, SUM(o.total) AS revenue
       FROM orders o
       WHERE o.status = 'selesai'
       GROUP BY y
       ORDER BY y`,
    );
    return Object.fromEntries(rows.map((r) => [r.y, num(r.revenue)]));
  },
};
