import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/db.js';
import { paymentRepository } from '../repositories/paymentRepository.js';
import { fetchTransactionStatus } from './midtransService.js';

interface OverdueRow extends RowDataPacket {
  id: number;
  code: string;
}

/**
 * Mencocokkan satu pesanan dengan Midtrans: bila Midtrans sudah mencatat lunas (atau expire),
 * database diperbarui lewat applyNotification, jalur yang sama dengan webhook.
 * Cadangan untuk webhook yang tidak sampai (misalnya tunnel mati).
 *
 * Mengembalikan hasil applyNotification, atau null bila Midtrans belum punya transaksinya.
 * Melempar galat bila Midtrans tidak bisa dihubungi.
 */
export async function syncOrderPayment(code: string) {
  const status = await fetchTransactionStatus(code);
  if (!status) return null;
  const outcome = await paymentRepository.applyNotification(status);
  if (outcome === 'late_payment' || outcome === 'amount_mismatch') {
    console.warn(`[midtrans] ${code}: ${outcome}. Periksa manual di dashboard Midtrans.`);
  }
  return outcome;
}

/**
 * Pesanan yang melewati batas bayar tetapi sudah punya sesi Snap: tanya Midtrans dulu sebelum
 * dibatalkan, supaya pesanan yang sebenarnya sudah dibayar tidak ikut terbatalkan.
 *
 * Mengembalikan id pesanan yang statusnya belum bisa dipastikan (Midtrans tidak terjangkau).
 * Pesanan itu jangan dibatalkan dulu; dicoba lagi pada pemanggilan berikutnya.
 */
export async function reconcileOverdue(): Promise<number[]> {
  const [rows] = await pool.query<OverdueRow[]>(
    `SELECT o.id, o.code FROM orders o
     JOIN payments p ON p.order_id = o.id
     WHERE o.status = 'menunggu' AND p.status = 'belum_dibayar'
       AND p.expires_at < NOW() AND p.snap_token IS NOT NULL
     ORDER BY o.id LIMIT 5`,
  );
  if (rows.length === 0) return [];

  const unsure: number[] = [];
  await Promise.all(
    rows.map(async (r) => {
      try {
        await syncOrderPayment(r.code);
      } catch (err) {
        console.error('[midtrans] gagal mencocokkan', r.code, (err as Error).message);
        unsure.push(r.id);
      }
    }),
  );
  return unsure;
}