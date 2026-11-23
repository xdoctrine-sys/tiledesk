import { computed, effect, signal } from '../../core/signals';
import { Injectable } from '@angular/core';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { setPageRtl } from '../util/dir';
import { guestSuffix } from '../util/text';

export type Lang = 'ar' | 'en';
type Dict = Record<string, unknown>;

function flatten(obj: Dict, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v as Dict, key, out);
  }
  return out;
}

const DICTS: Record<Lang, Record<string, string>> = { en: {}, ar: {} };
const STORAGE_KEY = 'monitor-v2.lang';

/** The page's own dictionaries live in src/assets/monitor-v2/i18n (the dashboard's translations are never touched). */
function assetUrl(file: string): string {
  return new URL(`assets/monitor-v2/${file}`, document.baseURI).toString();
}

/**
 * All UI text comes from assets/monitor-v2/i18n/en.json and ar.json. The language and direction are applied to the page root
 * (`.tr-monitor-v2`), never to <html>.
 * Arabic is the default. `t()` reads the `lang` signal, so any template that calls it re-renders on a switch.
 * To use ngx-translate or Tiledesk's own translator instead, keep this class as a thin adapter.
 */
@Injectable()
export class I18nService {
  readonly lang = signal<Lang>(this.initial());
  readonly dir = computed<'rtl' | 'ltr'>(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  readonly isRtl = computed(() => this.lang() === 'ar');
  private readonly warned = new Set<string>();

  /** True once both dictionaries are loaded: the page renders nothing before that. */
  readonly ready = signal(false);

  constructor() {
    effect(() => setPageRtl(this.dir() === 'rtl'));
  }

  async load(): Promise<void> {
    const get = async (l: Lang) => flatten((await (await fetch(assetUrl(`i18n/${l}.json`))).json()) as Dict);
    const [en, ar] = await Promise.all([get('en'), get('ar')]);
    DICTS.en = en;
    DICTS.ar = ar;
    this.ready.set(true);
  }

  private initial(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'en' || saved === 'ar' ? saved : 'ar';
    } catch {
      return 'ar';
    }
  }

  setLang(lang: Lang, persist = true): void {
    this.lang.set(lang);
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        /* storage unavailable */
      }
    }
  }

  /** Translate `key`, replacing `{param}` placeholders. Falls back to English, then to the key itself. */
  t(key: string, params?: Record<string, string | number>): string {
    const lang = this.lang();
    // plural forms: `key.one`, `key.two`, `key.few`, `key.many` (Arabic has all of them) fall back to `key` (= "other")
    const n = params?.['n'];
    const cat = typeof n === 'number' ? new Intl.PluralRules(lang).select(n) : undefined;
    let s = (cat && cat !== 'other' ? DICTS[lang][`${key}.${cat}`] : undefined) ?? DICTS[lang][key] ?? DICTS.en[key];
    if (s === undefined) {
      if (!this.warned.has(key)) {
        this.warned.add(key);
        console.warn(`[i18n] missing key: ${key}`);
      }
      return key;
    }
    if (params) s = s.replace(/\{(\w+)\}/g, (_, p: string) => (params[p] !== undefined ? String(params[p]) : `{${p}}`));
    return s;
  }

  has(key: string): boolean {
    return key in DICTS[this.lang()] || key in DICTS.en;
  }

  /** `guest#a104` → "Visitor #a104" / "زائر #a104" (document section 12.2, lead.fullname). */
  customerName(c: { name: string; isGuest?: boolean }): string {
    const suffix = guestSuffix(c.name);
    // U+200E (LRM) keeps "#a104" together in a right-to-left sentence
    return suffix ? `${this.t('customer.guest')} \u200E#${suffix}` : c.name;
  }
}

/** `{{ 'list.end' | t }}` or `{{ 'bulk.count' | t: { n: 3 } }}`. Impure on purpose: it must follow the language signal. */
@Pipe({ standalone: true, name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
