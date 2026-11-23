import { Signal, afterNextRender, computed, effect, signal, untracked } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, Input, Output, EventEmitter, ViewChild, OnDestroy } from '@angular/core';
import { AttachmentVM, ChannelCapabilities, MessageVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { GroupPosition, TrMessageBubbleComponent } from './message-bubble.component';
import { MessageAction } from './message-actions.component';
import { TrSystemEventComponent } from './system-event.component';
import { TrTypingIndicatorComponent } from './typing-indicator.component';

type Item =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'unread'; key: string }
  | { kind: 'events'; key: string; events: MessageVM[] }
  | { kind: 'msg'; key: string; m: MessageVM; group: GroupPosition };

const GROUP_GAP_MS = 5 * 60_000;

/**
 * The thread (F-60, F-61, F-62): day separators, consecutive messages of the same author grouped (< 5 min), system events
 * folded into groups, a "New messages" divider, opens at the first unread, a "↓ N new" button when the agent has
 * scrolled up, typing indicators, and an ARIA live region that announces new incoming messages with their author.
 */
@Component({
  standalone: true,
  selector: 'tr-message-list',
  imports: [TrIconComponent, TranslatePipe, TrMessageBubbleComponent, TrSystemEventComponent, TrTypingIndicatorComponent, CommonModule],
  template: `
    <div class="sc" #sc (scroll)="onScroll()" role="log" aria-live="off" [attr.aria-label]="'thread.label' | t">
      <div class="inner">
        <ng-content></ng-content>
        <ng-container *ngFor="let it of items(); trackBy: __trk1">
          <ng-container [ngSwitch]="it.kind"><ng-container *ngSwitchCase="'day'"> <div class="day"><span>{{ it.label }}</span></div> </ng-container><ng-container *ngSwitchCase="'unread'"> <div class="unread"><span>{{ 'thread.newMessages' | t }}</span></div> </ng-container><ng-container *ngSwitchCase="'events'"> <tr-system-event [events]="it.events"></tr-system-event> </ng-container><ng-container *ngSwitchCase="'msg'">
              <tr-message-bubble [message]="it.m" [group]="it.group" [channel]="channel()" [highlight]="highlight() === it.m.id" [query]="query()" [activeMatch]="activeId() === it.m.id"
                (act)="action.emit({ m: it.m, a: $event })" (retry)="retry.emit(it.m.tempId ?? it.m.id)" (discard)="discard.emit(it.m.tempId ?? it.m.id)" (openMedia)="openMedia.emit($event)" (jump)="jump.emit($event)"></tr-message-bubble>
            </ng-container></ng-container>
        </ng-container>
        <ng-container *ngIf="typing().bot"> <tr-typing-indicator kind="bot" [text]="'conv.botTyping' | t"></tr-typing-indicator> </ng-container>
        <ng-container *ngIf="typing().customer"> <tr-typing-indicator kind="customer" [text]="'cust.typing' | t"></tr-typing-indicator> </ng-container>
        <ng-container *ngIf="typing().agentName"> <tr-typing-indicator kind="agent" [text]="'coll.writing' | t: { name: typing().agentName! }"></tr-typing-indicator> </ng-container>
      </div>
    </div>
    <ng-container *ngIf="below() > 0">
      <button type="button" class="below" (click)="toBottom()"><tr-icon name="arrow-down" [size]="14"></tr-icon>{{ 'thread.newBelow' | t: { n: below() } }}</button>
    </ng-container>
    <span class="tr-sr-only" aria-live="polite" role="status">{{ announcement() }}</span>
  `,
  styles: [`
    :host { position: relative; display: block; flex: 1; min-block-size: 0; }
    .sc { block-size: 100%; overflow-y: auto; overscroll-behavior: contain; padding-block: 8px; }
    .inner { display: flex; flex-direction: column; min-block-size: 100%; justify-content: flex-end; }
    .day { display: flex; justify-content: center; padding: 16px 16px 4px; }
    .day span { padding: 4px 12px; border-radius: 8px; background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    .unread { display: flex; align-items: center; gap: 12px; padding: 8px 20px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 500; }
    .unread::before, .unread::after { content: ''; flex: 1; block-size: 1px; background: var(--border); }
    .below { position: absolute; inset-block-end: 12px; inset-inline-end: 16px; display: inline-flex; align-items: center; gap: 6px; block-size: 34px; padding-inline: 14px; border-radius: var(--radius-md); background: var(--primary); color: var(--primary-foreground); font-size: var(--tr-fs-body-sm); font-weight: 500; z-index: 5; }
  `],
})
export class TrMessageListComponent implements OnDestroy {
  readonly __trk1 = (__i: number, it: any): any => it.key;
  private readonly fmt = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(I18nService);

