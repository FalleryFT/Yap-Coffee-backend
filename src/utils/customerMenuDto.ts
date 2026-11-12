import type { MenuAddonRow, MenuItemRow } from '../types/db.js';

/**
 * Bentuk satu menu untuk aplikasi pelanggan (mobile/lib/features/menu/data/coffee_item_model.dart
 * → CoffeeItem.fromApi). Dipakai GET /api/menu dan GET /api/home agar keduanya selalu sama.
 */
export function toCustomerMenuDto(row: MenuItemRow, addons: MenuAddonRow[]) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    price: row.price,
    stock: row.stock,
    soldOut: row.stock <= 0,
    // Minuman (true) memilih ukuran dan tingkat manis; makanan (false) tidak.
    hasOptions: row.has_options === 1,
    image: row.image ?? undefined,
    addons: addons
      .filter((a) => a.menu_item_id === row.id)
      .map((a) => ({ id: a.id, label: a.label, extraPrice: a.extra_price })),
  };
}
