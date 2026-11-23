import { computed, signal } from '../../core/signals';
import { Injectable, inject, OnDestroy } from '@angular/core';
import { ConnectionState } from '../models/view-models';
import { I18nService } from '../services/i18n.service';
import { InboxApi } from '../services/inbox-api';
import { ToastService } from '../services/toast.service';
import { UiStore } from './ui.store';

export type Availability = 'available' | 'busy' | 'away';
export type BreakType = 'pause' | 'training' | 'prayer' | 'meal';

/** The current agent's availability + the real-time connection state (offline / reconnecting / restored). */
@Injectable()
export class PresenceStore implements OnDestroy {
  private readonly api = inject(InboxApi);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly ui = inject(UiStore);

  readonly availability = signal<Availability>('available');
  readonly breakInfo = signal<{ type: BreakType; until: Date } | null>(null);
  readonly connection = signal<ConnectionState>({ status: 'online' });
  readonly sessionExpired = signal(false);
  readonly newVersion = signal(false);
  /** "Disconnected for more than 3 s" before the banner shows (document 9.1). */
  readonly bannerVisible = computed(() => this.connection().status !== 'online');
  readonly isOnline = computed(() => this.connection().status === 'online' || this.connection().status === 'restored');
  readonly away = computed(() => this.availability() === 'away' || !!this.breakInfo());

  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanup: Array<() => void> = [];

  constructor() {
    this.api.events$.subscribe((e) => {
      if (e.type === 'connection') e.status === 'offline' ? this.goOffline() : this.restore();
    });
    // automatic "Away" after 15 minutes without activity (setting in the profile menu)
    let last = Date.now();
    const touch = () => (last = Date.now());
    for (const ev of ['pointerdown', 'keydown']) {
      window.addEventListener(ev, touch, { passive: true });
      this.cleanup.push(() => window.removeEventListener(ev, touch));
    }
    const idle = setInterval(() => {
      if (this.ui.autoAway() && this.availability() === 'available' && Date.now() - last > 15 * 60_000) {
        this.availability.set('away');
        this.toast.show(this.i18n.t('presence.autoAway'));
      }
    }, 30_000);
    this.cleanup.push(() => clearInterval(idle));
    const off = () => this.goOffline();
    const on = () => this.restore();
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    this.cleanup.push(() => window.removeEventListener('offline', off), () => window.removeEventListener('online', on));
  }

  ngOnDestroy(): void {
    this.cleanup.forEach((fn) => fn());
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
  }

  setAvailability(a: Availability): void {
    this.availability.set(a);
    this.breakInfo.set(null);
  }

  startBreak(type: BreakType, minutes = 15): void {
    this.availability.set('away');
    this.breakInfo.set({ type, until: new Date(Date.now() + minutes * 60_000) });
  }

  resume(): void {
    this.breakInfo.set(null);
    this.availability.set('available');
  }

  goOffline(): void {
    if (this.connection().status === 'offline') return;
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.connection.set({ status: 'offline', since: new Date() });
  }

  restore(): void {
    if (this.connection().status === 'online') return;
    this.connection.set({ status: 'restored' });
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineTimer = setTimeout(() => this.connection.set({ status: 'online' }), 3000);
  }

  retry(): void {
    this.connection.set({ status: 'reconnecting', since: this.connection().since });
    this.api.reconnect();
  }
}
