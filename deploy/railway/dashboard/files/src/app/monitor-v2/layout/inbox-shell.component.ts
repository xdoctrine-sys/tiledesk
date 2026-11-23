import { TrIconComponent } from '../ui/icon.component';
import { Signal, computed, effect, signal, untracked } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConversationNav } from '../core/services/conversation-nav.service';
import { TrComposerComponent } from '../composer/composer.component';
import { DemoStateService } from '../core/services/demo-state.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ShortcutAction, ShortcutService } from '../core/services/shortcut.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { MessageStore } from '../core/stores/message.store';
import { PresenceStore } from '../core/stores/presence.store';
import { SoundService } from '../core/services/sound.service';
import { UiStore } from '../core/stores/ui.store';
import { COLLAPSE_SLACK, COLS, ColId, GAP, RAIL, roomMax, solveWidths } from '../core/util/layout';
import { TrBotStepPickerComponent } from '../conversation/bot-step-picker.component';
import { TrConversationViewComponent } from '../conversation/conversation-view.component';
import { TrMediaViewerComponent } from '../conversation/media-viewer.component';
import { TrReassignDialogComponent } from '../conversation/reassign-dialog.component';
import { TrContextPanelComponent } from '../context/context-panel.component';
import { TrCreateTicketModalComponent } from '../context/create-ticket-modal.component';
import { TrConversationListComponent } from '../list/conversation-list.component';
import { TrSidebarComponent } from '../sidebar/sidebar.component';
import { TrConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { TrEmptyStateComponent } from '../ui/empty-state.component';
import { TrToastComponent } from '../ui/toast.component';
import { TrConnectionBannerComponent } from './connection-banner.component';
import { TrResizeHandleComponent } from './resize-handle.component';
import { TrShortcutsDialogComponent } from './shortcuts-dialog.component';

/**
 * The single screen (E-01, E-04, E-05): rail · views sidebar · conversation list · conversation · context panel.
 * Breakpoints of section 7.1: XL ≥ 1440 and L ≥ 1280 show everything; M (1024-1279) and S (768-1023) turn the sidebar and
 * the context panel into drawers; XS (< 768) is a stack: list → conversation, context as a bottom sheet.
 * RTL needs no extra code: the grid, the drawers and every logical CSS property follow <html dir>.
 */
@Component({
  standalone: true,
  selector: 'tr-inbox-shell',
  imports: [TrIconComponent, TranslatePipe, TrSidebarComponent, TrConversationListComponent, TrConversationViewComponent, TrContextPanelComponent, TrConnectionBannerComponent, TrReassignDialogComponent, TrCreateTicketModalComponent, TrShortcutsDialogComponent, TrBotStepPickerComponent, TrConfirmDialogComponent, TrMediaViewerComponent, TrToastComponent, TrEmptyStateComponent, TrResizeHandleComponent, CommonModule],
  host: { '[attr.data-bp]': 'ui.breakpoint()' },
  template: `
    <ng-container *ngIf="demo.forbidden(); else __e1">
      <tr-empty-state class="page" [title]="'app.forbidden' | t" [actionLabel]="'app.backToInbox' | t" (action)="leaveDemoState()"></tr-empty-state>
    </ng-container><ng-template #__e1><ng-container *ngIf="demo.noChannel(); else __e2">
      <tr-empty-state class="page" [title]="'app.noChannel' | t" [text]="'app.noChannelHint' | t"></tr-empty-state>
    </ng-container><ng-template #__e2>
      <div class="shell" [class.docked]="ui.showHandles()" [class.has-rail]="showRail()" [style.grid-template-columns]="columns()">
        <ng-container *ngIf="showSidebar()"> <tr-sidebar class="panel a-side"></tr-sidebar> </ng-container>
        <ng-container *ngIf="showSidebar() && ui.showHandles()">
          <tr-resize-handle [label]="'layout.resizeViews' | t" [value]="eff().side" [min]="COLS.side.min" [max]="roomFor('side')" panel="start" [foldable]="true"
            (resized)="resize('side', $event)" (reset)="ui.resetColWidth('side')" (fold)="ui.set('sidebarCollapsed', true)"></tr-resize-handle>
        </ng-container>
        <ng-container *ngIf="showList()"> <tr-conversation-list class="panel a-list" (open)="openConversation($event)" (assignOther)="ui.open('assign')" #list></tr-conversation-list> </ng-container>
        <ng-container *ngIf="showList() && showConversation() && ui.showHandles()">
          <tr-resize-handle [label]="'layout.resizeList' | t" [value]="eff().list" [min]="COLS.list.min" [max]="roomFor('list')" panel="start"
            (resized)="resize('list', $event)" (reset)="ui.resetColWidth('list')" (fold)="ui.resetColWidth('list')"></tr-resize-handle>
        </ng-container>
        <ng-container *ngIf="showConversation()">
          <div class="panel a-conv">
            <tr-connection-banner></tr-connection-banner>
            <tr-conversation-view #view></tr-conversation-view>
          </div>
        </ng-container>
        <ng-container *ngIf="showContextColumn() && ui.showHandles()">
          <tr-resize-handle [label]="'layout.resizeContext' | t" [value]="eff().ctx" [min]="COLS.ctx.min" [max]="roomFor('ctx')" panel="end" [foldable]="true"
            (resized)="resize('ctx', $event)" (reset)="ui.resetColWidth('ctx')" (fold)="ui.closeContext()"></tr-resize-handle>
        </ng-container>
        <ng-container *ngIf="showContextColumn()"> <tr-context-panel class="panel a-ctx" (openConversation)="openHistory($event)"></tr-context-panel> </ng-container>
      </div>

      <ng-container *ngIf="ui.sidebarIsDrawer() && ui.sidebarDrawerOpen()">
        <div class="scrim" (click)="ui.sidebarDrawerOpen.set(false)"></div>
        <tr-sidebar class="drawer start" (dismiss)="ui.sidebarDrawerOpen.set(false)" (navigated)="ui.sidebarDrawerOpen.set(false)"></tr-sidebar>
      </ng-container>
      <ng-container *ngIf="ui.contextIsDrawer() && ui.contextOpen() && conv.selectedId()">
        <div class="scrim" (click)="ui.closeContext()"></div>
        <tr-context-panel class="drawer end" [class.sheet]="ui.isMobile()" (openConversation)="openHistory($event)"></tr-context-panel>
      </ng-container>
    </ng-template></ng-template>

    <tr-reassign-dialog></tr-reassign-dialog>
    <tr-create-ticket-modal></tr-create-ticket-modal>
    <tr-shortcuts-dialog></tr-shortcuts-dialog>
    <tr-bot-step-picker></tr-bot-step-picker>
    <tr-confirm-dialog></tr-confirm-dialog>
    <tr-media-viewer></tr-media-viewer>
    <tr-toast></tr-toast>

    <ng-container *ngIf="presence.sessionExpired()">
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="se-t">
        <div class="mbox"><h2 id="se-t">{{ 'app.session' | t }}</h2><button type="button" class="tr-btn tr-btn--primary" (click)="relogin()">{{ 'app.relogin' | t }}</button></div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: block; block-size: 100%; overflow: hidden; background: var(--canvas); }
    /* Floating panels on the canvas: 8 px outer margin, 8 px between panels (the resize handles are those 8 px), rail straight on the canvas. */
    .shell { display: grid; block-size: 100%; padding-block: 8px; padding-inline: 0 8px; column-gap: 8px; }
    .shell.docked { column-gap: 0; }
    .shell > * { min-inline-size: 0; min-block-size: 0; }
    .shell:not(.has-rail) { padding-inline-start: 8px; }
    .panel { display: block; background: var(--card); color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .a-conv { display: flex; flex-direction: column; min-block-size: 0; block-size: 100%; }
    .a-conv tr-conversation-view { flex: 1; min-block-size: 0; }
    .page { display: flex; block-size: 100%; }
    .scrim { position: absolute; inset: 0; z-index: 190; background: var(--scrim); animation: mv2-fade var(--tr-motion-base); }
    .drawer { position: absolute; inset-block: 8px; z-index: 200; inline-size: min(360px, 92vw); background: var(--card); color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-popover); animation: mv2-slide var(--tr-motion-slow) var(--tr-ease-in); }
    .drawer.start { inset-inline-start: 8px; --from: -110%; } .drawer.end { inset-inline-end: 8px; --from: 110%; }
    :host-context([dir='rtl']) .drawer { --dir: -1; }
    .drawer.sheet { inset-block: auto 0; inset-inline: 0; inline-size: auto; block-size: 82vh; border-radius: var(--radius) var(--radius) 0 0; overflow: hidden; animation: mv2-sheet var(--tr-motion-slow) var(--tr-ease-in); }
    @keyframes mv2-fade { from { opacity: 0; } }
    @keyframes mv2-slide { from { transform: translateX(calc(var(--from) * var(--dir, 1))); } }
    @keyframes mv2-sheet { from { transform: translateY(100%); } }
    .modal { position: absolute; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: var(--scrim); }
    .mbox { display: flex; flex-direction: column; gap: 16px; padding: 24px; max-inline-size: 380px; border-radius: var(--radius-lg); background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow-popover); } .mbox h2 { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    @media (max-width: 767px) { .shell { padding-inline: 8px; } }
  `],
})
export class TrInboxShellComponent implements OnInit, OnDestroy {
  protected readonly ui = inject(UiStore);
  protected readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  protected readonly presence = inject(PresenceStore);
  protected readonly demo = inject(DemoStateService);
  private readonly shortcuts = inject(ShortcutService);
  private readonly nav = inject(ConversationNav);
  private readonly route = inject(ActivatedRoute);
  private subs = new Subscription();
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly messages = inject(MessageStore);
  private readonly sounds = inject(SoundService);

