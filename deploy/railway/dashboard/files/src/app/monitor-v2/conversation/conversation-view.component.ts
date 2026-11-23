import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { MessageVM } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { MessageStore } from '../core/stores/message.store';
import { UiStore } from '../core/stores/ui.store';
import { TrComposerComponent } from '../composer/composer.component';
import { TrActorBadgeComponent } from '../ui/actor-badge.component';
import { TrEmptyStateComponent } from '../ui/empty-state.component';
import { TrPrioritySelectComponent } from '../ui/priority-select.component';
import { TrSkeletonComponent } from '../ui/skeleton.component';
import { TrSlaBadgeComponent } from '../ui/sla-badge.component';
import { TrBannerStackComponent } from './banner-stack.component';
import { TrConversationHeaderComponent } from './conversation-header.component';
import { MessageAction } from './message-actions.component';
import { TrMessageListComponent } from './message-list.component';
import { TrRelayRibbonComponent } from './relay-ribbon.component';
import { TrTakeoverBriefComponent } from './takeover-brief.component';
import { TrBotCopilotBarComponent } from './bot-copilot-bar.component';
import { TrEntryContextComponent } from './entry-context.component';
import { TrThreadSearchComponent } from './thread-search.component';
import { TrPresenceStackComponent } from './presence-stack.component';
import { ConversationNav } from '../core/services/conversation-nav.service';

/**
 * Zone D. Header · "who answers" bar (one pill + one action, priority and SLA in discreet grey) · relay ribbon
 * (collapsed line) · banners · thread · handover brief · composer. Also owns the states: nothing selected, loading,
 * not found, load error (document 9.3).
 */
