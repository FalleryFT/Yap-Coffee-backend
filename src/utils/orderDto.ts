import type { OrderItemRow, OrderRow } from '../types/db.js';
import { STATUS_LABEL } from './orderStatus.js';

/** 'HH:mm:ss' dari MySQL → 'HH:mm'. */
export const hhmm = (time: string) => time.slice(0, 5);

const PAYMENT_LABEL = {
  lunas: 'Lunas',
  belum_dibayar: 'Belum Dibayar',
  kedaluwarsa: 'Kedaluwarsa',
} as const;

/** "QRIS Lunas", "QRIS Belum Dibayar", dst. Pesanan tanpa baris pembayaran dianggap belum bayar. */
function payLabel(row: OrderRow): string {
  if (!row.pay_status) return 'Belum Dibayar';
  return `${row.pay_channel ?? 'QRIS'} ${PAYMENT_LABEL[row.pay_status]}`;
}

function toItemDto(row: OrderItemRow) {
  return {
    qty: row.qty,
    name: row.item_name,
    // Frontend memakai harga total per baris (harga satuan × jumlah), lihat itemsSubtotal di utils/orders.ts.
    price: row.unit_price * row.qty,
    mods: [row.size, row.sugar_level, row.notes].filter((m): m is string => Boolean(m)),
  };
}

/** Bentuk satu pesanan untuk frontend (src/types/orders.ts → Order). Dipakai halaman Orders dan Dashboard. */
export function toOrderDto(row: OrderRow, items: OrderItemRow[]) {
  const start = hhmm(row.pickup_start);
  const end = hhmm(row.pickup_end);
  const location = [row.location, row.location_detail].filter(Boolean).join(', ');

  return {
    id: String(row.id),
    code: row.code,
    date: row.created_at.slice(0, 10),
    time: `${row.created_at.slice(11, 16)} WIB`,
    name: row.customer_name,
    phone: row.customer_phone,
    items: items.filter((i) => i.order_id === row.id).map(toItemDto),
    // Skema belum punya slot per pesanan, jadi jendela pickup = jam buka kloter-nya.
    window: `${start} - ${end}`,
    kloter: {
      name: row.schedule_name,
      date: row.schedule_date,
      hours: `${start.replace(':', '.')} - ${end.replace(':', '.')}`,
    },
    pickup: {
      name: row.location,
      detail: row.location_detail ?? '',
      // Skema belum menyimpan area dan patokan rute; dikirim kosong agar bentuknya tetap sama.
      area: '',
      route: '',
      mapsQuery: location,
      mapsUrl: row.maps_url ?? undefined,
    },
    note: row.note ?? undefined,
    subtotal: row.subtotal,
    tax: row.tax,
    serviceFee: row.service_fee,
    packagingFee: row.packaging_fee,
    total: row.total,
    pay: payLabel(row),
    paid: row.pay_status === 'lunas',
    status: STATUS_LABEL[row.status],
  };
}
