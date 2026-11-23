import { Signal, computed, signal } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { StatusTab } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { isRtlNow } from '../core/util/dir';

const TABS: StatusTab[] = ['open', 'pending', 'snoozed', 'resolved', 'all'];

/** Status tabs as plain text, 2 px --brand underline under the active one, a grey counter only on the active tab (F-20). Arrow keys move between tabs; Alt+N cycles from anywhere. */
@Component({
  standalone: true,
  selector: 'tr-status-tabs',
  imports: [TranslatePipe, CommonModule],
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="'tabs.label' | t" (keydown)="onKey($event)">
      <ng-container *ngFor="let t of tabs; trackBy: __trk1">
        <button type="button" role="tab" class="tab" [class.on]="t === active()" [attr.aria-selected]="t === active()" [attr.tabindex]="t === active() ? 0 : -1" (click)="pick.emit(t)">
          {{ ('tabs.' + t) | t }}<ng-container *ngIf="t === active() && counts()[t] > 0"> <span class="n">{{ fmt.number(counts()[t]) }}</span> </ng-container>
        </button>
      </ng-container>
    </div>
  `,
  styles: [`
    :host { display: block; margin-inline: 16px; border-block-end: 1px solid var(--border); }
    .tabs { display: flex; gap: 16px; overflow-x: auto; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab { position: relative; flex: none; display: inline-flex; align-items: center; gap: 6px; block-size: 40px; padding-inline: 2px; color: var(--muted-foreground); font-size: var(--tr-fs-body); line-height: var(--tr-lh-body); white-space: nowrap; }
    .tab:hover { color: var(--foreground); }
    .tab.on { color: var(--foreground); font-weight: 500; }
    .tab.on::after { content: ''; position: absolute; inset-inline: 0; inset-block-end: -1px; block-size: 2px; background: var(--brand); }
    .n { color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 400; }
    .tab.on .n { color: var(--foreground); }
  `],
})
export class TrStatusTabsComponent {
  readonly __trk1 = (__i: number, t: any): any => t;
  protected readonly fmt = inject(FormatService);
  private readonly _active = signal<StatusTab>(undefined as any);
  @Input() get active(): Signal<StatusTab> { return this._active; }
  set active(v: any) { this._active.set(v); }
  private readonly _counts = signal<Record<StatusTab, number>>(undefined as any);
  @Input() get counts(): Signal<Record<StatusTab, number>> { return this._counts; }
  set counts(v: any) { this._counts.set(v); }
  @Output() pick = new EventEmitter<StatusTab>();
  protected readonly tabs = TABS;
  protected readonly idx = computed(() => TABS.indexOf(this.active()));

  protected onKey(e: KeyboardEvent): void {
    const rtl = isRtlNow();
    const fwd = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const back = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!fwd && !back) return;
    e.preventDefault();
    const next = TABS[(this.idx() + (fwd ? 1 : -1) + TABS.length) % TABS.length]!;
    this.pick.emit(next);
    setTimeout(() => (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  }

  next(): void {
    this.pick.emit(TABS[(this.idx() + 1) % TABS.length]!);
  }
}
