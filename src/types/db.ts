import type { RowDataPacket } from 'mysql2';

export interface AdminRow extends RowDataPacket {
  id: number;
  name: string;
  username: string;
  password_hash: string;
  role: string;
}

export interface CustomerRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
}

export interface OtpRow extends RowDataPacket {
  id: number;
  email: string;
  code: string;
  reset_token: string | null;
  expires_at: string;
  consumed_at: string | null;
  reset_token_expires_at: string | null;
  created_at: string;
}

export interface MenuCategoryRow extends RowDataPacket {
  id: number;
  name: string;
}

export interface MenuItemRow extends RowDataPacket {
  id: number;
  category_id: number;
  category: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image: string | null;
}

export interface MenuAddonRow extends RowDataPacket {
  id: number;
  menu_item_id: number;
  label: string;
  extra_price: number;
}

// ---- Pesanan -----------------------------------------------------------

export type OrderStatusDb = 'menunggu' | 'meramu' | 'siap_ambil' | 'selesai' | 'dibatalkan';
export type PaymentStatusDb = 'belum_dibayar' | 'lunas' | 'kedaluwarsa';

/** Satu pesanan beserta pelanggan, jadwal pengambilan, dan pembayarannya (hasil JOIN). */
export interface OrderRow extends RowDataPacket {
  id: number;
  code: string;
  status: OrderStatusDb;
  note: string | null;
  subtotal: number;
  tax: number;
  service_fee: number;
  packaging_fee: number;
  total: number;
  created_at: string; // 'YYYY-MM-DD HH:mm:ss' (pool memakai dateStrings: true)

  customer_name: string;
  customer_phone: string;

  schedule_name: string;
  schedule_date: string; // 'YYYY-MM-DD'
  location: string;
  location_detail: string | null;
  maps_url: string | null;
  pickup_start: string; // 'HH:mm:ss'
  pickup_end: string; // 'HH:mm:ss'

  // LEFT JOIN: pesanan lama/rusak bisa saja belum punya baris payments.
  pay_channel: string | null;
  pay_status: PaymentStatusDb | null;
}

export interface OrderItemRow extends RowDataPacket {
  id: number;
  order_id: number;
  item_name: string;
  unit_price: number;
  qty: number;
  size: string | null;
  sugar_level: string | null;
  notes: string | null;
}
