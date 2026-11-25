import type { Request, Response } from 'express';
import { menuRepository } from '../../repositories/menuRepository.js';
import { notificationRepository } from '../../repositories/notificationRepository.js';
import type { MenuAddonRow, MenuItemRow, MenuSizeRow, MenuSugarRow, MenuType } from '../../types/db.js';
import { AppError } from '../../utils/AppError.js';
import { removeImage, uploadImage } from '../../utils/cloudinary.js';
import { logger } from '../../utils/logger.js';
import { toSizesDto, toSugarLevelsDto } from '../../utils/menuOptionsDto.js';
import { created, ok } from '../../utils/response.js';
import { looksLikeImage } from '../../utils/uploads.js';
import type { CreateCategoryInput, CreateMenuInput, UpdateMenuInput } from '../../validators/menuValidators.js';

/** Bentuk satu menu untuk frontend (src/types/admin.ts → MenuItem), addons berupa objek. */
function toMenuDto(
  row: MenuItemRow,
  addons: MenuAddonRow[],
  sizes: MenuSizeRow[],
  sugarLevels: MenuSugarRow[],
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    price: row.price,
    stock: row.stock,
    image: row.image ?? undefined,
    available: row.is_available === 1,
    // Jenis menu; terkunci setelah dibuat.
    menuType: row.menu_type,
    // Minuman (true) boleh punya pilihan ukuran dan tingkat manis; makanan (false) tidak.
    hasOptions: row.has_options === 1,
    sizes: toSizesDto(sizes, row.id),
    sugarLevels: toSugarLevelsDto(sugarLevels, row.id),
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

function parseCategoryId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('Kategori tidak ditemukan.');
  return id;
}

/** Kategori harus ada dan sejenis dengan menunya (kategori minuman untuk minuman, dst.). */
async function resolveCategoryId(name: string, menuType: MenuType): Promise<number> {
  const category = await menuRepository.findCategoryByName(name);
  if (category === null) {
    throw AppError.validation({ category: ['Kategori tidak dikenal.'] });
  }
  if ((category.has_options === 1) !== (menuType === 'minuman')) {
    throw AppError.validation({
      category: [`Kategori ini bukan kategori ${menuType}. Pilih kategori yang sesuai jenis menu.`],
    });
  }
  return category.id;
}

async function loadMenu(id: number) {
  const row = await menuRepository.findItemById(id);
  if (!row) throw AppError.notFound('Menu tidak ditemukan.');
  const [addons, sizes, sugarLevels] = await Promise.all([
    menuRepository.listAddons([id]),
    menuRepository.listSizes([id]),
    menuRepository.listSugarLevels([id]),
  ]);
  return toMenuDto(row, addons, sizes, sugarLevels);
}

