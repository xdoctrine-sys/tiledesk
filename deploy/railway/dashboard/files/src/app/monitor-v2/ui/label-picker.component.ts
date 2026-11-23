import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { LabelVM } from '../core/models/view-models';
import { TranslatePipe } from '../core/services/i18n.service';
import { DirectoryStore } from '../core/stores/directory.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

/**
 * Label picker: search, checkable labels, "Create 'xxx'" (F-46, F-137). Changes apply immediately.
 * `placement` lets the panel open upwards when it sits low on the screen.
 */
@Component({
  standalone: true,
  selector: 'tr-label-picker',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'close.emit()' },
  template: `
    <div class="tr-menu panel" role="dialog" [attr.aria-label]="'labels.title' | t" (trClickOutside)="close.emit()">
      <input class="tr-field" type="search" [placeholder]="'labels.search' | t" [value]="query()" (input)="query.set($any($event.target).value)" (keydown.enter)="onEnter()" #search autofocus />
      <ul class="list" role="listbox" aria-multiselectable="true">
        <ng-container *ngFor="let l of filtered(); trackBy: __trk1">
          <li>
            <button type="button" class="tr-menu__item" role="option" [attr.aria-selected]="isOn(l)" (click)="toggle.emit(l)">
              <span class="box" [class.on]="isOn(l)"><ng-container *ngIf="isOn(l)"> <tr-icon name="check" [size]="12"></tr-icon> </ng-container></span>
              <span class="tr-dot" [style.background]="'var(--muted-foreground)'"></span>
              <span class="n">{{ l.name }}</span>
            </button>
          </li>
        </ng-container>
        <ng-container *ngIf="canCreate(); else __e2">
          <li>
            <button type="button" class="tr-menu__item" (click)="create.emit(query().trim()); query.set('')">
              <tr-icon name="plus" [size]="14"></tr-icon>{{ 'labels.create' | t: { name: query().trim() } }}
            </button>
          </li>
        </ng-container><ng-template #__e2><ng-container *ngIf="!filtered().length">
          <li class="none">{{ 'labels.none' | t }}</li>
        </ng-container></ng-template>
      </ul>
    </div>
  `,
  styles: [`
    :host { position: absolute; inset-inline-start: 0; inset-block-start: 100%; z-index: 100; margin-block-start: 4px; }
    :host(.up) { inset-block-start: auto; inset-block-end: 100%; margin-block: 0 4px; }
    .panel { position: static; inline-size: 260px; padding: 8px; }
    .list { max-block-size: 220px; overflow: auto; margin-block-start: 6px; }
    .box { display: inline-flex; align-items: center; justify-content: center; inline-size: 16px; block-size: 16px; border: 1px solid var(--input); border-radius: 4px; background: var(--card); color: var(--primary-foreground); flex: none; }
    .box.on { background: var(--primary); border-color: var(--primary); }
    .n { overflow: hidden; text-overflow: ellipsis; }
    .none { padding: 8px 10px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrLabelPickerComponent {
  readonly __trk1 = (__i: number, l: any): any => l.id;
  private readonly dir = inject(DirectoryStore);
  private readonly _selected = signal<LabelVM[]>([]);
  @Input() get selected(): Signal<LabelVM[]> { return this._selected; }
  set selected(v: any) { this._selected.set(v); }
  @Output() toggle = new EventEmitter<LabelVM>();
  @Output() create = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.dir.labels().filter((l) => !q || l.name.toLowerCase().includes(q));
  });
  protected readonly canCreate = computed(() => {
    const q = this.query().trim();
    return !!q && !this.dir.labels().some((l) => l.name.toLowerCase() === q.toLowerCase());
  });

  protected isOn(l: LabelVM): boolean {
    return this.selected().some((s) => s.id === l.id);
  }

  protected onEnter(): void {
    if (this.canCreate()) {
      this.create.emit(this.query().trim());
      this.query.set('');
    } else if (this.filtered().length === 1) this.toggle.emit(this.filtered()[0]!);
  }
}