  /** Open conversation, from the `?c=` query parameter of /project/:projectid/monitor-v2. */
  private readonly _id = signal<string | undefined>(undefined);
  readonly id: Signal<string | undefined> = this._id;

  private readonly _list = signal<TrConversationListComponent | undefined>(undefined);
  @ViewChild('list') private get list(): Signal<TrConversationListComponent | undefined> { return this._list; }
  private set list(v: any) { this._list.set(v); }
  private readonly _view = signal<TrConversationViewComponent | undefined>(undefined);
  @ViewChild('view') private get view(): Signal<TrConversationViewComponent | undefined> { return this._view; }
  private set view(v: any) { this._view.set(v); }
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly hasConv = computed(() => !!this.id());
  /** The dashboard already has its own vertical rail: Monitor V2 never shows the template's one. */
  protected readonly showRail = computed(() => false);
  protected readonly showSidebar = computed(() => !this.ui.sidebarIsDrawer() && !this.ui.sidebarCollapsed());
  protected readonly showList = computed(() => !this.ui.isMobile() || !this.hasConv());
  protected readonly showConversation = computed(() => !this.ui.isMobile() || this.hasConv());
  protected readonly showContextColumn = computed(() => !this.ui.contextIsDrawer() && this.ui.contextOpen() && !!this.conv.selectedId());

