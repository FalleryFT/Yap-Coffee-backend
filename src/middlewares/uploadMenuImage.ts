import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { MENU_IMAGE_DIR } from '../utils/uploads.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: MENU_IMAGE_DIR,
    // Nama acak + ekstensi dari tipe berkas; nama asli dari klien tidak dipakai sama sekali.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: env.upload.maxImageBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXTENSIONS[file.mimetype]) return cb(null, true);
    cb(AppError.validation({ image: ['Format foto harus JPG, PNG, atau WebP.'] }));
  },
});

/** Menerima satu berkas pada field multipart "image" dan mengisi req.file. */
export function uploadMenuImage(req: Request, res: Response, next: NextFunction): void {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Ukuran foto maksimal ${env.upload.maxImageBytes / 1024 / 1024} MB.`
          : 'Berkas foto tidak valid.';
      return next(AppError.validation({ image: [message] }));
    }
    next(err);
  });
}
