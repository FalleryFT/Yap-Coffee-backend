import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

const num = (value: string | number | null | undefined): number => Number(value ?? 0);

// Senin pekan ini menurut tanggal server database (WEEKDAY: Senin = 0, Minggu = 6).
const WEEK_START = '(CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY)';

interface CalendarRow extends RowDataPacket {
  today: string; // 'YYYY-MM-DD' (pool memakai dateStrings: true)
  week_start: string;
}

interface TodayStatsRow extends RowDataPacket {
  total_orders: string | number | null;
  completed: string | number | null;
  on_time: string | number | null;
  revenue: string | number | null;
  paid_orders: string | number | null;
}

interface DailyRevenueRow extends RowDataPacket {
  d: string;
  revenue: string | number;
}

interface TopMenuRow extends RowDataPacket {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  category: string;
  sold: string | number;
}

interface TotalRow extends RowDataPacket {
  total: string | number | null;
}

interface NewOrderRow extends RowDataPacket {
  schedule_id: number;
  pickup_start: string;
  customer_name: string;
}

export interface TodayStats {
  totalOrders: number;
  completed: number;
  /** Pesanan selesai yang statusnya berubah sebelum jam tutup kloter-nya. */
  onTime: number;
  /** Pendapatan dari pesanan yang pembayarannya lunas. */
  revenue: number;
  paidOrders: number;
}

export interface TopMenuRecord {
  id: number;
  name: string;
  description: string;
  image: string | null;
  category: string;
  sold: number;
}

export interface NewOrderBatch {
  /** Jam mulai pickup kloter terdekat yang punya pesanan baru ('HH:mm:ss'). */
  pickupStart: string;
  /** Nama pelanggan pada kloter itu, urut dari yang masuk lebih dulu. */
  customers: string[];
}

export const dashboardRepository = {
  /** Tanggal hari ini dan Senin pekan ini, diambil dari database agar zona waktunya sama dengan query lain. */
  async calendar(): Promise<{ today: string; weekStart: string }> {
    const [[row]] = await pool.query<CalendarRow[]>(
      `SELECT CURDATE() AS today, ${WEEK_START} AS week_start`,
    );
    return { today: row?.today ?? '', weekStart: row?.week_start ?? '' };
  },

  /**
   * Angka ringkasan untuk hari ini. Pesanan dibatalkan tidak dihitung, sama dengan
   * orderRepository.countCreatedDaysAgo, supaya angkanya cocok dengan halaman Orders.
   */
  async todayStats(): Promise<TodayStats> {
    const [[row]] = await pool.query<TodayStatsRow[]>(
      `SELECT COUNT(*) AS total_orders,
              SUM(o.status = 'selesai') AS completed,
              SUM(o.status = 'selesai' AND o.updated_at <= TIMESTAMP(s.date, s.pickup_end)) AS on_time,
              SUM(CASE WHEN p.status = 'lunas' THEN o.total ELSE 0 END) AS revenue,
              SUM(p.status = 'lunas') AS paid_orders
       FROM orders o
       JOIN pickup_schedules s ON s.id = o.schedule_id
       LEFT JOIN payments p    ON p.order_id = o.id
       WHERE o.created_at >= CURDATE() AND o.created_at < CURDATE() + INTERVAL 1 DAY
         AND o.status <> 'dibatalkan'`,
    );
    return {
      totalOrders: num(row?.total_orders),
      completed: num(row?.completed),
      onTime: num(row?.on_time),
      revenue: num(row?.revenue),
      paidOrders: num(row?.paid_orders),
    };
  },

  /**
   * Pendapatan harian pekan ini dan pekan lalu (14 hari sejak Senin pekan lalu) dalam satu query.
   * Kunci hasil: 'YYYY-MM-DD'. Hari tanpa pembayaran lunas tidak ada di hasil.
   */
  async dailyRevenue(): Promise<Record<string, number>> {
    const [rows] = await pool.query<DailyRevenueRow[]>(
      `SELECT DATE(o.created_at) AS d, SUM(o.total) AS revenue
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE p.status = 'lunas' AND o.status <> 'dibatalkan'
         AND o.created_at >= ${WEEK_START} - INTERVAL 7 DAY
         AND o.created_at <  ${WEEK_START} + INTERVAL 7 DAY
       GROUP BY d`,
    );
    return Object.fromEntries(rows.map((r) => [r.d, num(r.revenue)]));
  },

  /** Menu paling banyak dipesan pekan ini (jumlah cup/porsi), di luar pesanan dibatalkan. */
  async topMenu(limit: number): Promise<TopMenuRecord[]> {
    const [rows] = await pool.query<TopMenuRow[]>(
      `SELECT mi.id, mi.name, mi.description, mi.image, mc.name AS category, SUM(oi.qty) AS sold
       FROM order_items oi
       JOIN orders o           ON o.id = oi.order_id
       JOIN menu_items mi      ON mi.id = oi.menu_item_id
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE o.status <> 'dibatalkan'
         AND o.created_at >= ${WEEK_START} AND o.created_at < ${WEEK_START} + INTERVAL 7 DAY
       GROUP BY mi.id, mi.name, mi.description, mi.image, mc.name
       ORDER BY sold DESC, mi.name ASC
       LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? '',
      image: r.image,
      category: r.category,
      sold: num(r.sold),
    }));
  },

  /** Total seluruh cup/porsi terpesan pekan ini; pembagi untuk persentase kontribusi menu. */
  async totalItemsSold(): Promise<number> {
    const [[row]] = await pool.query<TotalRow[]>(
      `SELECT SUM(oi.qty) AS total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'dibatalkan'
         AND o.created_at >= ${WEEK_START} AND o.created_at < ${WEEK_START} + INTERVAL 7 DAY`,
    );
    return num(row?.total);
  },

  /**
   * Kloter terdekat yang punya pesanan berstatus "menunggu", beserta nama pelanggannya.
   * null bila tidak ada pesanan baru.
   */
  async nextNewOrderBatch(): Promise<NewOrderBatch | null> {
    const [rows] = await pool.query<NewOrderRow[]>(
      `SELECT s.id AS schedule_id, s.pickup_start, c.name AS customer_name
       FROM orders o
       JOIN customers c        ON c.id = o.customer_id
       JOIN pickup_schedules s ON s.id = o.schedule_id
       WHERE o.status = 'menunggu'
       ORDER BY s.date ASC, s.pickup_start ASC, o.created_at ASC, o.id ASC
       LIMIT 50`,
    );
    const first = rows[0];
    if (!first) return null;

    const sameBatch = rows.filter((r) => r.schedule_id === first.schedule_id);
    return {
      pickupStart: first.pickup_start,
      customers: [...new Set(sameBatch.map((r) => r.customer_name))],
    };
  },
};
