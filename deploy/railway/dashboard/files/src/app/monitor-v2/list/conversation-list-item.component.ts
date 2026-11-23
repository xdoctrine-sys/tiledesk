import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, Input, Output, EventEmitter } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { TrActorBadgeComponent } from '../ui/actor-badge.component';
import { TrAvatarComponent } from '../ui/avatar.component';
import { TrSlaBadgeComponent } from '../ui/sla-badge.component';
import { isRtlNow } from '../core/util/dir';
import { ConversationNav } from '../core/services/conversation-nav.service';

export type QuickAction = 'takeover' | 'resolve' | 'snooze';

/**
 * List item, 72 px (compact 60 px), two lines. Avatar 44 px (initials on --muted, green presence dot, 14 px channel icon in the corner).
 * Line 1: name + time. Line 2: preview with an author prefix (You: / AI: / Draft:) + black unread badge. A third line exists only
 * for ONE discreet text: human wait / SLA beyond limit (red) or Urgent priority. Labels, #ticket and the rest appear on hover.
 * The whole row is one real <button> (an overlay), quick actions are siblings, so there is no nested interactive element.
 */
@Component({
  standalone: true,
  selector: 'tr-conversation-list-item',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, TrActorBadgeComponent, TrSlaBadgeComponent, CommonModule],
  host: {
    '[class.selected]': 'selected()', '[class.unread]': 'c().unread > 0', '[class.checked]': 'checked()', '[class.check-mode]': 'checkMode()',
    '[class.moving]': 'swipe() !== 0', '(contextmenu)': 'onContext($event)', '(keydown)': 'onKey($event)', '[attr.data-id]': 'c().id',
  },
  template: `
    <div class="swipe" [style.transform]="swipe() ? 'translateX(' + swipe() + 'px)' : null" (pointerdown)="onDown($event)" (pointermove)="onMove($event)" (pointerup)="onUp($event)" (pointercancel)="onCancel()">
      <button type="button" class="open" [attr.aria-label]="aria()" [attr.aria-current]="selected() ? 'true' : null" (click)="onClick($event)"></button>
      <div class="avwrap">
        <tr-avatar [initials]="c().customer.initials" [size]="44" [presence]="c().customer.online ? 'online' : null" [channel]="c().channel.kind" [src]="c().customer.avatarUrl"></tr-avatar>
        <button type="button" class="check" [class.on]="checked()" role="checkbox" [attr.aria-checked]="checked()" [attr.aria-label]="'list.select' | t" (click)="onCheck($event)">
          <ng-container *ngIf="checked()"> <tr-icon name="check" [size]="14"></tr-icon> </ng-container>
        </button>
      </div>
      <div class="body">
        <div class="l1">
          <span class="name tr-truncate" dir="auto">{{ name() }}</span>
          <span class="time">{{ time() }}</span>
          <span class="quick">
            <ng-container *ngIf="canTakeover()"> <button type="button" class="tr-icon-btn q" [attr.aria-label]="'actions.takeover' | t" [title]="'actions.takeover' | t" (click)="quick($event, 'takeover')"><tr-icon name="hand" [size]="16"></tr-icon></button> </ng-container>
            <button type="button" class="tr-icon-btn q" [attr.aria-label]="'actions.resolve' | t" [title]="'actions.resolve' | t" (click)="quick($event, 'resolve')"><tr-icon name="circle-check" [size]="16"></tr-icon></button>
            <button type="button" class="tr-icon-btn q" [attr.aria-label]="'actions.snooze' | t" [title]="'actions.snooze' | t" (click)="quick($event, 'snooze')"><tr-icon name="alarm-clock" [size]="16"></tr-icon></button>
          </span>
        </div>
        <div class="l2">
          <ng-container *ngIf="c().draft; else __e1">
            <span class="draft">{{ 'list.draft' | t }}</span><span class="prev tr-truncate" dir="auto">{{ c().draft }}</span>
          </ng-container><ng-template #__e1>
            <ng-container *ngIf="prefix() as p"> <span class="pfx"><ng-container *ngIf="c().lastMessage?.authorKind === 'note'"><tr-icon name="lock" [size]="12"></tr-icon></ng-container>{{ p }}</span> </ng-container>
            <span class="prev tr-truncate" dir="auto">{{ preview() }}</span>
          </ng-template>
          <ng-container *ngIf="c().unread > 0"> <span class="badge" [attr.aria-label]="'list.unread' | t: { n: c().unread }">{{ c().unread > 99 ? '99+' : c().unread }}</span> </ng-container>
        </div>
        <!-- no 3rd line by default: ONE discreet red/grey text only when the human wait / SLA is beyond its limit, or the priority is Urgent -->
        <ng-container *ngIf="alert() as a">
          <div class="l3">
            <ng-container [ngSwitch]="a"><ng-container *ngSwitchCase="'waiting'"> <tr-actor-badge [actor]="c().actor" size="sm" [breached]="true"></tr-actor-badge> </ng-container><ng-container *ngSwitchCase="'sla'"> <tr-sla-badge [sla]="c().sla!"></tr-sla-badge> </ng-container><ng-container *ngSwitchCase="'urgent'"> <span class="urgent"><tr-icon name="flag" [size]="12"></tr-icon>{{ 'priority.urgent' | t }}</span> </ng-container></ng-container>
          </div>
        </ng-container>
      </div>
    </div>
    <div class="swipe-hint start" aria-hidden="true"><tr-icon name="circle-check" [size]="20"></tr-icon></div>
    <div class="swipe-hint end" aria-hidden="true"><tr-icon name="alarm-clock" [size]="20"></tr-icon></div>
  `,
  styles: [`
    /* 72 px row, 8 px inset from the panel edge, no frame: selection = --accent, radius 12 */
    :host { position: relative; display: block; block-size: var(--tr-item-h); margin-inline: 8px; border-radius: var(--radius-lg); background: transparent; overflow: hidden; content-visibility: auto; contain-intrinsic-size: auto 72px; }
    :host-context([data-density='compact']) { block-size: 60px; }
    :host-context([data-density='compact']) .l3 { display: none; }
    :host(:hover), :host(:focus-within) { background: color-mix(in srgb, var(--accent) 60%, transparent); }
    :host(.selected) { background: var(--accent); }
    .swipe { position: relative; z-index: 1; display: flex; gap: 12px; align-items: center; block-size: 100%; padding-inline: 10px 12px; background: inherit; touch-action: pan-y; }
    :host(.moving) .swipe { transition: none; } .swipe { transition: transform var(--tr-motion-base) var(--tr-ease-in); }
    .open { position: absolute; inset: 0; z-index: 0; inline-size: 100%; border-radius: var(--radius-lg); }
    .open:focus-visible { outline-offset: -2px; }
    .avwrap { position: relative; z-index: 1; flex: none; inline-size: 44px; block-size: 44px; display: flex; align-items: center; justify-content: center; }
    @media (hover: none) { .avwrap { pointer-events: none; } }
    .check { position: absolute; inset: 0; margin: auto; inline-size: 20px; block-size: 20px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; background: var(--card); border: 1px solid var(--input); color: var(--primary-foreground); opacity: 0; }
    @media (hover: none) { .check { pointer-events: none; } }
    .check::after { content: ''; position: absolute; inset: -12px; }
    .check.on { background: var(--primary); border-color: var(--primary); }
    .avwrap:hover .check, :host(.check-mode) .check, .check:focus-visible { opacity: 1; }
    .avwrap:hover tr-avatar, :host(.check-mode) tr-avatar, .avwrap:focus-within tr-avatar { visibility: hidden; }
    .body { position: relative; z-index: 1; flex: 1; min-inline-size: 0; display: flex; flex-direction: column; justify-content: center; pointer-events: none; }
    .l1, .l2, .l3 { display: flex; align-items: center; gap: 8px; min-inline-size: 0; }
    .l1 { block-size: 22px; } .l2 { block-size: 20px; } .l3 { block-size: 18px; margin-block-start: 1px; }
    .name { flex: 1; font-size: var(--tr-fs-title); line-height: var(--tr-lh-title); font-weight: 500; }
    :host(.unread) .name { font-weight: 600; }
    .time { flex: none; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    .quick { display: none; flex: none; gap: 0; margin-inline-end: -6px; pointer-events: auto; }
    .q { inline-size: 30px; block-size: 28px; }
    :host(:hover) .time, :host(:focus-within) .time { display: none; }
    :host(:hover) .quick, :host(:focus-within) .quick { display: inline-flex; }
    .pfx { flex: none; display: inline-flex; align-items: center; gap: 3px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .prev { flex: 1; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    :host(.unread) .prev { color: var(--foreground); }
    .draft { flex: none; color: var(--warning); font-size: var(--tr-fs-body-sm); }
    .badge { flex: none; min-inline-size: 20px; block-size: 20px; padding-inline: 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--primary); color: var(--primary-foreground); font-size: var(--tr-fs-micro); line-height: 1; font-weight: 600; }
    .l3 { pointer-events: auto; }
    .urgent { display: inline-flex; align-items: center; gap: 4px; color: var(--destructive); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    .swipe-hint { position: absolute; inset-block: 0; inline-size: 96px; display: none; align-items: center; color: var(--muted-foreground); background: var(--muted); }
    :host(.moving) .swipe-hint { display: flex; } :host(.moving) .swipe { background: var(--card); }
    .swipe-hint.start { inset-inline-start: 0; justify-content: flex-start; padding-inline: 24px; }
    .swipe-hint.end { inset-inline-end: 0; justify-content: flex-end; padding-inline: 24px; }
  `],
})
export class TrConversationListItemComponent {
  private readonly nav = inject(ConversationNav);
  private readonly i18n = inject(I18nService);
  private readonly fmt = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  private readonly _selected = signal(false);
  @Input() get selected() { return this._selected; }
  set selected(v: any) { this._selected.set(v); }
  private readonly _checked = signal(false);
  @Input() get checked() { return this._checked; }
  set checked(v: any) { this._checked.set(v); }
  /** Any item is checked → checkboxes are visible everywhere. */
  private readonly _checkMode = signal(false);
  @Input() get checkMode() { return this._checkMode; }
  set checkMode(v: any) { this._checkMode.set(v); }

