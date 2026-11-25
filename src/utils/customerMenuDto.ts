import type { MenuAddonRow, MenuItemRow, MenuSizeRow, MenuSugarRow } from '../types/db.js';
import { toSizesDto, toSugarLevelsDto } from './menuOptionsDto.js';

/**
 * Bentuk satu menu untuk aplikasi pelanggan (mobile/lib/features/menu/data/coffee_item_model.dart
 * → CoffeeItem.fromApi). Dipakai GET /api/menu dan GET /api/home agar keduanya selalu sama.
 */
export function toCustomerMenuDto(
  row: MenuItemRow,
  addons: MenuAddonRow[],
  sizes: MenuSizeRow[] = [],
  sugarLevels: MenuSugarRow[] = [],
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    price: row.price,
    stock: row.stock,
    soldOut: row.stock <= 0,
    // Minuman (true) boleh punya pilihan ukuran dan tingkat manis; makanan (false) tidak.
    hasOptions: row.has_options === 1,
    menuType: row.menu_type,
    // Pilihan ukuran dan tingkat manis diatur admin per menu; bisa kosong.
    sizes: toSizesDto(sizes, row.id),
    sugarLevels: toSugarLevelsDto(sugarLevels, row.id),
    image: row.image ?? undefined,
    addons: addons
      .filter((a) => a.menu_item_id === row.id)
      .map((a) => ({ id: a.id, label: a.label, extraPrice: a.extra_price })),
  };
}