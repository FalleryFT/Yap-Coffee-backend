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

  cloudinary: {
    cloudName: required('CLOUDINARY_CLOUD_NAME'),
    apiKey: required('CLOUDINARY_API_KEY'),
    apiSecret: required('CLOUDINARY_API_SECRET'),
    folder: process.env.CLOUDINARY_FOLDER ?? 'yap-coffee',
  },

  upload: {
    maxImageBytes: 2 * 1024 * 1024,
  },

  otp: {
    length: 4,
    codeTtlMinutes: 5, // umur kode OTP
    resetTokenTtlMinutes: 15, // umur reset_token setelah OTP terverifikasi
    resendCooldownSeconds: 60, // jeda minimum sebelum boleh minta OTP baru
    maxAttempts: 5, // salah tebak yang diizinkan per OTP sebelum OTP itu hangus
  },

  // Info toko yang ditampilkan di aplikasi pelanggan (tombol Hubungi Penjual dan Instagram).
  store: {
    name: process.env.STORE_NAME ?? 'Yap Coffee',
    // Hanya cadangan bila tabel store_settings kosong; nilai yang berlaku diatur admin di halaman Pengaturan.
    whatsapp: process.env.STORE_WHATSAPP ?? '081231242277',
    instagram: process.env.STORE_INSTAGRAM ?? 'https://www.instagram.com/yap_coffee_/',
  },

  // Aturan harga dan pembayaran pesanan; server yang menghitung, bukan klien.
  order: {
    taxRate: 0.11,
    serviceFee: 2000,
    paymentWindowMinutes: 10, // batas waktu bayar sebelum pesanan dibatalkan otomatis
    // Ukuran, tingkat manis, dan jenis kategori (minuman/makanan) diatur admin di database.
  },

  // Layanan chatbot (FastAPI) yang menjawab pertanyaan pelanggan.
  chat: {
    url: process.env.CHAT_SERVICE_URL ?? 'http://127.0.0.1:8000/chat',
  },

  payment: {
    // Hanya untuk uji coba. Di produksi set PAYMENT_SIMULATED=false.
    simulated: (process.env.PAYMENT_SIMULATED ?? 'true') === 'true',
  },
} as const;
