import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type TokenRole = 'admin' | 'customer';

export interface TokenPayload {
  sub: number;
  role: TokenRole;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn } as jwt.SignOptions);
}

function isTokenPayload(value: unknown): value is TokenPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    'role' in value &&
    (value as { role: unknown }).role !== undefined
  );
}

/** Melempar jwt.JsonWebTokenError/TokenExpiredError bila tidak valid; ditangkap oleh middleware pemanggil. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.jwt.secret);
  if (!isTokenPayload(decoded)) {
    throw new jwt.JsonWebTokenError('Payload token tidak sesuai.');
  }
  return decoded;
}
