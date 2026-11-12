-- Data awal Yap Coffee untuk uji coba. Jalankan SETELAH schema.sql.
-- Aman dijalankan berulang: baris dengan id atau kode yang sama tidak diduplikasi.
-- HAPUS atau GANTI sandinya sebelum ke produksi.
--
-- Akun demo
--   Admin     username: admin                  sandi: admin123
--   Pelanggan email:    tetangga@yapcoffee.id   sandi: password123

-- ============================================================
-- Akun
-- ============================================================

INSERT INTO admins (name, username, password_hash, role)
VALUES (
  'Admin Gerai',
  'admin',
  '$2b$10$mk3eruM2DL42NFiTH2Y5Zu6MgzN2McWUvWWyJx1WAcQRoCuXUhRua',
  'admin'
)
-- Menjalankan ulang berkas ini mereset sandi admin demo ke admin123,
-- sengaja dibuat begitu supaya kredensial demo selalu bisa diandalkan.
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name);

INSERT INTO customers (name, email, phone, password_hash)
VALUES (
  'Tetangga Yap',
  'tetangga@yapcoffee.id',
  '+6281234567890',
  '$2b$10$2sEzAaIfS7Y4/o7WntEs3uGylhdlw3Gh/.S40vb1NcIbHHNwsn8Fa'
)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name);

-- ============================================================
-- Menu
-- ============================================================

INSERT IGNORE INTO menu_categories (id, name, has_options) VALUES
  (1, 'Kopi Susu', 1),
  (2, 'Manual Brew', 1),
  (3, 'Non-Coffee', 1),
  (4, 'Makanan Ringan', 0);

INSERT IGNORE INTO menu_items (id, category_id, name, description, price, stock, image) VALUES
  (1, 1, 'Yap Latte',               'Signature palm sugar dengan susu gurih',                      22000, 40, 'yap_latte.png'),
  (2, 1, 'Es Kopi Susu Gula Aren',  'Double shot robusta-arabika dipadu susu segar dan gula aren', 22000, 35, 'es_kopi_susu.png'),
  (3, 1, 'Cappuccino',              'Espresso bold dengan microfoam susu lembut',                  25000, 25, 'cappuccino.png'),
  (4, 2, 'V60 Pour Over',           'Seduhan manual pour over dengan rasa bersih dan berkarakter', 30000, 20, 'v60_pour_over.png'),
  (5, 2, 'V60 Gayo Beans',          'Arabika Aceh Gayo fermentasi anaerobik',                      30000, 15, 'v60_gayo.png'),
  (6, 3, 'Matcha Latte Dingin',     'Premium Uji matcha',                                          28000, 18, 'matcha_latte.png'),
  (7, 4, 'Butter Croissant',        'Hangat dan renyah',                                           25000, 12, 'butter_croissant.png');

INSERT IGNORE INTO menu_addons (id, menu_item_id, label, extra_price) VALUES
  (1,  1, 'Oat Milk',   5000),
  (2,  1, 'Extra Shot', 5000),
  (3,  2, 'Oat Milk',   5000),
  (4,  2, 'Extra Shot', 5000),
  (5,  3, 'Oat Milk',   5000),
  (6,  3, 'Extra Shot', 5000),
  (7,  6, 'Oat Milk',   5000),
  (8,  7, 'Hangatkan',  0);

-- ============================================================
-- Jadwal pre-order (lokasi dan jam adalah contoh, sesuaikan dengan gerai)
-- ============================================================

INSERT IGNORE INTO pickup_schedules
  (id, name, date, location, location_detail, maps_url, pickup_start, pickup_end, cut_off_time, status)
VALUES
  (1, 'Kloter Pagi Kampus', '2026-11-04',
      'Drop Box Gazebo Tengah Lantai 1',
      'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
      'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
      '08:00:00', '14:00:00', '07:00:00', 'aktif'),
  (2, 'Kloter Siang Kampus', '2026-11-05',
      'Drop Box Gazebo Tengah Lantai 1',
      'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
      'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
      '11:00:00', '14:00:00', '09:00:00', 'mendatang'),
  (3, 'Kloter Sore Kampus', '2026-11-06',
      'Drop Box Gazebo Tengah Lantai 1',
      'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
      'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
      '15:00:00', '18:00:00', '13:00:00', 'mendatang'),
  (4, 'Kloter Pagi Kampus', '2026-10-28',
      'Drop Box Gazebo Tengah Lantai 1',
      'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
      'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
      '08:00:00', '14:00:00', '07:00:00', 'selesai');

-- ============================================================
-- Pesanan contoh
-- Rumus total: subtotal + pajak 11% (dibulatkan) + biaya layanan Rp2.000
-- ============================================================

INSERT IGNORE INTO orders
  (id, code, customer_id, schedule_id, status, note, subtotal, tax, service_fee, packaging_fee, total, created_at)
VALUES
  -- Pesanan aktif, sudah dibayar
  (1, 'WK-8493',  1, 1, 'menunggu',   NULL, 69000, 7590, 2000, 0, 78590, '2026-11-03 06:30:00'),
  -- Pesanan aktif, belum dibayar
  (2, 'WK-8492',  1, 1, 'menunggu',   NULL, 55000, 6050, 2000, 0, 63050, '2026-11-03 06:45:00'),
  -- Riwayat: selesai
  (3, 'WK-82910', 1, 4, 'selesai',    NULL, 47000, 5170, 2000, 0, 54170, '2026-10-28 07:10:00'),
  -- Riwayat: dibatalkan karena pembayaran kedaluwarsa
  (4, 'WK-82845', 1, 4, 'dibatalkan', NULL, 28000, 3080, 2000, 0, 33080, '2026-10-28 07:20:00');

INSERT IGNORE INTO order_items
  (id, order_id, menu_item_id, item_name, unit_price, qty, size, sugar_level, notes)
VALUES
  (1, 1, 1, 'Yap Latte',            22000, 2, 'Regular', 'Less Sugar', 'Extra Shot'),
  (2, 1, 7, 'Butter Croissant',     25000, 1, NULL,      NULL,         'Hangatkan'),
  (3, 2, 3, 'Cappuccino',           25000, 1, 'Regular', 'Normal',     NULL),
  (4, 2, 4, 'V60 Pour Over',        30000, 1, NULL,      NULL,         NULL),
  (5, 3, 1, 'Yap Latte',            22000, 1, 'Regular', 'Normal',     NULL),
  (6, 3, 7, 'Butter Croissant',     25000, 1, NULL,      NULL,         NULL),
  (7, 4, 6, 'Matcha Latte Dingin',  28000, 1, 'Regular', 'Normal',     NULL);

INSERT IGNORE INTO payments
  (id, order_id, channel, rrn, status, expires_at, paid_at)
VALUES
  (1, 1, 'QRIS', '260311063012', 'lunas',         '2026-11-03 06:40:00', '2026-11-03 06:32:00'),
  (2, 2, 'QRIS', NULL,           'belum_dibayar', '2026-11-03 06:55:00', NULL),
  (3, 3, 'QRIS', '260210071145', 'lunas',         '2026-10-28 07:20:00', '2026-10-28 07:12:00'),
  (4, 4, 'QRIS', NULL,           'kedaluwarsa',   '2026-10-28 07:30:00', NULL);
