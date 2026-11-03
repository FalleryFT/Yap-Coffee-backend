import { z } from 'zod';

const time = (label: string) =>
  z
    .string({ error: `${label} wajib dipilih.` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} harus berformat HH:mm.`);

const date = z
  .string({ error: 'Tanggal wajib dipilih.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Tanggal tidak valid.');

// Hanya tautan Google Maps (https) yang diterima.
const MAPS_HOSTS = ['google.com', 'google.co.id', 'goo.gl', 'maps.app.goo.gl'];
const mapsUrl = z
  .string({ error: 'Link Google Maps wajib diisi.' })
  .trim()
  .min(1, 'Link Google Maps wajib diisi.')
  .max(500, 'Link Google Maps maksimal 500 karakter.')
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        MAPS_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
      );
    } catch {
      return false;
    }
  }, 'Link harus berupa tautan Google Maps yang valid (https).');

const name = z
  .string({ error: 'Nama kloter wajib diisi.' })
  .trim()
  .min(1, 'Nama kloter wajib diisi.')
  .max(191, 'Nama kloter maksimal 191 karakter.');

const location = z
  .string({ error: 'Nama titik lokasi wajib diisi.' })
  .trim()
  .min(1, 'Nama titik lokasi wajib diisi.')
  .max(191, 'Nama titik lokasi maksimal 191 karakter.');

const locationDetail = z.string().trim().max(255, 'Detail lokasi maksimal 255 karakter.');

/** Buat jadwal baru. Nama field mengikuti FormState di frontend (src/types/preOrder.ts). */
export const createScheduleSchema = z
  .object({
    name,
    date,
    location,
    locationDetail: locationDetail.default(''),
    mapsUrl,
    pickupStart: time('Jam mulai'),
    pickupEnd: time('Jam selesai'),
    cutOffTime: time('Batas pemesanan'),
  })
  .superRefine((data, ctx) => {
    if (data.pickupEnd <= data.pickupStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['pickupEnd'],
        message: 'Jam selesai harus setelah jam mulai.',
      });
    }
  });

/**
 * Edit jadwal. Di frontend, tanggal, link Maps, dan jam terkunci saat edit,
 * jadi hanya tiga kolom ini yang boleh diubah.
 */
export const updateScheduleSchema = z
  .object({
    name: name.optional(),
    location: location.optional(),
    locationDetail: locationDetail.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada data yang diubah.',
  });

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
