import { PiiSpan } from '../models/view-models';

/**
 * Gulf personal-data shield (improvement I-6, wave 2). Detection runs on display only:
 * regular expressions, plus the Luhn checksum for payment cards.
 */
const RULES: { kind: PiiSpan['kind']; re: RegExp; check?: (digits: string) => boolean }[] = [
  { kind: 'emirates_id', re: /\b784-?\d{4}-?\d{7}-?\d\b/g },
  { kind: 'iban', re: /\b(?:QA|AE|SA|KW|BH|OM)\d{2}[A-Z0-9]{10,28}\b/g },
  { kind: 'card', re: /\b(?:\d[ -]?){13,19}\b/g, check: luhn },
  { kind: 'kuwait_civil_id', re: /\b[1-3]\d{11}\b/g },
  { kind: 'qid', re: /\b[23]\d{10}\b/g },
  { kind: 'saudi_id', re: /\b[12]\d{9}\b/g },
];

export function detectPii(text: string): PiiSpan[] {
  const spans: PiiSpan[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const raw = m[0];
      const digits = raw.replace(/\D/g, '');
      if (rule.check && !rule.check(digits)) continue;
      const start = m.index;
      const end = start + raw.length;
      if (spans.some((s) => start < s.end && end > s.start)) continue; // keep the first (most specific) rule
      spans.push({ start, end, kind: rule.kind, last4: raw.replace(/\s|-/g, '').slice(-4) });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