  @Output() open = new EventEmitter<void>();
  @Output() toggleCheck = new EventEmitter<{ shiftKey: boolean }>();
  @Output() quickAction = new EventEmitter<QuickAction>();
  @Output() contextMenu = new EventEmitter<{ x: number; y: number }>();

  protected readonly swipe = signal(0);
  private start: { x: number; y: number; id: number } | null = null;
  private longPress: ReturnType<typeof setTimeout> | null = null;
  private moved = false;

  protected readonly name = computed(() => this.i18n.customerName(this.c().customer));
  protected readonly time = computed(() => this.fmt.listTime(this.c().lastMessage?.at ?? this.c().updatedAt, this.clock.now()));

  protected readonly prefix = computed(() => {
    const m = this.c().lastMessage;
    if (!m) return '';
    switch (m.authorKind) {
      case 'bot': return this.i18n.t('list.prefixAi');
      case 'agent': return m.authorName === this.agentName() ? this.i18n.t('list.prefixYou') : `${m.authorName}:`;
      case 'note': return this.i18n.t('list.prefixNote');
      default: return '';
    }
  });
  private readonly agentName = computed(() => this.c().agents.find((a) => a.isMe)?.firstName ?? '\u0000');

  protected readonly preview = computed(() => {
    const m = this.c().lastMessage;
    if (!m) return '';
    if (m.type === 'audio') return this.i18n.t('list.voice');
    return m.text.replace(/\s+/g, ' ');
  });

