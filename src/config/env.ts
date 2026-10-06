import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variabel lingkungan ${name} wajib diisi. Lihat .env.example.`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),

  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME', 'yap_coffee'),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  // Daftar origin yang boleh mengakses API ini, dipisah koma di .env.
  corsOrigins: required('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  otp: {
    length: 4,
    codeTtlMinutes: 5, // umur kode OTP
    resetTokenTtlMinutes: 15, // umur reset_token setelah OTP terverifikasi
    resendCooldownSeconds: 60, // jeda minimum sebelum boleh minta OTP baru
  },
} as const;
