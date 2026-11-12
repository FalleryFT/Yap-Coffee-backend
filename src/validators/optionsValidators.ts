import { z } from 'zod';

const label = (what: string) =>
  z
    .string({ error: `Nama ${what} wajib diisi.` })
    .trim()
    .min(1, `Nama ${what} wajib diisi.`)
    .max(32, `Nama ${what} maksimal 32 karakter.`);

const sizeSchema = z.object({
  label: label('ukuran'),
  detail: z.string().trim().max(64, 'Keterangan ukuran maksimal 64 karakter.').default(''),
  extraPrice: z
    .number({ error: 'Tambahan harga harus berupa angka.' })
    .int('Tambahan harga harus bilangan bulat.')
    .min(0, 'Tambahan harga tidak boleh negatif.')
    .max(1_000_000, 'Tambahan harga terlalu besar.')
    .default(0),
  isDefault: z.boolean().default(false),
});

const sugarSchema = z.object({
  label: label('tingkat manis'),
  isDefault: z.boolean().default(false),
});

/** Hanya satu pilihan bawaan; bila tidak ada yang ditandai, yang pertama dipakai. */
function withSingleDefault<T extends { isDefault: boolean }>(list: T[]): T[] {
  const first = list.findIndex((item) => item.isDefault);
  const index = first === -1 ? 0 : first;
  return list.map((item, i) => ({ ...item, isDefault: i === index }));
}

function duplicateLabel(list: { label: string }[]): boolean {
  const seen = new Set<string>();
  return list.some((item) => {
    const key = item.label.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

/** PUT /api/admin/settings/options */
export const updateOptionsSchema = z
  .object({
    sizes: z
      .array(sizeSchema, { error: 'Daftar ukuran wajib diisi.' })
      .min(1, 'Minimal satu ukuran.')
      .max(6, 'Maksimal 6 ukuran.'),
    sugarLevels: z
      .array(sugarSchema, { error: 'Daftar tingkat manis wajib diisi.' })
      .min(1, 'Minimal satu tingkat manis.')
      .max(6, 'Maksimal 6 tingkat manis.'),
  })
  .superRefine((data, ctx) => {
    if (duplicateLabel(data.sizes)) {
      ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Nama ukuran tidak boleh kembar.' });
    }
    if (duplicateLabel(data.sugarLevels)) {
      ctx.addIssue({ code: 'custom', path: ['sugarLevels'], message: 'Nama tingkat manis tidak boleh kembar.' });
    }
  })
  .transform((data) => ({
    sizes: withSingleDefault(data.sizes),
    sugarLevels: withSingleDefault(data.sugarLevels),
  }));

export type UpdateOptionsInput = z.infer<typeof updateOptionsSchema>;
