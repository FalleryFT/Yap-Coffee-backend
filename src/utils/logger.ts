import { pino } from 'pino';
import { env } from '../config/env.js';

/**
 * Logger utama (pino). Keluaran berupa JSON satu baris per peristiwa di produksi,
 * dan dirapikan oleh pino-pretty saat pengembangan.
 *
 * Nilai sensitif disamarkan di sini sebagai lapisan pengaman terakhir. Aturan utamanya tetap:
 * jangan pernah memasukkan sandi, OTP, atau token ke objek log.
 */
export const logger = pino({
  level: env.log.level,
  base: { service: 'yap-coffee-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'otp',
      'reset_token',
      '*.password',
      '*.current_password',
      '*.password_confirmation',
      '*.otp',
      '*.reset_token',
    ],
    censor: '[disamarkan]',
  },
  ...(env.log.pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:HH:MM:ss',
            // Metode, URL, dan status sudah ada di pesan; yang tersisa dari `req` hanya ID-nya.
            ignore: 'pid,hostname,service,req.method,req.url,req.remoteAddress,res',
          },
        },
      }
    : {}),
});

/** "budi.santoso@gmail.com" menjadi "b***@gmail.com": cukup untuk melacak, tanpa membuka alamat lengkap. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}
