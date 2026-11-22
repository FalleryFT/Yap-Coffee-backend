import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { requireCustomerAuth } from '../middlewares/auth.js';
import {
  customerOrderRepository,
  type CustomerOrderRow,
} from '../repositories/customerOrderRepository.js';
import { menuRepository } from '../repositories/menuRepository.js';
import { scheduleRepository } from '../repositories/scheduleRepository.js';
import { AppError } from '../utils/AppError.js';
import { ozDetail } from '../utils/menuOptionsDto.js';
import { hhmm } from '../utils/orderDto.js';
import { ok } from '../utils/response.js';

/** Panjang maksimal satu pesan dan jumlah riwayat yang diteruskan ke layanan chatbot. */
const MAX_PESAN_LENGTH = 500;
const MAX_RIWAYAT_ITEMS = 6;

/** Model chatbot berjalan di CPU, jadi jawaban bisa lama; beri waktu sampai 120 detik. */
const CHAT_TIMEOUT_MS = 120_000;

const CHAT_UNAVAILABLE = 'Asisten sedang tidak tersedia, coba lagi nanti.';

// Dibatasi per token (header Authorization), bukan per alamat IP.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers.authorization?.trim() || 'tanpa-token',
  message: { success: false, message: 'Terlalu banyak pesan. Tunggu sebentar lalu coba lagi.' },
});

type ChatHistoryItem = {
  peran: 'user' | 'bot';
  isi: string;
};

/** Pesan wajib string, dipotong 500 karakter, dan tidak boleh kosong. */
function normalizePesan(raw: unknown): string {
  if (typeof raw !== 'string') throw new AppError(400, 'Pesan wajib diisi.');
  const pesan = raw.trim().slice(0, MAX_PESAN_LENGTH).trim();
  if (pesan.length === 0) throw new AppError(400, 'Pesan tidak boleh kosong.');
  return pesan;
}

/** Item riwayat yang bentuknya tidak dikenal dibuang; hanya 6 item terakhir yang dipakai. */
function normalizeRiwayat(raw: unknown): ChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];

  const items: ChatHistoryItem[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { peran, isi } = item as { peran?: unknown; isi?: unknown };
    if (peran !== 'user' && peran !== 'bot') continue;
    if (typeof isi !== 'string') continue;
    const text = isi.trim().slice(0, MAX_PESAN_LENGTH).trim();
    if (text.length === 0) continue;
    items.push({ peran, isi: text });
  }
  return items.slice(-MAX_RIWAYAT_ITEMS);
}

// ---------- Data dari database untuk chatbot ----------

const CACHE_MS = 60_000;
const MAX_MENU_ITEMS = 100;
const MAX_ORDERS = 3;
const MAX_SCHEDULES = 6;

/**
 * Blok data hanya dikirim bila pertanyaan (atau 2 pesan riwayat terakhir) menyangkutnya,
 * supaya prompt model kecil tetap pendek.
 */
const POLA_PESANAN = /pesanan|order|siap|diambil|status|bayar|kloter|batal|riwayat|isi pesan/i;
const POLA_RIWAYAT = /riwayat|selesai|dibatalkan|kemarin|sebelumnya|dulu|terakhir|pernah/i;
const POLA_JADWAL = /jadwal|kloter|jam|tanggal|lokasi|dimana|di mana|ambil|pengambilan|tutup|kapan|hari ini|besok|titik/i;
const POLA_BIAYA = /pajak|biaya|layanan|total|bayar|pembayaran|batas|harga final/i;

type ChatMenuItem = {
  nama: string;
  kategori: string;
  jenis: 'minuman' | 'makanan';
  harga: number;
  habis: boolean;
  deskripsi: string;
  tambahan: { label: string; biaya: number }[];
  /** Pilihan ukuran gelas menu ini (kosong bila admin tidak mengisinya atau menu makanan). */
  ukuran: { label: string; detail: string; tambahan: number }[];
  /** Pilihan tingkat manis menu ini. */
  manis: string[];
};

type ChatOptions = {
  ukuran: { label: string; detail: string; tambahan: number }[];
  manis: string[];
};

type Catalog = { menu: ChatMenuItem[]; opsi: ChatOptions | null };

type ChatScheduleItem = {
  nama: string;
  tanggal: string;
  mulai: string;
  selesai: string;
  batas_pesan: string;
  lokasi: string;
  detail_lokasi: string;
};

