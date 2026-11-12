import { randomInt } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import type { OrderStatusDb, PaymentStatusDb } from '../types/db.js';
import { AppError } from '../utils/AppError.js';
import { ACTIVE_STATUSES, FINISHED_STATUSES } from '../utils/orderStatus.js';
import type { CreateOrderInput } from '../validators/customerValidators.js';
import type { SizeOptionRow, SugarOptionRow } from './optionsRepository.js';
import { releaseStock } from './orderStock.js';

/** Satu pesanan milik pelanggan beserta jadwal dan pembayarannya. */
export interface CustomerOrderRow extends RowDataPacket {
  id: number;
  code: string;
  status: OrderStatusDb;
  note: string | null;
  subtotal: number;
  tax: number;
  service_fee: number;
  packaging_fee: number;
  total: number;
  created_at: string;
  schedule_name: string;
  schedule_date: string;
  location: string;
  location_detail: string | null;
  maps_url: string | null;
  latitude: string | null;
  longitude: string | null;
  pickup_start: string;
  pickup_end: string;
  pay_channel: string | null;
  pay_status: PaymentStatusDb | null;
  pay_rrn: string | null;
  pay_paid_at: string | null;
  /** Sisa waktu bayar menurut jam database; negatif bila sudah lewat. */
  pay_seconds_left: number | null;
}

export interface CustomerOrderItemRow extends RowDataPacket {
  order_id: number;
  item_name: string;
  unit_price: number;
  qty: number;
  size: string | null;
  sugar_level: string | null;
  notes: string | null;
  image: string | null;
}

const SELECT_ORDERS = `
  SELECT o.id, o.code, o.status, o.note,
         o.subtotal, o.tax, o.service_fee, o.packaging_fee, o.total, o.created_at,
         s.name AS schedule_name, s.date AS schedule_date,
         s.location, s.location_detail, s.maps_url, s.latitude, s.longitude, s.pickup_start, s.pickup_end,
         p.channel AS pay_channel, p.status AS pay_status,
         p.rrn AS pay_rrn, p.paid_at AS pay_paid_at,
         TIMESTAMPDIFF(SECOND, NOW(), p.expires_at) AS pay_seconds_left
  FROM orders o
  JOIN pickup_schedules s ON s.id = o.schedule_id
  LEFT JOIN payments p    ON p.order_id = o.id`;

interface MenuLockRow extends RowDataPacket {
  id: number;
  category_id: number;
  name: string;
  price: number;
  stock: number;
  is_available: number;
}

interface AddonRow extends RowDataPacket {
  id: number;
  menu_item_id: number;
  label: string;
  extra_price: number;
}

interface CategoryRow extends RowDataPacket {
  id: number;
  has_options: number;
}

interface IdRow extends RowDataPacket {
  id: number;
}

/** Kode pesanan, contoh WK-4821. Empat digit dulu; bila terus bentrok, lima digit. */
function generateCode(attempt: number): string {
  return attempt < 5 ? `WK-${randomInt(1000, 10000)}` : `WK-${randomInt(10000, 100000)}`;
}

/** RRN tiruan 12 digit untuk pembayaran simulasi. */
function generateRrn(): string {
  return Array.from({ length: 12 }, () => randomInt(0, 10)).join('');
}

