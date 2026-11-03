import type { OrderStatusDb } from '../types/db.js';

/**
 * Status di database memakai snake_case, sedangkan frontend (src/types/orders.ts → OrderStatus)
 * memakai label tampilan. API berbicara dengan label frontend; pemetaannya hanya ada di sini.
 */
export const STATUS_LABEL = {
  menunggu: 'Baru Masuk',
  meramu: 'Diproses',
  siap_ambil: 'Siap Ambil',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
} as const satisfies Record<OrderStatusDb, string>;

export type OrderStatusLabel = (typeof STATUS_LABEL)[OrderStatusDb];

export const STATUS_FROM_LABEL: Record<OrderStatusLabel, OrderStatusDb> = {
  'Baru Masuk': 'menunggu',
  Diproses: 'meramu',
  'Siap Ambil': 'siap_ambil',
  Selesai: 'selesai',
  Dibatalkan: 'dibatalkan',
};

/** Pesanan yang masih berjalan: yang tampil di halaman Orders secara bawaan. */
export const ACTIVE_STATUSES: OrderStatusDb[] = ['menunggu', 'meramu', 'siap_ambil'];

/** Pesanan yang sudah berakhir. */
export const FINISHED_STATUSES: OrderStatusDb[] = ['selesai', 'dibatalkan'];

export const ALL_STATUSES: OrderStatusDb[] = [...ACTIVE_STATUSES, ...FINISHED_STATUSES];

/**
 * Pesanan selesai/dibatalkan hanya ditampilkan di halaman Orders selama ini (hari sejak status
 * terakhir berubah). Setelah itu disembunyikan dari daftar, datanya tetap ada di database.
 */
export const FINISHED_VISIBLE_DAYS = 14;

/** Status yang boleh dipilih lewat dropdown di baris tabel (tanpa "Dibatalkan", itu lewat aksi batal). */
export const FLOW_LABELS = ['Baru Masuk', 'Diproses', 'Siap Ambil', 'Selesai'] as const;
export const ALL_LABELS = [...FLOW_LABELS, 'Dibatalkan'] as const;
