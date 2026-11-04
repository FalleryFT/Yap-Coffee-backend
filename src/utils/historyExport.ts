import ExcelJS from 'exceljs';

/** Satu baris laporan; urutannya mengikuti HISTORY_EXPORT_COLUMNS. */
export type HistoryExportRecord = (string | number)[];

export const HISTORY_EXPORT_COLUMNS = [
  { key: 'order', label: 'No. Order', width: 14 },
  { key: 'date', label: 'Tanggal', width: 12 },
  { key: 'time', label: 'Waktu', width: 8 },
  { key: 'name', label: 'Pelanggan', width: 24 },
  { key: 'phone', label: 'No. HP', width: 16 },
  { key: 'item', label: 'Detail Menu', width: 40 },
  { key: 'mod', label: 'Modifikasi', width: 30 },
  { key: 'spot', label: 'Titik Ambil', width: 24 },
  { key: 'session', label: 'Sesi', width: 24 },
  { key: 'pay', label: 'Pembayaran', width: 16 },
  { key: 'total', label: 'Total (Rp)', width: 14 },
  { key: 'status', label: 'Status', width: 12 },
] as const;

/**
 * Sel yang diawali = + - @ dianggap rumus oleh Excel. Nama pelanggan dan catatan berasal dari
 * input pengguna, jadi diberi awalan ' agar tidak dieksekusi (CSV injection).
 */
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV dengan pemisah titik koma dan BOM UTF-8: Excel dengan pengaturan regional Indonesia
 * memakai ; sebagai pemisah daftar, dan BOM menjaga huruf non-ASCII tetap benar.
 */
export function buildCsv(records: HistoryExportRecord[]): string {
  const header = HISTORY_EXPORT_COLUMNS.map((c) => csvCell(c.label)).join(';');
  const lines = records.map((r) => r.map(csvCell).join(';'));
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

export async function buildXlsx(records: HistoryExportRecord[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Yap Coffee';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Riwayat', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = HISTORY_EXPORT_COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.width }));
  // String ditulis sebagai teks biasa oleh exceljs (rumus hanya lewat objek { formula }), jadi aman.
  for (const record of records) sheet.addRow(record);

  sheet.getRow(1).font = { bold: true };
  sheet.getColumn('total').numFmt = '#,##0';
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: HISTORY_EXPORT_COLUMNS.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
