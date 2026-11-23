import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { ConfirmService } from '../core/services/confirm.service';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { MessageStore } from '../core/stores/message.store';
import { UiStore } from '../core/stores/ui.store';
import { MenuItem, TrContextMenuComponent } from '../list/context-menu.component';
import { TrAvatarComponent } from '../ui/avatar.component';
import { TrSnoozePickerComponent } from './snooze-picker.component';
import { TrStatusControlComponent } from './status-control.component';
import { isRtlNow } from '../core/util/dir';
import { ConversationNav } from '../core/services/conversation-nav.service';

/**
 * Conversation header, 64 px (F-38 to F-49, F-53): avatar 40, name 15/600 and a 13 px grey sub-title (online · last seen · typing…);
 * on the end side the ONE solid button (Resolve, split) then 36 px icon buttons on --muted: Snooze, Assign, "⋮".
 * City, language, channel and #ticket live in the contact panel.
 * The "⋮" menu carries the rest: add teammate, leave, transcript, offline ticket, block, new tab, link, previous / next, delete.
 */
@Component({
  standalone: true,
  selector: 'tr-conversation-header',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, TrStatusControlComponent, TrSnoozePickerComponent, TrContextMenuComponent, CommonModule],
  template: `
    <header class="hd">
      <ng-container *ngIf="ui.isMobile() || ui.breakpoint() === 's'">
        <button type="button" class="tr-icon-btn back" [attr.aria-label]="'common.back' | t" (click)="back()"><tr-icon name="arrow-left" [size]="18" class="tr-mirror"></tr-icon></button>
      </ng-container>
      <button type="button" class="id" (click)="ui.toggleContext()" [attr.aria-label]="'header.openContact' | t" [attr.aria-pressed]="ui.contextOpen()">
        <tr-avatar [initials]="c().customer.initials" [size]="40" [presence]="c().customer.online ? 'online' : null" [src]="c().customer.avatarUrl"></tr-avatar>
        <span class="txt">
          <span class="nm tr-truncate" dir="auto">{{ name() }}</span>
          <span class="sub tr-truncate" [class.typing]="typing()">{{ sub() }}</span>
        </span>
      </button>
      <span class="sp"></span>
      <tr-status-control [kind]="c().state" [closed]="c().state === 'closed'" (resolve)="conv.resolve(c().id)" (resolveNext)="resolveNext()" (pending)="conv.exec(c().id, { type: 'pending' })" (reopen)="conv.exec(c().id, { type: 'reopen' })"></tr-status-control>
      <div class="anc">
        <button type="button" class="tr-icon-btn act" [attr.aria-expanded]="snooze()" [attr.aria-label]="'actions.snooze' | t" [title]="('actions.snooze' | t) + ' (Z)'" (click)="snooze.set(!snooze())"><tr-icon name="alarm-clock" [size]="18"></tr-icon></button>
        <ng-container *ngIf="snooze()"> <tr-snooze-picker (picked)="onSnooze($event)" (close)="snooze.set(false)"></tr-snooze-picker> </ng-container>
      </div>
      <button type="button" class="tr-icon-btn act asg" [attr.aria-label]="'actions.assign' | t" [title]="('actions.assign' | t) + ' (A)'" (click)="ui.open('assign')"><tr-icon name="user-plus" [size]="18"></tr-icon></button>
      <button type="button" class="tr-icon-btn act" [attr.aria-label]="'common.more' | t" aria-haspopup="menu" (click)="openMenu($event)"><tr-icon name="ellipsis-vertical" [size]="18"></tr-icon></button>
      <ng-container *ngIf="!ui.contextOpen() && !ui.isMobile()"> <button type="button" class="tr-icon-btn" [attr.aria-label]="'header.showPanel' | t" [title]="('header.showPanel' | t) + ' (Alt+I)'" (click)="ui.openContext()"><tr-icon name="panel-right" [size]="18" class="tr-mirror"></tr-icon></button> </ng-container>
    </header>
    <ng-container *ngIf="menu() as m"> <tr-context-menu [items]="m.items" [x]="m.x" [y]="m.y" (select)="onMenu($event)" (close)="menu.set(null)"></tr-context-menu> </ng-container>
  `,
  styles: [`
    :host { display: block; container-type: inline-size; }
    .hd { display: flex; align-items: center; gap: 6px; block-size: var(--tr-header-h); padding-inline: 16px 12px; }
    .hd:has(> .back) { padding-inline-start: 12px; }
    .id { display: flex; align-items: center; gap: 10px; min-inline-size: 0; flex: 0 1 auto; padding: 4px 8px; margin-inline-start: -8px; border-radius: var(--radius-md); text-align: start; }
    .id:hover { background: var(--muted); }
    .txt { display: flex; flex-direction: column; min-inline-size: 0; }
    .nm { font-size: var(--tr-fs-title); line-height: var(--tr-lh-title); font-weight: 600; min-inline-size: 0; }
    .sub { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .sub.typing { color: var(--success); }
    .sp { flex: 1; min-inline-size: 4px; }
    .anc { position: relative; }
    /* 36 x 36 icon buttons on --muted (snooze, assign, more) */
    .act { background: var(--muted); color: var(--foreground); }
    .act:hover:not(:disabled), .act[aria-expanded='true'] { background: var(--accent); }
    @container (max-width: 400px) { .asg { display: none; } }
    @container (max-width: 340px) { .anc { display: none; } }
  `],
})
export class TrConversationHeaderComponent {
  protected readonly conv = inject(ConversationStore);
  protected readonly ui = inject(UiStore);
  private readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);
  private readonly fmt = inject(FormatService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly nav = inject(ConversationNav);
  private readonly messages = inject(MessageStore);
  private readonly clock = inject(ClockService);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly snooze = signal(false);
  protected readonly menu = signal<{ items: MenuItem[]; x: number; y: number } | null>(null);
  protected readonly name = computed(() => this.i18n.customerName(this.c().customer));
  protected readonly typing = computed(() => this.messages.typing().customer);
  /** "online" · "last seen 5 min ago" · "typing…" (green), plus "Ticket" when smart reassignment is off. */
  protected readonly sub = computed(() => {
    const c = this.c();
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const presence = this.typing() ? t('header.typing') : c.customer.online ? t('header.online') : c.customer.lastSeen ? t('header.lastSeen', { t: this.fmt.relative(c.customer.lastSeen, this.clock.now()) }) : t('header.offline');
    return !c.smartAssignment && c.state !== 'closed' ? `${presence} · ${t('conv.ticketPill')}` : presence;
  });

  /** Opened by the Z shortcut. */
  openSnooze(): void {
    this.snooze.set(true);
  }

  protected back(): void {
    void this.nav.open(null);
  }

  protected async resolveNext(): Promise<void> {
    const next = await this.conv.resolve(this.c().id, true);
    void this.nav.open(next ?? null);
  }

  protected async onSnooze(until: Date): Promise<void> {
    this.snooze.set(false);
    await this.conv.snooze(this.c().id, until);
  }

  protected openMenu(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = (k: string) => this.i18n.t(k);
    const c = this.c();
    const rtl = isRtlNow();
    const mine = c.agents.some((a) => a.isMe);
    const isAdmin = this.dir.me()?.role !== 'agent';
    const compact = this.ui.isMobile();
    const items: MenuItem[] = [
      ...(compact ? [{ id: 'snooze', label: t('actions.snooze'), icon: 'alarm-clock' }, { id: 'assign', label: t('actions.assign'), icon: 'user-plus' }, { id: 'ctx', label: t('header.openContact'), icon: 'user-round' }, { id: 'd0', label: '', divider: true }] : []),
      ...(c.actor.isMe ? [{ id: 'brief', label: t('brief.title'), icon: 'sparkles' }] : []),
      { id: 'teammate', label: t('actions.addTeammate'), icon: 'users' },
      { id: 'leave', label: t('actions.leave'), icon: 'log-out', disabled: !mine },
      { id: 'transcript', label: t('actions.transcript'), icon: 'file-text', children: [{ id: 'tr:pdf', label: t('transcript.pdf') }, { id: 'tr:html', label: t('transcript.html') }, { id: 'tr:email', label: t('transcript.email') }] },
      { id: 'offline', label: c.smartAssignment ? t('actions.offlineTicket') : t('conv.backToChat'), icon: 'ticket' },
      { id: 'block', label: c.blocked ? t('cust.unblock') : t('actions.block'), icon: 'ban' },
      { id: 'd1', label: '', divider: true },
      { id: 'prev', label: t('actions.prev'), icon: 'arrow-up', shortcut: 'K' },
      { id: 'next', label: t('actions.next'), icon: 'arrow-down', shortcut: 'J' },
      { id: 'newtab', label: t('actions.newTab'), icon: 'panel-right' },
      { id: 'copylink', label: t('actions.copyLink'), icon: 'link' },
      ...(isAdmin ? [{ id: 'd2', label: '', divider: true }, { id: 'delete', label: t('actions.deleteConv'), icon: 'trash-2', danger: true }] : []),
    ];
    this.menu.set({ items, x: rtl ? r.left : r.right - 240, y: r.bottom + 4 });
  }

  protected async onMenu(id: string): Promise<void> {
    const c = this.c();
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const go = (target: string | null) => this.nav.open(target);
    switch (id.split(':')[0]) {
      case 'snooze': return this.snooze.set(true);
      case 'assign': return this.ui.open('assign');
      case 'ctx': return this.ui.openContext();
      case 'brief': return void this.messages.toggleBrief();
      case 'teammate': return this.ui.open('addTeammate');
      case 'leave': {
        const r = await this.confirm.ask({ title: t('confirm.leaveTitle'), text: t('confirm.leaveText'), confirmLabel: t('actions.leave'), cancelLabel: t('common.cancel') });
        if (r.result === 'confirm') await this.conv.exec(c.id, { type: 'leave' });
        return;
      }
      case 'tr': return void this.toast.show(t('transcript.done', { how: t(`transcript.${id.split(':')[1]}`) }), { kind: 'success' });
      case 'offline': {
        const r = await this.confirm.ask({ title: c.smartAssignment ? t('confirm.offlineTitle') : t('conv.backToChat'), text: c.smartAssignment ? t('confirm.offlineText') : t('confirm.onlineText'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel') });
        if (r.result === 'confirm') await this.conv.exec(c.id, { type: c.smartAssignment ? 'offlineTicket' : 'onlineTicket' });
        return;
      }
      case 'block': {
        if (c.blocked) return void this.conv.exec(c.id, { type: 'unban' });
        const r = await this.confirm.ask({ title: t('confirm.blockTitle', { name: this.name() }), text: t('confirm.blockText'), confirmLabel: t('actions.block'), cancelLabel: t('common.cancel'), danger: true, fields: [{ key: 'reason', label: t('confirm.blockReason') }] });
        if (r.result === 'confirm') await this.conv.exec(c.id, { type: 'ban' });
        return;
      }
      case 'prev': return void go(this.conv.prev());
      case 'next': return void go(this.conv.next());
      case 'newtab': return void window.open(this.nav.href(c.id), '_blank');
      case 'copylink':
        await navigator.clipboard?.writeText(this.nav.href(c.id)).catch(() => undefined);
        return void this.toast.show(t('toast.linkCopied'));
      case 'delete': {
        const r = await this.confirm.ask({ title: t('confirm.deleteConvTitle'), text: t('confirm.deleteConvText'), typeToConfirm: String(c.ticket), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
        if (r.result === 'confirm') { await this.conv.delete(c.id); void go(null); }
      }
    }
    void this.fmt;
  }
}
