import { Signal, afterNextRender, computed, effect, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, Output, EventEmitter, ViewChild } from '@angular/core';
import { ConversationVM, Priority } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConfirmService } from '../core/services/confirm.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { PresenceStore } from '../core/stores/presence.store';
import { UiStore } from '../core/stores/ui.store';
import { SnoozePreset, resolveSnooze } from '../core/util/snooze';
import { TrEmptyStateComponent } from '../ui/empty-state.component';
import { TrLabelChipComponent } from '../ui/label-chip.component';
import { TrSkeletonComponent } from '../ui/skeleton.component';
import { TrActorBadgeComponent } from '../ui/actor-badge.component';
import { TrBulkBarComponent } from './bulk-bar.component';
import { MenuItem, TrContextMenuComponent } from './context-menu.component';
import { QuickAction, TrConversationListItemComponent } from './conversation-list-item.component';
import { TrListToolbarComponent } from './list-toolbar.component';
import { TrStatusTabsComponent } from './status-tabs.component';
import { isRtlNow } from '../core/util/dir';
import { ConversationNav } from '../core/services/conversation-nav.service';

interface Hover { c: ConversationVM; x: number; y: number }

/**
 * The list column (C): toolbar, status tabs, virtualisation-friendly items, infinite scroll with "All loaded" and a
 * "↑ N new" pill, empty / error / loading states, hover card, right-click menu, bulk bar. Real-time arrivals never make
 * the list jump while the agent reads (scroll anchoring + the pill).
 */
