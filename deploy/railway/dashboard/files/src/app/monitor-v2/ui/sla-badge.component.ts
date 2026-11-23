import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { Component, inject, Input } from '@angular/core';
import { SlaVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { I18nService } from '../core/services/i18n.service';

/**
 * SLA text. Red only when the SLA is breached. "At risk" stays grey (amber is reserved for notes and drafts).
 * A paused clock (prayer break, outside hours) shows the moon icon instead of a countdown.
 */
@Component({
  standalone: true,
  selector: 'tr-sla-badge',
  imports: [TrIconComponent],
  host: { '[class.breached]': 'sla().level === "breached" && !sla().paused', '[attr.title]': 'tooltip()' },
  template: `<tr-icon [name]="sla().paused ? 'moon-star' : 'clock'" [size]="12"></tr-icon><span>{{ text() }}</span>`,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 4px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); white-space: nowrap; }
    :host(.breached) { color: var(--destructive); }
  `],
})
export class TrSlaBadgeComponent {
  private readonly clock = inject(ClockService);
  private readonly fmt = inject(FormatService);
  private readonly i18n = inject(I18nService);

  private readonly _sla = signal<SlaVM>(undefined as any);
  @Input() get sla(): Signal<SlaVM> { return this._sla; }
  set sla(v: any) { this._sla.set(v); }

  protected readonly text = computed(() => {
    const s = this.sla();
    if (s.paused) return this.i18n.t('sla.paused');
    const diff = s.dueAt.getTime() - this.clock.now().getTime();
    return diff <= 0 ? this.i18n.t('sla.breached', { d: this.fmt.duration(-diff) }) : this.i18n.t('sla.dueIn', { d: this.fmt.duration(diff) });
  });

  protected readonly tooltip = computed(() => this.i18n.t('sla.exact', { time: this.fmt.dateTime(this.sla().dueAt) }));
}
