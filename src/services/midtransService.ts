import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

const SNAP_URL = env.midtrans.isProduction
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

// Core API (cek status transaksi) memakai host yang berbeda dari Snap.
const CORE_API_URL = env.midtrans.isProduction
  ? 'https://api.midtrans.com'
  : 'https://api.sandbox.midtrans.com';

export class MidtransError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MidtransError';
  }
}

export interface SnapItem {
  id: string;
  price: number;
  quantity: number;
  name: string;
}

export interface SnapParams {
  orderId: string;
  grossAmount: number;
  items: SnapItem[];
  /** Kapan jendela bayar dimulai (saat pesanan dibuat). */
  expiryStart: Date;
  /** Lama jendela bayar dalam menit (harus sama dengan batas bayar di database). */
  expiryMinutes: number;
}

export interface SnapResult {
  token: string;
  redirectUrl: string;
}

function authHeader(): string {
  if (!env.midtrans.serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diisi di .env.');
  return `Basic ${Buffer.from(`${env.midtrans.serverKey}:`).toString('base64')}`;
}

/** Format yang diminta Midtrans: "YYYY-MM-DD HH:mm:ss +0700" (WIB). */
function toWib(date: Date): string {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().slice(0, 19).replace('T', ' ')} +0700`;
}

/**
 * Alamat webhook khusus pengembangan. Skrip tunnel menulis alamat publik ke file .tunnel-url
 * (di folder tempat backend dijalankan). Dibaca ulang tiap transaksi, jadi backend tidak perlu
 * restart dan Notification URL di dashboard Midtrans tidak perlu diubah.
 * Tanpa file itu (misalnya di produksi), Midtrans memakai Notification URL di dashboard.
 */
function devNotificationUrl(): string | undefined {
  try {
    const url = readFileSync(path.resolve(process.cwd(), '.tunnel-url'), 'utf8').trim();
    return url.startsWith('https://') ? url : undefined;
  } catch {
    return undefined;
  }
}

export async function createSnapTransaction(p: SnapParams): Promise<SnapResult> {
  // Midtrans menolak transaksi bila jumlah item tidak sama dengan gross_amount.
  const sum = p.items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (sum !== p.grossAmount) {
    throw new Error(`Total item (${sum}) tidak sama dengan total pesanan (${p.grossAmount}).`);
  }

  const notifUrl = devNotificationUrl();
  if (notifUrl) console.log('[midtrans] notifikasi transaksi', p.orderId, 'diarahkan ke', notifUrl);

  const res = await fetch(SNAP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      // Alamat notifikasi per transaksi; mengabaikan Notification URL di dashboard.
      ...(notifUrl ? { 'X-Override-Notification': notifUrl } : {}),
    },
    body: JSON.stringify({
      transaction_details: { order_id: p.orderId, gross_amount: p.grossAmount },
      item_details: p.items,
      // Snap memakai objek "expiry" (custom_expiry hanya untuk Core API dan diabaikan Snap).
      // start_time = saat pesanan dibuat, sehingga batas Midtrans sama dengan batas di aplikasi
      // walaupun pelanggan baru menekan Bayar belakangan.
      expiry: {
        start_time: toWib(p.expiryStart),
        unit: 'minute',
        duration: p.expiryMinutes,
      },
      callbacks: { finish: env.midtrans.finishUrl },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };
  if (!res.ok || !body.token || !body.redirect_url) {
    throw new MidtransError(res.status, body.error_messages?.join('; ') || `HTTP ${res.status}`);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

/** Isi notifikasi (webhook) Midtrans yang kita pakai. */
export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id?: string;
  payment_type?: string;
  fraud_status?: string;
  va_numbers?: { bank: string; va_number: string }[];
  permata_va_number?: string;
  bill_key?: string;
}

/**
 * Menanyakan status transaksi langsung ke Midtrans (GET /v2/{order_id}/status).
 * Bentuk hasilnya sama dengan notifikasi webhook, sehingga bisa langsung dipakai
 * paymentRepository.applyNotification.
 *
 * Mengembalikan null bila Midtrans belum punya transaksinya: transaksi Snap yang metodenya
 * belum dipilih pelanggan memang membalas 404 ("Payment not found"). Galat jaringan atau
 * autentikasi dilempar sebagai MidtransError agar pemanggil tahu statusnya belum pasti.
 */
export async function fetchTransactionStatus(orderId: string): Promise<MidtransNotification | null> {
  const res = await fetch(`${CORE_API_URL}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: 'application/json', Authorization: authHeader() },
    signal: AbortSignal.timeout(4000),
  });
  const body = (await res.json().catch(() => null)) as
    | (Partial<MidtransNotification> & { status_message?: string })
    | null;

  // Midtrans bisa membalas 404 lewat status HTTP atau lewat status_code di dalam isi respons.
  if (res.status === 404 || body?.status_code === '404') return null;
  if (!res.ok || !body || !body.order_id || !body.transaction_status) {
    throw new MidtransError(res.status, body?.status_message || `HTTP ${res.status}`);
  }
  return body as MidtransNotification;
}

/** signature_key = SHA512(order_id + status_code + gross_amount + ServerKey). */
export function verifyNotificationSignature(n: MidtransNotification): boolean {
  const expected = createHash('sha512')
    .update(`${n.order_id}${n.status_code}${n.gross_amount}${env.midtrans.serverKey}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(n.signature_key));
  return a.length === b.length && timingSafeEqual(a, b);
}