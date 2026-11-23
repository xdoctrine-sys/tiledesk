import { computed } from '../../core/signals';
import { Injectable, inject } from '@angular/core';
import { I18nService } from './i18n.service';
import { DemoStateService } from './demo-state.service';
import { DirectoryStore } from '../stores/directory.store';
import { ClockService } from './clock.service';
import { InboxApi } from './inbox-api';
import { MockInboxApi } from './mock-inbox-api';
import { TdHours } from '../models/tiledesk.models';

export interface HoursStatus {
  open: boolean;
  profile: 'standard' | 'ramadan';
  /** Short text for the chip: "Open · closes 18:00" */
  chip: string;
  /** Longer sentence for the popover / banner */
  detail: string;
  /** Prayer break in progress (SLA paused) */
  prayer?: { name: string; until: string };
  /** Time the team is back, for the "outside hours" banner */
  resumes?: string;
}

/**
 * Opening-hours status (F-115, F-128, F-133). In production derive it from the project's hours (`TdHours`: days,
 * timezone, Ramadan profile, prayer breaks per city). Here a demo switch decides, so the chip never depends on the
 * real clock when someone opens the template at midnight.
 */
@Injectable()
export class HoursService {
  private readonly demo = inject(DemoStateService);
  private readonly i18n = inject(I18nService);
  private readonly dir = inject(DirectoryStore);
  private readonly clock = inject(ClockService);
  private readonly isMock = inject(InboxApi) instanceof MockInboxApi;

  readonly status = computed<HoursStatus>(() => (this.isMock ? this.demoStatus() : this.realStatus()));

  /** Real project hours (`TdHours`, from the project's operating hours). Nothing configured → no chip at all. */
  private realStatus(): HoursStatus {
    const t = (k: string, p?: Record<string, string>) => this.i18n.t(k, p);
    const h: TdHours | null = this.dir.hours();
    if (!h || !h.enabled || !h.days.length) return { open: true, profile: 'standard', chip: '', detail: '' };
    const parts = localParts(this.clock.now(), h.timezone);
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const today = h.days.find((d) => d.day === parts.day);
    const slots = today ? [[today.open, today.close], ...(today.open2 !== undefined ? [[today.open2, today.close2!]] : [])] : [];
    const current = slots.find(([o, c]) => parts.minutes >= o! && parts.minutes < c!);
    if (current) {
      const time = hhmm(current[1]!);
      return { open: true, profile: 'standard', chip: t('hours.chipOpen', { time }), detail: t('hours.openDetail', { time }) };
    }
    const later = slots.find(([o]) => o! > parts.minutes);
    let time = '';
    let dayLabel = t('hours.tomorrow');
    if (later) {
      time = hhmm(later[0]!);
      dayLabel = t('hours.today');
    } else {
      for (let i = 1; i <= 7 && !time; i++) {
        const d = h.days.find((x) => x.day === (parts.day + i) % 7);
        if (d) {
          time = hhmm(d.open);
          dayLabel = i === 1 ? t('hours.tomorrow') : new Intl.DateTimeFormat(this.i18n.lang(), { weekday: 'long' }).format(new Date(2024, 0, 7 + ((parts.day + i) % 7)));
        }
      }
    }
    return { open: false, profile: 'standard', chip: t('hours.chipClosed', { time }), detail: t('hours.closed', { day: dayLabel, time }), resumes: time };
  }

  private demoStatus(): HoursStatus {
    const t = (k: string, p?: Record<string, string>) => this.i18n.t(k, p);
    switch (this.demo.hours()) {
      case 'closed':
        return { open: false, profile: 'standard', chip: t('hours.chipClosed', { time: '08:00' }), detail: t('hours.closed', { day: t('hours.tomorrow'), time: '08:00' }), resumes: '08:00' };
      case 'ramadan':
        return { open: true, profile: 'ramadan', chip: t('hours.chipRamadan', { close: '15:00', open: '20:00' }), detail: t('hours.ramadan') };
      case 'prayer':
        return { open: true, profile: 'standard', chip: t('hours.chipOpen', { time: '18:00' }), detail: t('hours.prayer', { name: t('hours.maghrib') }), prayer: { name: t('hours.maghrib'), until: '17:46' } };
      default:
        return { open: true, profile: 'standard', chip: t('hours.chipOpen', { time: '18:00' }), detail: t('hours.openDetail', { time: '18:00' }) };
    }
  }
}

/** Day of week (0 = Sunday) and minutes since midnight in the project's time zone. */
function localParts(now: Date, timeZone: string): { day: number; minutes: number } {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    const get = (type: string) => f.find((p) => p.type === type)?.value ?? '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day: day < 0 ? now.getDay() : day, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
  } catch {
    return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}
