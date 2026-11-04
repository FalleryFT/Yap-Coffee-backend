import type { OrderRow } from './db.js';

/** Pesanan untuk halaman Riwayat: OrderRow ditambah id pelanggan dan nomor referensi pembayaran. */
export interface HistoryOrderRow extends OrderRow {
  customer_id: number;
  pay_rrn: string | null;
}
