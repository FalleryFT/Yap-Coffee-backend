import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import type { CustomerRow } from '../types/db.js';

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
}

export const customerRepository = {
  async findByEmail(email: string): Promise<CustomerRow | null> {
    const [rows] = await pool.query<CustomerRow[]>(
      'SELECT id, name, email, phone, password_hash FROM customers WHERE email = ? LIMIT 1',
      [email],
    );
    return rows[0] ?? null;
  },

  async findById(id: number): Promise<CustomerRow | null> {
    const [rows] = await pool.query<CustomerRow[]>(
      'SELECT id, name, email, phone, password_hash FROM customers WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: CreateCustomerInput): Promise<CustomerRow> {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO customers (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [input.name, input.email, input.phone, input.passwordHash],
    );
    return {
      id: result.insertId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      password_hash: input.passwordHash,
    } as CustomerRow;
  },

  async updatePassword(email: string, passwordHash: string): Promise<void> {
    await pool.query('UPDATE customers SET password_hash = ? WHERE email = ?', [
      passwordHash,
      email,
    ]);
  },
};
