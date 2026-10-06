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
