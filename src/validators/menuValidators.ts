import { z } from 'zod';

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

const menuFields = {
  name: z
    .string({ error: 'Nama menu wajib diisi.' })
    .trim()
    .min(1, 'Nama menu wajib diisi.')
    .max(191, 'Nama menu maksimal 191 karakter.'),
  description: z.string().trim().max(200, 'Deskripsi maksimal 200 karakter.').default(''),
  category: z.string({ error: 'Kategori wajib dipilih.' }).trim().min(1, 'Kategori wajib dipilih.'),
  price: z
    .number({ error: 'Harga harus berupa angka.' })
    .int('Harga harus bilangan bulat.')
    .min(0, 'Harga tidak boleh negatif.'),
  stock: z
    .number({ error: 'Stok harus berupa angka.' })
    .int('Stok harus bilangan bulat.')
    .min(0, 'Stok tidak boleh negatif.'),
  // Nama berkas hasil unggah (tanpa folder) agar tidak bisa menunjuk ke path lain.
  image: z
    .string()
    .trim()
    .max(255, 'Nama berkas gambar terlalu panjang.')
    .regex(/^[\w][\w.-]*$/, 'Nama berkas gambar tidak valid.')
    .nullable()
    .optional(),
  addons: z.array(addonSchema).max(20, 'Maksimal 20 tambahan per menu.').default([]),
};

export const createMenuSchema = z.object(menuFields);

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
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada data yang diubah.',
  });

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
