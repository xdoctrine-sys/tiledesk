import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { ChannelKind } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { TrChannelBadgeComponent } from '../ui/channel-badge.component';

/** One view row: icon, label, quiet grey counter (red only when a human wait is beyond its SLA). */
@Component({
  standalone: true,
  selector: 'tr-sidebar-item',
  imports: [TrIconComponent, TrChannelBadgeComponent, TranslatePipe, CommonModule],
  host: { '[class.active]': 'active()' },
  template: `
    <button type="button" class="row" [attr.aria-current]="active() ? 'true' : null" (click)="select.emit()">
      <ng-container *ngIf="channel() as ch; else __e1"> <tr-channel-badge [kind]="ch" [size]="16"></tr-channel-badge> </ng-container><ng-template #__e1><ng-container *ngIf="dot() !== null; else __e2"> <span class="tr-dot"></span> </ng-container><ng-template #__e2><ng-container *ngIf="icon()"> <tr-icon [name]="icon()!" [size]="18"></tr-icon> </ng-container></ng-template></ng-template>
      <span class="lbl tr-truncate">{{ label() }}</span>
      <ng-container *ngIf="count() !== null"> <span class="cnt" [class.danger]="danger()" [attr.aria-label]="danger() ? ('sla.waitBreached' | t) : null">{{ shown() }}</span> </ng-container>
    </button>
    <ng-container *ngIf="hasMenu()">
      <button type="button" class="more tr-icon-btn" [attr.aria-label]="'common.more' | t" (click)="menu.emit($event)"><tr-icon name="ellipsis" [size]="16"></tr-icon></button>
    </ng-container>
  `,
  styles: [`
    :host { position: relative; display: flex; align-items: center; border-radius: var(--radius-md); }
    :host(:hover) { background: color-mix(in srgb, var(--accent) 60%, transparent); }
    :host(.active) { background: var(--accent); color: var(--foreground); }
    .row { display: flex; align-items: center; gap: 12px; flex: 1; min-inline-size: 0; min-block-size: 40px; padding-inline: 10px; border-radius: var(--radius-md); font-size: var(--tr-fs-body); line-height: var(--tr-lh-body); color: inherit; }
    :host(.active) .row { font-weight: 500; }
    tr-icon { color: var(--muted-foreground); flex: none; } :host(.active) tr-icon { color: var(--foreground); }
    .lbl { flex: 1; }
    /* counter: small outline badge, red only when a human wait is past its SLA */
    .cnt { min-inline-size: 22px; padding-inline: 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: 18px; text-align: center; }
    .cnt.danger { color: var(--destructive); border-color: color-mix(in srgb, var(--destructive) 30%, transparent); }
    .more { display: none; position: absolute; inset-inline-end: 2px; inline-size: 28px; block-size: 28px; }
    :host(:hover) .more, .more:focus-visible { display: inline-flex; background: var(--muted); }
    :host(:hover:has(.more)) .cnt { visibility: hidden; }
  `],
})
export class TrSidebarItemComponent {
  private readonly fmt = inject(FormatService);
  private readonly _label = signal<string>(undefined as any);
  @Input() get label(): Signal<string> { return this._label; }
  set label(v: any) { this._label.set(v); }
  private readonly _icon = signal<string | null>(null);
  @Input() get icon(): Signal<string | null> { return this._icon; }
  set icon(v: any) { this._icon.set(v); }
  private readonly _channel = signal<ChannelKind | null>(null);
  @Input() get channel(): Signal<ChannelKind | null> { return this._channel; }
  set channel(v: any) { this._channel.set(v); }
  /** label colour index (1..6) for label rows */
  private readonly _dot = signal<number | null>(null);
  @Input() get dot(): Signal<number | null> { return this._dot; }
  set dot(v: any) { this._dot.set(v); }
  private readonly _count = signal<number | null>(null);
  @Input() get count(): Signal<number | null> { return this._count; }
  set count(v: any) { this._count.set(v); }
  private readonly _active = signal(false);
  @Input() get active() { return this._active; }
  set active(v: any) { this._active.set(v); }
  private readonly _danger = signal(false);
  @Input() get danger() { return this._danger; }
  set danger(v: any) { this._danger.set(v); }
  private readonly _hasMenu = signal(false);
  @Input() get hasMenu() { return this._hasMenu; }
  set hasMenu(v: any) { this._hasMenu.set(v); }
  @Output() select = new EventEmitter<void>();
  @Output() menu = new EventEmitter<MouseEvent>();
  protected readonly shown = computed(() => (this.count() === null ? '' : this.fmt.number(this.count()!)));
}
