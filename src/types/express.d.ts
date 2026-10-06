// Menambah properti kustom ke Request Express, diisi oleh middleware auth.
// File .d.ts ini otomatis dipakai TypeScript berkat "include": ["src"] di tsconfig.json.

declare namespace Express {
  export interface Request {
    adminId?: number;
    customerId?: number;
  }
}
