import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { HoursService } from '../core/services/hours.service';
import { I18nService } from '../core/services/i18n.service';
import { isUntilReply } from '../core/util/snooze';

interface Banner { id: string; icon: string; text: string; action?: { label: string; emit: () => void }; strong?: boolean }

/**
 * Conversation banners, 40 px each, at most TWO visible, in priority order (section 7 D3): 24 h window (only on
 * channels that have one, never on web) > outside opening hours > blocked contact > snoozed > waiting for the
 * customer > abandoned > offline ticket. The real-time connection banner lives above, in the shell.
 */
@Component({
  standalone: true,
  selector: 'tr-banner-stack',
  imports: [TrIconComponent, CommonModule],
  template: `
    <ng-container *ngFor="let b of banners(); trackBy: __trk1">
      <div class="bn" [class.strong]="b.strong" role="status">
        <tr-icon [name]="b.icon" [size]="16"></tr-icon>
        <span class="tx tr-truncate">{{ b.text }}</span>
        <ng-container *ngIf="b.action as a"> <button type="button" class="ac" (click)="a.emit()">{{ a.label }}</button> </ng-container>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .bn { display: flex; align-items: center; gap: 8px; block-size: 40px; padding-inline: 16px; background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); border-block-end: 1px solid var(--border); }
    .bn.strong { color: var(--foreground); font-weight: 600; } .tx { flex: 1; }
    .ac { flex: none; color: var(--brand); font-weight: 600; padding-inline: 8px; min-block-size: 28px; border-radius: 6px; } .ac:hover { background: var(--muted); }
  `],
})
export class TrBannerStackComponent {
  readonly __trk1 = (__i: number, b: any): any => b.id;
  private readonly i18n = inject(I18nService);
  private readonly fmt = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly hours = inject(HoursService).status;

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  @Output() unsnooze = new EventEmitter<void>();
  @Output() reopenNow = new EventEmitter<void>();
  @Output() unblock = new EventEmitter<void>();
  @Output() backToChat = new EventEmitter<void>();
  private readonly hoursDismissed = signal(false);

  protected readonly banners = computed<Banner[]>(() => this.build(this.c()).slice(0, 2));

  private build(c: ConversationVM): Banner[] {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const out: Banner[] = [];
    // 24 h window (WhatsApp / Messenger / Instagram only; never on a web conversation)
    if (c.window && c.window.level !== 'open') {
      const mins = Math.max(0, Math.floor((c.window.expiresAt.getTime() - this.clock.now().getTime()) / 60_000));
      out.push(c.window.level === 'closed' ? { id: 'win', icon: 'clock', strong: true, text: t('win.closed') } : { id: 'win', icon: 'clock', text: t('win.closing', { n: mins }) });
    }
    if (!this.hours().open && !this.hoursDismissed()) out.push({ id: 'hours', icon: 'moon-star', text: this.hours().detail, action: { label: t('hours.replyAnyway'), emit: () => this.hoursDismissed.set(true) } });
    if (c.blocked) out.push({ id: 'blocked', icon: 'ban', strong: true, text: t('cust.blocked'), action: { label: t('cust.unblock'), emit: () => this.unblock.emit() } });
    if (c.state === 'snoozed' && c.snoozedUntil) {
      const text = isUntilReply(c.snoozedUntil) ? t('conv.snoozedReply') : t('conv.snoozed', { date: this.fmt.dateTime(c.snoozedUntil) });
      out.push({ id: 'snz', icon: 'alarm-clock', text, action: { label: t('conv.cancelSnooze'), emit: () => this.unsnooze.emit() } });
    }
    if (c.state === 'customer_pending') out.push({ id: 'pnd', icon: 'circle-pause', text: t('conv.pending'), action: { label: t('conv.reopenNow'), emit: () => this.reopenNow.emit() } });
    if (c.state === 'abandoned') out.push({ id: 'abn', icon: 'circle-alert', text: t('conv.abandoned') });
    if (!c.smartAssignment && c.state !== 'closed') out.push({ id: 'off', icon: 'ticket', text: t('conv.offlineTicket'), action: { label: t('conv.backToChat'), emit: () => this.backToChat.emit() } });
    return out;
  }
}
