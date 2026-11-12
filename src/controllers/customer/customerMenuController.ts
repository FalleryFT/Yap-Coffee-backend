import type { Request, Response } from 'express';
import { menuRepository } from '../../repositories/menuRepository.js';
import { optionsRepository } from '../../repositories/optionsRepository.js';
import { scheduleRepository } from '../../repositories/scheduleRepository.js';
import { toCustomerMenuDto } from '../../utils/customerMenuDto.js';
import { coordinatesOf } from '../../utils/mapsCoordinates.js';
import { toOptionsDto } from '../../utils/optionsDto.js';
import { hhmm } from '../../utils/orderDto.js';
import { ok } from '../../utils/response.js';

export const customerMenuController = {
  /** GET /api/menu — katalog untuk pelanggan: kategori, menu tersedia, dan tambahannya. */
  async catalog(_req: Request, res: Response) {
    const [categories, rows, sizes, sugarLevels] = await Promise.all([
      menuRepository.listCategories(),
      menuRepository.listAvailable(),
      optionsRepository.listSizes(),
      optionsRepository.listSugarLevels(),
    ]);
    const addons = await menuRepository.listAddons(rows.map((r) => r.id));

    ok(res, 'OK', {
      categories: categories.map((c) => c.name),
      items: rows.map((row) => toCustomerMenuDto(row, addons)),
      // Ukuran dan tingkat manis yang diatur admin; dipakai di sheet tambah ke keranjang.
      options: toOptionsDto(sizes, sugarLevels),
    });
  },

  /** GET /api/schedules — kloter pengambilan yang masih bisa dipesan. */
  async schedules(_req: Request, res: Response) {
    const rows = await scheduleRepository.listOrderable();
    ok(
      res,
      'OK',
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        start: hhmm(row.pickup_start),
        end: hhmm(row.pickup_end),
        cutOff: hhmm(row.cut_off_time),
        location: row.location,
        locationDetail: row.location_detail ?? '',
        mapsUrl: row.maps_url ?? undefined,
        ...coordinatesOf(row),
      })),
    );
  },
};
