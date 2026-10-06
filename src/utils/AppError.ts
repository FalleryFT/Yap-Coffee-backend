/**
 * Galat terkendali yang sengaja dilempar dari controller/repository.
 * Middleware galat pusat (errorHandler) mengubahnya menjadi respons JSON yang konsisten.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    statusCode: number,
    message: string,
    fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }

  static unauthorized(message = 'Autentikasi gagal.'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Anda tidak punya izin untuk tindakan ini.'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Data tidak ditemukan.'): AppError {
    return new AppError(404, message);
  }

  static validation(fieldErrors: Record<string, string[]>): AppError {
    return new AppError(422, 'Data yang dikirim belum valid.', fieldErrors);
  }

  static tooManyRequests(message: string): AppError {
    return new AppError(429, message);
  }
}
