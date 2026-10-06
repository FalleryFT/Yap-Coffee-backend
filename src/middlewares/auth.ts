import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { verifyToken, type TokenRole } from '../utils/jwt.js';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Membuat middleware yang mewajibkan JWT valid dengan `role` tertentu. */
function requireRole(role: TokenRole, idField: 'adminId' | 'customerId') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      return next(AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.'));
    }

    try {
      const payload = verifyToken(token);
      if (payload.role !== role) {
        return next(AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.'));
      }
      req[idField] = payload.sub;
      next();
    } catch (err) {
      const expired = err instanceof jwt.TokenExpiredError;
      next(
        AppError.unauthorized(
          expired ? 'Sesi berakhir. Silakan masuk lagi.' : 'Token tidak valid.',
        ),
      );
    }
  };
}

export const requireAdminAuth = requireRole('admin', 'adminId');
export const requireCustomerAuth = requireRole('customer', 'customerId');
