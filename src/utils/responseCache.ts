import type { NextFunction, Request, Response } from 'express';

interface CachedResponse {
  body: string;
  expiresAt: number;
}

const MAX_ENTRIES = 200;
const store = new Map<string, CachedResponse>();

// Naik setiap kali cache dikosongkan: respons yang sedang dihitung sebelum itu tidak boleh disimpan.
let version = 0;

// Permintaan tulis yang tidak memengaruhi data yang di-cache (login, profil, notifikasi, chatbot).
const UNRELATED = /^\/api\/(auth|chat|me|notifications|admin\/auth|admin\/me)(\/|\?|$)/;

export function clearResponseCache(): void {
  store.clear();
  version += 1;
}

/**
 * Menyimpan respons 200 dari GET selama `ttlMs`, per URL lengkap (termasuk query).
 * Pasang SETELAH middleware autentikasi, karena respons yang tersimpan disajikan tanpa menjalankan handler.
 * Hanya untuk respons yang sama bagi semua pengguna dengan peran itu.
 */
export function responseCache(ttlMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      res.status(200).type('application/json').send(hit.body);
      return;
    }
    if (hit) store.delete(key);

    const startVersion = version;
    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      if (res.statusCode === 200 && startVersion === version) {
        if (store.size >= MAX_ENTRIES) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) store.delete(oldest);
        }
        store.set(key, { body: JSON.stringify(body), expiresAt: Date.now() + ttlMs });
      }
      return originalJson(body);
    }) as Response['json'];

    res.setHeader('X-Cache', 'MISS');
    next();
  };
}

/** Mengosongkan cache setelah permintaan tulis selesai (apa pun hasilnya, supaya aman). */
export function clearCacheAfterWrite(req: Request, res: Response, next: NextFunction): void {
  const isWrite = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  if (isWrite && !UNRELATED.test(req.originalUrl)) {
    res.on('finish', clearResponseCache);
  }
  next();
}