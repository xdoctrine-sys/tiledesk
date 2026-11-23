import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { MessageVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { I18nService } from '../core/services/i18n.service';

/**
 * System events as short grey centered sentences, never raw ids (document T-64): localized from `messagelabel`.
 * Consecutive events are grouped and unfold on click ("The assistant handed over to Sara"); the widget's flow
 * commands (e.g. /listing_en) become one folded "Flow trigger" line.
 */
@Component({
  standalone: true,
  selector: 'tr-system-event',
  imports: [TrIconComponent, CommonModule],
  template: `
    <div class="ev">
      <ng-container *ngIf="events().length === 1 && !single().isFlowTrigger; else __e3">
        <span class="line">{{ text(single()) }}<time class="tm">{{ fmt.time(single().createdAt) }}</time></span>
      </ng-container><ng-template #__e3>
        <button type="button" class="line btn" [attr.aria-expanded]="open()" (click)="open.set(!open())">
          <span>{{ summary() }}</span><tr-icon name="chevron-down" [size]="12" [class.flip]="open()"></tr-icon>
        </button>
        <ng-container *ngIf="open()">
          <ul class="det"><ng-container *ngFor="let e of events(); trackBy: __trk2"> <li>{{ e.isFlowTrigger ? text(e) + ' · ' : '' }}<ng-container *ngIf="e.isFlowTrigger; else __e1"> <code class="tr-mono tr-ltr">{{ e.eventParams?.['command'] }}</code> </ng-container><ng-template #__e1> {{ text(e) }} </ng-template><time class="tm">{{ fmt.time(e.createdAt) }}</time></li> </ng-container></ul>
        </ng-container>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: block; padding: 8px 16px; }
    .ev { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); text-align: center; }
    .line { display: inline-flex; align-items: center; gap: 6px; max-inline-size: 100%; }
    .btn { color: inherit; border-radius: var(--radius-md); padding: 2px 8px; min-block-size: 24px; }
    .btn:hover { background: var(--muted); color: var(--muted-foreground); }
    .flip { transform: rotate(180deg); }
    .det { display: flex; flex-direction: column; gap: 2px; }
    .tm { margin-inline-start: 8px; opacity: .8; }
    code { font-size: 11px; background: var(--muted); padding: 1px 6px; border-radius: 4px; }
  `],
})
export class TrSystemEventComponent {
  readonly __trk2 = (__i: number, e: any): any => e.id;
  private readonly i18n = inject(I18nService);
  protected readonly fmt = inject(FormatService);
  private readonly _events = signal<MessageVM[]>(undefined as any);
  @Input() get events(): Signal<MessageVM[]> { return this._events; }
  set events(v: any) { this._events.set(v); }
  protected readonly open = signal(false);
  protected readonly single = computed(() => this.events()[0]!);

  protected text(e: MessageVM): string {
    const key = `event.${e.eventKey}`;
    if (!this.i18n.has(key)) return this.i18n.t('event.generic');
    const p = { ...(e.eventParams ?? {}) } as Record<string, string>;
    if (p['until']) p['until'] = this.fmt.dateTime(new Date(p['until']));
    return this.i18n.t(key, p);
  }

  /** Folded summary of a group: handover pattern → one sentence; otherwise "N events". */
  protected readonly summary = computed(() => {
    const ev = this.events();
    if (ev.length === 1 && ev[0]!.isFlowTrigger) return this.i18n.t('event.FLOW_TRIGGER');
    const left = ev.find((e) => e.eventKey === 'MEMBER_LEFT_GROUP.bot');
    const joined = ev.find((e) => e.eventKey === 'MEMBER_JOINED_GROUP.agent');
    if (left && joined) return this.i18n.t('event.handover', { bot: left.eventParams?.['name'] ?? '', agent: joined.eventParams?.['name'] ?? '' });
    const handoff = ev.find((e) => e.eventKey?.startsWith('TARASHLI_HANDOFF_REQUESTED'));
    if (handoff) return this.text(handoff);
    return this.i18n.t('event.group', { n: ev.length });
  });
}
