import type { Request, Response } from 'express';
import { historyRepository } from '../../repositories/historyRepository.js';
import { storeSettingsRepository } from '../../repositories/storeSettingsRepository.js';
import { toStoreContactDto } from '../../utils/storeContact.js';
import type { OrderItemRow, OrderStatusDb } from '../../types/db.js';
import type { HistoryOrderRow } from '../../types/db.history.js';
import { AppError } from '../../utils/AppError.js';
import { FINISHED_STATUSES } from '../../utils/orderStatus.js';
import { ok } from '../../utils/response.js';
import { buildCsv, buildXlsx, type HistoryExportRecord } from '../../utils/historyExport.js';
import {
  exportHistoryQuerySchema,
  historyPeriodQuerySchema,
  listHistoryQuerySchema,
} from '../../validators/historyValidators.js';

/** 'HH:mm:ss' dari MySQL → 'HH:mm'. */
const hhmm = (time: string) => time.slice(0, 5);

const rupiah = new Intl.NumberFormat('id-ID');

/** Batas baris per laporan agar server tidak memuat seluruh tabel ke memori. */
const EXPORT_LIMIT = 10_000;

/** Info toko di struk. Samakan dengan konstanta yang kini ada di web/src/utils/history.ts. */
const STORE = {
  name: 'Yap Coffee',
  branch: 'Kaftek Area Kampus UB',
  address: 'Jl. MT Haryono No. 167, Dinoyo, Lowokwaru, Malang',
  whatsapp: '+62 812-8921-9921',
} as const;

/** Nilai filter status di frontend (HistoryStatus) → status di database. */
const STATUS_FROM_FILTER: Record<'selesai' | 'batal', OrderStatusDb> = {
  selesai: 'selesai',
  batal: 'dibatalkan',
};

/** Warna lingkaran inisial pelanggan (kelas Tailwind yang sama dengan data dummy frontend). */
const TONES = [
  'bg-peach text-mocha',
  'bg-honey text-mocha',
  'bg-[#e8ecd8] text-olive',
  'bg-sand text-bark',
] as const;

/** "Siti Nurhaliza" → "SN"; satu kata → dua huruf pertamanya. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters =
    words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`;
  return letters.toUpperCase();
}

/**
 * Label pembayaran di tabel. Frontend membedakan ikon QRIS dari "QRIS Instan";
 * selain itu dianggap pembayaran di tempat (ikon uang tunai).
 */
function payLabel(row: HistoryOrderRow): string {
  if (!row.pay_status) return 'Belum Dibayar';
  const channel = row.pay_channel ?? 'QRIS';
  return channel.toUpperCase() === 'QRIS' ? 'QRIS Instan' : channel;
}

/** "2x Americano + Croissant" — format kolom Detail Menu di tabel. */
function itemSummary(items: OrderItemRow[]): string {
  return items.map((i) => `${i.qty}x ${i.item_name}`).join(' + ');
}

/** Ukuran, level gula, dan catatan semua item digabung tanpa duplikat; kosong → catatan pesanan. */
function modSummary(items: OrderItemRow[], note: string | null): string {
  const mods = items
    .flatMap((i) => [i.size, i.sugar_level, i.notes])
    .filter((m): m is string => Boolean(m));
  const unique = [...new Set(mods)];
  return unique.length > 0 ? unique.join(', ') : (note ?? '-');
}

/** Bentuk satu baris tabel untuk frontend (src/types/history.ts → HistoryRow), plus kolom tambahan. */
function toHistoryRowDto(row: HistoryOrderRow, allItems: OrderItemRow[]) {
  const items = allItems.filter((i) => i.order_id === row.id);
  const start = hhmm(row.pickup_start);
  const end = hhmm(row.pickup_end);

  return {
    id: String(row.id),
    code: row.code,
    date: row.created_at.slice(0, 10),
    time: row.created_at.slice(11, 16), // frontend menambahkan " WIB" sendiri
    name: row.customer_name,
    ini: initials(row.customer_name),
    tone: TONES[row.customer_id % TONES.length],
    ph: row.customer_phone,
    item: itemSummary(items),
    mod: modSummary(items, row.note),
    spot: row.location,
    session: { name: row.schedule_name, hours: `${start} - ${end}` },
    total: rupiah.format(row.total),
    totalAmount: row.total,
    pay: payLabel(row),
    status: row.status === 'dibatalkan' ? ('batal' as const) : ('selesai' as const),
  };
}