export const adminMenuController = {
  /** GET /api/admin/menu — seluruh menu beserta tambahan; filter/pencarian dilakukan di frontend. */
  async list(_req: Request, res: Response) {
    const rows = await menuRepository.listItems();
    const ids = rows.map((r) => r.id);
    const [addons, sizes, sugarLevels] = await Promise.all([
      menuRepository.listAddons(ids),
      menuRepository.listSizes(ids),
      menuRepository.listSugarLevels(ids),
    ]);
    ok(res, 'OK', rows.map((row) => toMenuDto(row, addons, sizes, sugarLevels)));
  },

  /** GET /api/admin/menu/categories */
  async categories(_req: Request, res: Response) {
    const rows = await menuRepository.listCategories();
    ok(res, 'OK', rows.map((r) => ({ id: r.id, name: r.name, hasOptions: r.has_options === 1 })));
  },

  /** POST /api/admin/menu/categories — kategori baru untuk filter dan form menu. */
  async createCategory(req: Request, res: Response) {
    const { name, hasOptions } = req.body as CreateCategoryInput;

    // Kolom `name` memakai collation _ci, jadi "kopi susu" dan "Kopi Susu" dianggap sama.
    if ((await menuRepository.findCategoryIdByName(name)) !== null) {
      throw AppError.validation({ name: ['Kategori ini sudah ada.'] });
    }

    try {
      const id = await menuRepository.createCategory(name, hasOptions);
      created(res, 'Kategori berhasil ditambahkan.', { id, name, hasOptions });
    } catch (err) {
      // Dua permintaan serentak dengan nama sama: yang kedua kalah di indeks UNIQUE.
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw AppError.validation({ name: ['Kategori ini sudah ada.'] });
      }
      throw err;
    }
  },

  /**
- DELETE /api/admin/menu/categories/:id
- Tanpa `?moveTo` hanya kategori kosong yang boleh dihapus (selain itu 409 → popup konfirmasi).
- `?moveTo=<id kategori lain>` memindahkan menu ke kategori lain; `?moveTo=none` melepas menu
- dari kategori mana pun (tetap tampil di filter "Semua"). Menu tidak pernah ikut terhapus.
   */
  async removeCategory(req: Request, res: Response) {
    const id = parseCategoryId(req);
    const rawMoveTo = req.query.moveTo;
    const toNone = rawMoveTo === 'none' || rawMoveTo === 'semua';
    const moveTo = toNone || rawMoveTo === undefined ? null : Number(rawMoveTo);

    if (!toNone && moveTo !== null) {
      if (!Number.isInteger(moveTo) || moveTo <= 0 || moveTo === id) {
        throw AppError.validation({ moveTo: ['Kategori tujuan tidak valid.'] });
      }
      const target = await menuRepository.findCategoryById(moveTo);
      if (target === null) {
        throw AppError.validation({ moveTo: ['Kategori tujuan tidak dikenal.'] });
      }
      // Menu tidak boleh berpindah ke kategori berjenis lain (minuman ↔ makanan).
      const source = await menuRepository.findCategoryById(id);
      if (source && source.has_options !== target.has_options) {
        throw AppError.validation({ moveTo: ['Kategori tujuan harus sejenis (minuman/makanan).'] });
      }
    }

    // Tanpa tujuan pindah, kategori hanya boleh dihapus kalau kosong; 409 ini yang memicu
    // popup konfirmasi berisi pilihan tujuan di frontend.
    if (moveTo === null && !toNone && (await menuRepository.categoryHasItems(id))) {
      throw new AppError(409, 'Kategori masih dipakai menu.');
    }

    const deleted = await menuRepository.removeCategory(id, toNone ? 'none' : moveTo);
    if (!deleted) throw AppError.notFound('Kategori tidak ditemukan.');
    ok(res, 'Kategori berhasil dihapus.', null);
  },

  /** GET /api/admin/menu/:id */
  async show(req: Request, res: Response) {
    ok(res, 'OK', await loadMenu(parseId(req)));
  },

  /** POST /api/admin/menu/image */
  async uploadImage(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw AppError.validation({ image: ['Foto wajib dipilih.'] });

    if (!looksLikeImage(file.buffer)) {
      throw AppError.validation({ image: ['Isi berkas bukan gambar JPG, PNG, atau WebP yang valid.'] });
    }
    const url = await uploadImage(file.buffer, 'menu');
    created(res, 'Foto berhasil diunggah.', { image: url, url });
  },

  /** POST /api/admin/menu */
  async create(req: Request, res: Response) {
    const input = req.body as CreateMenuInput;
    const categoryId = await resolveCategoryId(input.category, input.menuType);
    const id = await menuRepository.create(input, categoryId);

    // Menu yang langsung tampil di katalog diumumkan ke pelanggan; menu tersembunyi tidak.
    if (input.available) {
      await notificationRepository.createNewMenu(id, input.name).catch((err: unknown) => {
        logger.error({ err, menuId: id }, 'Gagal membuat notifikasi menu baru.');
      });
    }
    created(res, 'Menu berhasil ditambahkan.', await loadMenu(id));
  },

  /** PUT /api/admin/menu/:id — hanya kolom yang dikirim yang diubah. */
  async update(req: Request, res: Response) {
    const id = parseId(req);
    const input = req.body as UpdateMenuInput;

    const existing = await menuRepository.findItemById(id);
    if (!existing) throw AppError.notFound('Menu tidak ditemukan.');

    // Jenis menu terkunci: boleh dikirim ulang, tapi tidak boleh berbeda dari yang tersimpan.
    if (input.menuType !== undefined && input.menuType !== existing.menu_type) {
      throw AppError.validation({ menuType: ['Jenis menu tidak bisa diubah setelah dibuat.'] });
    }
    const categoryId = input.category
      ? await resolveCategoryId(input.category, existing.menu_type)
      : undefined;
    // Makanan tidak punya pilihan ukuran dan manis.
    const effective =
      existing.menu_type === 'makanan' ? { ...input, sizes: undefined, sugarLevels: undefined } : input;
    await menuRepository.update(id, effective, categoryId);

    // Foto diganti atau dihapus: berkas lama tidak dipakai lagi.
    if (input.image !== undefined && existing.image !== input.image) {
      await removeImage(existing.image);
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
    await removeImage(existing?.image);
    ok(res, 'Menu berhasil dihapus.', null);
  },
};