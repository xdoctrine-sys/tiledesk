import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, Output, EventEmitter, ViewChild } from '@angular/core';
import { FilterRow, SortKey } from '../core/models/tiledesk.models';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { UiStore } from '../core/stores/ui.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { TrPresenceMenuComponent } from '../layout/presence-menu.component';
import { TrFilterBuilderComponent } from './filter-builder.component';

const SORTS: SortKey[] = ['last_activity', 'created', 'unread', 'priority', 'longest_wait', 'sla'];

/**
 * List header (F-21, F-22, F-24, F-35): "Messages" title + new ticket, always-visible search field, the status tabs (projected),
 * then sort ("Newest ⌄") and ghost icon buttons for filters and "…". Quick filters (Unread, AI, Waiting, High priority) live
 * INSIDE the filters menu; only ACTIVE filters show, as small removable badges.
 */
@Component({
  standalone: true,
  selector: 'tr-list-toolbar',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, TrFilterBuilderComponent, TrPresenceMenuComponent, CommonModule],
  template: `
    <div class="bar">
      <ng-container *ngIf="ui.sidebarIsDrawer() || ui.sidebarCollapsed()">
        <button type="button" class="tr-icon-btn" [attr.aria-label]="'sidebar.title' | t" (click)="ui.sidebarIsDrawer() ? ui.sidebarDrawerOpen.set(true) : ui.set('sidebarCollapsed', false)"><tr-icon name="menu" [size]="18"></tr-icon></button>
      </ng-container>
      <h2 class="title tr-truncate">{{ 'list.title' | t }}<ng-container *ngIf="ui.sidebarIsDrawer() || ui.sidebarCollapsed()"> <span class="view">{{ title() }}</span> </ng-container></h2>
      <button type="button" class="tr-icon-btn" [attr.aria-label]="'ticket.create' | t" [title]="('ticket.create' | t) + ' (C)'" (click)="ui.open('ticket')"><tr-icon name="plus" [size]="18"></tr-icon></button>
      <ng-container *ngIf="ui.isMobile()"> <tr-presence-menu placement="below"></tr-presence-menu> </ng-container>
    </div>

    <div class="searchrow">
      <label class="search">
        <tr-icon name="search" [size]="18"></tr-icon>
        <input #q type="search" class="in" dir="auto" [attr.aria-label]="'list.searchBtn' | t" [placeholder]="'list.search' | t" [value]="conv.search()" (input)="conv.search.set($any($event.target).value)" (keydown.escape)="closeSearch()" />
        <ng-container *ngIf="conv.search()"> <button type="button" class="tr-icon-btn clr" [attr.aria-label]="'common.close' | t" (click)="closeSearch()"><tr-icon name="x" [size]="16"></tr-icon></button> </ng-container>
      </label>
    </div>

    <ng-content></ng-content>

    <div class="tools">
      <div class="anchor">
        <button type="button" class="sortbtn" [attr.aria-expanded]="menu() === 'sort'" aria-haspopup="menu" [attr.aria-label]="'sort.title' | t" (click)="toggle('sort')">{{ ('sort.' + conv.sort()) | t }}<tr-icon name="chevron-down" [size]="14"></tr-icon></button>
        <ng-container *ngIf="menu() === 'sort'">
          <div class="tr-menu pop start" role="menu" (trClickOutside)="menu.set(null)">
            <div class="tr-menu__title">{{ 'sort.title' | t }}</div>
            <ng-container *ngFor="let s of sorts; trackBy: __trk1">
              <button type="button" role="menuitemradio" class="tr-menu__item" [class.is-selected]="conv.sort() === s" [attr.aria-checked]="conv.sort() === s" (click)="conv.setSort(s); menu.set(null)">{{ ('sort.' + s) | t }}<ng-container *ngIf="conv.sort() === s"> <tr-icon name="check" [size]="14" class="tr-menu__kbd"></tr-icon> </ng-container></button>
            </ng-container>
          </div>
        </ng-container>
      </div>
      <span class="sp"></span>
      <div class="anchor">
        <button type="button" class="tr-icon-btn" [attr.aria-expanded]="menu() === 'filters'" [attr.aria-label]="'filters.title' | t" [title]="'filters.title' | t" (click)="toggle('filters')">
          <tr-icon name="list-filter" [size]="18"></tr-icon><ng-container *ngIf="activeCount() > 0"> <span class="bubble">{{ activeCount() }}</span> </ng-container>
        </button>
      </div>
      <div class="anchor">
        <button type="button" class="tr-icon-btn" [attr.aria-expanded]="menu() === 'more'" aria-haspopup="menu" [attr.aria-label]="'common.more' | t" (click)="toggle('more')"><tr-icon name="ellipsis" [size]="18"></tr-icon></button>
        <ng-container *ngIf="menu() === 'more'">
          <div class="tr-menu pop" role="menu" (trClickOutside)="menu.set(null)">
            <div class="tr-menu__title">{{ 'density.title' | t }}</div>
            <button type="button" role="menuitemradio" class="tr-menu__item" [class.is-selected]="ui.density() === 'comfortable'" (click)="ui.set('density', 'comfortable'); menu.set(null)">{{ 'density.comfortable' | t }}</button>
            <button type="button" role="menuitemradio" class="tr-menu__item" [class.is-selected]="ui.density() === 'compact'" (click)="ui.set('density', 'compact'); menu.set(null)">{{ 'density.compact' | t }}</button>
            <div class="tr-menu__sep"></div>
            <button type="button" role="menuitem" class="tr-menu__item" (click)="conv.selectAll(); menu.set(null)">{{ 'list.selectAll' | t }}<span class="tr-menu__kbd">⌘A</span></button>
          </div>
        </ng-container>
      </div>
    </div>

    <ng-container *ngIf="conv.quick().size || conv.rows().length">
      <div class="chips" role="group" [attr.aria-label]="'chips.label' | t">
        <ng-container *ngFor="let c of activeQuick(); trackBy: __trk2">
          <span class="chip">{{ ('chips.' + c) | t }}<button type="button" class="x" [attr.aria-label]="'common.delete' | t" (click)="conv.toggleQuick(c)"><tr-icon name="x" [size]="12"></tr-icon></button></span>
        </ng-container>
        <ng-container *ngFor="let r of conv.rows(); trackBy: __trk3; let i = index">
          <span class="chip">{{ describe(r) }}<button type="button" class="x" [attr.aria-label]="'common.delete' | t" (click)="removeRow(i)"><tr-icon name="x" [size]="12"></tr-icon></button></span>
        </ng-container>
        <ng-container *ngIf="conv.hasActiveFilters()">
          <button type="button" class="clear" (click)="conv.clearFilters()">{{ 'filters.clear' | t }}</button>
        </ng-container>
      </div>
    </ng-container>

    <ng-container *ngIf="menu() === 'filters'"> <tr-filter-builder (close)="menu.set(null)"></tr-filter-builder> </ng-container>
  `,
  styles: [`
    :host { position: relative; display: block; background: var(--card); }
    .bar { display: flex; align-items: center; gap: 4px; block-size: 64px; padding-inline: 20px 12px; }
    .title { flex: 1; min-inline-size: 0; font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .view { margin-inline-start: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); font-weight: 400; }
    .bar:has(> .tr-icon-btn:first-child) { padding-inline-start: 12px; }
    .searchrow { padding: 0 16px 8px; }
    .search { display: flex; align-items: center; gap: 8px; block-size: 40px; padding-inline: 12px 4px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); }
    .search:focus-within { box-shadow: 0 0 0 2px var(--ring); }
    .in { flex: 1; min-inline-size: 0; border: 0; background: none; outline: none; color: var(--foreground); font-size: var(--tr-fs-body); } .in::placeholder { color: var(--muted-foreground); } .in::-webkit-search-cancel-button { display: none; }
    .clr { inline-size: 32px; block-size: 32px; }
    .tools { display: flex; align-items: center; gap: 2px; block-size: 44px; padding-inline: 12px 12px; }
    .sp { flex: 1; }
    .anchor { position: relative; }
    .sortbtn { display: inline-flex; align-items: center; gap: 4px; min-block-size: 32px; padding-inline: 8px; border-radius: var(--radius-md); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .sortbtn:hover, .sortbtn[aria-expanded='true'] { background: var(--muted); color: var(--foreground); }
    .bubble { position: absolute; inset-block-start: 0; inset-inline-end: 0; min-inline-size: 16px; block-size: 16px; padding-inline: 4px; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); font-size: var(--tr-fs-micro); line-height: 16px; font-weight: 600; text-align: center; }
    .pop { inset-block-start: 100%; inset-inline-end: 0; margin-block-start: 4px; min-inline-size: 220px; }
    .pop.start { inset-inline: 0 auto; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 16px 10px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; block-size: 24px; padding-inline: 8px 4px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); white-space: nowrap; }
    .x { display: inline-flex; align-items: center; justify-content: center; inline-size: 18px; block-size: 18px; border-radius: var(--radius-sm); color: var(--muted-foreground); } .x:hover { background: var(--muted); color: var(--foreground); }
    .clear { color: var(--muted-foreground); font-size: var(--tr-fs-caption); padding-inline: 6px; min-block-size: 24px; } .clear:hover { color: var(--foreground); }
  `],
})
export class TrListToolbarComponent {
  readonly __trk1 = (__i: number, s: any): any => s;
  readonly __trk2 = (__i: number, c: any): any => c;
  readonly __trk3 = (__i: number, r: any): any => __i;
  protected readonly conv = inject(ConversationStore);
  protected readonly ui = inject(UiStore);
  protected readonly fmt = inject(FormatService);
  private readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);

  protected readonly sorts = SORTS;
  protected readonly menu = signal<'filters' | 'sort' | 'more' | null>(null);
  private readonly _q = signal<ElementRef<HTMLInputElement> | undefined>(undefined);
  @ViewChild('q') private get q(): Signal<ElementRef<HTMLInputElement> | undefined> { return this._q; }
  private set q(v: any) { this._q.set(v); }
  @Output() searchOpened = new EventEmitter<void>();

  protected readonly activeQuick = computed(() => [...this.conv.quick()]);

  protected readonly activeCount = computed(() => this.conv.rows().length + this.conv.quick().size);

  protected readonly title = computed(() => {
    const v = this.conv.view();
    const t = (k: string) => this.i18n.t(k);
    if (['mine', 'waiting', 'bot', 'all', 'mentions'].includes(v)) return t(`view.${v}`);
    const [kind, id] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)];
    switch (kind) {
      case 'channel': return t(`channel.${id}`);
      case 'dept': return this.dir.departments().find((d) => d._id === id)?.name ?? '';
      case 'team': return this.dir.teams().find((d) => d._id === id)?.name ?? '';
      case 'label': return this.dir.labels().find((l) => l.id === id)?.name ?? id;
      case 'saved': return this.dir.savedViews().find((s) => s._id === id)?.name ?? '';
    }
    return t('view.all');
  });

  protected toggle(m: 'filters' | 'sort' | 'more'): void {
    this.menu.update((cur) => (cur === m ? null : m));
  }

  /** Focuses the always-visible search field ("/" shortcut). */
  openSearch(): void {
    this.q()?.nativeElement.focus();
  }
  protected closeSearch(): void {
    this.conv.search.set('');
    this.q()?.nativeElement.blur();
  }

  protected removeRow(i: number): void {
    this.conv.setFilters(this.conv.rows().filter((_, j) => j !== i), this.conv.conjunction());
  }

  protected describe(r: FilterRow): string {
    const t = (k: string) => this.i18n.t(k);
    const attr = t(`filters.attr.${r.attribute}`);
    const v = r.values[0] ?? '';
    const label = (() => {
      switch (r.attribute) {
        case 'status': return t(`tabs.${v}`);
        case 'priority': return t(`priority.${v}`);
        case 'actor': return t(`filters.actor.${v}`);
        case 'channel': return t(`channel.${v}`);
        case 'assignee': return v === 'me' ? t('filters.me') : v === 'none' ? t('filters.unassigned') : (this.dir.agentsById().get(v)?.name ?? v);
        case 'department': return this.dir.departments().find((d) => d._id === v)?.name ?? v;
        case 'team': return this.dir.teams().find((d) => d._id === v)?.name ?? v;
        case 'language': return t(`lang.${v}`);
        case 'created': return t(`filters.days${v}`);
        default: return v;
      }
    })();
    return `${attr}${r.operator === 'is_not' ? ' ≠' : ':'} ${label}`;
  }
}
