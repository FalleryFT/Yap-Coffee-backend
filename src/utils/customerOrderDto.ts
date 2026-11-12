import type { CustomerOrderItemRow, CustomerOrderRow } from '../repositories/customerOrderRepository.js';
import { coordinatesOf } from './mapsCoordinates.js';
import { hhmm } from './orderDto.js';

/**
 * Status untuk aplikasi pelanggan (mobile/lib/features/orders/data/order_model.dart → OrderStatus):
 * belum_dibayar → belum_diambil (sudah lunas, menunggu diambil) → selesai, atau dibatalkan.
 */
export type CustomerOrderStatus = 'belum_dibayar' | 'belum_diambil' | 'selesai' | 'dibatalkan';

export function customerStatus(row: CustomerOrderRow): CustomerOrderStatus {
  if (row.status === 'dibatalkan') return 'dibatalkan';
  if (row.status === 'selesai') return 'selesai';
  return row.pay_status === 'lunas' ? 'belum_diambil' : 'belum_dibayar';
}

export function toCustomerOrderDto(row: CustomerOrderRow, items: CustomerOrderItemRow[]) {
  return {
    id: row.code,
    orderId: row.id,
    status: customerStatus(row),
    // Status dapur: menunggu | meramu | siap_ambil | selesai | dibatalkan.
    kitchenStatus: row.status,
    ready: row.status === 'siap_ambil',
    createdAt: row.created_at, // 'YYYY-MM-DD HH:mm:ss'
    note: row.note ?? undefined,
    pickup: {
      date: row.schedule_date,
      start: hhmm(row.pickup_start),
      end: hhmm(row.pickup_end),
      batchName: row.schedule_name,
      location: row.location,
      locationDetail: row.location_detail ?? '',
      mapsUrl: row.maps_url ?? undefined,
      // Titik di peta aplikasi; tidak ada bila admin belum mengisinya.
      ...coordinatesOf(row),
    },
    items: items
      .filter((i) => i.order_id === row.id)
      .map((i) => ({
        name: i.item_name,
        qty: i.qty,
        unitPrice: i.unit_price,
        notes: [i.size, i.sugar_level, i.notes].filter((m): m is string => Boolean(m)).join(', '),
        image: i.image ?? undefined,
      })),
    subtotal: row.subtotal,
    tax: row.tax,
    serviceFee: row.service_fee,
    total: row.total,
    payment: {
      status: row.pay_status ?? 'belum_dibayar',
      channel: row.pay_channel ?? 'QRIS',
      rrn: row.pay_rrn ?? undefined,
      paidAt: row.pay_paid_at ?? undefined,
      // Hanya bermakna selama belum dibayar; klien menghitung mundur dari angka ini.
      secondsLeft:
        row.pay_status === 'belum_dibayar' ? Math.max(0, row.pay_seconds_left ?? 0) : 0,
    },
  };
}
