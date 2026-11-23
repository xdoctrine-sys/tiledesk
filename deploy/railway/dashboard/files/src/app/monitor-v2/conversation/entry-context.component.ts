import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { TranslatePipe } from '../core/services/i18n.service';
import { UiStore } from '../core/stores/ui.store';

/** First card of the thread (F-65): where the visitor started from: page title, page, language, entry department. */
@Component({
  standalone: true,
  selector: 'tr-entry-context',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container *ngIf="c().raw.sourcePage as page">
      <button type="button" class="card" (click)="ui.openContext()" [attr.aria-label]="'entry.open' | t">
        <tr-icon name="globe" [size]="16" class="ic"></tr-icon>
        <span class="txt">
          <span class="ttl tr-truncate" dir="auto">{{ c().raw.attributes.sourceTitle || host() }}</span>
          <span class="sub tr-truncate"><bdi class="tr-ltr">{{ host() }}</bdi><ng-container *ngIf="c().customer.language"> · {{ ('lang.' + c().customer.language) | t }} </ng-container><ng-container *ngIf="c().department"> · {{ c().department!.name }} </ng-container></span>
        </span>
        <tr-icon name="chevron-right" [size]="14" class="tr-mirror go"></tr-icon>
      </button>
    </ng-container>
  `,
  styles: [`
    :host { display: block; padding: 8px 16px 0; }
    .card { display: flex; align-items: center; gap: 10px; inline-size: 100%; padding: 8px 12px; border-radius: var(--radius-md); background: var(--muted); text-align: start; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .card:hover { background: var(--muted); } .ic, .go { flex: none; color: var(--muted-foreground); }
    .txt { display: flex; flex-direction: column; min-inline-size: 0; flex: 1; } .ttl { font-size: var(--tr-fs-body-sm); color: var(--foreground); font-weight: 600; } .sub { color: var(--muted-foreground); }
  `],
})
export class TrEntryContextComponent {
  protected readonly ui = inject(UiStore);
  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly host = computed(() => {
    try { return new URL(this.c().raw.sourcePage ?? '').host; } catch { return this.c().raw.sourcePage ?? ''; }
  });
}
