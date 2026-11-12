import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';

export type NotificationType = 'order_ready' | 'new_menu';

export interface NotificationRow extends RowDataPacket {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  ref: string | null;
  read_at: string | null;
  created_at: string;
}

export const notificationRepository = {
  async listForCustomer(customerId: number, limit: number): Promise<NotificationRow[]> {
    const [rows] = await pool.query<NotificationRow[]>(
      `SELECT id, type, title, body, ref, read_at, created_at
       FROM notifications WHERE customer_id = ? ORDER BY id DESC LIMIT ?`,
      [customerId, limit],
    );
    return rows;
  },

  async countUnread(customerId: number): Promise<number> {
    const [rows] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM notifications WHERE customer_id = ? AND read_at IS NULL',
      [customerId],
    );
    return Number(rows[0]?.total ?? 0);
  },

  async markRead(customerId: number, id: number): Promise<void> {
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND customer_id = ? AND read_at IS NULL',
      [id, customerId],
    );
  },

  async markAllRead(customerId: number): Promise<void> {
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE customer_id = ? AND read_at IS NULL',
      [customerId],
    );
  },

  /**
   * Pesanan menjadi "siap ambil": beri tahu pemiliknya. Hanya untuk pesanan yang sudah lunas dan
   * pelanggan yang notifikasinya aktif; satu pesanan paling banyak satu notifikasi.
   * Mengembalikan jumlah notifikasi yang dibuat (0 atau 1).
   */
  async createOrderReady(orderId: number): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO notifications (customer_id, type, title, body, ref)
       SELECT o.customer_id, 'order_ready', 'Pesanan siap diambil',
              CONCAT('Pesanan ', o.code, ' sudah siap. Ambil di ', s.location, ' (', TIME_FORMAT(s.pickup_start, '%H.%i'), ' - ', TIME_FORMAT(s.pickup_end, '%H.%i'), ').'),
              o.code
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.notifications_enabled = 1
       JOIN pickup_schedules s ON s.id = o.schedule_id
       JOIN payments p ON p.order_id = o.id AND p.status = 'lunas'
       WHERE o.id = ?
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.customer_id = o.customer_id AND n.type = 'order_ready' AND n.ref = o.code
         )`,
      [orderId],
    );
    return result.affectedRows;
  },

  /** Menu baru dibuka: beri tahu semua pelanggan yang notifikasinya aktif. */
  async createNewMenu(menuId: number, menuName: string): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO notifications (customer_id, type, title, body, ref)
       SELECT c.id, 'new_menu', ?, ?, ?
       FROM customers c WHERE c.notifications_enabled = 1`,
      [`Menu baru: ${menuName}`.slice(0, 191), `${menuName} sekarang tersedia. Yuk pre-order sebelum kehabisan!`.slice(0, 500), String(menuId)],
    );
    return result.affectedRows;
  },
};
