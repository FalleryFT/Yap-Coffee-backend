/** Koordinat titik pengambilan untuk peta di aplikasi pelanggan. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

function inRange(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function toLatLng(lat: string | undefined, lng: string | undefined): LatLng | null {
  if (lat === undefined || lng === undefined) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  return inRange(latitude, longitude) ? { latitude, longitude } : null;
}

/**
 * Mencari koordinat pada tautan Google Maps lengkap. Urutan: pin (!3d..!4d..), lalu @lat,lng,
 * lalu parameter q / query / ll yang berisi angka. Tautan pendek (maps.app.goo.gl) tidak memuatnya.
 */
export function coordinatesFromMapsUrl(raw: string): LatLng | null {
  const pin = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) return toLatLng(pin[1], pin[2]);

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* tetap memakai teks mentah */
  }

  const at = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return toLatLng(at[1], at[2]);

  const query = decoded.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (query) return toLatLng(query[1], query[2]);

  return null;
}

/** Koordinat dari kolom DECIMAL (mysql2 mengirimnya sebagai string). undefined bila belum diisi. */
export function coordinatesOf(row: { latitude: string | null; longitude: string | null }): LatLng | undefined {
  if (row.latitude === null || row.longitude === null) return undefined;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  return inRange(latitude, longitude) ? { latitude, longitude } : undefined;
}

/** Koordinat yang diketik admin menang; bila kosong, dicoba dibaca dari tautan Maps. */
export function resolveCoordinates(input: {
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string;
}): LatLng | null {
  if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
    return inRange(input.latitude, input.longitude)
      ? { latitude: input.latitude, longitude: input.longitude }
      : null;
  }
  return input.mapsUrl ? coordinatesFromMapsUrl(input.mapsUrl) : null;
}
