import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { TakeoverBriefVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';

/**
 * Handover brief (I-2, F-127, F-109): inserted above the composer when a human takes over from the bot. What the
 * customer wants in one sentence, what the bot already collected (each value jumps to its source message), why the
 * conversation was handed over, the mood, and a suggested first reply. Folds to one line after the first reply.
 */
@Component({
  standalone: true,
  selector: 'tr-takeover-brief',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <section class="card" [attr.aria-label]="'brief.title' | t">
      <header class="hd">
        <tr-icon name="sparkles" [size]="14" class="sp"></tr-icon>
        <h3>{{ 'brief.title' | t }}</h3>
        <ng-container *ngIf="!open()"> <span class="one tr-truncate" dir="auto">{{ brief().summary }}</span> </ng-container>
        <button type="button" class="tr-icon-btn tg" [attr.aria-expanded]="open()" [attr.aria-label]="(open() ? 'brief.collapse' : 'brief.expand') | t" (click)="toggle.emit()"><tr-icon [name]="open() ? 'chevron-down' : 'chevron-up'" [size]="16"></tr-icon></button>
      </header>
      <ng-container *ngIf="open()">
        <div class="body">
          <p class="sum" dir="auto">{{ brief().summary }}</p>
          <div class="chips">
            <ng-container *ngFor="let s of brief().slots; trackBy: __trk1">
              <button type="button" class="slot" [disabled]="!s.messageId" [attr.title]="'bot.jump' | t" (click)="s.messageId && jump.emit(s.messageId)"><span class="k">{{ label(s.key) }}</span><span class="v" dir="auto">{{ s.value }}</span></button>
            </ng-container>
          </div>
          <div class="why">
            <ng-container *ngIf="brief().handoffReason"> <span><tr-icon [name]="reasonIcon()" [size]="14"></tr-icon>{{ ('brief.reason.' + brief().handoffReason) | t }}</span> </ng-container>
            <span><tr-icon [name]="brief().sentiment === 'positive' ? 'smile' : brief().sentiment === 'negative' ? 'frown' : 'meh'" [size]="14"></tr-icon>{{ ('brief.mood.' + brief().sentiment) | t }}</span>
          </div>
          <ng-container *ngIf="brief().suggestion as s">
            <div class="sug">
              <p dir="auto"><span class="lb">{{ 'brief.suggestion' | t }}</span>{{ s.text }}</p>
              <div class="acts">
                <button type="button" class="tr-btn tr-btn--ghost" (click)="dismiss.emit()">{{ 'brief.ignore' | t }}</button>
                <button type="button" class="tr-btn" (click)="insert.emit(s.text)">{{ 'brief.insert' | t }}</button>
              </div>
            </div>
          </ng-container>
        </div>
      </ng-container>
    </section>
  `,
  styles: [`
    :host { display: block; padding: 0 16px 8px; }
    /* hand-over: one folded line, --muted, radius 12, no coloured border */
    .card { border-radius: var(--radius-lg); background: var(--muted); max-block-size: 40vh; overflow: auto; }
    .hd { display: flex; align-items: center; gap: 8px; min-block-size: 36px; padding-inline: 12px 4px; }
    .hd h3 { font-size: var(--tr-fs-body-sm); font-weight: 500; flex: none; } .sp { color: var(--muted-foreground); flex: none; }
    .one { flex: 1; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } .tg { margin-inline-start: auto; }
    .body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 10px; }
    .sum { margin: 0; color: var(--foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .slot { display: inline-flex; align-items: center; gap: 6px; min-block-size: 26px; padding-inline: 10px; border-radius: var(--radius-md); background: var(--card); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    .slot:hover:not(:disabled) { background: var(--accent); } .slot:disabled { cursor: default; }
    .slot .k { color: var(--muted-foreground); } .slot .v { font-weight: 500; }
    .why { display: flex; flex-wrap: wrap; gap: 2px 14px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); } .why span { display: inline-flex; align-items: center; gap: 6px; }
    .sug { display: flex; align-items: center; gap: 8px; padding-block: 8px; padding-inline: 12px 8px; border-radius: var(--radius-md); background: var(--card); }
    .sug p { flex: 1; margin: 0; font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .lb { display: block; color: var(--muted-foreground); font-size: var(--tr-fs-micro); font-weight: 600; }
    .acts { display: flex; flex: none; gap: 4px; } .acts .tr-btn { min-block-size: 32px; padding-inline: 10px; }
  `],
})
export class TrTakeoverBriefComponent {
  readonly __trk1 = (__i: number, s: any): any => s.key;
  private readonly i18n = inject(I18nService);
  protected label(key: string): string {
    const k = `bot.slot.${key}`;
    return this.i18n.has(k) ? this.i18n.t(k) : key;
  }
  private readonly _brief = signal<TakeoverBriefVM>(undefined as any);
  @Input() get brief(): Signal<TakeoverBriefVM> { return this._brief; }
  set brief(v: any) { this._brief.set(v); }
  private readonly _open = signal(true);
  @Input() get open() { return this._open; }
  set open(v: any) { this._open.set(v); }
  @Output() insert = new EventEmitter<string>();
  @Output() dismiss = new EventEmitter<void>();
  @Output() jump = new EventEmitter<string>();
  @Output() toggle = new EventEmitter<void>();
  protected reasonIcon(): string {
    switch (this.brief().handoffReason) {
      case 'customer_asked': return 'hand';
      case 'bot_failed': return 'triangle-alert';
      case 'agent_transfer': return 'arrow-left-right';
      case 'handed_back': return 'corner-up-left';
      default: return 'info';
    }
  }
}