  /** The single optional pill: human wait beyond its SLA, else SLA breached, else Urgent priority. Nothing otherwise. */
  protected readonly alert = computed<'waiting' | 'sla' | 'urgent' | null>(() => {
    const c = this.c();
    if (c.state === 'closed') return null;
    if (c.state === 'waiting_human' && c.sla?.level === 'breached') return 'waiting';
    if (c.sla?.level === 'breached') return 'sla';
    return c.priority === 'urgent' ? 'urgent' : null;
  });
  protected readonly canTakeover = computed(() => ['bot', 'waiting_human'].includes(this.c().state) || (this.c().state === 'human' && !this.c().actor.isMe));

  protected readonly aria = computed(() => `${this.name()}, ${this.preview()}, ${this.time()}${this.c().unread ? ', ' + this.i18n.t('list.unread', { n: this.c().unread }) : ''}`);

  protected onClick(e: MouseEvent): void {
    if (this.moved) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      if (e.metaKey || e.ctrlKey) return void window.open(this.nav.href(this.c().id), '_blank');
      return this.toggleCheck.emit({ shiftKey: true });
    }
    this.open.emit();
  }
  protected onCheck(e: MouseEvent): void {
    e.stopPropagation();
    this.toggleCheck.emit({ shiftKey: e.shiftKey });
  }
  protected quick(e: MouseEvent, a: QuickAction): void {
    e.stopPropagation();
    this.quickAction.emit(a);
  }
  protected onContext(e: MouseEvent): void {
    e.preventDefault();
    this.contextMenu.emit({ x: e.clientX, y: e.clientY });
  }
  protected onKey(e: KeyboardEvent): void {
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      const r = this.el.nativeElement.getBoundingClientRect();
      this.contextMenu.emit({ x: r.left + 40, y: r.top + 40 });
    }
  }

  // ---- touch: long press = context menu, horizontal swipe = resolve / snooze (mirrored in RTL), F-32
  protected onDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.moved = false;
    this.longPress = setTimeout(() => {
      if (!this.moved) this.contextMenu.emit({ x: e.clientX, y: e.clientY });
      this.start = null;
    }, 500);
  }
  protected onMove(e: PointerEvent): void {
    if (!this.start || e.pointerType !== 'touch') return;
    const dx = e.clientX - this.start.x;
    if (Math.abs(dx) > 8) {
      this.moved = true;
      if (this.longPress) clearTimeout(this.longPress);
      this.swipe.set(Math.max(-96, Math.min(96, dx)));
    }
  }
  protected onUp(e: PointerEvent): void {
    if (this.longPress) clearTimeout(this.longPress);
    if (!this.start) return;
    const dx = this.swipe();
    this.swipe.set(0);
    this.start = null;
    if (Math.abs(dx) >= 72) {
      const rtl = isRtlNow();
      const towardsStart = rtl ? dx > 0 : dx < 0; // visual direction → logical: swiping towards the start = resolve
      this.quickAction.emit(towardsStart ? 'resolve' : 'snooze');
    }
    setTimeout(() => (this.moved = false));
  }
  protected onCancel(): void {
    if (this.longPress) clearTimeout(this.longPress);
    this.swipe.set(0);
    this.start = null;
  }
}
