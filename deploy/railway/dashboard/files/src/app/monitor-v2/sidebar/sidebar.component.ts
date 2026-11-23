import { computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Output, EventEmitter } from '@angular/core';
import { ChannelKind } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { UiStore } from '../core/stores/ui.store';
import { MenuItem, TrContextMenuComponent } from '../list/context-menu.component';
import { TrHoursChipComponent } from '../ui/hours-chip.component';
import { TrSidebarItemComponent } from './sidebar-item.component';

interface Row { id: string; label: string; icon?: string; channel?: ChannelKind; dot?: number; count: number; hasMenu?: boolean; shared?: boolean }
interface Group { id: string; title: string; rows: Row[] }

const CHANNEL_ORDER: ChannelKind[] = ['web', 'whatsapp', 'messenger', 'instagram', 'telegram', 'email', 'sms', 'voice', 'internal'];
const MAX_ROWS = 5;

/**
 * Views sidebar (F-13 to F-19). Five system views up top; channels, departments, teams, labels and saved views are
 * COLLAPSED sections (5 rows, then "Show all"). Project name is plain text, no switcher. The opening-hours chip sits at the bottom.
 */
@Component({
  standalone: true,
  selector: 'tr-sidebar',
  imports: [TrIconComponent, TranslatePipe, TrSidebarItemComponent, TrHoursChipComponent, TrContextMenuComponent, CommonModule],
  template: `
    <aside class="sb" [attr.aria-label]="'sidebar.title' | t">
      <header class="hd">
        <div class="id">
          <h1 class="proj tr-truncate">{{ dir.projectName() || ('project.name' | t) }}</h1>
          <p class="role tr-truncate">{{ dir.projectName() && dir.meRaw() ? ('role.' + dir.meRaw()!.role | t) : ('sidebar.role' | t) }}</p>
        </div>
        <button type="button" class="tr-icon-btn" [attr.aria-label]="'ticket.create' | t" [title]="('ticket.create' | t) + ' (C)'" (click)="ui.open('ticket')"><tr-icon name="plus" [size]="18"></tr-icon></button>
        <ng-container *ngIf="ui.sidebarIsDrawer(); else __e1"> <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="dismiss.emit()"><tr-icon name="x" [size]="18"></tr-icon></button> </ng-container><ng-template #__e1> <button type="button" class="tr-icon-btn" [attr.aria-label]="'sidebar.collapse' | t" [title]="('sidebar.collapse' | t) + ' (Alt+O)'" (click)="ui.set('sidebarCollapsed', true)"><tr-icon name="chevron-left" [size]="18" class="tr-mirror"></tr-icon></button> </ng-template>
      </header>
      <nav class="scroll">
        <ul class="views">
          <ng-container *ngFor="let v of views(); trackBy: __trk2">
            <li><tr-sidebar-item [label]="v.label" [icon]="v.icon ?? null" [count]="v.count" [active]="conv.view() === v.id" [danger]="v.id === 'waiting' && conv.waitingBreached()" (select)="pick(v.id)"></tr-sidebar-item></li>
          </ng-container>
        </ul>
        <ng-container *ngFor="let g of groups(); trackBy: __trk4">
          <section class="grp">
            <button type="button" class="gh" [attr.aria-expanded]="isOpen(g.id)" (click)="toggle(g.id)">
              <tr-icon name="chevron-right" [size]="14" class="chev tr-mirror" [class.open]="isOpen(g.id)"></tr-icon>{{ g.title }}
            </button>
            <ng-container *ngIf="isOpen(g.id)">
              <ul>
                <ng-container *ngFor="let r of visibleRows(g); trackBy: __trk3">
                  <li><tr-sidebar-item [label]="r.label" [icon]="r.icon ?? null" [channel]="r.channel ?? null" [dot]="r.dot ?? null" [count]="r.count" [active]="conv.view() === r.id" [hasMenu]="!!r.hasMenu" (select)="pick(r.id)" (menu)="openMenu($event, r)"></tr-sidebar-item></li>
                </ng-container>
                <ng-container *ngIf="g.rows.length > MAX && !showAll().has(g.id)">
                  <li><button type="button" class="showall" (click)="expand(g.id)">{{ 'sidebar.showAll' | t: { n: g.rows.length } }}</button></li>
                </ng-container>
              </ul>
            </ng-container>
          </section>
        </ng-container>
      </nav>
      <footer class="ft"><tr-hours-chip></tr-hours-chip></footer>
    </aside>
    <ng-container *ngIf="menu() as m"> <tr-context-menu [items]="m.items" [x]="m.x" [y]="m.y" (select)="onMenu($event)" (close)="menu.set(null)"></tr-context-menu> </ng-container>
  `,
  styles: [`
    :host { display: block; block-size: 100%; }
    .sb { display: flex; flex-direction: column; block-size: 100%; }
    .hd { display: flex; align-items: center; gap: 2px; block-size: 64px; padding-inline: 20px 12px; }
    .id { flex: 1; min-inline-size: 0; }
    .proj { font-size: var(--tr-fs-title); line-height: var(--tr-lh-title); font-weight: 600; }
    .role { color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    .scroll { flex: 1; overflow: auto; padding: 4px 12px 16px; }
    .views { display: flex; flex-direction: column; gap: 2px; }
    .grp { margin-block-start: 16px; }
    .gh { display: flex; align-items: center; gap: 4px; inline-size: 100%; min-block-size: 32px; padding-inline: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); font-weight: 500; border-radius: var(--radius-sm); }
    .gh:hover { color: var(--foreground); }
    .chev { transition: transform var(--tr-motion-fast); } .chev.open { transform: rotate(90deg); }
    [dir='rtl'] .chev.open { transform: scaleX(-1) rotate(90deg); }
    .grp ul { display: flex; flex-direction: column; gap: 2px; }
    .showall { padding-block: 6px; padding-inline: 36px 10px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } .showall:hover { color: var(--foreground); }
    .ft { padding: 8px 16px 12px; }
  `],
})
export class TrSidebarComponent {
  readonly __trk2 = (__i: number, v: any): any => v.id;
  readonly __trk3 = (__i: number, r: any): any => r.id;
  readonly __trk4 = (__i: number, g: any): any => g.id;
  protected readonly conv = inject(ConversationStore);
  protected readonly dir = inject(DirectoryStore);
  protected readonly ui = inject(UiStore);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);

  @Output() dismiss = new EventEmitter<void>();
  @Output() navigated = new EventEmitter<void>();
  protected readonly MAX = MAX_ROWS;
  private readonly open = signal<ReadonlySet<string>>(new Set());
  protected readonly showAll = signal<ReadonlySet<string>>(new Set());
  protected readonly menu = signal<{ items: MenuItem[]; x: number; y: number; row: Row } | null>(null);

  protected readonly views = computed<Row[]>(() => {
    const c = this.conv.counts();
    const t = (k: string) => this.i18n.t(k);
    return [
      { id: 'mine', label: t('view.mine'), icon: 'user-round', count: c['mine'] ?? 0 },
      { id: 'waiting', label: t('view.waiting'), icon: 'hourglass', count: c['waiting'] ?? 0 },
      { id: 'bot', label: t('view.bot'), icon: 'bot', count: c['bot'] ?? 0 },
      { id: 'all', label: t('view.all'), icon: 'inbox', count: c['all'] ?? 0 },
      { id: 'mentions', label: t('view.mentions'), icon: 'at-sign', count: c['mentions'] ?? 0 },
    ];
  });

  protected readonly groups = computed<Group[]>(() => {
    const c = this.conv.counts();
    const t = (k: string) => this.i18n.t(k);
    // Only Web is always present. Other channels appear only if a connected channel has conversations.
    const present = new Set<ChannelKind>(['web', ...this.conv.connectedChannels()]);
    const channels = CHANNEL_ORDER.filter((k) => present.has(k)).map((k) => ({ id: `channel:${k}`, label: t(`channel.${k}`), channel: k, count: c[`channel:${k}`] ?? 0 }));
    return [
      { id: 'channels', title: t('sidebar.channels'), rows: channels },
      { id: 'departments', title: t('sidebar.departments'), rows: this.dir.departments().map((d) => ({ id: `dept:${d._id}`, label: d.name, icon: 'building-2', count: c[`dept:${d._id}`] ?? 0 })) },
      { id: 'teams', title: t('sidebar.teams'), rows: this.dir.teams().map((x) => ({ id: `team:${x._id}`, label: x.name, icon: 'users', count: c[`team:${x._id}`] ?? 0 })) },
      { id: 'labels', title: t('sidebar.labels'), rows: this.dir.labels().map((l) => ({ id: `label:${l.id}`, label: l.name, dot: l.color, count: c[`label:${l.id}`] ?? 0 })) },
      { id: 'saved', title: t('sidebar.saved'), rows: this.dir.savedViews().map((v) => ({ id: `saved:${v._id}`, label: v.name, icon: v.shared ? 'users' : 'bookmark', count: c[`saved:${v._id}`] ?? 0, hasMenu: true, shared: v.shared })) },
    ].filter((g) => g.rows.length > 0);
  });

  protected isOpen(id: string): boolean {
    return this.open().has(id);
  }
  protected toggle(id: string): void {
    this.open.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  protected expand(id: string): void {
    this.showAll.update((s) => new Set(s).add(id));
  }
  protected visibleRows(g: Group): Row[] {
    return this.showAll().has(g.id) ? g.rows : g.rows.slice(0, MAX_ROWS);
  }
  protected pick(id: string): void {
    this.conv.setView(id);
    this.navigated.emit();
  }

  protected openMenu(e: MouseEvent, row: Row): void {
    const t = (k: string) => this.i18n.t(k);
    this.menu.set({
      row, x: e.clientX, y: e.clientY,
      items: [
        { id: 'rename', label: t('view.rename'), icon: 'pencil' },
        { id: 'share', label: row.shared ? t('view.unshare') : t('view.share'), icon: 'users' },
        { id: 'div', label: '', divider: true },
        { id: 'delete', label: t('common.delete'), icon: 'trash-2', danger: true },
      ],
    });
  }

  protected async onMenu(action: string): Promise<void> {
    const row = this.menu()?.row;
    if (!row) return;
    const id = row.id.replace('saved:', '');
    if (action === 'share') this.dir.toggleShareView(id);
    if (action === 'rename') {
      const r = await this.confirm.ask({ title: this.i18n.t('view.rename'), confirmLabel: this.i18n.t('common.save'), cancelLabel: this.i18n.t('common.cancel'), fields: [{ key: 'name', label: this.i18n.t('view.name'), value: row.label }] });
      if (r.result === 'confirm' && r.values['name']?.trim()) this.dir.renameView(id, r.values['name'].trim());
    }
    if (action === 'delete') {
      const r = await this.confirm.ask({ title: this.i18n.t('view.deleteTitle', { name: row.label }), text: this.i18n.t('view.deleteText'), confirmLabel: this.i18n.t('common.delete'), cancelLabel: this.i18n.t('common.cancel'), danger: true });
      if (r.result === 'confirm') {
        this.dir.deleteView(id);
        if (this.conv.view() === row.id) this.conv.setView('all');
      }
    }
  }
}