  private readonly _messages = signal<MessageVM[]>(undefined as any);
  @Input() get messages(): Signal<MessageVM[]> { return this._messages; }
  set messages(v: any) { this._messages.set(v); }
  private readonly _channel = signal<ChannelCapabilities>(undefined as any);
  @Input() get channel(): Signal<ChannelCapabilities> { return this._channel; }
  set channel(v: any) { this._channel.set(v); }
  private readonly _conversationId = signal<string>(undefined as any);
  @Input() get conversationId(): Signal<string> { return this._conversationId; }
  set conversationId(v: any) { this._conversationId.set(v); }
  private readonly _firstUnreadId = signal<string | null>(null);
  @Input() get firstUnreadId(): Signal<string | null> { return this._firstUnreadId; }
  set firstUnreadId(v: any) { this._firstUnreadId.set(v); }
  private readonly _typing = signal<{ customer?: boolean; bot?: boolean; agentName?: string }>({});
  @Input() get typing(): Signal<{ customer?: boolean; bot?: boolean; agentName?: string }> { return this._typing; }
  set typing(v: any) { this._typing.set(v); }
  private readonly _highlight = signal<string | null>(null);
  @Input() get highlight(): Signal<string | null> { return this._highlight; }
  set highlight(v: any) { this._highlight.set(v); }
  private readonly _query = signal('');
  @Input() get query() { return this._query; }
  set query(v: any) { this._query.set(v); }
  private readonly _activeId = signal<string | null>(null);
  @Input() get activeId(): Signal<string | null> { return this._activeId; }
  set activeId(v: any) { this._activeId.set(v); }
  private readonly _scrollTarget = signal<{ id: string; nonce: number } | null>(null);
  @Input() get scrollTarget(): Signal<{ id: string; nonce: number } | null> { return this._scrollTarget; }
  set scrollTarget(v: any) { this._scrollTarget.set(v); }
  private readonly _myId = signal('');
  @Input() get myId() { return this._myId; }
  set myId(v: any) { this._myId.set(v); }

  @Output() action = new EventEmitter<{ m: MessageVM; a: MessageAction }>();
  @Output() retry = new EventEmitter<string>();
  @Output() discard = new EventEmitter<string>();
  @Output() openMedia = new EventEmitter<AttachmentVM>();
  @Output() jump = new EventEmitter<string>();

  private readonly _sc = signal<ElementRef<HTMLElement>>(undefined as any);
  @ViewChild('sc') private get sc(): Signal<ElementRef<HTMLElement>> { return this._sc; }
  private set sc(v: any) { this._sc.set(v); }
  protected readonly below = signal(0);
  protected readonly announcement = signal('');
  private lastLen = 0;
  private lastConv = '';
  private atBottom = true;
  /** Keep the bottom in view while the layout changes (brief loads, composer grows, images load) unless the agent scrolled away. */
  private stick = true;