  protected readonly COLS = COLS;

  /** Room for the columns: the viewport minus the rail and the 8 px outer margin. */
  private readonly avail = computed(() => this.ui.width() - (this.showRail() ? RAIL : 8) - 8);
  /** Saved widths squeezed to what fits (the conversation keeps at least 480 px). */
  protected readonly eff = computed(() =>
    solveWidths(this.avail(), this.ui.widths(), { side: this.showSidebar(), ctx: this.showContextColumn() }),
  );

  protected readonly columns = computed(() => {
    if (this.ui.isMobile()) return '1fr';
    const e = this.eff();
    const h = this.ui.showHandles() ? `${GAP}px ` : '';
    const cols: string[] = [];
    if (this.showRail()) cols.push(`${RAIL}px`);
    if (this.showSidebar()) cols.push(`${e.side}px`, ...(h ? [`${GAP}px`] : []));
    // below 1024 px the list is a share of the screen; above it the saved width (squeezed) applies
    cols.push(this.ui.width() < 1024 ? 'minmax(280px, 40%)' : `${e.list}px`);
    if (this.showList() && this.showConversation()) { if (h) cols.push(`${GAP}px`); }
    cols.push('minmax(0, 1fr)');
    if (this.showContextColumn()) cols.push(...(h ? [`${GAP}px`] : []), `${e.ctx}px`);
    return cols.join(' ');
  });

  protected roomFor(id: ColId): number {
    return roomMax(id, this.eff());
  }

  /** The agent drags a handle: clamp to the column limits, or fold it when pulled well under its minimum. */
  protected resize(id: ColId, w: number): void {
    if (w < COLS[id].min - COLLAPSE_SLACK) {
      if (id === 'side') return this.ui.set('sidebarCollapsed', true);
      if (id === 'ctx') return this.ui.closeContext();
    }
    this.ui.setColWidth(id, Math.min(w, this.roomFor(id)));
  }

