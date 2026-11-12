import type { Request, Response } from 'express';
import { optionsRepository } from '../../repositories/optionsRepository.js';
import { toOptionsDto } from '../../utils/optionsDto.js';
import { ok } from '../../utils/response.js';
import type { UpdateOptionsInput } from '../../validators/optionsValidators.js';

async function currentOptions() {
  const [sizes, sugarLevels] = await Promise.all([
    optionsRepository.listSizes(),
    optionsRepository.listSugarLevels(),
  ]);
  return toOptionsDto(sizes, sugarLevels);
}

export const adminOptionsController = {
  /** GET /api/admin/settings/options — ukuran gelas dan tingkat manis yang dipilih pelanggan. */
  async show(_req: Request, res: Response) {
    ok(res, 'OK', await currentOptions());
  },

  /** PUT /api/admin/settings/options — mengganti seluruh daftar; berlaku seketika di aplikasi. */
  async update(req: Request, res: Response) {
    const input = req.body as UpdateOptionsInput;
    await optionsRepository.replaceAll(input.sizes, input.sugarLevels);
    ok(res, 'Pilihan ukuran dan tingkat manis berhasil disimpan.', await currentOptions());
  },
};
