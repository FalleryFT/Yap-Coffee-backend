import { z } from 'zod';
import { isOwnImageUrl } from '../utils/cloudinary.js';

const addonSchema = z.object({
  label: z
    .string({ error: 'Nama tambahan wajib diisi.' })
    .trim()
    .min(1, 'Nama tambahan wajib diisi.')
    .max(64, 'Nama tambahan maksimal 64 karakter.'),
  extra_price: z
    .number({ error: 'Harga tambahan harus berupa angka.' })
    .int('Harga tambahan harus bilangan bulat.')
    .min(0, 'Harga tambahan tidak boleh negatif.')
    .default(0),
});

const optionLabel = (what: string) =>
  z
    .string({ error: `Nama ${what} wajib diisi.` })
    .trim()
    .min(1, `Nama ${what} wajib diisi.`)
    .max(32, `Nama ${what} maksimal 32 karakter.`);

const sizeSchema = z.object({
  label: optionLabel('ukuran'),
  // Angka saja; satuan "oz" ditambahkan otomatis saat ditampilkan. null/kosong = tanpa keterangan.
  oz: z
    .number({ error: 'Ukuran (oz) harus berupa angka.' })
    .int('Ukuran (oz) harus bilangan bulat.')
    .min(1, 'Ukuran (oz) minimal 1.')
    .max(999, 'Ukuran (oz) terlalu besar.')
    .nullable()
    .default(null),
  extraPrice: z
    .number({ error: 'Harga ukuran harus berupa angka.' })
    .int('Harga ukuran harus bilangan bulat.')
    .min(0, 'Harga ukuran tidak boleh negatif.')
    .max(1_000_000, 'Harga ukuran terlalu besar.')
    .default(0),
  isDefault: z.boolean().default(false),
});

const sugarSchema = z.object({
  label: optionLabel('tingkat manis'),
  isDefault: z.boolean().default(false),
});

const sizesField = z.array(sizeSchema).max(6, 'Maksimal 6 ukuran per menu.');
const sugarField = z.array(sugarSchema).max(6, 'Maksimal 6 tingkat manis per menu.');

const menuTypeField = z.enum(['makanan', 'minuman'], { error: 'Jenis menu wajib dipilih.' });

/** Hanya satu pilihan bawaan; bila tidak ada yang ditandai, yang pertama dipakai. Daftar kosong dibiarkan. */
export function withSingleDefault<T extends { isDefault: boolean }>(list: T[]): T[] {
  if (list.length === 0) return list;
  const first = list.findIndex((item) => item.isDefault);
  const index = first === -1 ? 0 : first;
  return list.map((item, i) => ({ ...item, isDefault: i === index }));
}

function hasDuplicate(list: { label: string }[]): boolean {
  const seen = new Set<string>();
  return list.some((item) => {
    const key = item.label.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function checkDuplicates(
  data: { sizes?: { label: string }[]; sugarLevels?: { label: string }[] },
  ctx: z.RefinementCtx,
) {
  if (data.sizes && hasDuplicate(data.sizes)) {
    ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Nama ukuran tidak boleh kembar.' });
  }
  if (data.sugarLevels && hasDuplicate(data.sugarLevels)) {
    ctx.addIssue({ code: 'custom', path: ['sugarLevels'], message: 'Nama tingkat manis tidak boleh kembar.' });
  }
}

const menuFields = {
  name: z
    .string({ error: 'Nama menu wajib diisi.' })
    .trim()
    .min(1, 'Nama menu wajib diisi.')
    .max(191, 'Nama menu maksimal 191 karakter.'),
  description: z.string().trim().max(200, 'Deskripsi maksimal 200 karakter.').default(''),
  category: z.string({ error: 'Kategori wajib dipilih.' }).trim().min(1, 'Kategori wajib dipilih.'),
  menuType: menuTypeField,
  price: z
    .number({ error: 'Harga harus berupa angka.' })
    .int('Harga harus bilangan bulat.')
    .min(0, 'Harga tidak boleh negatif.'),
  stock: z
    .number({ error: 'Stok harus berupa angka.' })
    .int('Stok harus bilangan bulat.')
    .min(0, 'Stok tidak boleh negatif.'),
  image: z
    .string()
    .trim()
    .max(255, 'Alamat gambar terlalu panjang.')
    .refine((v) => isOwnImageUrl(v) || /^[\w][\w.-]*$/.test(v), 'Alamat gambar tidak valid.')
    .nullable()
    .optional(),
  addons: z.array(addonSchema).max(20, 'Maksimal 20 tambahan per menu.').default([]),
  // Hanya dipakai untuk menu minuman; boleh kosong (pengisiannya opsional).
  sizes: sizesField.default([]),
  sugarLevels: sugarField.default([]),
  // Tampil/tidaknya menu di katalog pre-order pelanggan.
  available: z.boolean({ error: 'Status ketersediaan harus berupa true atau false.' }).default(true),
};

export const createMenuSchema = z
  .object(menuFields)
  .superRefine(checkDuplicates)
  .transform((data) => ({
    ...data,
    // Makanan tidak punya pilihan ukuran dan manis.
    sizes: data.menuType === 'minuman' ? withSingleDefault(data.sizes) : [],
    sugarLevels: data.menuType === 'minuman' ? withSingleDefault(data.sugarLevels) : [],
  }));

/** Untuk edit: semua kolom opsional, hanya yang dikirim yang diubah. */
export const updateMenuSchema = z
  .object({
    name: menuFields.name.optional(),
    description: z.string().trim().max(200, 'Deskripsi maksimal 200 karakter.').optional(),
    category: menuFields.category.optional(),
    price: menuFields.price.optional(),
    stock: menuFields.stock.optional(),
    image: menuFields.image,
    addons: z.array(addonSchema).max(20, 'Maksimal 20 tambahan per menu.').optional(),
    // Jenis menu terkunci setelah dibuat: dikirim pun harus sama dengan yang tersimpan (dicek di controller).
    menuType: menuTypeField.optional(),
    sizes: sizesField.optional(),
    sugarLevels: sugarField.optional(),
    available: menuFields.available.removeDefault().optional(),
  })
  .superRefine(checkDuplicates)
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada data yang diubah.',
  })
  .transform((data) => ({
    ...data,
    sizes: data.sizes ? withSingleDefault(data.sizes) : undefined,
    sugarLevels: data.sugarLevels ? withSingleDefault(data.sugarLevels) : undefined,
  }));

/** 'semua' dipakai frontend sebagai chip filter "Semua", jadi tidak boleh jadi nama kategori. */
export const createCategorySchema = z.object({
  name: z
    .string({ error: 'Nama kategori wajib diisi.' })
    .trim()
    .min(1, 'Nama kategori wajib diisi.')
    .max(64, 'Nama kategori maksimal 64 karakter.')
    .refine((value) => value.toLowerCase() !== 'semua', {
      message: 'Nama "Semua" sudah dipakai untuk filter, gunakan nama lain.',
    }),
  // Jenis kategori: true = minuman (pelanggan memilih ukuran dan tingkat manis), false = makanan.
  hasOptions: z.boolean({ error: 'Jenis kategori harus minuman atau makanan.' }).default(true),
});

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;