import { signal } from '../../core/signals';
import { Injectable, inject } from '@angular/core';
import { PresenceStore } from '../stores/presence.store';
import { UiStore } from '../stores/ui.store';
import { I18nService } from './i18n.service';
import { InboxApi } from './inbox-api';
import { MockInboxApi } from './mock-inbox-api';

export type HoursState = 'open' | 'closed' | 'ramadan' | 'prayer';

/**
 * Demo switches read from the URL, so every UI state of the document (section 9) can be shown with fake data and no
 * extra UI. Nothing here exists in production: delete this service together with MockInboxApi.
 *
 *   ?lang=en|ar            ?theme=light|dark|system     ?view=mine|waiting|bot|all|mentions
 *   ?dataset=whatsapp      (separate WhatsApp data set, off by default)
 *   ?state=offline|loading|empty|error|session|forbidden|nochannel|closedhours|ramadan|prayer|away|break|update
 *   ?script=0              (no scripted live events: stable screenshots)
 *   ?density=compact
 */
@Injectable()
export class DemoStateService {
  private readonly api = inject(InboxApi);
  private get mock(): MockInboxApi | null {
    return this.api instanceof MockInboxApi ? this.api : null;
  }
  private readonly ui = inject(UiStore);
  private readonly i18n = inject(I18nService);
  private readonly presence = inject(PresenceStore);

  readonly hours = signal<HoursState>('open');
  readonly forbidden = signal(false);
  readonly noChannel = signal(false);
  readonly view = signal<string | null>(null);
  readonly state = signal<string | null>(null);
  readonly whatsapp = signal(false);

  init(): void {
    const q = new URLSearchParams(window.location.search);
    const lang = q.get('lang');
    if (lang === 'ar' || lang === 'en') this.i18n.setLang(lang, false);
    const theme = q.get('theme');
    if (theme === 'light' || theme === 'dark' || theme === 'system') this.ui.setTransient('theme', theme);
    if (q.get('density') === 'compact') this.ui.setTransient('density', 'compact');
    if (q.get('numerals') === 'arab') this.ui.setTransient('numerals', 'arab');
    if (q.get('hijri') === '1') this.ui.setTransient('hijri', true);
    this.view.set(q.get('view'));
    const state = q.get('state');
    this.state.set(state);
    this.whatsapp.set(q.get('dataset') === 'whatsapp');

    this.mock?.configure({
      whatsapp: this.whatsapp(),
      script: q.get('script') !== '0',
      listMode: state === 'empty' ? 'empty' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ok',
      latencyMs: state === 'slow' ? 900 : 160,
    });

    switch (state) {
      case 'offline':
        setTimeout(() => this.mock?.setConnection(false), 1200);
        break;
      case 'session':
        this.presence.sessionExpired.set(true);
        break;
      case 'forbidden':
        this.forbidden.set(true);
        break;
      case 'nochannel':
        this.noChannel.set(true);
        break;
      case 'closedhours':
      case 'ramadan':
      case 'prayer':
        this.hours.set(state === 'closedhours' ? 'closed' : state);
        break;
      case 'away':
        this.presence.setAvailability('away');
        break;
      case 'break':
        this.presence.startBreak('prayer', 14);
        break;
      case 'update':
        this.presence.newVersion.set(true);
        break;
    }
  }
}
