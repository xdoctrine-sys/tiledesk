import { PiiSpan } from '../models/view-models';
import { normalizeArabic } from './text';

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'hit'; text: string }
  | { kind: 'pii'; text: string; piiKind: PiiSpan['kind']; last4: string };

/** Splits a message into plain text, sensitive spans (to mask) and in-thread search hits (to highlight). */
export function buildParts(text: string, spans: PiiSpan[], query: string): Part[] {
  const parts: Part[] = [];
  let cursor = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const q = query.trim();
    if (!q) return void parts.push({ kind: 'text', text: t });
    // normalised search (Arabic letter variants are equal); both strings keep the same length per character
    const hay = normalizeArabic(t);
    const needle = normalizeArabic(q);
    if (hay.length !== t.length || !needle) return void parts.push({ kind: 'text', text: t });
    let i = 0;
    for (let at = hay.indexOf(needle, i); at !== -1; at = hay.indexOf(needle, i)) {
      if (at > i) parts.push({ kind: 'text', text: t.slice(i, at) });
      parts.push({ kind: 'hit', text: t.slice(at, at + needle.length) });
      i = at + needle.length;
    }
    if (i < t.length) parts.push({ kind: 'text', text: t.slice(i) });
  };
  for (const s of spans) {
    pushText(text.slice(cursor, s.start));
    parts.push({ kind: 'pii', text: text.slice(s.start, s.end), piiKind: s.kind, last4: s.last4 });
    cursor = s.end;
  }
  pushText(text.slice(cursor));
  return parts;
}

/**
 * Values that must survive a translation or an AI rewrite unchanged (F-147): numbers, amounts, dates, phone numbers.
 * Arabic-Indic and Latin digits are the same value ("١٢٥" = "125").
 */
export function protectedValues(text: string): string[] {
  const latin = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  return (latin.match(/\d[\d.,:/-]*\d|\d/g) ?? []).map((v) => v.replace(/,/g, ''));
}

export function diffProtected(before: string, after: string): { from: string; to: string }[] {
  const a = protectedValues(before);
  const b = protectedValues(after);
  const out: { from: string; to: string }[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.push({ from: a[i] ?? '—', to: b[i] ?? '—' });
  return out;
}