/** Bentuk struk untuk frontend (src/types/receipt.ts → ReceiptData), plus `tax`. */
/** Data toko di struk: nama outlet dan WhatsApp mengikuti halaman Pengaturan. */
async function receiptStore(): Promise<{ name: string; branch: string; address: string; whatsapp: string }> {
  const settings = await storeSettingsRepository.get();
  const contact = toStoreContactDto(settings);
  return { ...STORE, name: settings.outletName, whatsapp: contact.whatsapp || STORE.whatsapp };
}

function toReceiptDto(
  row: HistoryOrderRow,
  items: OrderItemRow[],
  store: { name: string; branch: string; address: string; whatsapp: string },
) {
  const start = hhmm(row.pickup_start);
  const end = hhmm(row.pickup_end);
  const paid = row.pay_status === 'lunas';

  return {
    store,
    receiptNo: `STRUK-${row.created_at.slice(0, 10).replace(/-/g, '')}-${row.id}`,
    preOrderNo: `ORD-${row.id}`,
    transactionAt: row.created_at.replace(' ', 'T'), // '2024-10-24T09:15:00'
    customer: { name: row.customer_name, phone: row.customer_phone },
    items: items.map((i) => ({
      qty: i.qty,
      name: i.item_name,
      unitPrice: i.unit_price,
      lines: [
        i.size && { label: 'Ukuran', value: i.size },
        i.sugar_level && { label: 'Gula', value: i.sugar_level },
        i.notes && { label: 'Catatan', value: i.notes },
      ].filter((l): l is { label: string; value: string } => Boolean(l)),
    })),
    baristaNote: row.note ?? undefined,
    subtotal: row.subtotal,
    // ReceiptData di frontend belum punya `tax`; tambahkan agar rincian struk menjumlah ke total.
    tax: row.tax,
    packagingFee: row.packaging_fee,
    serviceFee: row.service_fee,
    total: row.total,
    paymentStatus: paid ? `Lunas via ${row.pay_channel ?? 'QRIS'}` : 'Belum Dibayar',
    payment: {
      channel: payLabel(row),
      rrn: row.pay_rrn ?? '-',
      pickupSlot: `${row.location} (${start} - ${end})`,
      handover: 'Selesai',
    },
  };
}

/** Filter status frontend → daftar status database. */
function statusesFor(filter: 'semua' | 'selesai' | 'batal'): OrderStatusDb[] {
  return filter === 'semua' ? FINISHED_STATUSES : [STATUS_FROM_FILTER[filter]];
}

/** Nomor order sering diketik dengan "#" di depan (placeholder kolom cari: "#ORD"). */
function normalizeSearch(q?: string): string | undefined {
  return q?.replace(/^#/, '').trim() || undefined;
}

/** Satu baris laporan; urutan sesuai HISTORY_EXPORT_COLUMNS. */
function toExportRecord(dto: ReturnType<typeof toHistoryRowDto>): HistoryExportRecord {
  return [
    `#ORD-${dto.id}`,
    dto.date,
    dto.time,
    dto.name,
    dto.ph,
    dto.item,
    dto.mod,
    dto.spot,
    dto.session.name + ' (' + dto.session.hours + ')',
    dto.pay,
    dto.totalAmount,
    dto.status === 'selesai' ? 'Selesai' : 'Dibatalkan',
  ];
}

/** Id dari URL harus bilangan bulat positif; selain itu dianggap tidak ditemukan. */
function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('Pesanan tidak ditemukan.');
  return id;
}

