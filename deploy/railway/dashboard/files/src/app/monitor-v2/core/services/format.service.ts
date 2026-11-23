import { computed } from '../../core/signals';
import { Injectable, inject } from '@angular/core';
import { UiStore } from '../stores/ui.store';
import { I18nService } from './i18n.service';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Locale-aware formatting (section 10.4): Latin digits by default (option: Arabic-Indic), 24 h clock, Intl for
 * dates, relative dates and numbers, optional Hijri calendar for date separators.
 */
@Injectable()
export class FormatService {
  private readonly i18n = inject(I18nService);
  private readonly ui = inject(UiStore);

  readonly locale = computed(() => {
    const arabicDigits = this.ui.numerals() === 'arab';
    if (this.i18n.lang() === 'ar') return arabicDigits ? 'ar-QA' : 'ar-QA-u-nu-latn';
    return arabicDigits ? 'en-u-nu-arab' : 'en-GB';
  });

  number(n: number): string {
    return new Intl.NumberFormat(this.locale()).format(n);
  }

  /** `17:46` */
  time(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  }

  /** Short date: `12/11` */
  shortDate(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: '2-digit' }).format(d);
  }

  dateTime(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  }

  fullDateTime(d: Date): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(d);
  }

  /** Time shown at the end of the first line of a list item (rule of section 8.2, tr-conversation-list-item). */
  listTime(d: Date, now: Date): string {
    const diff = now.getTime() - d.getTime();
    if (diff < MIN) return this.i18n.t('time.now');
    if (diff < HOUR) return this.i18n.t('time.min', { n: this.number(Math.floor(diff / MIN)) });
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return this.time(d);
    const yesterday = new Date(now.getTime() - DAY);
    if (d.toDateString() === yesterday.toDateString()) return this.i18n.t('time.yesterday');
    if (diff < 7 * DAY) return new Intl.DateTimeFormat(this.locale(), { weekday: 'short' }).format(d);
    return this.shortDate(d);
  }

  /** "3 h 12 m" / "٣ س ١٢ د" */
  duration(ms: number): string {
    const totalMin = Math.max(0, Math.floor(ms / MIN));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h && m) return this.i18n.t('time.hm', { h: this.number(h), m: this.number(m) });
    if (h) return this.i18n.t('time.h', { n: this.number(h) });
    return this.i18n.t('time.min', { n: this.number(m) });
  }

  /** "18 minutes ago" (handles the Arabic dual: منذ دقيقتين). */
  relative(d: Date, now: Date): string {
    const diff = d.getTime() - now.getTime();
    const rtf = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto' });
    const abs = Math.abs(diff);
    if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
    if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
    return rtf.format(Math.round(diff / DAY), 'day');
  }

  /** Date separator in the thread: "Today", "Yesterday" or a full date (optionally also Hijri). */
  daySeparator(d: Date, now: Date): string {
    if (d.toDateString() === now.toDateString()) return this.i18n.t('time.today');
    if (d.toDateString() === new Date(now.getTime() - DAY).toDateString()) return this.i18n.t('time.yesterday');
    const greg = new Intl.DateTimeFormat(this.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    if (!this.ui.hijri()) return greg;
    const hijri = new Intl.DateTimeFormat(this.i18n.lang() === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    return `${hijri} · ${greg}`;
  }

  bytes(n: number): string {
    if (n < 1024) return `${this.number(n)} B`;
    if (n < 1024 * 1024) return `${this.number(Math.round(n / 1024))} KB`;
    return `${new Intl.NumberFormat(this.locale(), { maximumFractionDigits: 1 }).format(n / 1024 / 1024)} MB`;
  }

  /** mm:ss for voice notes and timers. */
  clock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
