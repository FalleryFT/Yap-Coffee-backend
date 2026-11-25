import type { MenuSizeRow, MenuSugarRow } from '../types/db.js';

/** Keterangan ukuran untuk tampilan: 16 → "16 oz"; kosong bila tidak diisi. */
export function ozDetail(oz: number | null): string {
  return oz ? `${oz} oz` : '';
}

/** Ukuran gelas satu menu (admin web dan aplikasi pelanggan memakai bentuk yang sama). */
export function toSizesDto(rows: MenuSizeRow[], menuItemId: number) {
  return rows
    .filter((s) => s.menu_item_id === menuItemId)
    .map((s) => ({
      label: s.label,
      oz: s.oz,
      // Dipertahankan untuk aplikasi pelanggan (SizeOption.fromApi membaca `detail`).
      detail: ozDetail(s.oz),
      extraPrice: s.extra_price,
      isDefault: s.is_default === 1,
    }));
}

/** Tingkat manis satu menu. */
export function toSugarLevelsDto(rows: MenuSugarRow[], menuItemId: number) {
  return rows
    .filter((s) => s.menu_item_id === menuItemId)
    .map((s) => ({ label: s.label, isDefault: s.is_default === 1 }));
}