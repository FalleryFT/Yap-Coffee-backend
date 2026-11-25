import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/db.js';
import type { OrderStatusDb, PaymentStatusDb } from '../types/db.js';
import type { MidtransNotification } from '../services/midtransService.js';
import { releaseStock } from './orderStock.js';

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

export interface PayableRow extends RowDataPacket {
  id: number;
  code: string;
  status: OrderStatusDb;
  total: number;
  pay_status: PaymentStatusDb;
  snap_token: string | null;
  redirect_url: string | null;
  seconds_left: number;
}

/** Nama kanal yang ditampilkan di aplikasi dan admin (kolom payments.channel, maks 32 karakter). */
function channelLabel(n: MidtransNotification): string | null {
  const bank = n.va_numbers?.[0]?.bank;
  switch (n.payment_type) {
    case 'qris': return 'QRIS';
    case 'gopay': return 'GoPay';
    case 'shopeepay': return 'ShopeePay';
    case 'credit_card': return 'Kartu Kredit';
    case 'cstore': return 'Minimarket';
    case 'echannel': return 'VA Mandiri';
    case 'bank_transfer':
      if (n.permata_va_number) return 'VA PERMATA';
      return bank ? `VA ${bank.toUpperCase()}` : 'Virtual Account';
    default:
      return n.payment_type ? n.payment_type.slice(0, 32) : null;
  }
}

export type NotificationOutcome =
  | 'paid' | 'cancelled' | 'updated' | 'ignored'
  | 'late_payment' | 'amount_mismatch' | 'not_found';

export const paymentRepository = {
  async findPayable(customerId: number, code: string): Promise<PayableRow | null> {
    const [rows] = await pool.query<PayableRow[]>(
      `SELECT o.id, o.code, o.status, o.total,
              p.status AS pay_status, p.snap_token, p.redirect_url,
              TIMESTAMPDIFF(SECOND, NOW(), p.expires_at) AS seconds_left
       FROM orders o JOIN payments p ON p.order_id = o.id
       WHERE o.customer_id = ? AND o.code = ? LIMIT 1`,
      [customerId, code],
    );
    return rows[0] ?? null;
  },

  async saveSnap(orderId: number, token: string, redirectUrl: string): Promise<void> {
    await pool.query(
      `UPDATE payments SET snap_token = ?, redirect_url = ?
       WHERE order_id = ? AND snap_token IS NULL`,
      [token, redirectUrl, orderId],
    );
  },

  /** Menerapkan notifikasi Midtrans. Idempotent: aman bila Midtrans mengirim ulang. */
  async applyNotification(n: MidtransNotification): Promise<NotificationOutcome> {
    return inTransaction(async (conn) => {
      const [rows] = await conn.query<
        (RowDataPacket & { id: number; status: OrderStatusDb; total: number; pay_status: PaymentStatusDb })[]
      >(
        `SELECT o.id, o.status, o.total, p.status AS pay_status
         FROM orders o JOIN payments p ON p.order_id = o.id
         WHERE o.code = ? FOR UPDATE`,
        [n.order_id],
      );
      const row = rows[0];
      if (!row) return 'not_found';
      if (Number(n.gross_amount) !== Number(row.total)) return 'amount_mismatch';

      const open = row.status === 'menunggu' && row.pay_status === 'belum_dibayar';
      const channel = channelLabel(n);
      const ts = n.transaction_status;

      const paid = ts === 'settlement' || (ts === 'capture' && n.fraud_status === 'accept');
      if (paid) {
        if (row.pay_status === 'lunas') return 'ignored';
        // Uang sudah masuk tetapi pesanan sudah dibatalkan: perlu refund manual lewat dashboard Midtrans.
        if (!open) return 'late_payment';
        await conn.query(
          `UPDATE payments
           SET status = 'lunas', paid_at = NOW(),
               channel = COALESCE(?, channel), payment_type = ?, midtrans_transaction_id = ?
           WHERE order_id = ?`,
          [channel, n.payment_type ?? null, n.transaction_id ?? null, row.id],
        );
        return 'paid';
      }

      // Hanya expire dan cancel yang membatalkan pesanan. "deny" (mis. kartu ditolak)
      // dibiarkan: pelanggan masih boleh mencoba lagi selama sisa waktu 10 menit.
      if (ts === 'expire' || ts === 'cancel') {
        if (!open) return 'ignored';
        await conn.query(`UPDATE orders SET status = 'dibatalkan' WHERE id = ?`, [row.id]);
        await conn.query(`UPDATE payments SET status = 'kedaluwarsa' WHERE order_id = ?`, [row.id]);
        await releaseStock(conn, [row.id]);
        return 'cancelled';
      }

      if (ts === 'pending' && open) {
        await conn.query(
          `UPDATE payments
           SET channel = COALESCE(?, channel), payment_type = ?, midtrans_transaction_id = ?
           WHERE order_id = ?`,
          [channel, n.payment_type ?? null, n.transaction_id ?? null, row.id],
        );
        return 'updated';
      }
      return 'ignored';
    });
  },
};