type ChatFees = {
  pajak_persen: number;
  biaya_layanan: number;
  batas_bayar_menit: number;
};

type ChatOrderItem = {
  nomor: string;
  status: string;
  tanggal: string;
  kloter: string;
  lokasi: string;
  total: number;
  item: { nama: string; jumlah: number; ukuran: string; manis: string; catatan: string }[];
};

let catalogCache: { at: number; data: Catalog } | null = null;

/**
 * Menu, tambahan, ukuran gelas, dan tingkat manis (fungsi yang sama dengan GET /api/menu).
 * Gagal = menu kosong dan tidak di-cache; chatbot akan mengatakan menu belum bisa dibaca.
 */
async function loadCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < CACHE_MS) return catalogCache.data;
  try {
    const rows = (await menuRepository.listAvailable()).slice(0, MAX_MENU_ITEMS);
    const ids = rows.map((r) => r.id);
    const [addons, sizes, sugarLevels] = await Promise.all([
      menuRepository.listAddons(ids),
      menuRepository.listSizes(ids),
      menuRepository.listSugarLevels(ids),
    ]);
    const data: Catalog = {
      menu: rows.map((row) => ({
        nama: row.name,
        kategori: row.category ?? '',
        jenis: row.menu_type,
        harga: Number(row.price),
        habis: row.stock <= 0,
        deskripsi: row.description ?? '',
        tambahan: addons
          .filter((a) => a.menu_item_id === row.id)
          .slice(0, 4)
          .map((a) => ({ label: a.label, biaya: Number(a.extra_price) })),
        ukuran: sizes
          .filter((x) => x.menu_item_id === row.id)
          .map((x) => ({ label: x.label, detail: ozDetail(x.oz), tambahan: Number(x.extra_price) })),
        manis: sugarLevels.filter((x) => x.menu_item_id === row.id).map((x) => x.label),
      })),
      // Pilihan ukuran dan manis sekarang ada di tiap menu (ukuran, manis), bukan daftar global.
      opsi: null,
    };
    catalogCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error('[chat] gagal membaca menu:', err);
    return { menu: [], opsi: null };
  }
}

/** Kloter pengambilan yang masih bisa dipesan (fungsi yang sama dengan GET /api/schedules). */
async function loadSchedules(): Promise<ChatScheduleItem[] | null> {
  try {
    const rows = await scheduleRepository.listOrderable();
    return rows.slice(0, MAX_SCHEDULES).map((row) => ({
      nama: row.name,
      tanggal: row.date,
      mulai: hhmm(row.pickup_start),
      selesai: hhmm(row.pickup_end),
      batas_pesan: hhmm(row.cut_off_time),
      lokasi: row.location,
      detail_lokasi: row.location_detail ?? '',
    }));
  } catch (err) {
    console.error('[chat] gagal membaca jadwal:', err);
    return null;
  }
}

/** Pajak, biaya layanan, dan batas bayar: nilai yang sama dengan yang dipakai saat pesanan dibuat. */
function loadFees(): ChatFees {
  return {
    pajak_persen: Math.round(Number(env.order.taxRate) * 10000) / 100,
    biaya_layanan: Number(env.order.serviceFee),
    batas_bayar_menit: Number(env.order.paymentWindowMinutes),
  };
}

/** Status dengan istilah yang sama seperti di aplikasi pelanggan. */
function statusLabel(row: CustomerOrderRow): string {
  if (row.status === 'dibatalkan') return 'Dibatalkan';
  if (row.status === 'selesai') return 'Selesai';
  if (row.pay_status !== 'lunas') {
    const minutes = Math.ceil(Math.max(0, row.pay_seconds_left ?? 0) / 60);
    return minutes > 0
      ? `Belum Dibayar (sisa waktu bayar ${minutes} menit)`
      : 'Belum Dibayar';
  }
  return row.status === 'siap_ambil' ? 'Siap Diambil' : 'Belum Diambil';
}

/**
 * Pesanan milik pelanggan ini saja (id dari token, bukan dari isi chat), lengkap dengan isinya.
 * Gagal = null, sehingga chatbot tidak mengaku "tidak ada pesanan" padahal datanya tidak terbaca.
 */
