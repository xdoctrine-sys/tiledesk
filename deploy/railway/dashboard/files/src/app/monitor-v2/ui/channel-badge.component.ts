import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ChannelKind } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';

/**
 * Channel mark, drawn in grey by default (quiet list). Simple monoline glyphs stand in for brand logos; replace them
 * with the official artwork (identification use only) before production.
 */
@Component({
  standalone: true,
  selector: 'tr-channel-badge',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  host: { '[style.color]': 'color()', '[attr.title]': 'tip()', role: 'img', '[attr.aria-label]': 'tip()' },
  template: `
    <ng-container [ngSwitch]="kind()"><ng-container *ngSwitchCase="'web'"> <tr-icon name="globe" [size]="size()"></tr-icon> </ng-container><ng-container *ngSwitchCase="'email'"> <tr-icon name="mail" [size]="size()"></tr-icon> </ng-container><ng-container *ngSwitchCase="'sms'"> <tr-icon name="message-square" [size]="size()"></tr-icon> </ng-container><ng-container *ngSwitchCase="'voice'"> <tr-icon name="phone" [size]="size()"></tr-icon> </ng-container><ng-container *ngSwitchCase="'internal'"> <tr-icon name="ticket" [size]="size()"></tr-icon> </ng-container><ng-container *ngSwitchCase="'whatsapp'">
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.5L3 21z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.8-2.2-1-.9.9c-1-.4-2-1.4-2.4-2.4l.9-.9-1-2.2L9 8.5z"/></svg>
      </ng-container><ng-container *ngSwitchCase="'messenger'">
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-9 8.8c0 2.8 1.4 5.2 3.5 6.7V22l3.3-1.8c.7.2 1.4.3 2.2.3 5 0 9-3.9 9-8.8S17 3 12 3z"/><path d="M7 13.5l3.5-4 2.5 2.5 4-3.5"/></svg>
      </ng-container><ng-container *ngSwitchCase="'instagram'">
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/></svg>
      </ng-container><ng-container *ngSwitchCase="'telegram'">
        <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4L3 11l6 2 2 6 3-4 5 4L21 4z"/><path d="M9 13l12-9"/></svg>
      </ng-container></ng-container>
    <ng-container *ngIf="label()"> <span class="lbl">{{ ('channel.' + kind()) | t }}</span> </ng-container>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; color: var(--muted-foreground); flex: none; }
    .lbl { font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); color: var(--muted-foreground); }
  `],
})
export class TrChannelBadgeComponent {
  private readonly i18n = inject(I18nService);
  protected readonly tip = computed(() => this.i18n.t(`channel.${this.kind()}`));
  private readonly _kind = signal<ChannelKind>(undefined as any);
  @Input() get kind(): Signal<ChannelKind> { return this._kind; }
  set kind(v: any) { this._kind.set(v); }
  private readonly _size = signal<14 | 16>(14);
  @Input() get size(): Signal<14 | 16> { return this._size; }
  set size(v: any) { this._size.set(v); }
  private readonly _label = signal(false);
  @Input() get label() { return this._label; }
  set label(v: any) { this._label.set(v); }
  /** Official brand colour (WhatsApp, Instagram, Messenger, Telegram): used only for the 14 px corner icon of an avatar. */
  private readonly _colored = signal(false);
  @Input() get colored() { return this._colored; }
  set colored(v: any) { this._colored.set(v); }

  protected readonly color = computed(() => {
    if (!this.colored()) return null;
    const map: Partial<Record<ChannelKind, string>> = { whatsapp: 'var(--channel-whatsapp)', instagram: 'var(--channel-instagram)', messenger: 'var(--channel-messenger)', telegram: 'var(--channel-telegram)', };
    return map[this.kind()] ?? null;
  });
}
