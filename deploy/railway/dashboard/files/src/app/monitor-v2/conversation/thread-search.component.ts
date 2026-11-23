import { Signal, afterNextRender, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { MessageStore } from '../core/stores/message.store';

/** Search inside the open conversation with highlighting (F-64): ⌘⇧F, ↵ / ⇧↵ next / previous match, Esc closes. */
@Component({
  standalone: true,
  selector: 'tr-thread-search',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <div class="bar" role="search">
      <tr-icon name="search" [size]="16"></tr-icon>
      <input #q class="in" type="search" dir="auto" [placeholder]="'thread.search' | t" [value]="store.searchQuery()" (input)="onInput($any($event.target).value)" (keydown.enter)="$event.preventDefault(); store.stepMatch($any($event).shiftKey ? -1 : 1)" (keydown.escape)="store.closeSearch()" />
      <span class="n" aria-live="polite"><ng-container *ngIf="store.searchMatches().length; else __e1"> {{ fmt.number(store.searchIndex() + 1) }} / {{ fmt.number(store.searchMatches().length) }} </ng-container><ng-template #__e1><ng-container *ngIf="store.searchQuery()"> {{ 'thread.noMatch' | t }} </ng-container></ng-template></span>
      <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.previous' | t" (click)="store.stepMatch(-1)"><tr-icon name="chevron-up" [size]="16"></tr-icon></button>
      <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.next' | t" (click)="store.stepMatch(1)"><tr-icon name="chevron-down" [size]="16"></tr-icon></button>
      <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="store.closeSearch()"><tr-icon name="x" [size]="16"></tr-icon></button>
    </div>
  `,
  styles: [`
    :host { display: block; background: var(--card); border-block-end: 1px solid var(--border); }
    .bar { display: flex; align-items: center; gap: 4px; padding-block: 4px; padding-inline: 16px 8px; min-block-size: 44px; color: var(--muted-foreground); }
    .in { flex: 1; min-inline-size: 0; border: 0; background: none; outline: none; color: var(--foreground); font-size: var(--tr-fs-body); padding-inline: 8px; } .in::-webkit-search-cancel-button { display: none; }
    .n { color: var(--muted-foreground); font-size: var(--tr-fs-caption); white-space: nowrap; margin-inline-end: 4px; }
  `],
})
export class TrThreadSearchComponent {
  protected readonly store = inject(MessageStore);
  protected readonly fmt = inject(FormatService);
  private readonly _q = signal<ElementRef<HTMLInputElement>>(undefined as any);
  @ViewChild('q') private get q(): Signal<ElementRef<HTMLInputElement>> { return this._q; }
  private set q(v: any) { this._q.set(v); }

  constructor() {
    afterNextRender(() => this.q().nativeElement.focus());
  }

  protected onInput(v: string): void {
    this.store.searchQuery.set(v);
    this.store.searchIndex.set(0);
    queueMicrotask(() => this.store.searchMatches().length && this.store.jump(this.store.searchMatches()[0]!));
  }
}