export const adminHistoryController = {
  /**
   * GET /api/admin/history?status=&month=&q=&page=&limit=
   * `status`: semua | selesai | batal. `month`: YYYY-MM atau semua.
   * Hanya pesanan yang sudah berakhir (selesai/dibatalkan); tanpa batas hari seperti halaman Orders.
   */
  async list(req: Request, res: Response) {
    const query = listHistoryQuerySchema.parse(req.query);
    const statuses = statusesFor(query.status);

    const { rows, total } = await historyRepository.list({
      statuses,
      month: query.month,
      search: normalizeSearch(query.q),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    const items = await historyRepository.listItems(rows.map((r) => r.id));

    ok(res, 'OK', {
      items: rows.map((row) => toHistoryRowDto(row, items)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    });
  },

  /** GET /api/admin/history/stats?month= — tiga kartu ringkasan di samping grafik. */
  async stats(req: Request, res: Response) {
    const { month } = historyPeriodQuerySchema.parse(req.query);
    const [counts, topMenu] = await Promise.all([
      historyRepository.stats(month),
      historyRepository.topMenu(month),
    ]);

    ok(res, 'OK', {
      month,
      completed: counts.completed,
      cancelled: counts.cancelled,
      total: counts.completed + counts.cancelled,
      topMenu, // { name, qty } atau null bila belum ada pesanan selesai
      revenue: counts.revenue,
    });
  },

  /**
   * GET /api/admin/history/revenue?month= — data grafik pendapatan.
   * month=YYYY-MM → 12 batang bulan di tahun itu; month=semua → satu batang per tahun.
   * `revenue: null` = belum ada pesanan selesai (frontend menggambar garis kosong).
   */
  async revenue(req: Request, res: Response) {
    const { month } = historyPeriodQuerySchema.parse(req.query);

    if (month === 'semua') {
      const byYear = await historyRepository.revenueByYear();
      const points = Object.entries(byYear)
        .map(([year, revenue]) => ({ key: year, year: Number(year), revenue }))
        .sort((a, b) => a.year - b.year);
      ok(res, 'OK', { mode: 'yearly' as const, points });
      return;
    }

    const year = Number(month.slice(0, 4));
    const byMonth = await historyRepository.revenueByMonth(year);
    const points = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
      return { key, revenue: byMonth[key] ?? null };
    });

    ok(res, 'OK', {
      mode: 'monthly' as const,
      year,
      points,
      // Pembanding tren untuk Januari (bulan sebelumnya jatuh di tahun lalu).
      previousDecember: byMonth[`${year - 1}-12`] ?? null,
    });
  },

  /** GET /api/admin/history/:id/receipt — tombol "Struk". Pesanan dibatalkan tidak punya struk. */
  async receipt(req: Request, res: Response) {
    const id = parseId(req);
    const row = await historyRepository.findFinishedById(id);
    if (!row) throw AppError.notFound('Pesanan tidak ditemukan.');
    if (row.status === 'dibatalkan') {
      throw new AppError(409, 'Pesanan yang dibatalkan tidak memiliki struk.');
    }
    ok(res, 'OK', toReceiptDto(row, await historyRepository.listItems([id]), await receiptStore()));
  },

  /**
   * GET /api/admin/history/export?format=csv|xlsx&status=&month=&q=
   * Mengunduh seluruh baris yang cocok dengan filter (bukan hanya satu halaman), terbaru di atas.
   */
  async export(req: Request, res: Response) {
    const query = exportHistoryQuerySchema.parse(req.query);

    const { rows, total } = await historyRepository.list({
      statuses: statusesFor(query.status),
      month: query.month,
      search: normalizeSearch(query.q),
      limit: EXPORT_LIMIT,
      offset: 0,
    });
    if (total > EXPORT_LIMIT) {
      throw new AppError(
        422,
        `Data terlalu banyak (${rupiah.format(total)} baris). Persempit filter hingga maksimal ${rupiah.format(EXPORT_LIMIT)} baris.`,
      );
    }

    const items = await historyRepository.listItems(rows.map((r) => r.id));
    const records = rows.map((row) => toExportRecord(toHistoryRowDto(row, items)));
    const filename = `riwayat-transaksi-${query.month}-${query.status}.${query.format}`;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (query.format === 'xlsx') {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(await buildXlsx(records));
    } else {
      res.type('text/csv; charset=utf-8');
      res.send(buildCsv(records));
    }
  },
};
