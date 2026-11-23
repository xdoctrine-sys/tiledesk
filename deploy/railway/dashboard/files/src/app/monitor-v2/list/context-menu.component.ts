import { Signal, afterNextRender, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, Input, Output, EventEmitter } from '@angular/core';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { activeElementOf } from '../core/util/dom';
import { isRtlNow } from '../core/util/dir';

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  checked?: boolean;
  /** section title (not clickable) */
  title?: boolean;
  children?: MenuItem[];
}

/**
 * Generic context menu with sub-menus (F-30, F-36, F-37). Opens at the pointer (right-click), at the element
 * (Shift+F10) or on long press (mobile). Arrow keys move, Enter selects, Esc closes. Sub-menus open towards the
 * end side of the menu, so they mirror in RTL.
 */
@Component({
  standalone: true,
  selector: 'tr-context-menu',
  imports: [TrIconComponent, ClickOutsideDirective, CommonModule],
  host: { '(keydown)': 'onKey($event)' },
  template: `
    <div class="tr-menu m" role="menu" tabindex="-1" [style.left.px]="left()" [style.top.px]="top()" (trClickOutside)="close.emit()" #menu>
      <ng-container *ngFor="let it of items(); trackBy: __trk4">
        <ng-container *ngIf="it.divider; else __e2">
          <div class="tr-menu__sep" role="separator"></div>
        </ng-container><ng-template #__e2><ng-container *ngIf="it.title; else __e3">
          <div class="tr-menu__title">{{ it.label }}</div>
        </ng-container><ng-template #__e3>
          <div class="row" (mouseenter)="sub.set(it.children ? it.id : null)">
            <button type="button" class="tr-menu__item" role="menuitem" [class.tr-menu__item--danger]="it.danger" [disabled]="it.disabled"
              [attr.aria-haspopup]="it.children ? 'menu' : null" [attr.aria-expanded]="it.children ? sub() === it.id : null"
              (click)="it.children ? sub.set(it.id) : pick(it)">
              <ng-container *ngIf="it.icon"> <tr-icon [name]="it.icon" [size]="16"></tr-icon> </ng-container>
              <span class="tr-truncate">{{ it.label }}</span>
              <ng-container *ngIf="it.checked"> <tr-icon name="check" [size]="14" class="tr-menu__kbd"></tr-icon> </ng-container>
              <ng-container *ngIf="it.shortcut"> <span class="tr-menu__kbd">{{ it.shortcut }}</span> </ng-container>
              <ng-container *ngIf="it.children"> <tr-icon name="chevron-right" [size]="14" class="tr-mirror tr-menu__kbd"></tr-icon> </ng-container>
            </button>
            <ng-container *ngIf="it.children && sub() === it.id">
              <div class="tr-menu subm" role="menu">
                <ng-container *ngFor="let c of it.children; trackBy: __trk1">
                  <button type="button" class="tr-menu__item" role="menuitem" [disabled]="c.disabled" (click)="pick(c)">
                    <ng-container *ngIf="c.icon"> <tr-icon [name]="c.icon" [size]="16"></tr-icon> </ng-container>
                    <span class="tr-truncate">{{ c.label }}</span>
                    <ng-container *ngIf="c.checked"> <tr-icon name="check" [size]="14" class="tr-menu__kbd"></tr-icon> </ng-container>
                  </button>
                </ng-container>
              </div>
            </ng-container>
          </div>
        </ng-template></ng-template>
      </ng-container>
    </div>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 100; pointer-events: none; }
    .m { position: fixed; pointer-events: auto; min-inline-size: 220px; }
    .row { position: relative; }
    .subm { position: absolute; inset-inline-start: 100%; inset-block-start: -4px; pointer-events: auto; }
  `],
})
export class TrContextMenuComponent {
  readonly __trk1 = (__i: number, c: any): any => c.id;
  readonly __trk4 = (__i: number, it: any): any => it.id;
  private readonly _items = signal<MenuItem[]>(undefined as any);
  @Input() get items(): Signal<MenuItem[]> { return this._items; }
  set items(v: any) { this._items.set(v); }
  private readonly _x = signal(0);
  @Input() get x() { return this._x; }
  set x(v: any) { this._x.set(v); }
  private readonly _y = signal(0);
  @Input() get y() { return this._y; }
  set y(v: any) { this._y.set(v); }
  @Output() select = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  protected readonly sub = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly size = signal({ w: 240, h: 320 });

  // pointer coordinates are physical (left/top) by nature; clamped to the viewport
  protected readonly left = computed(() => Math.max(8, Math.min(this.x(), window.innerWidth - this.size().w - 8)));
  protected readonly top = computed(() => Math.max(8, Math.min(this.y(), window.innerHeight - this.size().h - 8)));

  constructor() {
    afterNextRender(() => {
      const m = this.host.nativeElement.querySelector<HTMLElement>('.m');
      if (m) {
        this.size.set({ w: m.offsetWidth, h: m.offsetHeight });
        m.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
      }
    });
  }

  protected pick(it: MenuItem): void {
    if (it.disabled) return;
    this.select.emit(it.id);
    this.close.emit();
  }

  protected onKey(e: KeyboardEvent): void {
    const btns = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.m > .row > button:not(:disabled)'));
    const i = btns.indexOf(activeElementOf(this.host.nativeElement) as HTMLElement);
    const rtl = isRtlNow();
    if (e.key === 'Escape') { e.preventDefault(); this.close.emit(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); btns[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1]?.focus(); }
    else if ((e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) && i >= 0) {
      const it = this.items().filter((x) => !x.divider && !x.title)[i];
      if (it?.children) { e.preventDefault(); this.sub.set(it.id); setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.subm button')?.focus()); }
    } else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) { this.sub.set(null); }
  }
}
