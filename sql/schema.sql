-- Skema database Yap Coffee (hanya struktur tabel, tanpa data).
-- Jalankan di database yang sudah dibuat, misalnya lewat HeidiSQL (menu Database di Laragon)
-- atau: mysql -u root yap_coffee < sql/schema.sql
-- Data awal ada di berkas terpisah: seed.sql (jalankan setelah berkas ini).

-- ============================================================
-- Akun dan autentikasi
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(191) NOT NULL,
  username      VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(32)  NOT NULL DEFAULT 'admin',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(191) NOT NULL,
  email         VARCHAR(191) NOT NULL UNIQUE,
  phone         VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_updated_at DATETIME NULL,
  -- Saklar Notifikasi di aplikasi. Bila 0, server tidak membuatkan notifikasi untuk pelanggan ini.
  notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
  -- Nama berkas foto profil di uploads/avatars; NULL = memakai foto bawaan aplikasi.
  avatar        VARCHAR(64) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Satu baris per permintaan OTP (bukan satu baris per email) sehingga riwayat tetap ada
-- dan jeda kirim-ulang bisa dihitung dari created_at baris paling baru.
-- Kolom email sengaja tanpa foreign key: OTP bisa diminta sebelum akun ada.
CREATE TABLE IF NOT EXISTS otp_codes (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email                   VARCHAR(191) NOT NULL,
  code                    CHAR(4)      NOT NULL,
  attempts                TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- salah tebak; dibatasi env.otp.maxAttempts
  -- Diisi saat OTP terverifikasi; dipakai ulang sebagai bukti pada langkah ganti sandi.
  reset_token             VARCHAR(96),
  expires_at              DATETIME     NOT NULL,
  consumed_at             DATETIME,
  reset_token_expires_at  DATETIME,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_email (email),
  INDEX idx_otp_reset_token (reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Menu
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_categories (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(64) NOT NULL UNIQUE,
  -- Jenis kategori: 1 = minuman (pelanggan memilih ukuran dan tingkat manis), 0 = makanan (tanpa pilihan).
  has_options TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- NULL = menu tanpa kategori (hanya tampil di filter "Semua"). Diisi NULL otomatis
  -- saat kategori dihapus, jadi menunya tidak ikut terhapus.
  category_id  INT UNSIGNED NULL,
  name         VARCHAR(191) NOT NULL,
  description  TEXT,
  price        INT UNSIGNED NOT NULL,            -- rupiah, tanpa format
  stock        INT UNSIGNED NOT NULL DEFAULT 0,  -- sisa stok harian
  image        VARCHAR(255),
  is_available TINYINT(1)   NOT NULL DEFAULT 1,  -- 0 = disembunyikan dari katalog pre-order pelanggan
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_menu_items_category (category_id),
  CONSTRAINT fk_menu_items_category
    FOREIGN KEY (category_id) REFERENCES menu_categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_addons (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  menu_item_id  INT UNSIGNED NOT NULL,
  label         VARCHAR(64)  NOT NULL,            -- contoh: Oat Milk
  extra_price   INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_menu_addons_item (menu_item_id),
  CONSTRAINT fk_menu_addons_item
    FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Jadwal pre-order (kloter pengambilan)
-- ============================================================

CREATE TABLE IF NOT EXISTS pickup_schedules (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(191) NOT NULL,         -- nama kloter
  date             DATE         NOT NULL,
  location         VARCHAR(191) NOT NULL,
  location_detail  VARCHAR(255),
  maps_url         VARCHAR(500),
  latitude         DECIMAL(10,7) NULL,            -- titik di peta aplikasi pelanggan
  longitude        DECIMAL(10,7) NULL,
  pickup_start     TIME         NOT NULL,
  pickup_end       TIME         NOT NULL,
  cut_off_time     TIME         NOT NULL,
  status           ENUM('mendatang','aktif','selesai') NOT NULL DEFAULT 'mendatang',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pickup_schedules_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Pesanan dan pembayaran
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20)  NOT NULL UNIQUE,    -- contoh: WK-8493
  customer_id    INT UNSIGNED NOT NULL,
  schedule_id    INT UNSIGNED NOT NULL,
  status         ENUM('menunggu','meramu','siap_ambil','selesai','dibatalkan')
                 NOT NULL DEFAULT 'menunggu',
  note           TEXT,
  subtotal       INT UNSIGNED NOT NULL,
  tax            INT UNSIGNED NOT NULL DEFAULT 0,
  service_fee    INT UNSIGNED NOT NULL DEFAULT 0,
  packaging_fee  INT UNSIGNED NOT NULL DEFAULT 0,
  total          INT UNSIGNED NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_customer (customer_id),
  INDEX idx_orders_schedule (schedule_id),
  INDEX idx_orders_status (status),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_schedule
    FOREIGN KEY (schedule_id) REFERENCES pickup_schedules (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- item_name dan unit_price adalah salinan saat pesanan dibuat,
-- supaya riwayat dan struk tidak berubah ketika menu diedit.
CREATE TABLE IF NOT EXISTS order_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id      INT UNSIGNED NOT NULL,
  menu_item_id  INT UNSIGNED NOT NULL,
  item_name     VARCHAR(191) NOT NULL,
  unit_price    INT UNSIGNED NOT NULL,
  qty           INT UNSIGNED NOT NULL,
  size          VARCHAR(32),
  sugar_level   VARCHAR(32),
  notes         VARCHAR(255),
  INDEX idx_order_items_order (order_id),
  INDEX idx_order_items_menu (menu_item_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_menu
    FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL UNIQUE,       -- satu pesanan, satu pembayaran
  channel     VARCHAR(32)  NOT NULL DEFAULT 'QRIS',
  rrn         VARCHAR(32),
  status      ENUM('belum_dibayar','lunas','kedaluwarsa') NOT NULL DEFAULT 'belum_dibayar',
  expires_at  DATETIME,
  paid_at     DATETIME,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pengaturan toko yang bisa diganti admin kapan saja tanpa deploy ulang (halaman Pengaturan di web admin).
CREATE TABLE IF NOT EXISTS store_settings (
  setting_key   VARCHAR(64)  NOT NULL PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nilai awal; INSERT IGNORE supaya nilai yang sudah diganti admin tidak tertimpa saat skema dijalankan ulang.
INSERT IGNORE INTO store_settings (setting_key, setting_value) VALUES
  ('whatsapp',  '081234567890'),
  ('instagram', 'https://www.instagram.com/yap_coffee_/');

-- Notifikasi dalam aplikasi untuk pelanggan: pesanan siap diambil dan menu baru.
-- `ref` = kode pesanan (order_ready) atau id menu (new_menu), dipakai aplikasi untuk membuka halaman terkait.
CREATE TABLE IF NOT EXISTS notifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  type        ENUM('order_ready','new_menu') NOT NULL,
  title       VARCHAR(191) NOT NULL,
  body        VARCHAR(500) NOT NULL,
  ref         VARCHAR(64),
  read_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_customer (customer_id, id),
  CONSTRAINT fk_notifications_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pilihan ukuran gelas dan tingkat manis yang tampil di aplikasi pelanggan. Diatur admin di web (Pengaturan).
-- Pesanan menyimpan namanya sebagai teks, jadi mengubah atau menghapus pilihan tidak merusak pesanan lama.
CREATE TABLE IF NOT EXISTS menu_sizes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(32) NOT NULL UNIQUE,
  detail      VARCHAR(64) NOT NULL DEFAULT '',        -- contoh: '16 oz'
  extra_price INT UNSIGNED NOT NULL DEFAULT 0,        -- tambahan harga per gelas
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sugar_levels (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(32) NOT NULL UNIQUE,
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO menu_sizes (label, detail, extra_price, is_default, sort_order) VALUES
  ('Reguler', '16 oz', 0, 1, 1),
  ('Large',   '22 oz', 5000, 0, 2);

INSERT IGNORE INTO sugar_levels (label, is_default, sort_order) VALUES
  ('Normal', 0, 1),
  ('Less Sugar', 1, 2),
  ('No Sugar', 0, 3);

INSERT IGNORE INTO store_settings (setting_key, setting_value) VALUES
  ('outlet_name', 'Yap Coffee');