  constructor() {
    effect(() => {
      const id = this.id() ?? null;
      untracked(() => this.conv.select(id));
    });
    // a new language or viewport must not lose the sidebar drawer when growing past the breakpoint
    effect(() => {
      if (!this.ui.sidebarIsDrawer()) this.ui.sidebarDrawerOpen.set(false);
    });
    this.subs.add(this.route.queryParamMap.subscribe((m) => this._id.set(m.get('c') ?? undefined)));
    this.subs.add(this.shortcuts.action$.subscribe((a) => void this.onShortcut(a)));
    effect(() => {
      if (this.presence.newVersion())
        untracked(() => this.toast.show(this.i18n.t('app.update'), { sticky: true, actionLabel: this.i18n.t('app.reload'), action: () => location.reload() }));
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  async ngOnInit(): Promise<void> {
    const v = this.demo.view();
    if (v) this.conv.setView(v);
    await this.dir.load();
    await this.conv.load();
  }

  protected openConversation(id: string): void {
    void this.nav.open(id);
  }

  /** History items belong to old conversations: open them when they are in the list, otherwise explain. */
  protected openHistory(id: string): void {
    if (this.conv.byId().has(id)) this.openConversation(id);
    else this.toast.show(this.i18n.t('history.archived'));
  }

  protected leaveDemoState(): void {
    void this.nav.open(null);
    this.demo.forbidden.set(false);
  }
  protected relogin(): void {
    this.presence.sessionExpired.set(false);
    location.reload();
  }

  private go(id: string | null): void {
    if (id) this.openConversation(id);
    else void this.nav.open(null);
  }

  private async onShortcut(a: ShortcutAction): Promise<void> {
    const sel = this.conv.selected();
    switch (a) {
      case 'help': return this.ui.open('shortcuts');
      case 'escape':
        if (this.conv.checked().size) return this.conv.clearChecked();
        if (this.ui.sidebarDrawerOpen()) return this.ui.sidebarDrawerOpen.set(false);
        if (this.ui.contextIsDrawer() && this.ui.contextOpen()) return this.ui.closeContext();
        if (this.ui.width() < 1024 && this.hasConv()) return this.go(null);
        return;
      case 'next': return this.go(this.conv.next());
      case 'prev': return this.go(this.conv.prev());
      case 'toggleSidebar': return this.ui.sidebarIsDrawer() ? this.ui.sidebarDrawerOpen.update((o) => !o) : this.ui.set('sidebarCollapsed', !this.ui.sidebarCollapsed());
      case 'toggleContext': return this.ui.toggleContext();
      case 'nextTab': return this.list()?.nextTab();
      case 'createTicket': return this.ui.open('ticket');
      case 'select': return sel ? this.conv.toggleCheck(sel.id) : undefined;
      case 'selectAll': return this.conv.selectAll();
    }
    if (!sel) return;
    switch (a) {
      case 'resolve': { await this.conv.resolve(sel.id); return; }
      case 'resolveNext': { const next = await this.conv.resolve(sel.id, true); return this.go(next); }
      case 'snooze': return this.view()?.openSnooze();
      case 'assign': return this.ui.open('assign');
      case 'assignMe': return void (await this.conv.exec(sel.id, { type: 'assign', target: { kind: 'agent', id: this.dir.meId() } }));
      case 'takeover':
        if (sel.state === 'bot' || sel.state === 'waiting_human' || (sel.state === 'human' && !sel.actor.isMe)) return void (await this.conv.takeOver(sel.id));
        return sel.actor.isMe && sel.hasBot ? this.ui.open('handBack') : undefined;
      case 'labels': this.ui.openContext(); this.ui.labelsRequest.update((n) => n + 1); return;
      case 'priority': return this.view()?.togglePriority();
      case 'unread': await this.conv.exec(sel.id, { type: 'markUnread', unread: true }); return this.go(null);
      case 'reply': return this.view()?.focusReply();
      case 'note': return this.view()?.focusNote();
      case 'attach': return this.view()?.attach();
      case 'ai': return this.view()?.toggleAi();
      case 'threadSearch': return this.messages.openSearch();
    }
    void this.host;
    void this.sounds;
  }
}
