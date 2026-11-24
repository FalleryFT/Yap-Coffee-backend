import { Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export type ImageKind = 'menu' | 'avatars';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hanya cocok dengan URL Cloudinary milik akun ini, dan menangkap public_id-nya.
const OWN_URL = new RegExp(
  `^https://res\\.cloudinary\\.com/${escapeRegex(env.cloudinary.cloudName)}/image/upload/(?:v\\d+/)?` +
    `(${escapeRegex(env.cloudinary.folder)}/(?:menu|avatars)/[A-Za-z0-9_-]+)\\.[A-Za-z0-9]+$`,
);

export function isOwnImageUrl(value: string): boolean {
  return OWN_URL.test(value);
}

/** Mengunggah foto ke Cloudinary dan mengembalikan secure_url. */
export function uploadImage(buffer: Buffer, kind: ImageKind): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${env.cloudinary.folder}/${kind}`,
        resource_type: 'image',
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        transformation:
          kind === 'avatars'
            ? [{ width: 512, height: 512, crop: 'fill', gravity: 'auto' }, { quality: 'auto' }]
            : [{ width: 1200, height: 1200, crop: 'limit' }, { quality: 'auto' }],
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary tidak mengembalikan hasil.'));
        resolve(result.secure_url);
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

/** Menghapus foto berdasarkan URL. Diam saja bila bukan URL milik aplikasi ini atau gagal. */
export async function removeImage(value: string | null | undefined): Promise<void> {
  if (!value) return;
  const publicId = OWN_URL.exec(value)?.[1];
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch (err) {
    console.error('Gagal menghapus foto di Cloudinary:', publicId, err);
  }
}