/** Small, dependency-free text helpers. */

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Index 0..5 into the soft avatar palette (avatars are excluded from the "4 saturated colours" budget). */
export function colorIndexOf(id: string): number {
  return hashString(id) % 6;
}

export function initialsOf(name: string): string {
  const clean = name.replace(/^guest#?/i, 'G').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return Array.from(parts[0])[0]!.toUpperCase();
  return (Array.from(parts[0])[0]! + Array.from(parts[1])[0]!).toUpperCase();
}

/** `guest#a104` → `a104`; anything else → null. */
export function guestSuffix(fullname: string): string | null {
  const m = /^guest#?([a-z0-9]+)$/i.exec(fullname.trim());
  return m ? m[1]! : null;
}

/** Arabic letter normalisation used by the search (section 10.4): alef forms, ta marbuta, alef maqsura, diacritics. */
export function normalizeArabic(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase();
}

/** Very small Arabizi transliteration (3 = ع, 7 = ح, 8 = ق ...), enough for the demo search ("sha8a" finds "شقة"). */
export function arabiziToArabicHint(input: string): string {
  const map: Record<string, string> = { '3': 'ع', '7': 'ح', '8': 'ق', '5': 'خ', '2': 'ء', '9': 'ص' };
  return input.replace(/[3578259]/g, (c) => map[c] ?? c);
}

export function isMostlyArabic(text: string): boolean {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const lat = (text.match(/[a-z]/gi) ?? []).length;
  return ar > lat;
}

/** Stable id for optimistic messages. */
export function uid(prefix = 'tmp'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
