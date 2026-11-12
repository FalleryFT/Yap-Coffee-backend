import type { Request, Response } from 'express';
import { scheduleRepository } from '../../repositories/scheduleRepository.js';
import type { PickupScheduleRow } from '../../types/db.js';
import { AppError } from '../../utils/AppError.js';
import { coordinatesOf } from '../../utils/mapsCoordinates.js';
import { created, ok } from '../../utils/response.js';
import type { CreateScheduleInput, UpdateScheduleInput } from '../../validators/scheduleValidators.js';

/** Cut-off dianggap mendesak bila tinggal kurang dari 2 jam lagi pada hari pengambilan. */
const URGENT_WINDOW_MS = 2 * 60 * 60 * 1000;

/** 'HH:mm:ss' dari MySQL → 'HH:mm'. */
const hhmm = (time: string) => time.slice(0, 5);

function isCutOffUrgent(row: PickupScheduleRow, now = new Date()): boolean {
  if (row.status !== 'aktif') return false;
  const [y = 1970, m = 1, d = 1] = row.date.split('-').map(Number);
  const [h = 0, min = 0] = row.cut_off_time.split(':').map(Number);
  const diff = new Date(y, m - 1, d, h, min).getTime() - now.getTime();
  return diff > 0 && diff <= URGENT_WINDOW_MS;
}

/** Bentuk satu jadwal untuk frontend (src/types/admin.ts → PreOrderSchedule). */
function toScheduleDto(row: PickupScheduleRow) {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    location: row.location,
    locationDetail: row.location_detail ?? '',
    mapsUrl: row.maps_url ?? undefined,
    // Titik di peta aplikasi pelanggan; tidak ada bila belum diisi.
    ...coordinatesOf(row),
    pickupTime: `${hhmm(row.pickup_start)} - ${hhmm(row.pickup_end)} WIB`,
    cutOff: `${hhmm(row.cut_off_time)} WIB`,
    cutOffUrgent: isCutOffUrgent(row),
    // Frontend hanya mengenal 'aktif' dan 'mendatang'; 'selesai' tidak pernah dikirim (lihat list).
    status: row.status as 'aktif' | 'mendatang',
  };
}

/** Id dari URL harus bilangan bulat positif; selain itu dianggap tidak ditemukan. */
function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw AppError.notFound('Jadwal tidak ditemukan.');
  return id;
}

async function loadSchedule(id: number) {
  const row = await scheduleRepository.findById(id);
  if (!row) throw AppError.notFound('Jadwal tidak ditemukan.');
  return toScheduleDto(row);
}

export const adminScheduleController = {
  /** GET /api/admin/pre-order/schedules — jadwal aktif & mendatang untuk tabel di halaman Pre-Order. */
  async list(_req: Request, res: Response) {
    const rows = await scheduleRepository.listOpen();
    ok(res, 'OK', rows.map(toScheduleDto));
  },

  /** GET /api/admin/pre-order/schedules/:id */
  async show(req: Request, res: Response) {
    ok(res, 'OK', await loadSchedule(parseId(req)));
  },

  /** POST /api/admin/pre-order/schedules — jadwal baru langsung aktif. */
  async create(req: Request, res: Response) {
    const input = req.body as CreateScheduleInput;
    const id = await scheduleRepository.create(input);
    created(res, 'Jadwal berhasil dibuat.', await loadSchedule(id));
  },

  /** PUT /api/admin/pre-order/schedules/:id — hanya nama, lokasi, dan detail lokasi yang bisa diubah. */
  async update(req: Request, res: Response) {
    const id = parseId(req);
    const input = req.body as UpdateScheduleInput;

    const existing = await scheduleRepository.findById(id);
    if (!existing) throw AppError.notFound('Jadwal tidak ditemukan.');

    await scheduleRepository.update(id, input);
    ok(res, 'Jadwal berhasil diperbarui.', await loadSchedule(id));
  },

  /** DELETE /api/admin/pre-order/schedules/:id */
  async remove(req: Request, res: Response) {
    const id = parseId(req);
    try {
      const deleted = await scheduleRepository.remove(id);
      if (!deleted) throw AppError.notFound('Jadwal tidak ditemukan.');
    } catch (err) {
      // orders punya FK RESTRICT ke pickup_schedules: jadwal yang sudah menerima pesanan tidak boleh dihapus.
      if ((err as { code?: string }).code === 'ER_ROW_IS_REFERENCED_2') {
        throw new AppError(
          409,
          'Jadwal ini sudah memiliki pesanan sehingga tidak bisa dihapus.',
        );
      }
      throw err;
    }
    ok(res, 'Jadwal berhasil dihapus.', null);
  },
};
