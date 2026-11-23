import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { LabelVM } from '../core/models/view-models';

/** Label = outline badge (radius 6) with a neutral 8 px dot. Never coloured text. */
@Component({
  standalone: true,
  selector: 'tr-label-chip',
  imports: [TrIconComponent, CommonModule],
  template: `
    <span class="dot" [style.background]="'var(--muted-foreground)'"></span>
    <span class="name">{{ label().name }}</span>
    <ng-container *ngIf="removable()">
      <button type="button" class="x" (click)="remove.emit()" [attr.aria-label]="'×'"><tr-icon name="x" [size]="12"></tr-icon></button>
    </ng-container>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; max-inline-size: 100%; block-size: 22px; padding-inline: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); white-space: nowrap; }
    .dot { inline-size: 8px; block-size: 8px; border-radius: 50%; flex: none; }
    .name { overflow: hidden; text-overflow: ellipsis; }
    .x { display: inline-flex; color: var(--muted-foreground); margin-inline-end: -4px; border-radius: 50%; }
    .x:hover { color: var(--foreground); }
  `],
})
export class TrLabelChipComponent {
  private readonly _label = signal<LabelVM>(undefined as any);
  @Input() get label(): Signal<LabelVM> { return this._label; }
  set label(v: any) { this._label.set(v); }
  private readonly _removable = signal(false);
  @Input() get removable() { return this._removable; }
  set removable(v: any) { this._removable.set(v); }
  @Output() remove = new EventEmitter<void>();
}
