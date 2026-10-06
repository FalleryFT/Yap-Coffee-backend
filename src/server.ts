import { app } from './app.js';
import { assertDatabaseConnection } from './config/db.js';
import { env } from './config/env.js';

async function main() {
  try {
    await assertDatabaseConnection();
  } catch (err) {
    console.error('Tidak dapat terhubung ke database. Periksa pengaturan di .env.');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Yap Coffee API berjalan di http://localhost:${env.port}/api`);
  });
}

main();
