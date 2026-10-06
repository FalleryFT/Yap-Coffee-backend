import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

function fieldErrorsFromZod(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/** Terakhir di rantai middleware (4 argumen = Express mengenalinya sebagai error handler). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(Object.keys(err.fieldErrors).length > 0 ? { errors: err.fieldErrors } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Data yang dikirim belum valid.',
      errors: fieldErrorsFromZod(err),
    });
    return;
  }

  // Body JSON rusak yang dilempar body-parser bawaan Express.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ success: false, message: 'Format permintaan tidak valid.' });
    return;
  }

  console.error('[unhandled error]', err);
  res.status(500).json({ success: false, message: 'Server sedang bermasalah. Coba lagi nanti.' });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
}
