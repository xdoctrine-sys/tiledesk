import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { UiStore } from '../core/stores/ui.store';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { ChannelCapabilities, MessageVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { MenuItem, TrContextMenuComponent } from '../list/context-menu.component';

export type MessageAction = 'reply' | 'copy' | 'translate' | 'link' | 'toCanned' | 'flag' | 'delete' | 'toContact';

/**
 * Message actions in three equivalent forms: hover toolbar (desktop), right-click menu, long-press (mobile) (F-66 to F-74).
 * Toolbar: reply · copy · translate · "…". The "…" menu holds the rest (link, saved reply, flag a bot answer, delete).
 */
@Component({
  standalone: true,
  selector: 'tr-message-actions',
  imports: [TrIconComponent, TranslatePipe, TrContextMenuComponent, CommonModule],
  template: `
    <div class="tb" role="toolbar" [attr.aria-label]="'msg.actions' | t">
      <button type="button" class="tr-icon-btn b" [attr.aria-label]="'msg.reply' | t" [title]="'msg.reply' | t" (click)="act.emit('reply')"><tr-icon name="corner-up-left" [size]="16" class="tr-mirror"></tr-icon></button>
      <button type="button" class="tr-icon-btn b" [attr.aria-label]="'msg.copy' | t" [title]="'msg.copy' | t" (click)="act.emit('copy')"><tr-icon name="copy" [size]="16"></tr-icon></button>
      <ng-container *ngIf="message().text && ui.ext.translate"> <button type="button" class="tr-icon-btn b" [attr.aria-label]="'msg.translate' | t" [title]="'msg.translate' | t" (click)="act.emit('translate')"><tr-icon name="languages" [size]="16"></tr-icon></button> </ng-container>
      <button type="button" class="tr-icon-btn b" [attr.aria-label]="'common.more' | t" aria-haspopup="menu" (click)="openFromButton($event)"><tr-icon name="ellipsis" [size]="16"></tr-icon></button>
    </div>
    <ng-container *ngIf="menu() as m"> <tr-context-menu [items]="m.items" [x]="m.x" [y]="m.y" (select)="onSelect($event)" (close)="menu.set(null)"></tr-context-menu> </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .tb { display: flex; padding: 2px; border-radius: var(--radius-md); background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow-flat); }
    .b { inline-size: 30px; block-size: 28px; color: var(--muted-foreground); }
  `],
})
export class TrMessageActionsComponent {
  protected readonly ui = inject(UiStore);
  private readonly i18n = inject(I18nService);
  private readonly _message = signal<MessageVM>(undefined as any);
  @Input() get message(): Signal<MessageVM> { return this._message; }
  set message(v: any) { this._message.set(v); }
  private readonly _channel = signal<ChannelCapabilities>(undefined as any);
  @Input() get channel(): Signal<ChannelCapabilities> { return this._channel; }
  set channel(v: any) { this._channel.set(v); }
  @Output() act = new EventEmitter<MessageAction>();
  protected readonly menu = signal<{ items: MenuItem[]; x: number; y: number } | null>(null);

  private readonly items = computed<MenuItem[]>(() => {
    const m = this.message();
    const t = (k: string) => this.i18n.t(k);
    const hasContactInfo = /(\+?\d[\d\s-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/.test(m.text);
    return [
      { id: 'reply', label: t('msg.reply'), icon: 'corner-up-left' },
      { id: 'copy', label: t('msg.copy'), icon: 'copy' },
      ...(m.text && this.ui.ext.translate ? [{ id: 'translate', label: t('msg.translate'), icon: 'languages' }] : []),
      { id: 'link', label: t('msg.copyLink'), icon: 'link' },
      ...(m.authorKind === 'customer' && hasContactInfo ? [{ id: 'toContact', label: t('msg.toContact'), icon: 'user-round' }] : []),
      ...(m.authorKind === 'agent' || m.authorKind === 'bot' ? [{ id: 'toCanned', label: t('msg.toCanned'), icon: 'slash' }] : []),
      ...(m.authorKind === 'bot' ? [{ id: 'flag', label: t('msg.flag'), icon: 'flag-triangle-right' }] : []),
      ...(m.authorKind === 'agent' && !m.deleted ? [{ id: 'd', label: '', divider: true }, { id: 'delete', label: this.channel().supportsDelete ? t('msg.delete') : t('msg.hide'), icon: 'trash-2', danger: true }] : []),
    ];
  });

  /** Right-click or long-press on the bubble. */
  openAt(x: number, y: number): void {
    this.menu.set({ items: this.items(), x, y });
  }
  protected openFromButton(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menu.set({ items: this.items(), x: r.left, y: r.bottom + 4 });
  }
  protected onSelect(id: string): void {
    this.act.emit(id as MessageAction);
  }
}
