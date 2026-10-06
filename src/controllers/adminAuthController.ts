import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { adminRepository } from '../repositories/adminRepository.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import { ok } from '../utils/response.js';

function toPublicAdmin(row: { id: number; name: string; username: string; role: string }) {
  return { id: row.id, name: row.name, username: row.username, role: row.role };
}

export const adminAuthController = {
  async login(req: Request, res: Response) {
    const { username, password } = req.body as { username: string; password: string };

    const admin = await adminRepository.findByUsername(username);
    // Pesan generik disengaja: tidak membedakan "username tidak ada" dari "sandi salah".
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      throw AppError.unauthorized('Username atau kata sandi salah.');
    }

    const token = signToken({ sub: admin.id, role: 'admin' });
    ok(res, 'Login berhasil.', { token, user: toPublicAdmin(admin) });
  },

  async me(req: Request, res: Response) {
    const admin = await adminRepository.findById(req.adminId!);
    if (!admin) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');
    ok(res, 'OK', toPublicAdmin(admin));
  },
};