async function loadOrders(
  customerId: number,
  tab: 'active' | 'history',
): Promise<ChatOrderItem[] | null> {
  try {
    const rows = (await customerOrderRepository.listByCustomer(customerId, tab)).slice(
      0,
      MAX_ORDERS,
    );
    const items = await customerOrderRepository.listItems(rows.map((r) => r.id));
    return rows.map((row) => ({
      nomor: row.code,
      status: statusLabel(row),
      tanggal: row.schedule_date,
      kloter: `${row.schedule_name} ${hhmm(row.pickup_start)}-${hhmm(row.pickup_end)}`,
      lokasi: row.location,
      total: Number(row.total),
      item: items
        .filter((i) => i.order_id === row.id)
        .slice(0, 8)
        .map((i) => ({
          nama: i.item_name,
          jumlah: Number(i.qty),
          ukuran: i.size ?? '',
          manis: i.sugar_level ?? '',
          catatan: (i.notes ?? '').slice(0, 40),
        })),
    }));
  } catch (err) {
    console.error(`[chat] gagal membaca pesanan (${tab}):`, err);
    return null;
  }
}

// Antrean sederhana: permintaan ke model diproses satu per satu karena berjalan di CPU.
let antrean: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = antrean.then(task, task);
  antrean = result.catch(() => undefined);
  return result;
}

type ChatPayload = {
  pesan: string;
  riwayat: ChatHistoryItem[];
  menu: ChatMenuItem[];
  opsi: ChatOptions | null;
  jadwal: ChatScheduleItem[] | null;
  biaya: ChatFees | null;
  pesanan: ChatOrderItem[] | null;
  pesanan_lama: ChatOrderItem[] | null;
};

/** Memanggil layanan chatbot. Semua kegagalan (termasuk timeout) menjadi 503. */
async function askChatService(payload: ChatPayload): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const response = await fetch(env.chat.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new AppError(503, CHAT_UNAVAILABLE);

    const data = (await response.json()) as { jawaban?: unknown };
    const jawaban = typeof data.jawaban === 'string' ? data.jawaban.trim() : '';
    if (jawaban.length === 0) throw new AppError(503, CHAT_UNAVAILABLE);
    return jawaban;
  } catch (err) {
    // 401 sengaja tidak dipakai: aplikasi pelanggan otomatis keluar saat menerima 401.
    if (err instanceof AppError) throw err;
    console.error('[chat service]', err);
    throw new AppError(503, CHAT_UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}

/** Rute chatbot pelanggan (dipasang di /api). */
export const chatRoutes = Router();

chatRoutes.post('/chat', requireCustomerAuth, chatLimiter, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const pesan = normalizePesan(body.pesan);
    const riwayat = normalizeRiwayat(body.riwayat);

    // Pertanyaan lanjutan ("yang tadi?") ikut dihitung lewat 2 pesan riwayat terakhir.
    const customerId = req.customerId;
    const teks = [pesan, ...riwayat.slice(-2).map((r) => r.isi)].join(' ');
    const soalPesanan = POLA_PESANAN.test(teks);
    const soalRiwayat = soalPesanan && POLA_RIWAYAT.test(teks);

    const [catalog, jadwal, pesanan, pesananLama] = await Promise.all([
      loadCatalog(),
      POLA_JADWAL.test(teks) ? loadSchedules() : Promise.resolve(null),
      customerId !== undefined && soalPesanan
        ? loadOrders(customerId, 'active')
        : Promise.resolve(null),
      customerId !== undefined && soalRiwayat
        ? loadOrders(customerId, 'history')
        : Promise.resolve(null),
    ]);
    const biaya = POLA_BIAYA.test(teks) ? loadFees() : null;

    console.log(
      `[chat] menu=${catalog.menu.length} jadwal=${jadwal === null ? '-' : jadwal.length} ` +
        `biaya=${biaya ? 'ya' : '-'} pesanan=${pesanan === null ? '-' : pesanan.length} ` +
        `riwayat=${pesananLama === null ? '-' : pesananLama.length}`,
    );

    const jawaban = await runExclusive(() =>
      askChatService({
        pesan,
        riwayat,
        menu: catalog.menu,
        opsi: catalog.opsi,
        jadwal,
        biaya,
        pesanan,
        pesanan_lama: pesananLama,
      }),
    );
    ok(res, 'OK', { jawaban });
  } catch (err) {
    next(err);
  }
});