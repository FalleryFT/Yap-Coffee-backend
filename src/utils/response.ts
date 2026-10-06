import type { Response } from 'express';

export function ok<T>(res: Response, message: string, data: T, status = 200): void {
  res.status(status).json({ success: true, message, data });
}

export function created<T>(res: Response, message: string, data: T): void {
  ok(res, message, data, 201);
}
