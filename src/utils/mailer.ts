import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'mailer' });

/** False bila SMTP_HOST kosong. Hanya boleh terjadi di luar produksi (env.ts menolaknya di produksi). */
export const mailEnabled = env.mail.host !== '';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure, // true untuk port 465; port 587 memakai STARTTLS otomatis
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/** Dipanggil sekali saat server start. Gagal hanya dicatat, tidak menghentikan server. */
export async function verifyMailer(): Promise<void> {
  if (!mailEnabled) {
    log.warn('SMTP_HOST belum diisi. Email tidak dikirim; kode OTP hanya muncul di log (mode pengembangan).');
    return;
  }
  try {
    await getTransporter().verify();
    log.info({ host: env.mail.host, port: env.mail.port }, 'Koneksi SMTP siap.');
  } catch (err) {
    log.error({ err, host: env.mail.host, port: env.mail.port }, 'Koneksi SMTP gagal. Periksa SMTP_* di .env.');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface OtpEmailInput {
  to: string;
  name: string;
  code: string;
  ttlMinutes: number;
}

function renderOtpText({ name, code, ttlMinutes }: OtpEmailInput): string {
  return [
    `Halo ${name},`,
    '',
    `Kode OTP untuk mengatur ulang kata sandi ${env.store.name} kamu:`,
    '',
    `    ${code}`,
    '',
    `Kode berlaku ${ttlMinutes} menit dan hanya bisa dipakai sekali.`,
    'Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari kami.',
    '',
    'Kalau kamu tidak merasa meminta kode ini, abaikan saja email ini. Kata sandimu tidak berubah.',
  ].join('\n');
}

function renderOtpHtml({ name, code, ttlMinutes }: OtpEmailInput): string {
  const store = escapeHtml(env.store.name);
  return `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:24px;background:#f5f1ec;font-family:Arial,Helvetica,sans-serif;color:#2b2118;">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
      <h2 style="margin:0 0 16px;font-size:18px;">${store}</h2>
      <p style="margin:0 0 12px;">Halo ${escapeHtml(name)},</p>
      <p style="margin:0 0 20px;">Ini kode OTP untuk mengatur ulang kata sandi kamu:</p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#f5f1ec;border-radius:8px;padding:16px 0;margin-bottom:20px;">${escapeHtml(code)}</div>
      <p style="margin:0 0 8px;font-size:14px;">Kode berlaku ${ttlMinutes} menit dan hanya bisa dipakai sekali.</p>
      <p style="margin:0 0 8px;font-size:14px;">Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku dari kami.</p>
      <p style="margin:16px 0 0;font-size:12px;color:#7a6a5c;">Kalau kamu tidak merasa meminta kode ini, abaikan saja email ini. Kata sandimu tidak berubah.</p>
    </div>
  </body>
</html>`;
}

/**
 * Mengirim kode OTP lewat email. Melempar galat bila SMTP gagal; pemanggil yang memutuskan penanganannya.
 * Mengembalikan true bila email diterima server SMTP, false bila SMTP tidak dikonfigurasi.
 * Tanpa SMTP (hanya di luar produksi), kode ditulis ke log supaya alur lupa sandi tetap bisa dicoba.
 */
export async function sendOtpEmail(input: OtpEmailInput): Promise<boolean> {
  if (!mailEnabled) {
    // Satu-satunya tempat kode OTP boleh masuk log, dan hanya tanpa SMTP di luar produksi.
    log.info({ to: input.to, devOtp: input.code }, '[DEV] SMTP tidak dikonfigurasi, OTP tidak dikirim lewat email.');
    return false;
  }

  await getTransporter().sendMail({
    from: env.mail.from,
    to: input.to,
    subject: `Kode OTP reset kata sandi ${env.store.name}`,
    text: renderOtpText(input),
    html: renderOtpHtml(input),
  });
  return true;
}
