import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { RelaySegmentVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';

interface Seg extends RelaySegmentVM { ms: number; label: string; tip: string; merged?: boolean; icon?: string }

const REASON_ICON: Record<string, string> = { customer_asked: 'hand', bot_failed: 'triangle-alert', agent_transfer: 'arrow-left-right', snooze_end: 'alarm-clock', handed_back: 'corner-up-left' };

/**
 * Relay ribbon (I-1, F-51): who held the conversation, for how long, and why it changed hands. Folded by default (nothing shown);
 * the small control in the who-bar unfolds it into a thin grey frieze with labels and a hand-over icon on each boundary. Segment
 * width is proportional to its duration (min 6 px); beyond 8 segments the oldest ones merge into one "…" segment.
 * The time flows from the start side, so it reads right-to-left in Arabic.
 */
@Component({
  standalone: true,
  selector: 'tr-relay-ribbon',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container *ngIf="expanded() && segs().length">
      <div class="rb" role="group" [attr.aria-label]="'relay.title' | t">
        <div class="bar">
          <ng-container *ngFor="let s of segs(); trackBy: __trk1; let $last = last">
            <span class="seg" [class]="'k-' + s.kind" [style.flex-grow]="s.ms" [attr.title]="s.tip" [class.live]="!s.end && $last">
              <ng-container *ngIf="s.icon"> <span class="bd"><tr-icon [name]="s.icon" [size]="12"></tr-icon></span> </ng-container>
              <button type="button" class="seglbl" (click)="s.firstMessageId && jump.emit(s.firstMessageId)">{{ s.label }}</button>
            </span>
          </ng-container>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .rb { padding: 0 20px 8px; }
    .bar { display: flex; gap: 2px; block-size: var(--tr-ribbon-open-h); }
    .seg { position: relative; flex-basis: 0; min-inline-size: 6px; border-radius: var(--radius-sm); display: flex; align-items: center; padding-inline: 8px; color: var(--foreground); }
    /* grey scale only: the ribbon is information, not decoration */
    .k-bot { background: var(--muted); color: var(--muted-foreground); }
    .k-human { background: var(--input); }
    .k-waiting_human { background: var(--muted); border: 1px solid var(--ring); }
    .k-customer_pending { background: var(--muted); color: var(--muted-foreground); }
    .k-snoozed { background: var(--muted); color: var(--muted-foreground); }
    .seg.live { animation: mv2-pulse 2.4s ease-in-out infinite; }
    @keyframes mv2-pulse { 50% { opacity: .72; } }
    .seglbl { position: relative; z-index: 2; color: inherit; font-size: var(--tr-fs-caption); line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-inline-size: 100%; min-block-size: 20px; }
    .bd { position: absolute; inset-inline-start: -10px; inset-block-start: 50%; transform: translateY(-50%); z-index: 3; display: inline-flex; align-items: center; justify-content: center; inline-size: 18px; block-size: 18px; border-radius: 50%; background: var(--card); color: var(--muted-foreground); border: 1px solid var(--border); }
    @media (prefers-reduced-motion: reduce) { .seg.live { animation: none; } }
  `],
})
export class TrRelayRibbonComponent {
  readonly __trk1 = (__i: number, s: any): any => __i;
  private readonly i18n = inject(I18nService);
  private readonly fmt = inject(FormatService);
  private readonly clock = inject(ClockService);

  private readonly _segments = signal<RelaySegmentVM[]>(undefined as any);
  @Input() get segments(): Signal<RelaySegmentVM[]> { return this._segments; }
  set segments(v: any) { this._segments.set(v); }
  @Output() jump = new EventEmitter<string>();
  /** Folded by default; the who-bar toggle opens it (two-way bound). */
  private readonly _expanded = signal(false);
  @Input('expanded') set expandedIn(v: boolean) { this._expanded.set(!!v); }
  @Output() expandedChange = new EventEmitter<boolean>();
  /** Two-way state (`[expanded]` + `(expandedChange)`): reads as `expanded()`, writes as `expanded.set(v)`. */
  readonly expanded = Object.assign(() => this._expanded(), {
    set: (v: boolean) => { this._expanded.set(v); this.expandedChange.emit(v); },
    update: (fn: (v: boolean) => boolean) => { const v = fn(this._expanded()); this._expanded.set(v); this.expandedChange.emit(v); },
  });

  protected readonly segs = computed<Seg[]>(() => {
    const now = this.clock.now().getTime();
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const raw = this.segments();
    const merge = raw.length > 8 ? raw.slice(0, raw.length - 7) : [];
    const rest = raw.length > 8 ? raw.slice(raw.length - 7) : raw;
    const build = (s: RelaySegmentVM): Seg => {
      const ms = Math.max(1000, (s.end?.getTime() ?? now) - s.start.getTime());
      const kindLabel = t(`relay.kind.${s.kind}`);
      const who = s.actorLabel || kindLabel;
      const dur = this.fmt.duration(ms);
      return { ...s, ms, label: `${who} ${dur}`, tip: t('relay.tip', { who, dur, n: s.messageCount }), icon: s.reason ? REASON_ICON[s.reason] : undefined };
    };
    const out = rest.map(build);
    if (merge.length) {
      const ms = merge.reduce((a, s) => a + ((s.end?.getTime() ?? now) - s.start.getTime()), 0);
      out.unshift({ ...merge[0]!, kind: 'customer_pending', actorLabel: '…', ms, label: '…', tip: t('relay.earlier', { n: merge.length }), merged: true, end: merge[merge.length - 1]!.end });
    }
    return out;
  });
}
