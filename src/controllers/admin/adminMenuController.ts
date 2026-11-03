import type { Request, Response } from 'express';
import { menuRepository } from '../../repositories/menuRepository.js';
import type { MenuAddonRow, MenuItemRow } from '../../types/db.js';
import { AppError } from '../../utils/AppError.js';
import { created, ok } from '../../utils/response.js';
import { looksLikeImage, removeMenuImage } from '../../utils/uploads.js';
import type { CreateMenuInput, UpdateMenuInput } from '../../validators/menuValidators.js';

/** Bentuk satu menu untuk frontend (src/types/admin.ts → MenuItem), addons berupa objek. */
function toMenuDto(row: MenuItemRow, addons: MenuAddonRow[]) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    price: row.price,
    stock: row.stock,
    image: row.image ?? undefined,
    addons: addons
      .filter((a) => a.menu_item_id === row.id)
      .map((a) => ({ id: a.id, label: a.label, extra_price: a.extra_price })),
  };
}

/** Id dari URL harus bilangan bulat positif; selain itu dianggap tidak ditemukan. */
function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('Menu tidak ditemukan.');
  return id;
}

async function resolveCategoryId(name: string): Promise<number> {
  const categoryId = await menuRepository.findCategoryIdByName(name);
  if (categoryId === null) {
    throw AppError.validation({ category: ['Kategori tidak dikenal.'] });
  }
  return categoryId;
}

async function loadMenu(id: number) {
  const row = await menuRepository.findItemById(id);
  if (!row) throw AppError.notFound('Menu tidak ditemukan.');
  return toMenuDto(row, await menuRepository.listAddons([id]));
}

export const adminMenuController = {
  /** GET /api/admin/menu — seluruh menu beserta tambahan; filter/pencarian dilakukan di frontend. */
  async list(_req: Request, res: Response) {
    const rows = await menuRepository.listItems();
    const addons = await menuRepository.listAddons(rows.map((r) => r.id));
    ok(res, 'OK', rows.map((row) => toMenuDto(row, addons)));
  },

  /** GET /api/admin/menu/categories */
  async categories(_req: Request, res: Response) {
    const rows = await menuRepository.listCategories();
    ok(res, 'OK', rows.map((r) => ({ id: r.id, name: r.name })));
  },

  /** GET /api/admin/menu/:id */
  async show(req: Request, res: Response) {
    ok(res, 'OK', await loadMenu(parseId(req)));
  },

  /** POST /api/admin/menu/image — multipart, field "image". Mengembalikan nama berkas untuk dikirim ke create/update. */
  async uploadImage(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw AppError.validation({ image: ['Foto wajib dipilih.'] });

    if (!(await looksLikeImage(file.path))) {
      await removeMenuImage(file.filename);
      throw AppError.validation({ image: ['Isi berkas bukan gambar JPG, PNG, atau WebP yang valid.'] });
    }
    created(res, 'Foto berhasil diunggah.', { image: file.filename, url: `/uploads/menu/${file.filename}` });
  },

  /** POST /api/admin/menu */
  async create(req: Request, res: Response) {
    const input = req.body as CreateMenuInput;
    const categoryId = await resolveCategoryId(input.category);
    const id = await menuRepository.create(input, categoryId);
    created(res, 'Menu berhasil ditambahkan.', await loadMenu(id));
  },

  /** PUT /api/admin/menu/:id — hanya kolom yang dikirim yang diubah. */
  async update(req: Request, res: Response) {
    const id = parseId(req);
    const input = req.body as UpdateMenuInput;

    const existing = await menuRepository.findItemById(id);
    if (!existing) throw AppError.notFound('Menu tidak ditemukan.');

    const categoryId = input.category ? await resolveCategoryId(input.category) : undefined;
    await menuRepository.update(id, input, categoryId);

    // Foto diganti atau dihapus: berkas lama tidak dipakai lagi.
    if (input.image !== undefined && existing.image !== input.image) {
      await removeMenuImage(existing.image);
    }
    ok(res, 'Menu berhasil diperbarui.', await loadMenu(id));
  },

  /** DELETE /api/admin/menu/:id */
  async remove(req: Request, res: Response) {
    const id = parseId(req);
    const existing = await menuRepository.findItemById(id);
    try {
      const deleted = await menuRepository.remove(id);
      if (!deleted) throw AppError.notFound('Menu tidak ditemukan.');
    } catch (err) {
      // order_items punya FK RESTRICT ke menu_items: menu yang pernah dipesan tidak boleh dihapus.
      if ((err as { code?: string }).code === 'ER_ROW_IS_REFERENCED_2') {
        throw new AppError(
          409,
          'Menu ini sudah pernah dipesan sehingga tidak bisa dihapus. Kosongkan stoknya saja.',
        );
      }
      throw err;
    }
    await removeMenuImage(existing?.image);
    ok(res, 'Menu berhasil dihapus.', null);
  },
};
