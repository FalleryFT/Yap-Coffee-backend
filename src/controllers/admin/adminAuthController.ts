import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { adminRepository } from '../../repositories/adminRepository.js';
import { AppError } from '../../utils/AppError.js';
import { signToken } from '../../utils/jwt.js';
import { ok } from '../../utils/response.js';
import type { ChangeAdminPasswordInput, UpdateAdminProfileInput } from '../../validators/settingsValidators.js';

const PASSWORD_HASH_ROUNDS = 10;

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

  /** PUT /api/admin/me — mengganti nama tampilan. Username (untuk login) tidak diubah di sini. */
  async updateProfile(req: Request, res: Response) {
    const { name } = req.body as UpdateAdminProfileInput;
    const admin = await adminRepository.findById(req.adminId!);
    if (!admin) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');
    await adminRepository.updateName(admin.id, name);
    ok(res, 'Nama berhasil diperbarui.', toPublicAdmin({ ...admin, name }));
  },

  /** POST /api/admin/me/change-password — wajib menyebut kata sandi saat ini. */
  async changePassword(req: Request, res: Response) {
    const { current_password: current, password } = req.body as ChangeAdminPasswordInput;
    const admin = await adminRepository.findById(req.adminId!);
    if (!admin) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');

    if (!(await bcrypt.compare(current, admin.password_hash))) {
      throw AppError.validation({ current_password: ['Kata sandi saat ini salah.'] });
    }
    if (await bcrypt.compare(password, admin.password_hash)) {
      throw AppError.validation({ password: ['Kata sandi baru tidak boleh sama dengan yang lama.'] });
    }
    await adminRepository.updatePassword(admin.id, await bcrypt.hash(password, PASSWORD_HASH_ROUNDS));
    ok(res, 'Kata sandi berhasil diubah.', null);
  },
};
