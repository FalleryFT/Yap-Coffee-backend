import type { Request, Response } from 'express';
import { customerOrderRepository } from '../../repositories/customerOrderRepository.js';
import { customerRepository } from '../../repositories/customerRepository.js';
import { menuRepository } from '../../repositories/menuRepository.js';
import { notificationRepository } from '../../repositories/notificationRepository.js';
import { storeSettingsRepository } from '../../repositories/storeSettingsRepository.js';
import { AppError } from '../../utils/AppError.js';
import { toCustomerMenuDto } from '../../utils/customerMenuDto.js';
import { toCustomerOrderDto } from '../../utils/customerOrderDto.js';
import { ok } from '../../utils/response.js';
import { toStoreContactDto } from '../../utils/storeContact.js';

/** Jumlah kartu di "Menu Favorit Tetangga" (sama dengan _favoriteCount di home_view.dart). */
const FAVORITE_LIMIT = 6;

/** Menu terlaris dihitung dari pesanan sebanyak ini hari ke belakang. */
const FAVORITE_WINDOW_DAYS = 30;

/** "Siti Nurhaliza" → "Siti". Nama kosong dikembalikan apa adanya. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export const customerHomeController = {
  /**
   * GET /api/home — semua data layar Home dalam satu permintaan:
   *  - customer: sapaan di kartu atas
   *  - store: nama outlet, WhatsApp, dan Instagram yang diatur admin (berlaku seketika)
   *  - notifications: jumlah belum dibaca (lencana lonceng) dan status saklar notifikasi
   *  - readyOrder: pesanan lunas yang sudah siap diambil, atau null (kartu "Siap Diambil")
   *  - categories: nama kategori untuk chip filter
   *  - favorites: menu favorit (bentuknya sama dengan elemen `items` pada GET /api/menu)
   *
   * Filter kategori di Home tetap berjalan di aplikasi memakai GET /api/menu; endpoint ini
   * tidak menggantikannya.
   */
  async overview(req: Request, res: Response) {
    const customerId = req.customerId!;

    const [customer, readyRow, categories, favoriteRows, storeSettings, unread] = await Promise.all([
      customerRepository.findById(customerId),
      customerOrderRepository.findReadyForPickup(customerId),
      menuRepository.listCategories(),
      menuRepository.listPopular(FAVORITE_LIMIT, FAVORITE_WINDOW_DAYS),
      storeSettingsRepository.get(),
      notificationRepository.countUnread(customerId),
    ]);
    if (!customer) throw AppError.unauthorized('Sesi berakhir. Silakan masuk lagi.');

    const [readyItems, addons] = await Promise.all([
      readyRow ? customerOrderRepository.listItems([readyRow.id]) : Promise.resolve([]),
      menuRepository.listAddons(favoriteRows.map((r) => r.id)),
    ]);

    ok(res, 'OK', {
      customer: { name: customer.name, firstName: firstName(customer.name) },
      store: { name: storeSettings.outletName, ...toStoreContactDto(storeSettings) },
      notifications: { unreadCount: unread, enabled: customer.notifications_enabled === 1 },
      readyOrder: readyRow ? toCustomerOrderDto(readyRow, readyItems) : null,
      categories: categories.map((c) => c.name),
      favorites: favoriteRows.map((row) => toCustomerMenuDto(row, addons)),
    });
  },
};