async function inTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export const customerOrderRepository = {
  /**
   * Membuat pesanan lengkap dalam satu transaksi: kunci baris menu, cek stok, hitung harga di
   * server, kurangi stok, lalu simpan pesanan, item, dan pembayaran (QRIS, belum dibayar).
   * Mengembalikan kode pesanan.
   */
  async create(customerId: number, input: CreateOrderInput): Promise<string> {
    return inTransaction(async (conn) => {
      // 1) Jadwal harus aktif dan belum lewat batas pemesanan (jam database).
      const [schedules] = await conn.query<IdRow[]>(
        `SELECT id FROM pickup_schedules
         WHERE id = ? AND status = 'aktif' AND TIMESTAMP(date, cut_off_time) > NOW()`,
        [input.scheduleId],
      );
      if (schedules.length === 0) {
        throw AppError.validation({
          scheduleId: ['Jadwal ini sudah ditutup. Pilih jadwal pengambilan lain.'],
        });
      }

      // 2) Kunci baris menu (urut id agar tidak saling menunggu) dan baca stok terbaru.
      const menuIds = [...new Set(input.items.map((i) => i.menuItemId))].sort((a, b) => a - b);
      const [menuRows] = await conn.query<MenuLockRow[]>(
        `SELECT id, category_id, name, price, stock, is_available
         FROM menu_items WHERE id IN (?) ORDER BY id FOR UPDATE`,
        [menuIds],
      );
      const menuById = new Map(menuRows.map((m) => [m.id, m]));

      const [categoryRows] = await conn.query<CategoryRow[]>('SELECT id, has_options FROM menu_categories');
      const categoryHasOptions = new Map(categoryRows.map((c) => [c.id, c.has_options === 1]));

      // Ukuran dan tingkat manis yang berlaku saat ini (diatur admin).
      const [sizeRows] = await conn.query<SizeOptionRow[]>(
        'SELECT id, label, detail, extra_price, is_default FROM menu_sizes ORDER BY sort_order, id',
      );
      const [sugarRows] = await conn.query<SugarOptionRow[]>(
        'SELECT id, label, is_default FROM sugar_levels ORDER BY sort_order, id',
      );
      const sizeByLabel = new Map(sizeRows.map((s) => [s.label.toLowerCase(), s]));
      const sugarByLabel = new Map(sugarRows.map((s) => [s.label.toLowerCase(), s]));
      const defaultSize = sizeRows.find((s) => s.is_default === 1) ?? sizeRows[0];
      const defaultSugar = sugarRows.find((s) => s.is_default === 1) ?? sugarRows[0];

      const addonIds = [...new Set(input.items.flatMap((i) => i.addonIds))];
      const [addonRows] = addonIds.length
        ? await conn.query<AddonRow[]>(
            'SELECT id, menu_item_id, label, extra_price FROM menu_addons WHERE id IN (?)',
            [addonIds],
          )
        : [[] as AddonRow[]];
      const addonById = new Map(addonRows.map((a) => [a.id, a]));

      // 3) Validasi ketersediaan dan stok (dijumlahkan per menu, karena menu yang sama
      //    bisa muncul di beberapa baris dengan ukuran berbeda).
      const requested = new Map<number, number>();
      for (const line of input.items) {
        requested.set(line.menuItemId, (requested.get(line.menuItemId) ?? 0) + line.qty);
      }
      const problems: string[] = [];
      for (const [menuId, qty] of requested) {
        const menu = menuById.get(menuId);
        if (!menu || menu.is_available !== 1) {
          problems.push(`${menu?.name ?? `Menu #${menuId}`} tidak tersedia.`);
        } else if (menu.stock < qty) {
          problems.push(
            menu.stock === 0
              ? `${menu.name} sudah habis.`
              : `Stok ${menu.name} tersisa ${menu.stock}, kamu memesan ${qty}.`,
          );
        }
      }
      if (problems.length > 0) throw AppError.validation({ items: problems });

      // 4) Hitung harga baris dan total.
      const lines = input.items.map((line) => {
        const menu = menuById.get(line.menuItemId)!;
        const plain = categoryHasOptions.get(menu.category_id) === false;

        const addons = line.addonIds.map((id) => {
          const addon = addonById.get(id);
          if (!addon || addon.menu_item_id !== menu.id) {
            throw AppError.validation({ items: [`Tambahan untuk ${menu.name} tidak valid.`] });
          }
          return addon;
        });

        let size: string | null = null;
        let sugar: string | null = null;
        let sizeExtra = 0;
        if (!plain) {
          const chosenSize = line.size ? sizeByLabel.get(line.size.toLowerCase()) : defaultSize;
          if (!chosenSize) {
            throw AppError.validation({ items: [`Ukuran untuk ${menu.name} tidak tersedia.`] });
          }
          const chosenSugar = line.sugarLevel
            ? sugarByLabel.get(line.sugarLevel.toLowerCase())
            : defaultSugar;
          if (!chosenSugar) {
            throw AppError.validation({ items: [`Tingkat manis untuk ${menu.name} tidak tersedia.`] });
          }
          size = chosenSize.label;
          sugar = chosenSugar.label;
          sizeExtra = chosenSize.extra_price;
        }
        const unitPrice =
          menu.price + sizeExtra + addons.reduce((sum, a) => sum + a.extra_price, 0);
        const notes = [...addons.map((a) => a.label), line.notes]
          .filter((n): n is string => Boolean(n))
          .join(', ')
          .slice(0, 255);

        return { menu, qty: line.qty, unitPrice, size, sugar, notes: notes || null };
      });

      const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
      const tax = Math.round(subtotal * env.order.taxRate);
      const serviceFee = env.order.serviceFee;
      const total = subtotal + tax + serviceFee;

      // 5) Kurangi stok. Syarat `stock >= ?` menjaga dari selisih sekecil apa pun.
      for (const [menuId, qty] of requested) {
        const [result] = await conn.query<ResultSetHeader>(
          'UPDATE menu_items SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [qty, menuId, qty],
        );
        if (result.affectedRows === 0) {
          throw AppError.validation({ items: ['Stok baru saja berubah. Muat ulang menu lalu coba lagi.'] });
        }
      }

      // 6) Simpan pesanan; kode yang bentrok (UNIQUE) diulang dengan kode lain.
      let orderId = 0;
      let code = '';
      for (let attempt = 0; ; attempt++) {
        code = generateCode(attempt);
        try {
          const [result] = await conn.query<ResultSetHeader>(
            `INSERT INTO orders
               (code, customer_id, schedule_id, status, note, subtotal, tax, service_fee, packaging_fee, total)
             VALUES (?, ?, ?, 'menunggu', ?, ?, ?, ?, 0, ?)`,
            [code, customerId, input.scheduleId, input.note || null, subtotal, tax, serviceFee, total],
          );
          orderId = result.insertId;
          break;
        } catch (err) {
          if ((err as { code?: string }).code === 'ER_DUP_ENTRY' && attempt < 10) continue;
          throw err;
        }
      }

      await conn.query(
        `INSERT INTO order_items
           (order_id, menu_item_id, item_name, unit_price, qty, size, sugar_level, notes)
         VALUES ?`,
        [lines.map((l) => [orderId, l.menu.id, l.menu.name, l.unitPrice, l.qty, l.size, l.sugar, l.notes])],
      );

      await conn.query(
        `INSERT INTO payments (order_id, channel, status, expires_at)
         VALUES (?, 'QRIS', 'belum_dibayar', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [orderId, env.order.paymentWindowMinutes],
      );

      return code;
    });
  },

  async listByCustomer(customerId: number, tab: 'active' | 'history'): Promise<CustomerOrderRow[]> {
    const statuses: OrderStatusDb[] = tab === 'active' ? ACTIVE_STATUSES : FINISHED_STATUSES;
    const [rows] = await pool.query<CustomerOrderRow[]>(
      `${SELECT_ORDERS} WHERE o.customer_id = ? AND o.status IN (?)
       ORDER BY o.created_at DESC, o.id DESC LIMIT 100`,
      [customerId, statuses],
    );
    return rows;
  },

  /**
   * Pesanan pelanggan yang sudah lunas dan ditandai siap ambil oleh barista (untuk kartu di Home).
   * Bila ada beberapa, yang jadwal pengambilannya paling awal didahulukan. null bila tidak ada.
   */
  async findReadyForPickup(customerId: number): Promise<CustomerOrderRow | null> {
    const [rows] = await pool.query<CustomerOrderRow[]>(
      `${SELECT_ORDERS}
       WHERE o.customer_id = ? AND o.status = 'siap_ambil' AND p.status = 'lunas'
       ORDER BY s.date ASC, s.pickup_start ASC, o.id ASC
       LIMIT 1`,
      [customerId],
    );
    return rows[0] ?? null;
  },

  /** Satu pesanan milik pelanggan ini; pesanan orang lain dianggap tidak ada. */
  async findByCode(customerId: number, code: string): Promise<CustomerOrderRow | null> {
    const [rows] = await pool.query<CustomerOrderRow[]>(
      `${SELECT_ORDERS} WHERE o.customer_id = ? AND o.code = ? LIMIT 1`,
      [customerId, code],
    );
    return rows[0] ?? null;
  },

  async listItems(orderIds: number[]): Promise<CustomerOrderItemRow[]> {
    if (orderIds.length === 0) return [];
    const [rows] = await pool.query<CustomerOrderItemRow[]>(
      `SELECT oi.order_id, oi.item_name, oi.unit_price, oi.qty, oi.size, oi.sugar_level, oi.notes,
              mi.image
       FROM order_items oi
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE oi.order_id IN (?) ORDER BY oi.id`,
      [orderIds],
    );
    return rows;
  },

  /**
   * Membatalkan pesanan yang waktu bayarnya habis dan mengembalikan stoknya.
   * Aman dipanggil berulang atau bersamaan: baris dikunci dan status dicek ulang.
   * Mengembalikan jumlah pesanan yang dibatalkan.
   */
  async expireOverdue(): Promise<number> {
    return inTransaction(async (conn) => {
      const [rows] = await conn.query<IdRow[]>(
        `SELECT o.id FROM orders o
         JOIN payments p ON p.order_id = o.id
         WHERE o.status = 'menunggu' AND p.status = 'belum_dibayar' AND p.expires_at < NOW()
         ORDER BY o.id FOR UPDATE`,
      );
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return 0;

      await conn.query(`UPDATE orders SET status = 'dibatalkan' WHERE id IN (?)`, [ids]);
      await conn.query(`UPDATE payments SET status = 'kedaluwarsa' WHERE order_id IN (?)`, [ids]);
      await releaseStock(conn, ids);
      return ids.length;
    });
  },

  /**
   * Pembayaran simulasi: menandai pesanan lunas. Di produksi, pemanggil sebaiknya webhook
   * penyedia pembayaran, bukan aplikasi pelanggan.
   */
  async markPaid(customerId: number, code: string): Promise<'paid' | 'already_paid' | 'expired' | 'not_found'> {
    return inTransaction(async (conn) => {
      const [rows] = await conn.query<
        (RowDataPacket & { id: number; status: OrderStatusDb; pay_status: PaymentStatusDb | null; seconds_left: number | null })[]
      >(
        `SELECT o.id, o.status, p.status AS pay_status,
                TIMESTAMPDIFF(SECOND, NOW(), p.expires_at) AS seconds_left
         FROM orders o JOIN payments p ON p.order_id = o.id
         WHERE o.customer_id = ? AND o.code = ? FOR UPDATE`,
        [customerId, code],
      );
      const row = rows[0];
      if (!row) return 'not_found';
      if (row.pay_status === 'lunas') return 'already_paid';
      if (row.status === 'dibatalkan' || row.pay_status === 'kedaluwarsa') return 'expired';
      if (row.seconds_left !== null && row.seconds_left <= 0) return 'expired';

      await conn.query(
        `UPDATE payments SET status = 'lunas', paid_at = NOW(), rrn = ? WHERE order_id = ?`,
        [generateRrn(), row.id],
      );
      return 'paid';
    });
  },

  /** Pelanggan hanya boleh membatalkan pesanan yang belum dibayar dan belum diproses. */
  async cancelUnpaid(customerId: number, code: string): Promise<'cancelled' | 'not_allowed' | 'not_found'> {
    return inTransaction(async (conn) => {
      const [rows] = await conn.query<
        (RowDataPacket & { id: number; status: OrderStatusDb; pay_status: PaymentStatusDb | null })[]
      >(
        `SELECT o.id, o.status, p.status AS pay_status
         FROM orders o LEFT JOIN payments p ON p.order_id = o.id
         WHERE o.customer_id = ? AND o.code = ? FOR UPDATE`,
        [customerId, code],
      );
      const row = rows[0];
      if (!row) return 'not_found';
      if (row.status !== 'menunggu' || row.pay_status !== 'belum_dibayar') return 'not_allowed';

      await conn.query(`UPDATE orders SET status = 'dibatalkan' WHERE id = ?`, [row.id]);
      await conn.query(`UPDATE payments SET status = 'kedaluwarsa' WHERE order_id = ?`, [row.id]);
      await releaseStock(conn, [row.id]);
      return 'cancelled';
    });
  },
};
