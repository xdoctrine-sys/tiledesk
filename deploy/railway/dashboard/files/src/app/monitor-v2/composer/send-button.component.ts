import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TranslatePipe } from '../core/services/i18n.service';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { isRtlNow } from '../core/util/dir';

export type SendAfter = 'open' | 'pending' | 'resolved';

/**
 * Send button (F-76): a 40 px square. A click sends and keeps the conversation open; long press, right click or the corner mark
 * offer "Send and resolve" and "Send and set pending". In note mode it adds the note and has no menu.
 */
@Component({
  standalone: true,
  selector: 'tr-send-button',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'open.set(false)' },
  template: `
    <button type="button" class="send" [disabled]="disabled()" [attr.aria-haspopup]="mode() === 'reply' ? 'menu' : null" [attr.aria-expanded]="mode() === 'reply' ? open() : null"
      [attr.aria-label]="(mode() === 'note' ? 'comp.addNote' : 'comp.send') | t" [title]="((mode() === 'note' ? 'comp.addNote' : 'comp.send') | t) + (mode() === 'reply' ? ' · ' + ('comp.sendOptions' | t) : '')"
      (click)="onClick($event)" (contextmenu)="onContext($event)" (pointerdown)="down()" (pointerup)="cancel()" (pointerleave)="cancel()" (pointercancel)="cancel()">
      <tr-icon [name]="mode() === 'note' ? 'check' : 'send-horizontal'" [size]="18" [class.tr-mirror]="mode() === 'reply'"></tr-icon>
      <ng-container *ngIf="mode() === 'reply'"> <span class="corner" aria-hidden="true"></span> </ng-container>
    </button>
    <ng-container *ngIf="open()">
      <div class="tr-menu menu" role="menu" (trClickOutside)="open.set(false)">
        <button type="button" role="menuitem" class="tr-menu__item" (click)="fire('open')"><tr-icon name="send-horizontal" [size]="16" class="tr-mirror"></tr-icon>{{ 'comp.send' | t }}<span class="tr-menu__kbd">⌘↵</span></button>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="fire('resolved')"><tr-icon name="circle-check" [size]="16"></tr-icon>{{ 'comp.sendResolve' | t }}<span class="tr-menu__kbd">⌘⇧↵</span></button>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="fire('pending')"><tr-icon name="circle-pause" [size]="16"></tr-icon>{{ 'comp.sendPending' | t }}<span class="tr-menu__kbd">⌘⌥↵</span></button>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; flex: none; }
    /* 40 px square, radius 12, solid --primary, white icon. Send options: long press, right click, or the small corner mark. */
    .send { position: relative; display: inline-flex; align-items: center; justify-content: center; inline-size: 40px; block-size: 40px; border-radius: 12px; background: var(--primary); color: var(--primary-foreground); }
    .send:hover:not(:disabled) { opacity: .88; }
    .send:disabled { opacity: .35; cursor: not-allowed; }
    .corner { position: absolute; inset-inline-end: 3px; inset-block-end: 3px; inline-size: 7px; block-size: 7px; background: currentColor; opacity: .55; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
    :host-context([dir='rtl']) .corner { clip-path: polygon(0 0, 100% 100%, 0 100%); }
    .menu { inset-block-end: 100%; inset-inline-end: 0; margin-block-end: 6px; min-inline-size: 270px; }
  `],
})
export class TrSendButtonComponent {
  private readonly _mode = signal<'reply' | 'note'>('reply');
  @Input() get mode(): Signal<'reply' | 'note'> { return this._mode; }
  set mode(v: any) { this._mode.set(v); }
  private readonly _disabled = signal(false);
  @Input() get disabled() { return this._disabled; }
  set disabled(v: any) { this._disabled.set(v); }
  @Output() send = new EventEmitter<SendAfter>();
  protected readonly open = signal(false);
  private press: ReturnType<typeof setTimeout> | null = null;
  private longPressed = false;

  protected down(): void {
    if (this.mode() !== 'reply' || this.disabled()) return;
    this.longPressed = false;
    this.press = setTimeout(() => { this.longPressed = true; this.open.set(true); }, 450);
  }
  protected cancel(): void {
    if (this.press) clearTimeout(this.press);
    this.press = null;
  }
  protected onContext(e: MouseEvent): void {
    if (this.mode() !== 'reply') return;
    e.preventDefault();
    if (!this.disabled()) this.open.set(true);
  }
  protected onClick(e: MouseEvent): void {
    if (this.longPressed) { this.longPressed = false; return; }
    // the small corner mark (last 12 px of the button) opens the menu instead of sending
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rtl = isRtlNow();
    const inCorner = this.mode() === 'reply' && e.clientY > r.bottom - 12 && (rtl ? e.clientX < r.left + 12 : e.clientX > r.right - 12);
    if (inCorner) return this.open.set(!this.open());
    this.send.emit('open');
  }
  protected fire(a: SendAfter): void {
    this.open.set(false);
    this.send.emit(a);
  }
}
