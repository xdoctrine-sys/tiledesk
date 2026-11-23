import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Priority } from '../core/models/view-models';
import { TranslatePipe } from '../core/services/i18n.service';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

const LEVELS: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

/** Priority menu: flag icon + label. Only the Urgent flag is red. */
@Component({
  standalone: true,
  selector: 'tr-priority-select',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'open.set(false)' },
  template: `
    <button type="button" class="trigger" [class.field]="variant() === 'field'" [attr.aria-expanded]="open()" aria-haspopup="menu" (click)="open.set(!open())">
      <tr-icon name="flag" [size]="16" [class]="'flag p-' + value()"></tr-icon>
      <span class="txt" [class.quiet]="variant() === 'inline' && (value() === 'medium' || value() === 'none')">{{ ('priority.' + value()) | t }}</span>
      <tr-icon name="chevron-down" [size]="14" class="chev"></tr-icon>
    </button>
    <ng-container *ngIf="open()">
      <div class="tr-menu menu" role="menu" (trClickOutside)="open.set(false)">
        <ng-container *ngFor="let p of levels; trackBy: __trk1">
          <button type="button" role="menuitemradio" class="tr-menu__item" [class.is-selected]="p === value()" [attr.aria-checked]="p === value()" (click)="pick(p)">
            <tr-icon name="flag" [size]="16" [class]="'flag p-' + p"></tr-icon>
            {{ ('priority.' + p) | t }}
            <ng-container *ngIf="p === value()"> <tr-icon name="check" [size]="14" class="tr-menu__kbd"></tr-icon> </ng-container>
          </button>
        </ng-container>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { position: relative; display: inline-block; }
    .trigger { display: inline-flex; align-items: center; gap: 4px; min-block-size: 28px; padding-inline: 6px; border-radius: var(--radius-md); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .trigger:hover { background: var(--muted); }
    .trigger.field { inline-size: 100%; min-block-size: 36px; border: 1px solid var(--input); background: var(--card); padding-inline: 10px; }
    .field .chev { margin-inline-start: auto; }
    .menu { inset-block-start: 100%; inset-inline-start: 0; min-inline-size: 180px; margin-block-start: 4px; }
    /* the default priority only shows its flag; the name appears once it is Low, High or Urgent */
    .txt.quiet { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
    .flag { flex: none; color: var(--muted-foreground); }
    .p-urgent { color: var(--destructive); }
    .trigger .flag { color: var(--muted-foreground); }
  `],
})
export class TrPrioritySelectComponent {
  readonly __trk1 = (__i: number, p: any): any => p;
  private readonly _value = signal<Priority>('medium');
  @Input() get value(): Signal<Priority> { return this._value; }
  set value(v: any) { this._value.set(v); }
  private readonly _variant = signal<'inline' | 'field'>('inline');
  @Input() get variant(): Signal<'inline' | 'field'> { return this._variant; }
  set variant(v: any) { this._variant.set(v); }
  @Output() changed = new EventEmitter<Priority>();
  protected readonly open = signal(false);
  protected readonly levels = LEVELS;

  protected pick(p: Priority): void {
    this.open.set(false);
    this.changed.emit(p);
  }

  toggle(): void {
    this.open.update((o) => !o);
  }
}
