import { app } from './app.js';
import { assertDatabaseConnection } from './config/db.js';
import { env } from './config/env.js';
import { customerOrderRepository } from './repositories/customerOrderRepository.js';
import { otpRepository } from './repositories/otpRepository.js';
import { logger } from './utils/logger.js';
import { verifyMailer } from './utils/mailer.js';

const EXPIRE_INTERVAL_MS = 60_000;
const OTP_PURGE_INTERVAL_MS = 60 * 60_000;

// Galat yang lolos dari semua penanganan: catat dengan format yang sama, lalu keluar
// (perilaku bawaan Node tetap, hanya lognya yang rapi).
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  process.exit(1);
});

async function main() {
  try {
    await assertDatabaseConnection();
  } catch (err) {
    logger.fatal({ err }, 'Tidak dapat terhubung ke database. Periksa pengaturan di .env.');
    process.exit(1);
  }

  await verifyMailer();

  // Pesanan yang tidak dibayar sampai batas waktu dibatalkan dan stoknya dikembalikan.
  // Endpoint pesanan juga menjalankannya saat dibaca, jadi jeda satu menit tidak terlihat pengguna.
  const sweep = () =>
    customerOrderRepository
      .expireOverdue()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'Pesanan kedaluwarsa dibatalkan.');
      })
      .catch((err) => logger.error({ err }, 'Gagal membatalkan pesanan kedaluwarsa.'));
  void sweep();
  setInterval(sweep, EXPIRE_INTERVAL_MS).unref();

  // Baris OTP lama (terpakai, kedaluwarsa, atau pencatat email tak terdaftar) dibersihkan tiap jam.
  const purgeOtp = () =>
    otpRepository
      .purgeOld()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'Baris OTP lama dibersihkan.');
      })
      .catch((err) => logger.error({ err }, 'Gagal membersihkan baris OTP lama.'));
  void purgeOtp();
  setInterval(purgeOtp, OTP_PURGE_INTERVAL_MS).unref();

  app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, `Yap Coffee API berjalan di http://localhost:${env.port}/api`);
  });
}

void main();
