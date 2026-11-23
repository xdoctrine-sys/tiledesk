import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { Component, inject, Input } from '@angular/core';
import { ActorVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { I18nService } from '../core/services/i18n.service';

/**
 * "Who is answering": quiet grey text with an icon (no pill). Bot → bot name; human → first name ("You"); waiting → "Waiting 4 min",
 * red only once the human wait is beyond its SLA. Colour is never the only signal: every actor has its own icon.
 */
@Component({
  standalone: true,
  selector: 'tr-actor-badge',
  imports: [TrIconComponent],
  host: { '[class.breached]': 'breached()', '[class.sm]': 'size() === "sm"', '[attr.title]': 'tooltip()' },
  template: `
    <tr-icon [name]="icon()" [size]="size() === 'sm' ? 12 : 14"></tr-icon>
    <span class="lbl">{{ label() }}</span>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; max-inline-size: 100%; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); white-space: nowrap; }
    :host(.sm) { gap: 4px; font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    :host(.breached) { color: var(--destructive); }
    tr-icon { flex: none; }
    .lbl { overflow: hidden; text-overflow: ellipsis; }
  `],
})
export class TrActorBadgeComponent {
  private readonly i18n = inject(I18nService);
  private readonly fmt = inject(FormatService);
  private readonly clock = inject(ClockService);

  private readonly _actor = signal<ActorVM>(undefined as any);
  @Input() get actor(): Signal<ActorVM> { return this._actor; }
  set actor(v: any) { this._actor.set(v); }
  private readonly _size = signal<'sm' | 'md'>('md');
  @Input() get size(): Signal<'sm' | 'md'> { return this._size; }
  set size(v: any) { this._size.set(v); }
  private readonly _breached = signal(false);
  @Input() get breached() { return this._breached; }
  set breached(v: any) { this._breached.set(v); }

  protected readonly icon = computed(() => {
    switch (this.actor().kind) {
      case 'bot': return 'bot';
      case 'human': return 'user-round';
      case 'waiting_human': return 'hourglass';
      case 'customer_pending': return 'circle-pause';
      case 'snoozed': return 'alarm-clock';
      case 'closed': return 'circle-check';
      case 'abandoned': return 'circle-alert';
    }
  });

  protected readonly label = computed(() => {
    const a = this.actor();
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    switch (a.kind) {
      case 'bot': return t('who.bot');
      case 'human': return a.isMe ? t('who.me') : t('who.other', { name: a.label });
      case 'waiting_human': return a.since ? t('who.waiting', { d: this.fmt.duration(this.clock.now().getTime() - a.since.getTime()) }) : t('who.waitingShort');
      case 'customer_pending': return t('actor.pending');
      case 'snoozed': return t('actor.snoozed');
      case 'closed': return t('actor.resolved');
      case 'abandoned': return t('actor.abandoned');
    }
  });

  protected readonly tooltip = computed(() => {
    const a = this.actor();
    return a.since ? `${this.label()} · ${this.i18n.t('actor.since', { time: this.fmt.time(a.since) })}` : this.label();
  });
}