@Component({
  standalone: true,
  selector: 'tr-conversation-view',
  imports: [TrIconComponent, TranslatePipe, TrConversationHeaderComponent, TrRelayRibbonComponent, TrBannerStackComponent, TrMessageListComponent, TrTakeoverBriefComponent, TrComposerComponent, TrBotCopilotBarComponent, TrEntryContextComponent, TrThreadSearchComponent, TrActorBadgeComponent, TrEmptyStateComponent, TrSkeletonComponent, TrPrioritySelectComponent, TrSlaBadgeComponent, TrPresenceStackComponent, CommonModule],
  template: `
    <ng-container *ngIf="!conv.selectedId(); else __e5">
      <tr-empty-state class="fill" [title]="'conv.none' | t" [hint]="'conv.noneHint' | t"></tr-empty-state>
    </ng-container><ng-template #__e5><ng-container *ngIf="store.notFound(); else __e6">
      <tr-empty-state class="fill" [title]="'conv.notFound' | t" [actionLabel]="'conv.backToList' | t" (action)="conv.select(null)"></tr-empty-state>
    </ng-container><ng-template #__e6><ng-container *ngIf="store.loadError(); else __e7">
      <tr-empty-state class="fill" [title]="'conv.loadError' | t" [actionLabel]="'common.retry' | t" (action)="store.reload()"></tr-empty-state>
    </ng-container><ng-template #__e7><ng-container *ngIf="conv.selected() as c; else __e8">
      <tr-conversation-header #header [c]="c"></tr-conversation-header>
      <div class="who">
        <ng-container *ngIf="conv.transitioning().has(c.id); else __e3">
          <span class="trans" role="status"><tr-icon name="rotate-cw" [size]="14" class="spin"></tr-icon>{{ 'conv.transferring' | t }}</span>
        </ng-container><ng-template #__e3>
          <tr-actor-badge [actor]="c.actor" [breached]="c.sla?.level === 'breached'"></tr-actor-badge>
          <ng-container *ngIf="c.state === 'bot' || c.state === 'waiting_human'; else __e1">
            <button type="button" class="who-act" (click)="conv.takeOver(c.id)" [title]="('actions.takeover' | t) + ' (T)'"><tr-icon name="hand" [size]="16"></tr-icon>{{ 'actions.takeover' | t }}</button>
          </ng-container><ng-template #__e1><ng-container *ngIf="c.state === 'human' && c.actor.isMe && c.hasBot; else __e2">
            <button type="button" class="who-act" (click)="ui.open('handBack')" [title]="('actions.handback' | t) + ' (T)'"><tr-icon name="corner-up-left" [size]="16" class="tr-mirror"></tr-icon>{{ 'actions.handback' | t }}</button>
          </ng-container><ng-template #__e2><ng-container *ngIf="c.state === 'human' && !c.actor.isMe">
            <button type="button" class="who-act" (click)="join(c.id)"><tr-icon name="user-plus" [size]="16"></tr-icon>{{ 'actions.join' | t }}</button>
          </ng-container></ng-template></ng-template>
        </ng-template>
        <span class="sp"></span>
        <ng-container *ngIf="c.viewers.length || c.penHolder"> <tr-presence-stack [viewers]="c.viewers" [penHolder]="c.penHolder"></tr-presence-stack> </ng-container>
        <tr-priority-select #prio [value]="c.priority" (changed)="conv.setPriority(c.id, $event)"></tr-priority-select>
        <ng-container *ngIf="c.sla && c.state !== 'closed'"> <tr-sla-badge [sla]="c.sla"></tr-sla-badge> </ng-container>
        <ng-container *ngIf="store.relay().length">
          <button type="button" class="tr-icon-btn rl" [attr.aria-pressed]="relayOpen()" [attr.aria-label]="(relayOpen() ? 'relay.collapse' : 'relay.expand') | t" [title]="'who.relay' | t" (click)="relayOpen.set(!relayOpen())"><tr-icon name="arrow-left-right" [size]="16"></tr-icon></button>
        </ng-container>
      </div>
      <tr-relay-ribbon [segments]="store.relay()" [expanded]="relayOpen()" (expandedChange)="relayOpen.set($event)" (jump)="store.jump($event)"></tr-relay-ribbon>
      <tr-banner-stack [c]="c" (unsnooze)="conv.unsnooze(c.id)" (reopenNow)="conv.exec(c.id, { type: 'reopen' })" (unblock)="conv.exec(c.id, { type: 'unban' })" (backToChat)="conv.exec(c.id, { type: 'onlineTicket' })"></tr-banner-stack>
      <ng-container *ngIf="store.searchOpen()"> <tr-thread-search></tr-thread-search> </ng-container>
      <ng-container *ngIf="store.loading(); else __e4">
        <div class="skel"><tr-skeleton kind="bubble" [count]="5"></tr-skeleton></div>
      </ng-container><ng-template #__e4>
        <tr-message-list [messages]="store.vms()" [channel]="c.channel" [conversationId]="c.id" [firstUnreadId]="store.firstUnreadId()" [typing]="typing()" [highlight]="store.highlight()" [query]="store.searchQuery()" [activeId]="activeMatch()" [scrollTarget]="store.scrollTarget()" [myId]="dir.meId()"
          (action)="onAction($event.m, $event.a)" (retry)="store.retry($event)" (discard)="store.discard($event)" (openMedia)="store.viewerId.set($event.id)" (jump)="store.jump($event)"><tr-entry-context [c]="c"></tr-entry-context></tr-message-list>
      </ng-template>
      <ng-container *ngIf="c.state === 'bot' && c.raw.attributes.tarashli?.bot_intent"> <tr-bot-copilot-bar [c]="c" (takeover)="conv.takeOver(c.id)"></tr-bot-copilot-bar> </ng-container>
      <ng-container *ngIf="store.brief() as b">
        <tr-takeover-brief [brief]="b" [open]="store.briefOpen()" (toggle)="store.briefOpen.set(!store.briefOpen())" (dismiss)="store.briefOpen.set(false)" (insert)="insert($event)" (jump)="store.jump($event)"></tr-takeover-brief>
      </ng-container>
      <tr-composer #composer [c]="c" (join)="join(c.id)" (reopen)="conv.exec(c.id, { type: 'reopen' })" (unblock)="conv.exec(c.id, { type: 'unban' })"></tr-composer>
    </ng-container><ng-template #__e8>
      <div class="skel"><tr-skeleton kind="header"></tr-skeleton><tr-skeleton kind="bubble" [count]="5"></tr-skeleton></div>
    </ng-template></ng-template></ng-template></ng-template>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; block-size: 100%; min-inline-size: 0; background: var(--card); }
    .fill { flex: 1; } .skel { flex: 1; overflow: hidden; padding-block-start: 12px; }
    /* "who answers": one 40 px transparent line, 13 px text, ghost action, priority and SLA as quiet grey text */
    .who { display: flex; flex-wrap: wrap; align-items: center; column-gap: 4px; min-block-size: var(--tr-who-h); padding-inline: 16px 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .who-act { display: inline-flex; align-items: center; gap: 6px; min-block-size: 28px; padding-inline: 6px; border-radius: var(--radius-md); color: var(--foreground); font-size: var(--tr-fs-body-sm); font-weight: 500; position: relative; white-space: nowrap; }
    .who-act::after { content: ''; position: absolute; inset-inline: 0; inset-block: -8px; } .who-act:hover { background: var(--muted); }
    .rl { inline-size: 28px; block-size: 28px; } .rl[aria-pressed='true'] { background: var(--muted); color: var(--foreground); }
    .sp { flex: 1; } .trans { display: inline-flex; align-items: center; gap: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .spin { animation: mv2-spin 1s linear infinite; } @keyframes mv2-spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
    tr-priority-select { flex: none; }
    :host-context([data-bp='xs']) tr-priority-select, :host-context([data-bp='xs']) tr-sla-badge { display: none; }
  `],
})
export class TrConversationViewComponent {
  private readonly nav = inject(ConversationNav);
  protected readonly conv = inject(ConversationStore);
  protected readonly store = inject(MessageStore);
  protected readonly dir = inject(DirectoryStore);
  protected readonly ui = inject(UiStore);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  private readonly _composer = signal<TrComposerComponent | undefined>(undefined);
  @ViewChild('composer') private get composer(): Signal<TrComposerComponent | undefined> { return this._composer; }
  private set composer(v: any) { this._composer.set(v); }
  private readonly _header = signal<TrConversationHeaderComponent | undefined>(undefined);
  @ViewChild('header') private get header(): Signal<TrConversationHeaderComponent | undefined> { return this._header; }
  private set header(v: any) { this._header.set(v); }
  private readonly _prio = signal<TrPrioritySelectComponent | undefined>(undefined);
  @ViewChild('prio') private get prio(): Signal<TrPrioritySelectComponent | undefined> { return this._prio; }
  private set prio(v: any) { this._prio.set(v); }