  protected readonly items = computed<Item[]>(() => {
    const out: Item[] = [];
    const msgs = this.messages();
    const now = this.clock.now();
    let day = '';
    let evBuf: MessageVM[] = [];
    const flush = () => {
      if (evBuf.length) out.push({ kind: 'events', key: `ev_${evBuf[0]!.id}`, events: evBuf });
      evBuf = [];
    };
    msgs.forEach((m, i) => {
      const d = m.createdAt.toDateString();
      if (d !== day) {
        flush();
        day = d;
        out.push({ kind: 'day', key: `day_${d}`, label: this.fmt.daySeparator(m.createdAt, now) });
      }
      if (m.id === this.firstUnreadId()) {
        flush();
        out.push({ kind: 'unread', key: 'unread' });
      }
      if (m.authorKind === 'system') return void evBuf.push(m);
      flush();
      const prev = this.sameBlock(msgs[i - 1], m) ? msgs[i - 1] : undefined;
      const next = this.sameBlock(m, msgs[i + 1]) ? msgs[i + 1] : undefined;
      const group: GroupPosition = prev && next ? 'middle' : prev ? 'last' : next ? 'first' : 'single';
      out.push({ kind: 'msg', key: m.tempId ?? m.id, m, group });
    });
    flush();
    return out;
  });

  private ro?: ResizeObserver;
  ngOnDestroy(): void {
    this.ro?.disconnect();
  }

  constructor() {
    afterNextRender(() => {
      const el = this.sc().nativeElement;
      this.ro = new ResizeObserver(() => this.stick && (el.scrollTop = el.scrollHeight));
      this.ro.observe(el);
      this.ro.observe(el.firstElementChild!);
    });
    // open at the first unread, otherwise at the bottom; follow new messages only if the agent is at the bottom
    effect(() => {
      const msgs = this.messages();
      const conv = this.conversationId();
      untracked(() => {
        const sc = this.sc().nativeElement;
        if (conv !== this.lastConv) {
          this.lastConv = conv;
          this.lastLen = msgs.length;
          this.below.set(0);
          this.atBottom = true;
          this.stick = true;
          if (msgs.length) requestAnimationFrame(() => this.openPosition());
          return;
        }
        const added = msgs.length - this.lastLen;
        this.lastLen = msgs.length;
        if (added <= 0) return;
        const last = msgs[msgs.length - 1]!;
        if (last.authorKind !== 'system' && !last.isOutgoing) this.announcement.set(`${last.author.name || ''}: ${last.text}`);
        const mine = last.isOutgoing && last.author.id === this.myId();
        if (this.atBottom || mine) requestAnimationFrame(() => this.toBottom(true));
        else this.below.update((n) => n + added);
        void sc;
      });
    });
    effect(() => {
      const t = this.scrollTarget();
      if (!t) return;
      untracked(() => this.sc().nativeElement.querySelector<HTMLElement>(`[data-mid="${CSS.escape(t.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    });
  }

  /** Same author, same direction, no system event in between and less than 5 minutes apart. */
  private sameBlock(a: MessageVM | undefined, b: MessageVM | undefined): boolean {
    if (!a || !b || a.authorKind === 'system' || b.authorKind === 'system') return false;
    return a.authorKind === b.authorKind && a.author.id === b.author.id && Math.abs(b.createdAt.getTime() - a.createdAt.getTime()) < GROUP_GAP_MS && !a.deleted === !b.deleted;
  }

  /** Opens at the bottom; if the "New messages" divider would be above the visible area, opens at the divider instead. */
  private openPosition(): void {
    const el = this.sc().nativeElement;
    el.scrollTop = el.scrollHeight;
    const divider = el.querySelector<HTMLElement>('.unread');
    if (divider && divider.offsetTop < el.scrollTop + 8) {
      el.scrollTop = Math.max(0, divider.offsetTop - 16);
      this.stick = false;
    }
    this.onScroll();
  }

  protected toBottom(smooth = false): void {
    const el = this.sc().nativeElement;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    this.below.set(0);
    this.atBottom = true;
    this.stick = true;
  }

  protected onScroll(): void {
    const el = this.sc().nativeElement;
    this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    this.stick = this.atBottom;
    if (this.atBottom) this.below.set(0);
  }
}
