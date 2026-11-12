import type { Request, Response } from 'express';
import { dashboardRepository } from '../../repositories/dashboardRepository.js';
import { orderRepository } from '../../repositories/orderRepository.js';
import { hhmm, toOrderDto } from '../../utils/orderDto.js';
import { ACTIVE_STATUSES } from '../../utils/orderStatus.js';
import { ok } from '../../utils/response.js';
import { dashboardQuerySchema } from '../../validators/dashboardValidators.js';

/** Menu yang tampil di kartu "Menu Terlaris". */
const TOP_MENU_LIMIT = 4;

/** Label hari Senin → Minggu, sama dengan sumbu X grafik pendapatan di frontend. */
const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const;

/** Antrean di dashboard: pesanan aktif dan yang sudah selesai hari ini (yang dibatalkan tidak ditampilkan). */
const QUEUE_STATUSES = [...ACTIVE_STATUSES, 'selesai' as const];

/** Geser tanggal 'YYYY-MM-DD' sebanyak n hari. Memakai UTC supaya zona waktu server Node tidak ikut campur. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Selisih persen dibanding pembanding, satu angka desimal. null bila pembanding 0 (tidak bisa dibagi nol). */
function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const formatPercent = (value: number) => `${(Math.round(value * 10) / 10).toFixed(1)}%`;

export const adminDashboardController = {
  /**
   * GET /api/admin/dashboard?q=&queueLimit=
   * Semua data halaman Dashboard dalam satu permintaan. Jumlah "hari ini" mengikuti tanggal server
   * database (CURDATE()), sama dengan GET /api/admin/orders/stats.
   */
  async overview(req: Request, res: Response) {
    const query = dashboardQuerySchema.parse(req.query);

    const [calendar, byStatus, stats, yesterdayCount, daily, topRows, totalSold, batch, queue] =
      await Promise.all([
        dashboardRepository.calendar(),
        orderRepository.countActiveByStatus(),
        dashboardRepository.todayStats(),
        orderRepository.countCreatedDaysAgo(1),
        dashboardRepository.dailyRevenue(),
        dashboardRepository.topMenu(TOP_MENU_LIMIT),
        dashboardRepository.totalItemsSold(),
        dashboardRepository.nextNewOrderBatch(),
        orderRepository.list({
          statuses: QUEUE_STATUSES,
          createdToday: true,
          search: query.q?.replace(/^#/, '').trim() || undefined,
          limit: query.queueLimit,
          offset: 0,
        }),
      ]);
    const queueItems = await orderRepository.listItems(queue.rows.map((r) => r.id));

    // ---- Banner "Pesanan Baru Masuk" ----------------------------------------------------------
    const newCount = byStatus.menunggu ?? 0;
    const newOrderAlert =
      newCount > 0 && batch
        ? {
            count: newCount,
            pickupTime: `${hhmm(batch.pickupStart)} WIB`,
            // Banner cukup menyebut beberapa nama pertama.
            customers: batch.customers.slice(0, 3),
          }
        : null;

    // ---- Ringkasan hari ini -------------------------------------------------------------------
    const summary = {
      totalOrders: stats.totalOrders,
      // Dibanding kemarin; null bila kemarin kosong.
      trendPercent: changePercent(stats.totalOrders, yesterdayCount),
      // Pesanan yang kini ada di rak pengambilan, termasuk yang masuk hari sebelumnya.
      readyForPickup: byStatus.siap_ambil ?? 0,
      completed: stats.completed,
      // Skema belum punya waktu "diambil", jadi dihitung dari updated_at pesanan selesai
      // terhadap jam tutup kloter. Perkiraan, bukan angka pasti. null bila belum ada yang selesai.
      onTimePercent: stats.completed === 0 ? null : Math.round((stats.onTime / stats.completed) * 100),
      revenue: stats.revenue,
      averagePerOrder: stats.paidOrders === 0 ? 0 : Math.round(stats.revenue / stats.paidOrders),
    };

    // ---- Pendapatan mingguan (Senin–Minggu) ---------------------------------------------------
    const { today, weekStart } = calendar;
    const points = DAY_LABELS.map((day, i) => {
      const date = addDays(weekStart, i);
      return {
        day,
        date,
        // Hari yang belum tiba berisi null (grafik menggambar garis tipis), bukan 0.
        revenue: date > today ? null : (daily[date] ?? 0),
        ...(date === today ? { isToday: true } : {}),
      };
    });

    // Tren: pekan ini sampai hari ini dibanding hari yang sama pekan lalu.
    let thisWeek = 0;
    let lastWeek = 0;
    DAY_LABELS.forEach((_, i) => {
      if (addDays(weekStart, i) > today) return;
      thisWeek += daily[addDays(weekStart, i)] ?? 0;
      lastWeek += daily[addDays(weekStart, i - 7)] ?? 0;
    });

    // ---- Menu terlaris ------------------------------------------------------------------------
    const topItems = topRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      // Nama berkas foto; frontend membentuk URL /uploads/menu/<berkas>, sama seperti halaman Menu.
      image: row.image ?? undefined,
      sold: row.sold,
      share: totalSold === 0 ? '0.0%' : formatPercent((row.sold / totalSold) * 100),
      unit: row.hasOptions ? 'cup' : 'porsi',
    }));
    const topSold = topRows.reduce((sum, row) => sum + row.sold, 0);

    ok(res, 'OK', {
      generatedAt: new Date().toISOString(),
      newOrderAlert,
      summary,
      weeklyRevenue: { points, trendPercent: changePercent(thisWeek, lastWeek) },
      topMenu: {
        items: topItems,
        contribution: totalSold === 0 ? '0.0%' : formatPercent((topSold / totalSold) * 100),
      },
      queue: {
        items: queue.rows.map((row) => toOrderDto(row, queueItems)),
        total: queue.total,
      },
    });
  },
};
