import type { Request, Response } from 'express';
import { storeSettingsRepository } from '../../repositories/storeSettingsRepository.js';
import { ok } from '../../utils/response.js';
import { toStoreContactDto } from '../../utils/storeContact.js';
import type { UpdateStoreSettingsInput } from '../../validators/settingsValidators.js';

async function currentSettings() {
  const raw = await storeSettingsRepository.get();
  const contact = toStoreContactDto(raw);
  // Yang dikembalikan ke form: nomor dalam bentuk ketikan lokal (08…) dan tautan Instagram.
  return {
    outletName: raw.outletName,
    whatsapp: contact.whatsapp ? `0${contact.whatsapp.slice(3)}` : raw.whatsapp,
    instagram: contact.instagram || raw.instagram,
    preview: contact,
  };
}

export const adminSettingsController = {
  /** GET /api/admin/settings — kontak toko yang tampil di aplikasi pelanggan. */
  async show(_req: Request, res: Response) {
    ok(res, 'OK', await currentSettings());
  },

  /** PUT /api/admin/settings — berlaku seketika di aplikasi (dibaca lewat GET /api/home). */
  async update(req: Request, res: Response) {
    const input = req.body as UpdateStoreSettingsInput;
    await storeSettingsRepository.save(input);
    ok(res, 'Pengaturan toko berhasil disimpan.', await currentSettings());
  },
};