  protected readonly relayOpen = signal(false);
  protected readonly activeMatch = computed(() => this.store.searchMatches()[this.store.searchIndex()] ?? null);
  protected readonly typing = computed(() => {
    const t = this.store.typing();
    return { customer: t.customer, bot: t.bot, agentName: t.agentId ? this.dir.agentsById().get(t.agentId)?.firstName : undefined };
  });

  // ---- used by the shell's keyboard shortcuts
  focusReply(): void { this.composer()?.setMode('reply'); }
  focusNote(): void { this.composer()?.setMode('note'); }
  attach(): void { this.composer()?.attachFiles(); }
  openSnooze(): void { this.header()?.openSnooze(); }
  togglePriority(): void { this.prio()?.toggle(); }
  toggleAi(): void { this.composer()?.toggleAi(); }

  protected insert(text: string): void {
    this.composer()?.insert(text);
    this.store.briefOpen.set(false);
  }

  protected async join(id: string): Promise<void> {
    await this.conv.exec(id, { type: 'addParticipant', agentId: this.dir.meId() });
  }

  protected async onAction(m: MessageVM, a: MessageAction): Promise<void> {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    switch (a) {
      case 'reply':
        this.store.quote(m);
        return this.composer()?.focus();
      case 'copy':
        await navigator.clipboard?.writeText(m.text).catch(() => undefined);
        return void this.toast.show(t('toast.copied'));
      case 'translate':
        return void this.store.translate(m);
      case 'link':
        await navigator.clipboard?.writeText(`${this.nav.href(this.conv.selectedId()!)}#${m.id}`).catch(() => undefined);
        return void this.toast.show(t('toast.linkCopied'));
      case 'toCanned': {
        const r = await this.confirm.ask({ title: t('canned.createTitle'), confirmLabel: t('common.save'), cancelLabel: t('common.cancel'), fields: [{ key: 'title', label: t('canned.fieldTitle') }, { key: 'shortcut', label: t('canned.fieldShortcut') }, { key: 'text', label: t('canned.fieldText'), value: m.text, multiline: true }] });
        const v = r.values;
        if (r.result === 'confirm' && v['title']?.trim()) { this.dir.createCanned(v['title'].trim(), (v['shortcut'] || v['title']).trim().replace(/\s+/g, '-'), v['text'] ?? m.text); this.toast.show(t('canned.saved'), { kind: 'success' }); }
        return;
      }
      case 'flag': {
        const r = await this.confirm.ask({ title: t('msg.flagTitle'), text: t('msg.flagText'), confirmLabel: t('msg.flag'), cancelLabel: t('common.cancel'), fields: [{ key: 'reason', label: t('msg.flagReason'), multiline: true }] });
        if (r.result === 'confirm') { await this.store.flagBotReply(m, r.values['reason'] ?? ''); this.toast.show(t('msg.flagged'), { kind: 'success', actionLabel: t('common.undo'), action: () => this.store.unflag(m) }); }
        return;
      }
      case 'delete': {
        const r = await this.confirm.ask({ title: t('msg.deleteTitle'), text: t('msg.deleteText'), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
        if (r.result === 'confirm') await this.store.deleteMessage(m);
        return;
      }
      case 'toContact': {
        const phone = /(\+?\d[\d\s-]{7,}\d)/.exec(m.text)?.[1]?.trim();
        const email = /([\w.+-]+@[\w-]+\.[\w.]+)/.exec(m.text)?.[1];
        const c = this.conv.selected();
        if (!c || (!phone && !email)) return;
        const r = await this.confirm.ask({ title: t('msg.toContactTitle'), text: t('msg.toContactText', { value: (email ?? phone)!, field: t(email ? 'contact.email' : 'contact.phone') }), confirmLabel: t('common.save'), cancelLabel: t('common.cancel') });
        if (r.result === 'confirm') { await this.conv.updateLead(c, email ? { email } : { phone }); this.toast.show(t('toast.contactUpdated'), { kind: 'success' }); }
      }
    }
  }
}
