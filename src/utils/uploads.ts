import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

export const MENU_IMAGE_DIR = path.join(env.upload.dir, 'menu');
fs.mkdirSync(MENU_IMAGE_DIR, { recursive: true });

export const AVATAR_DIR = path.join(env.upload.dir, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const SAFE_NAME = /^[\w][\w.-]*$/;

/** Menghapus berkas foto menu; diam saja jika sudah tidak ada atau namanya tidak aman. */
export async function removeMenuImage(filename: string | null | undefined): Promise<void> {
  if (!filename || !SAFE_NAME.test(filename)) return;
  await fs.promises.unlink(path.join(MENU_IMAGE_DIR, filename)).catch(() => {});
}

/** Menghapus berkas foto profil; diam saja jika sudah tidak ada atau namanya tidak aman. */
export async function removeAvatar(filename: string | null | undefined): Promise<void> {
  if (!filename || !SAFE_NAME.test(filename)) return;
  await fs.promises.unlink(path.join(AVATAR_DIR, filename)).catch(() => {});
}

/**
 * Menentukan format foto dari tanda byte awal berkas (bukan dari Content-Type atau nama berkas kiriman
 * klien, yang bisa salah atau dipalsukan). null bila bukan JPEG, PNG, atau WebP.
 */
export async function detectImageExtension(filePath: string): Promise<'.jpg' | '.png' | '.webp' | null> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, 12, 0);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
    if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
    return null;
  } finally {
    await handle.close();
  }
}

/** Memeriksa tanda byte awal berkas (bukan sekadar percaya pada Content-Type kiriman klien). */
export async function looksLikeImage(filePath: string): Promise<boolean> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    await handle.read(buf, 0, 12, 0);
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    return jpeg || png || webp;
  } finally {
    await handle.close();
  }
}
