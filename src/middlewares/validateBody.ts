import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Memvalidasi req.body dengan skema Zod, lalu menimpa req.body dengan hasil yang sudah
 * ter-"parse" (misalnya string yang di-trim). Galat validasi diteruskan ke errorHandler.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Tanpa body sama sekali, req.body bisa jadi undefined, bukan {}.
    // Dinormalkan dulu supaya Zod melaporkan field yang kosong satu per satu
    // (pesan berbahasa Indonesia dari skema), bukan pesan generik "expected object".
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
