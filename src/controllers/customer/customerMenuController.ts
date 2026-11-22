import type { Request, Response } from 'express';
import { menuRepository } from '../../repositories/menuRepository.js';
import { scheduleRepository } from '../../repositories/scheduleRepository.js';
import { toCustomerMenuDto } from '../../utils/customerMenuDto.js';
import { coordinatesOf } from '../../utils/mapsCoordinates.js';
import { hhmm } from '../../utils/orderDto.js';
import { ok } from '../../utils/response.js';

export const customerMenuController = {
  /** GET /api/menu — katalog untuk pelanggan: kategori, menu tersedia, dan tambahannya. */
  async catalog(_req: Request, res: Response) {
    const [categories, rows] = await Promise.all([
      menuRepository.listCategories(),
      menuRepository.listAvailable(),
    ]);
    const ids = rows.map((r) => r.id);
    const [addons, sizes, sugarLevels] = await Promise.all([
      menuRepository.listAddons(ids),
      menuRepository.listSizes(ids),
      menuRepository.listSugarLevels(ids),
    ]);

    ok(res, 'OK', {
      categories: categories.map((c) => c.name),
      // Ukuran dan tingkat manis ikut di tiap item (diatur admin per menu).
      items: rows.map((row) => toCustomerMenuDto(row, addons, sizes, sugarLevels)),
      // Daftar global sudah tidak ada. Dikirim kosong agar aplikasi versi lama tidak error saat membaca `options`.
      options: { sizes: [], sugarLevels: [] },
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