/**
 * Kontak toko (WhatsApp dan Instagram). Admin boleh mengetik dalam banyak bentuk; nilai yang
 * disimpan dan dikirim ke aplikasi selalu dinormalkan di sini.
 */

const IG_USERNAME = /^[A-Za-z0-9._]{1,30}$/;
// Segmen pertama URL Instagram yang bukan nama akun.
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'tv', 'direct']);

/**
 * '081231242277' | '+62 812-3124-2277' | '6281231242277' → '6281231242277'.
 * null bila bukan nomor seluler Indonesia yang masuk akal.
 */
export function normalizeWhatsapp(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith('8')) digits = `62${digits}`;
  return /^628\d{8,12}$/.test(digits) ? digits : null;
}

/**
 * Tautan profil, '@nama', atau 'nama' → 'https://www.instagram.com/nama/'.
 * Parameter pelacak seperti ?rpxt=… dibuang. null bila bukan profil Instagram.
 */
export function normalizeInstagram(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  let username: string | undefined;
  if (/^(https?:\/\/)?(www\.)?instagram\.com(\/|$)/i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return null;
    }
    username = url.pathname.split('/').filter(Boolean)[0];
  } else if (!/[/:]/.test(text)) {
    username = text.replace(/^@/, '');
  }

  if (!username || IG_RESERVED.has(username.toLowerCase()) || !IG_USERNAME.test(username)) return null;
  return `https://www.instagram.com/${username}/`;
}

export interface StoreContactDto {
  /** Format internasional, contoh '+6281231242277'. Kosong bila nilai tersimpan tidak valid. */
  whatsapp: string;
  /** Tautan wa.me untuk membuka percakapan. */
  whatsappUrl: string;
  /** Tautan profil Instagram. */
  instagram: string;
  /** Contoh '@yap_coffee_' untuk ditampilkan. */
  instagramHandle: string;
}

export function toStoreContactDto(raw: { whatsapp: string; instagram: string }): StoreContactDto {
  const wa = normalizeWhatsapp(raw.whatsapp);
  const ig = normalizeInstagram(raw.instagram);
  const handle = ig ? (new URL(ig).pathname.split('/').filter(Boolean)[0] ?? '') : '';
  return {
    whatsapp: wa ? `+${wa}` : '',
    whatsappUrl: wa ? `https://wa.me/${wa}` : '',
    instagram: ig ?? '',
    instagramHandle: handle ? `@${handle}` : '',
  };
}
