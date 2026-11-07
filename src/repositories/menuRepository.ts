import type { ResultSetHeader } from 'mysql2';
import { pool } from '../config/db.js';
import type { MenuAddonRow, MenuCategoryRow, MenuItemRow } from '../types/db.js';
import type { CreateMenuInput, UpdateMenuInput } from '../validators/menuValidators.js';

const SELECT_ITEMS = `
  SELECT mi.id, mi.category_id, mc.name AS category, mi.name, mi.description,
         mi.price, mi.stock, mi.image, mi.is_available
  FROM menu_items mi
  JOIN menu_categories mc ON mc.id = mi.category_id`;

type Addons = CreateMenuInput['addons'];

export const menuRepository = {
  async listCategories(): Promise<MenuCategoryRow[]> {
    const [rows] = await pool.query<MenuCategoryRow[]>(
      'SELECT id, name FROM menu_categories ORDER BY id',
    );
    return rows;
  },

  /** Menambah kategori; mengembalikan id baru. Nama yang sama (tanpa membedakan huruf besar/kecil) ditolak UNIQUE. */
  async createCategory(name: string): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      'INSERT INTO menu_categories (name) VALUES (?)',
      [name],
    );
    return result.insertId;
  },

  async findCategoryIdByName(name: string): Promise<number | null> {
    const [rows] = await pool.query<MenuCategoryRow[]>(
      'SELECT id, name FROM menu_categories WHERE name = ? LIMIT 1',
      [name],
    );
    return rows[0]?.id ?? null;
  },

  async listItems(): Promise<MenuItemRow[]> {
    const [rows] = await pool.query<MenuItemRow[]>(`${SELECT_ITEMS} ORDER BY mi.id`);
    return rows;
  },

  async findItemById(id: number): Promise<MenuItemRow | null> {
    const [rows] = await pool.query<MenuItemRow[]>(`${SELECT_ITEMS} WHERE mi.id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  /** Semua tambahan untuk sekumpulan menu sekaligus (menghindari query per menu). */
  async listAddons(menuItemIds: number[]): Promise<MenuAddonRow[]> {
    if (menuItemIds.length === 0) return [];
    const [rows] = await pool.query<MenuAddonRow[]>(
      'SELECT id, menu_item_id, label, extra_price FROM menu_addons WHERE menu_item_id IN (?) ORDER BY id',
      [menuItemIds],
    );
    return rows;
  },

  async create(input: CreateMenuInput, categoryId: number): Promise<number> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO menu_items (category_id, name, description, price, stock, image, is_available)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          categoryId,
          input.name,
          input.description,
          input.price,
          input.stock,
          input.image ?? null,
          input.available ? 1 : 0,
        ],
      );
      await insertAddons(conn, result.insertId, input.addons);
      await conn.commit();
      return result.insertId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async update(id: number, input: UpdateMenuInput, categoryId?: number): Promise<void> {
    const columns: Record<string, unknown> = {
      category_id: categoryId,
      name: input.name,
      description: input.description,
      price: input.price,
      stock: input.stock,
      image: input.image,
      is_available: input.available === undefined ? undefined : input.available ? 1 : 0,
    };
    // Hanya kolom yang benar-benar dikirim (undefined dilewati; image boleh null untuk menghapus).
    const entries = Object.entries(columns).filter(([, value]) => value !== undefined);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (entries.length > 0) {
        const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
        await conn.query(`UPDATE menu_items SET ${setClause} WHERE id = ?`, [
          ...entries.map(([, value]) => value),
          id,
        ]);
      }
      if (input.addons !== undefined) {
        await conn.query('DELETE FROM menu_addons WHERE menu_item_id = ?', [id]);
        await insertAddons(conn, id, input.addons);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async remove(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>('DELETE FROM menu_items WHERE id = ?', [id]);
    return result.affectedRows > 0;
  },
};

async function insertAddons(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  menuItemId: number,
  addons: Addons,
): Promise<void> {
  if (addons.length === 0) return;
  await conn.query('INSERT INTO menu_addons (menu_item_id, label, extra_price) VALUES ?', [
    addons.map((a) => [menuItemId, a.label, a.extra_price]),
  ]);
}
