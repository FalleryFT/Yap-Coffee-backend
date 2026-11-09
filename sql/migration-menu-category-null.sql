-- Migrasi untuk database yang sudah dibuat sebelum kategori menu opsional.
-- Setelah migrasi ini, menghapus kategori tidak lagi menghapus/menolak menu:
-- menu di kategori tersebut menjadi tanpa kategori (hanya tampil di filter "Semua").
--
-- Jalankan sekali, contoh: mysql -u root yap_coffee < sql/migration-menu-category-null.sql

ALTER TABLE menu_items DROP FOREIGN KEY fk_menu_items_category;
ALTER TABLE menu_items MODIFY category_id INT UNSIGNED NULL;
ALTER TABLE menu_items
  ADD CONSTRAINT fk_menu_items_category
    FOREIGN KEY (category_id) REFERENCES menu_categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