@Component({
  standalone: true,
  selector: 'tr-conversation-list',
  imports: [TrIconComponent, TranslatePipe, TrListToolbarComponent, TrStatusTabsComponent, TrConversationListItemComponent, TrEmptyStateComponent, TrSkeletonComponent, TrBulkBarComponent, TrContextMenuComponent, TrLabelChipComponent, TrActorBadgeComponent, CommonModule],
  host: { '(keydown)': 'onKeydown($event)', '(pointerdown)': 'lastPointer = { x: $event.clientX, y: $event.clientY }' },
  template: `
    <tr-list-toolbar #toolbar>
      <tr-status-tabs #tabs [active]="conv.statusTab()" [counts]="conv.statusCounts()" (pick)="conv.setTab($event)"></tr-status-tabs>
    </tr-list-toolbar>
    <ng-container *ngIf="presence.away()">
      <div class="away" role="status">
        <tr-icon name="moon" [size]="14"></tr-icon>
        <span class="tr-truncate">{{ presence.breakInfo() ? ('presence.break' | t: { type: ('presence.break.' + presence.breakInfo()!.type | t), time: fmt.time(presence.breakInfo()!.until) }) : ('presence.awayBanner' | t) }}</span>
        <button type="button" class="go" (click)="presence.resume()">{{ (presence.breakInfo() ? 'presence.resume' : 'presence.goAvailable') | t }}</button>
      </div>
    </ng-container>

    <div class="wrap">
      <ng-container *ngIf="conv.pendingNew() > 0 && conv.listScrolled()">
        <button type="button" class="newpill" (click)="toTop()"><tr-icon name="arrow-up" [size]="14"></tr-icon>{{ 'list.new' | t: { n: conv.pendingNew() } }}</button>
      </ng-container>
      <div class="scroller" #scroller (scroll)="onScroll()">
        <ng-container *ngIf="conv.status() === 'idle' || conv.status() === 'loading'; else __e3">
          <tr-skeleton kind="list-item" [count]="6"></tr-skeleton>
        </ng-container><ng-template #__e3><ng-container *ngIf="conv.status() === 'error'; else __e4">
          <tr-empty-state [title]="'list.error' | t" [actionLabel]="'common.retry' | t" (action)="conv.load()"></tr-empty-state>
        </ng-container><ng-template #__e4><ng-container *ngIf="conv.visible().length === 0; else __e5">
          <tr-empty-state [title]="empty().title | t" [text]="empty().text ? (empty().text! | t) : ''" [actionLabel]="empty().action ? (empty().action! | t) : ''" [hint]="empty().hint ? (empty().hint! | t) : ''" (action)="onEmptyAction()"></tr-empty-state>
        </ng-container><ng-template #__e5>
          <ul class="items">
            <ng-container *ngFor="let c of conv.visible(); trackBy: __trk1">
              <li>
                <tr-conversation-list-item [c]="c" [selected]="c.id === conv.selectedId()" [checked]="conv.checked().has(c.id)" [checkMode]="conv.checked().size > 0"
                  (open)="open.emit(c.id)" (toggleCheck)="conv.toggleCheck(c.id, $event.shiftKey)" (quickAction)="onQuick(c, $event)" (contextMenu)="openMenu(c, $event)"
                  (mouseenter)="hoverStart(c, $event)" (mouseleave)="hoverEnd()"></tr-conversation-list-item>
              </li>
            </ng-container>
          </ul>
          <div #sentinel class="sentinel"></div>
          <ng-container *ngIf="conv.loadingMore(); else __e2"> <tr-skeleton kind="list-item" [count]="2"></tr-skeleton> </ng-container><ng-template #__e2><ng-container *ngIf="!conv.hasMore"> <p class="end">{{ 'list.end' | t }}</p> </ng-container></ng-template>
        </ng-template></ng-template></ng-template>
      </div>
      <ng-container *ngIf="conv.checked().size > 0"> <tr-bulk-bar [ids]="checkedIds()"></tr-bulk-bar> </ng-container>
    </div>

    <ng-container *ngIf="hover() as h">
      <div class="hc" role="tooltip" [style.left.px]="h.x" [style.top.px]="h.y">
        <div class="hh"><strong class="tr-truncate" dir="auto">{{ i18n.customerName(h.c.customer) }}</strong><span class="tr-mono tr-ltr">#{{ h.c.ticket }}</span></div>
        <dl>
          <ng-container *ngIf="h.c.department"> <div><dt>{{ 'hover.department' | t }}</dt><dd>{{ h.c.department.name }}</dd></div> </ng-container>
          <div><dt>{{ 'hover.status' | t }}</dt><dd><tr-actor-badge [actor]="h.c.actor" size="sm" [breached]="h.c.sla?.level === 'breached'"></tr-actor-badge></dd></div>
          <div><dt>{{ 'hover.created' | t }}</dt><dd>{{ fmt.relative(h.c.createdAt, clock.now()) }}</dd></div>
          <ng-container *ngIf="h.c.customer.city"> <div><dt>{{ 'hover.location' | t }}</dt><dd><bdi>{{ h.c.customer.city }}, {{ h.c.customer.country }}</bdi></dd></div> </ng-container>
        </dl>
        <ng-container *ngIf="h.c.labels.length"> <div class="lbls"><ng-container *ngFor="let l of h.c.labels.slice(0, 3); trackBy: __trk6"> <tr-label-chip [label]="l"></tr-label-chip> </ng-container><ng-container *ngIf="h.c.labels.length > 3"> <span class="more">+{{ h.c.labels.length - 3 }}</span> </ng-container></div> </ng-container>
      </div>
    </ng-container>
    <ng-container *ngIf="menu() as m"> <tr-context-menu [items]="m.items" [x]="m.x" [y]="m.y" (select)="onMenuSelect($event)" (close)="menu.set(null)"></tr-context-menu> </ng-container>
  `,
  styles: [`
    :host { position: relative; display: flex; flex-direction: column; block-size: 100%; min-inline-size: 0; }
    .away { display: flex; align-items: center; gap: 8px; min-block-size: 36px; padding-inline: 16px; background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); border-block-start: 1px solid var(--border); }
    .away .tr-truncate { flex: 1; } .go { flex: none; color: var(--brand); font-weight: 600; padding-inline: 6px; min-block-size: 28px; }
    .wrap { position: relative; flex: 1; min-block-size: 0; display: flex; flex-direction: column; }
    .scroller { flex: 1; overflow-y: auto; overflow-anchor: auto; overscroll-behavior: contain; padding-block: 8px; }
    .items { display: flex; flex-direction: column; gap: 2px; }
    .newpill { position: absolute; z-index: 15; inset-block-start: 8px; inset-inline: 0; margin-inline: auto; inline-size: max-content; display: inline-flex; align-items: center; gap: 6px; block-size: 32px; padding-inline: 14px; border-radius: var(--radius-md); background: var(--primary); color: var(--primary-foreground); font-size: var(--tr-fs-body-sm); font-weight: 500; }
    .end { padding: 20px; text-align: center; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .sentinel { block-size: 1px; }
    .hc { position: fixed; z-index: 90; inline-size: 264px; padding: 12px; border-radius: var(--radius-lg); background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow-popover); pointer-events: none; animation: tr-pop var(--tr-motion-base) var(--tr-ease-in); }
    .hh { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-end: 8px; font-size: var(--tr-fs-body); } .hh span { color: var(--muted-foreground); }
    dl { margin: 0; display: flex; flex-direction: column; gap: 6px; } dl div { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: var(--tr-fs-body-sm); }
    dt { color: var(--muted-foreground); } dd { margin: 0; color: var(--foreground); text-align: end; }
    .lbls { display: flex; flex-wrap: wrap; gap: 6px; margin-block-start: 10px; } .more { color: var(--muted-foreground); font-size: var(--tr-fs-caption); align-self: center; }
  `],
})
export class TrConversationListComponent {
  private readonly nav = inject(ConversationNav);
  readonly __trk1 = (__i: number, c: any): any => c.id;
  readonly __trk6 = (__i: number, l: any): any => l.id;
  protected readonly conv = inject(ConversationStore);
  protected readonly dir = inject(DirectoryStore);
  protected readonly presence = inject(PresenceStore);
  protected readonly i18n = inject(I18nService);
  protected readonly fmt = inject(FormatService);
  protected readonly clock = inject(ClockService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly ui = inject(UiStore);

  @Output() open = new EventEmitter<string>();
  @Output() assignOther = new EventEmitter<string>();
  private readonly _scroller = signal<ElementRef<HTMLElement> | undefined>(undefined);
  @ViewChild('scroller') private get scroller(): Signal<ElementRef<HTMLElement> | undefined> { return this._scroller; }
  private set scroller(v: any) { this._scroller.set(v); }
  private readonly _sentinel = signal<ElementRef<HTMLElement> | undefined>(undefined);
  @ViewChild('sentinel') private get sentinel(): Signal<ElementRef<HTMLElement> | undefined> { return this._sentinel; }
  private set sentinel(v: any) { this._sentinel.set(v); }
  private readonly _tabs = signal<TrStatusTabsComponent | undefined>(undefined);
  @ViewChild('tabs') private get tabs(): Signal<TrStatusTabsComponent | undefined> { return this._tabs; }
  private set tabs(v: any) { this._tabs.set(v); }
  private readonly _toolbar = signal<TrListToolbarComponent | undefined>(undefined);
  @ViewChild('toolbar') private get toolbar(): Signal<TrListToolbarComponent | undefined> { return this._toolbar; }
  private set toolbar(v: any) { this._toolbar.set(v); }

  protected readonly hover = signal<Hover | null>(null);
  protected readonly menu = signal<{ c: ConversationVM; items: MenuItem[]; x: number; y: number } | null>(null);
  protected lastPointer = { x: 0, y: 0 };
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private observer?: IntersectionObserver;

  protected readonly checkedIds = computed(() => [...this.conv.checked()]);

  constructor() {
    // keep the open conversation visible when it changes (J / K, deep link)
    effect(() => {
      const id = this.conv.selectedId();
      if (!id) return;
      queueMicrotask(() => this.scroller()?.nativeElement.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }));
    });
    // infinite scroll: observe the sentinel whenever it exists
    effect(() => {
      const s = this.sentinel()?.nativeElement;
      const root = this.scroller()?.nativeElement;
      this.observer?.disconnect();
      if (!s || !root) return;
      this.observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void this.conv.loadMore(), { root, rootMargin: '120px' });
      this.observer.observe(s);
    });
    afterNextRender(() => void 0);
  }

  protected readonly empty = computed<{ title: string; text?: string; action?: string; hint?: string; actionKey?: 'clear' | 'next' }>(() => {
    const v = this.conv.view();
    if (this.conv.hasActiveFilters()) return { title: 'list.empty.filtered', action: 'filters.clear', actionKey: 'clear' as const };
    if (this.conv.statusTab() === 'snoozed') return { title: 'list.empty.snoozed', hint: 'list.empty.snoozedHint' };
    if (this.conv.statusTab() === 'resolved') return { title: 'list.empty.resolved' };
    if (v === 'mine') return { title: 'list.empty.mine', action: this.conv.counts()['waiting'] ? 'queue.pickNext' : 'list.empty.viewQueue', actionKey: 'next' as const };
    if (v === 'waiting') return { title: 'list.empty.queue' };
    if (v === 'bot') return { title: 'list.empty.bot' };
    if (v === 'mentions') return { title: 'list.empty.mentions', hint: 'list.empty.mentionsHint' };
    return { title: 'list.empty.generic' };
  });

  protected onEmptyAction(): void {
    const e = this.empty() as { actionKey?: 'clear' | 'next' };
    if (e.actionKey === 'clear') this.conv.clearFilters();
    else if (e.actionKey === 'next') void this.pickNext();
  }

  /** F-142: take the oldest / highest-priority conversation waiting for a human. */
  async pickNext(): Promise<void> {
    const rank: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
    const waiting = this.conv.all().filter((c) => c.state === 'waiting_human').sort((a, b) => rank[b.priority] - rank[a.priority] || (a.waitingSince?.getTime() ?? 0) - (b.waitingSince?.getTime() ?? 0));
    const next = waiting[0];
    if (!next) return this.conv.setView('waiting');
    await this.conv.takeOver(next.id);
    this.open.emit(next.id);
  }

  protected onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    this.conv.listScrolled.set(el.scrollTop > 40);
    if (el.scrollTop <= 40) this.conv.pendingNew.set(0);
    this.hoverEnd();
  }
  protected toTop(): void {
    this.scroller()?.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    this.conv.pendingNew.set(0);
  }

  // ---- hover card (after a short delay, mouse only)
  protected hoverStart(c: ConversationVM, e: MouseEvent): void {
    this.hoverEnd();
    if ((e as PointerEvent).pointerType === 'touch' || this.conv.checked().size > 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rtl = isRtlNow();
    const w = 264 + 8;
    this.hoverTimer = setTimeout(() => {
      const x = rtl ? Math.max(8, r.left - w) : Math.min(window.innerWidth - w - 8, r.right + 8);
      this.hover.set({ c, x, y: Math.max(8, Math.min(r.top, window.innerHeight - 200)) });
    }, 650);
  }
  protected hoverEnd(): void {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hover.set(null);
  }

  // ---- keyboard: arrows move focus between rows
  protected onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const t = e.target as HTMLElement;
    if (!t.classList.contains('open')) return;
    const all = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.items .open'));
    const i = all.indexOf(t);
    const n = all[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) { e.preventDefault(); n.focus(); }
  }

  /** Public so the shell's "Alt+N" shortcut can cycle tabs and "/" can focus search. */
  nextTab(): void {
    this.tabs()?.next();
  }
  focusSearch(): void {
    this.toolbar()?.openSearch();
  }

  // ---- quick actions (hover icons, swipe)
  protected async onQuick(c: ConversationVM, a: QuickAction): Promise<void> {
    if (a === 'takeover') {
      await this.conv.takeOver(c.id);
      this.open.emit(c.id);
    } else if (a === 'resolve') await this.conv.resolve(c.id);
    else this.openSnoozeMenu(c);
  }

  private openSnoozeMenu(c: ConversationVM): void {
    const t = (k: string) => this.i18n.t(k);
    this.menu.set({ c, x: this.lastPointer.x, y: this.lastPointer.y, items: [
      { id: 'sn:next_reply', label: t('snooze.untilReply') }, { id: 'sn:1h', label: t('snooze.in1h') }, { id: 'sn:tonight', label: t('snooze.tonight') },
      { id: 'sn:tomorrow', label: t('snooze.tomorrow') }, { id: 'sn:weekend', label: t('snooze.afterWeekend') },
    ] });
  }

  // ---- context menu (F-30)
  protected openMenu(c: ConversationVM, pos: { x: number; y: number }): void {
    this.hoverEnd();
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const prio = (['urgent', 'high', 'medium', 'low'] as const).map((p) => ({ id: `pr:${p}`, label: t(`priority.${p}`), icon: 'flag', checked: c.priority === p }));
    const labels = this.dir.labels().map((l) => ({ id: `lb:${l.id}`, label: l.name, checked: c.labels.some((x) => x.id === l.id) }));
    const assign: MenuItem[] = [
      { id: 'as:me', label: t('assign.toMe') },
      ...this.dir.agents().filter((a) => !a.isMe).map((a) => ({ id: `as:${a.id}`, label: a.name })),
      { id: 'as:more', label: t('assign.more') },
    ];
    const isAdmin = this.dir.me()?.role !== 'agent';
    this.menu.set({ c, x: pos.x, y: pos.y, items: [
      { id: 'unread', label: c.unread ? t('actions.markRead') : t('actions.markUnread'), icon: 'eye', shortcut: 'U' },
      { id: 'resolve', label: t('actions.resolve'), icon: 'circle-check', shortcut: 'E', disabled: c.state === 'closed' },
      { id: 'pending', label: t('actions.pending'), icon: 'circle-pause' },
      { id: 'snooze', label: t('actions.snooze'), icon: 'alarm-clock', shortcut: 'Z', children: [
        { id: 'sn:next_reply', label: t('snooze.untilReply') }, { id: 'sn:1h', label: t('snooze.in1h') }, { id: 'sn:tonight', label: t('snooze.tonight') },
        { id: 'sn:tomorrow', label: t('snooze.tomorrow') }, { id: 'sn:weekend', label: t('snooze.afterWeekend') } ] },
      { id: 'priority', label: t('actions.priority'), icon: 'flag', shortcut: 'P', children: prio },
      { id: 'labels', label: t('actions.labels'), icon: 'tag', shortcut: 'L', children: labels },
      { id: 'assign', label: t('actions.assign'), icon: 'user-plus', shortcut: 'A', children: assign },
      { id: 'takeover', label: t('actions.takeover'), icon: 'hand', shortcut: 'T', disabled: c.actor.isMe },
      { id: 'd1', label: '', divider: true },
      { id: 'newtab', label: t('actions.newTab'), icon: 'panel-right' },
      { id: 'copylink', label: t('actions.copyLink'), icon: 'link' },
      { id: 'mute', label: t('actions.mute'), icon: 'volume-x' },
      ...(isAdmin ? [{ id: 'd2', label: '', divider: true }, { id: 'delete', label: t('actions.deleteConv'), icon: 'trash-2', danger: true }] : []),
    ] });
  }

  protected async onMenuSelect(id: string): Promise<void> {
    const c = this.menu()?.c;
    if (!c) return;
    const [k, a] = id.split(':');
    switch (k) {
      case 'unread': return void this.conv.exec(c.id, { type: 'markUnread', unread: !c.unread });
      case 'resolve': return void this.conv.resolve(c.id);
      case 'pending': return void this.conv.exec(c.id, { type: 'pending' });
      case 'takeover': await this.conv.takeOver(c.id); return this.open.emit(c.id);
      case 'sn': return void this.conv.snooze(c.id, resolveSnooze(a as SnoozePreset));
      case 'pr': return void this.conv.setPriority(c.id, a as Priority);
      case 'lb': {
        const on = c.labels.some((l) => l.id === a);
        const tags = on ? c.raw.tags.filter((x) => x.tag !== a) : [...c.raw.tags, { tag: a!, color: 'neutral' }];
        return void this.conv.setLabels(c.id, tags);
      }
      case 'as':
        if (a === 'more') { this.open.emit(c.id); return this.assignOther.emit(c.id); }
        return void this.conv.exec(c.id, { type: 'assign', target: { kind: 'agent', id: a === 'me' ? this.dir.meId() : a! } });
      case 'newtab': return void window.open(this.nav.href(c.id), '_blank');
      case 'copylink':
        await navigator.clipboard?.writeText(this.nav.href(c.id)).catch(() => undefined);
        return void this.toast.show(this.i18n.t('toast.linkCopied'));
      case 'mute': return void this.toast.show(this.i18n.t('toast.muted'));
      case 'delete': {
        const r = await this.confirm.ask({ title: this.i18n.t('confirm.deleteConvTitle'), text: this.i18n.t('confirm.deleteConvText'), typeToConfirm: String(c.ticket), confirmLabel: this.i18n.t('common.delete'), cancelLabel: this.i18n.t('common.cancel'), danger: true });
        if (r.result === 'confirm') await this.conv.delete(c.id);
      }
    }
  }
}
