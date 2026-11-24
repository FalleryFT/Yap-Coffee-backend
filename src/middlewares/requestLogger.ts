import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

/** ID permintaan dari klien dipakai bila bentuknya wajar; selain itu dibuat baru. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Mencatat satu baris log per permintaan (metode, URL, status, durasi) dan menyediakan `req.log`
 * dengan `req.id` yang sama untuk semua log di dalam permintaan itu.
 * Body permintaan sengaja tidak dicatat karena berisi sandi dan OTP.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Di dalam router yang dipasang di sub-path, req.url dipotong (mis. "/login"); originalUrl tetap utuh.
  customSuccessMessage: (req, res) =>
    `${req.method} ${(req as Request).originalUrl ?? req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) =>
    `${req.method} ${(req as Request).originalUrl ?? req.url} ${res.statusCode} (galat)`,
  customProps: (req) => {
    const { customerId, adminId } = req as unknown as Request;
    return { customerId, adminId };
  },
  serializers: {
    req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  autoLogging: { ignore: (req) => req.url === '/health' },
});
