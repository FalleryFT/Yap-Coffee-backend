import { app } from './app.js';
import { assertDatabaseConnection } from './config/db.js';
import { env } from './config/env.js';
import { customerOrderRepository } from './repositories/customerOrderRepository.js';

const EXPIRE_INTERVAL_MS = 60_000;

async function main() {
  try {
    await assertDatabaseConnection();
  } catch (err) {
    console.error('Tidak dapat terhubung ke database. Periksa pengaturan di .env.');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Pesanan yang tidak dibayar sampai batas waktu dibatalkan dan stoknya dikembalikan.
  // Endpoint pesanan juga menjalankannya saat dibaca, jadi jeda satu menit tidak terlihat pengguna.
  const sweep = () =>
    customerOrderRepository
      .expireOverdue()
      .then((count) => {
        if (count > 0) console.log(`[pesanan] ${count} pesanan kedaluwarsa dibatalkan.`);
      })
      .catch((err) => console.error('[pesanan] gagal membatalkan pesanan kedaluwarsa:', err));
  void sweep();
  setInterval(sweep, EXPIRE_INTERVAL_MS).unref();

  app.listen(env.port, () => {
    console.log(`Yap Coffee API berjalan di http://localhost:${env.port}/api`);
  });
}

main();
