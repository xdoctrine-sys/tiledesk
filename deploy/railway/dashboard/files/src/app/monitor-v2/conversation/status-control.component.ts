import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ActorKind } from '../core/models/view-models';
import { TranslatePipe } from '../core/services/i18n.service';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

/**
 * The one primary button of the header: "Resolve" with a chevron (split button). Menu: Resolve (E), Resolve and next
 * (Shift+E), Mark as pending (waiting for the customer), Reopen (when resolved). When resolved the main button reads "Reopen".
 */
@Component({
  standalone: true,
  selector: 'tr-status-control',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'open.set(false)' },
  template: `
    <div class="split">
      <ng-container *ngIf="closed(); else __e1">
        <button type="button" class="main" (click)="reopen.emit()"><tr-icon name="rotate-cw" [size]="16"></tr-icon><span class="lbl">{{ 'actions.reopen' | t }}</span></button>
      </ng-container><ng-template #__e1>
        <button type="button" class="main" (click)="resolve.emit()" [title]="('actions.resolve' | t) + ' (E)'"><tr-icon name="circle-check" [size]="16"></tr-icon><span class="lbl">{{ 'actions.resolve' | t }}</span></button>
        <button type="button" class="chev" [attr.aria-expanded]="open()" aria-haspopup="menu" [attr.aria-label]="'common.more' | t" (click)="open.set(!open())"><tr-icon name="chevron-down" [size]="16"></tr-icon></button>
      </ng-template>
    </div>
    <ng-container *ngIf="open()">
      <div class="tr-menu menu" role="menu" (trClickOutside)="open.set(false)">
        <button type="button" role="menuitem" class="tr-menu__item" (click)="fire('resolve')"><tr-icon name="circle-check" [size]="16"></tr-icon>{{ 'actions.resolve' | t }}<span class="tr-menu__kbd">E</span></button>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="fire('resolveNext')"><tr-icon name="arrow-down" [size]="16"></tr-icon>{{ 'actions.resolveNext' | t }}<span class="tr-menu__kbd">⇧E</span></button>
        <button type="button" role="menuitem" class="tr-menu__item" [disabled]="kind() === 'customer_pending'" (click)="fire('pending')"><tr-icon name="circle-pause" [size]="16"></tr-icon>{{ 'actions.pending' | t }}</button>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .split { display: inline-flex; border-radius: var(--radius-md); background: var(--primary); color: var(--primary-foreground); }
    .main, .chev { display: inline-flex; align-items: center; gap: 8px; min-block-size: 36px; color: inherit; font-size: var(--tr-fs-body); font-weight: 500; position: relative; }
    .main { padding-inline: 12px 10px; border-start-start-radius: var(--radius-md); border-end-start-radius: var(--radius-md); } .chev { padding-inline: 8px; border-inline-start: 1px solid color-mix(in srgb, var(--primary-foreground) 25%, transparent); border-start-end-radius: var(--radius-md); border-end-end-radius: var(--radius-md); }
    .main::after, .chev::after { content: ''; position: absolute; inset-inline: 0; inset-block: -4px; }
    .main:hover, .chev:hover { opacity: .88; }
    @container (max-width: 430px) { .lbl { display: none; } .main { padding-inline: 10px 8px; } }
    .menu { inset-block-start: 100%; inset-inline-end: 0; margin-block-start: 4px; min-inline-size: 240px; }
  `],
})
export class TrStatusControlComponent {
  private readonly _kind = signal<ActorKind>(undefined as any);
  @Input() get kind(): Signal<ActorKind> { return this._kind; }
  set kind(v: any) { this._kind.set(v); }
  private readonly _closed = signal(false);
  @Input() get closed() { return this._closed; }
  set closed(v: any) { this._closed.set(v); }
  @Output() resolve = new EventEmitter<void>();
  @Output() resolveNext = new EventEmitter<void>();
  @Output() pending = new EventEmitter<void>();
  @Output() reopen = new EventEmitter<void>();
  protected readonly open = signal(false);

  protected fire(a: 'resolve' | 'resolveNext' | 'pending'): void {
    this.open.set(false);
    this[a].emit();
  }
}
