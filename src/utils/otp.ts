import { randomBytes, randomInt } from 'node:crypto';
import { env } from '../config/env.js';

/** Kode OTP numerik, contoh "1234" untuk panjang 4. Memakai CSPRNG, bukan Math.random. */
export function generateOtpCode(length = env.otp.length): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

/** Token acak 48 byte (96 karakter hex) untuk reset_token. */
export function generateResetToken(): string {
  return randomBytes(48).toString('hex');
}
