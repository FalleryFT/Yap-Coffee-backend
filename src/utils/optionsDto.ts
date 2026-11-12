import type { SizeOptionRow, SugarOptionRow } from '../repositories/optionsRepository.js';

/** Pilihan ukuran dan tingkat manis (GET /api/menu → options, GET /api/admin/settings/options). */
export function toOptionsDto(sizes: SizeOptionRow[], sugarLevels: SugarOptionRow[]) {
  return {
    sizes: sizes.map((s) => ({
      label: s.label,
      detail: s.detail,
      extraPrice: s.extra_price,
      isDefault: s.is_default === 1,
    })),
    sugarLevels: sugarLevels.map((s) => ({ label: s.label, isDefault: s.is_default === 1 })),
  };
}
