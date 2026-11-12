import type { PoolConnection } from 'mysql2/promise';

/**
 * Mengembalikan stok menu dari pesanan yang dibatalkan atau kedaluwarsa.
 * Jumlah dijumlahkan per menu lebih dulu (GROUP BY): UPDATE ... JOIN langsung ke order_items
 * hanya akan menambah satu baris per menu bila menu yang sama muncul di beberapa baris item.
 * Harus dipanggil di dalam transaksi yang sama dengan perubahan status pesanan.
 */
export async function releaseStock(conn: PoolConnection, orderIds: number[]): Promise<void> {
  if (orderIds.length === 0) return;
  await conn.query(
    `UPDATE menu_items mi
     JOIN (SELECT menu_item_id, SUM(qty) AS qty
           FROM order_items WHERE order_id IN (?) GROUP BY menu_item_id) t
       ON t.menu_item_id = mi.id
     SET mi.stock = mi.stock + t.qty`,
    [orderIds],
  );
}
