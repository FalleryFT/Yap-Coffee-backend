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
