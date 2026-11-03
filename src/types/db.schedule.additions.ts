// Tambahkan blok ini di BAGIAN BAWAH src/types/db.ts (import RowDataPacket sudah ada di sana).

export type ScheduleStatusDb = 'mendatang' | 'aktif' | 'selesai';

export interface PickupScheduleRow extends RowDataPacket {
  id: number;
  name: string;
  date: string; // 'YYYY-MM-DD' (pool memakai dateStrings: true)
  location: string;
  location_detail: string | null;
  maps_url: string | null;
  pickup_start: string; // 'HH:mm:ss'
  pickup_end: string; // 'HH:mm:ss'
  cut_off_time: string; // 'HH:mm:ss'
  status: ScheduleStatusDb;
}
