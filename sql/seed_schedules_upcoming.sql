-- Jadwal pre-order yang tanggalnya RELATIF terhadap hari ini, supaya selalu ada kloter yang bisa
-- dipesan saat uji coba (jadwal di seed.sql bertanggal tetap dan cepat kedaluwarsa).
-- Jalankan kapan saja; tiap eksekusi menambah 3 jadwal baru untuk besok dan lusa.

INSERT INTO pickup_schedules
  (name, date, location, location_detail, maps_url, pickup_start, pickup_end, cut_off_time, status)
VALUES
  ('Kloter Pagi Kampus', CURDATE() + INTERVAL 1 DAY,
   'Drop Box Gazebo Tengah Lantai 1',
   'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
   'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
   '08:00:00', '11:30:00', '07:00:00', 'aktif'),
  ('Kloter Siang Kampus', CURDATE() + INTERVAL 1 DAY,
   'Drop Box Gazebo Tengah Lantai 1',
   'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
   'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
   '13:00:00', '15:30:00', '11:00:00', 'aktif'),
  ('Kloter Pagi Kampus', CURDATE() + INTERVAL 2 DAY,
   'Drop Box Gazebo Tengah Lantai 1',
   'Gedung FT Sipil UB, area Kampus Universitas Brawijaya',
   'https://www.google.com/maps/search/?api=1&query=Gedung+Sipil+Universitas+Brawijaya',
   '08:00:00', '11:30:00', '07:00:00', 'aktif');
