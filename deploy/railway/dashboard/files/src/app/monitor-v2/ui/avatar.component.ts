import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ChannelKind } from '../core/models/view-models';
import { TrChannelBadgeComponent } from './channel-badge.component';

/**
 * Avatar: photo, or initials on --muted (no colour, no coloured ring). Optional green presence dot (8 px) and a 14 px channel
 * icon in the lower corner (official colours, the only place they appear). Sizes 24 / 32 / 36 / 40 / 44 / 56.
 */
@Component({
  standalone: true,
  selector: 'tr-avatar',
  imports: [TrIconComponent, TrChannelBadgeComponent, CommonModule],
  host: { '[class.is-bot]': 'kind() === "bot"', '[class.has-ch]': '!!channel()', '[style.--sz.px]': 'size()', '[attr.aria-hidden]': 'true' },
  template: `
    <ng-container *ngIf="kind() === 'bot'; else __e1">
      <tr-icon name="bot" [size]="iconSize()"></tr-icon>
    </ng-container><ng-template #__e1><ng-container *ngIf="src(); else __e2">
      <img [src]="src()" alt="" />
    </ng-container><ng-template #__e2>
      <span class="txt">{{ initials() }}</span>
    </ng-template></ng-template>
    <ng-container *ngIf="presence() === 'online'"> <span class="dot"></span> </ng-container>
    <ng-container *ngIf="channel() as ch"> <span class="ch"><tr-channel-badge [kind]="ch" [size]="14" [colored]="true"></tr-channel-badge></span> </ng-container>
  `,
  styles: [`
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      inline-size: var(--sz);
      block-size: var(--sz);
      border-radius: 50%;
      background: var(--muted);
      color: var(--muted-foreground);
      font-size: calc(var(--sz) * 0.36);
      font-weight: 500;
      line-height: 1;
      user-select: none;
    }
    img { inline-size: 100%; block-size: 100%; border-radius: 50%; object-fit: cover; }
    .dot {
      position: absolute;
      inset-inline-end: 0;
      inset-block-end: 0;
      inline-size: 8px;
      block-size: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 0 2px var(--card);
    }
    /* channel icon takes the lower corner, the presence dot moves to the upper one */
    :host(.has-ch) .dot { inset-block: 0 auto; }
    .ch { position: absolute; inset-inline-end: -4px; inset-block-end: -4px; display: inline-flex; padding: 1px; border-radius: 50%; background: var(--card); }
  `],
})
export class TrAvatarComponent {
  private readonly _initials = signal('');
  @Input() get initials() { return this._initials; }
  set initials(v: any) { this._initials.set(v); }
  private readonly _size = signal<24 | 32 | 36 | 40 | 44 | 56>(40);
  @Input() get size(): Signal<24 | 32 | 36 | 40 | 44 | 56> { return this._size; }
  set size(v: any) { this._size.set(v); }
  private readonly _presence = signal<'online' | 'offline' | null>(null);
  @Input() get presence(): Signal<'online' | 'offline' | null> { return this._presence; }
  set presence(v: any) { this._presence.set(v); }
  private readonly _kind = signal<'person' | 'bot'>('person');
  @Input() get kind(): Signal<'person' | 'bot'> { return this._kind; }
  set kind(v: any) { this._kind.set(v); }
  private readonly _src = signal<string | undefined>(undefined);
  @Input() get src(): Signal<string | undefined> { return this._src; }
  set src(v: any) { this._src.set(v); }
  /** Shows the small channel icon in the lower corner (conversation list). */
  private readonly _channel = signal<ChannelKind | null>(null);
  @Input() get channel(): Signal<ChannelKind | null> { return this._channel; }
  set channel(v: any) { this._channel.set(v); }

  protected readonly iconSize = computed(() => Math.round(this.size() * 0.5));
}
