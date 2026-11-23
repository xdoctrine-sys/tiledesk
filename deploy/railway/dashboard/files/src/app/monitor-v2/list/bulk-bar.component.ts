import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { LabelVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { BulkAction, BulkSimulation, ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { SnoozePreset, resolveSnooze } from '../core/util/snooze';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { MenuItem, TrContextMenuComponent } from './context-menu.component';

/**
 * Floating bulk bar (F-29, F-150): resolve, snooze, assign, labels, priority, "more". Before anything is applied the
 * action is simulated; if some conversations are held by a bot or refused, a preview asks "Apply to 18 / Adjust".
 * After applying, a toast offers "Undo" for 10 s. Progress is shown inline.
 */
@Component({
  standalone: true,
  selector: 'tr-bulk-bar',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, TrContextMenuComponent, CommonModule],
  template: `
    <ng-container *ngIf="preview() as p">
      <div class="preview" role="alertdialog" [attr.aria-label]="'bulk.simulate' | t: { ok: p.applicable.length, warn: p.warnings.length + p.refused.length }" (trClickOutside)="preview.set(null)">
        <p class="pt"><tr-icon name="info" [size]="16"></tr-icon>{{ 'bulk.simulate' | t: { ok: p.applicable.length, warn: p.warnings.length + p.refused.length } }}</p>
        <ul class="pl">
          <ng-container *ngIf="p.warnings.length"> <li>{{ 'bulk.warn.bot' | t: { n: p.warnings.length } }}</li> </ng-container>
          <ng-container *ngIf="p.refused.length"> <li>{{ 'bulk.warn.refused' | t: { n: p.refused.length } }}</li> </ng-container>
        </ul>
        <div class="pa">
          <button type="button" class="tr-btn tr-btn--ghost" (click)="preview.set(null)">{{ 'bulk.adjust' | t }}</button>
          <button type="button" class="tr-btn tr-btn--primary" [disabled]="!p.applicable.length" (click)="run(p.applicable, p.action)">{{ 'bulk.applyTo' | t: { n: p.applicable.length } }}</button>
        </div>
      </div>
    </ng-container>
    <div class="bar" role="toolbar" [attr.aria-label]="'bulk.label' | t">
      <span class="sel">{{ 'bulk.count' | t: { n: ids().length } }}</span>
      <button type="button" class="tr-icon-btn clr" [attr.aria-label]="'bulk.clear' | t" [title]="'bulk.clear' | t" (click)="conv.clearChecked()"><tr-icon name="x" [size]="14"></tr-icon></button>
      <span class="sep"></span>
      <ng-container *ngIf="conv.bulkProgress() as pr; else __e1">
        <span class="prog" role="status"><span class="track"><span class="fill" [style.inline-size.%]="(pr.done / pr.total) * 100"></span></span>{{ 'bulk.progress' | t: { done: pr.done, total: pr.total } }}</span>
      </ng-container><ng-template #__e1>
        <button type="button" class="a" (click)="start({ type: 'resolve' })"><tr-icon name="circle-check" [size]="16"></tr-icon><span>{{ 'actions.resolve' | t }}</span></button>
        <button type="button" class="a" [attr.aria-label]="'actions.snooze' | t" [title]="'actions.snooze' | t" (click)="openMenu($event, 'snooze')"><tr-icon name="alarm-clock" [size]="16"></tr-icon></button>
        <button type="button" class="a" [attr.aria-label]="'actions.assign' | t" [title]="'actions.assign' | t" (click)="openMenu($event, 'assign')"><tr-icon name="user-plus" [size]="16"></tr-icon></button>
        <button type="button" class="a" [attr.aria-label]="'actions.labels' | t" [title]="'actions.labels' | t" (click)="openMenu($event, 'labels')"><tr-icon name="tag" [size]="16"></tr-icon></button>
        <button type="button" class="a" (click)="openMenu($event, 'more')" [attr.aria-label]="'common.more' | t"><tr-icon name="ellipsis" [size]="16"></tr-icon></button>
      </ng-template>
    </div>
    <ng-container *ngIf="menu() as m"> <tr-context-menu [items]="m.items" [x]="m.x" [y]="m.y" (select)="onMenu($event)" (close)="menu.set(null)"></tr-context-menu> </ng-container>
  `,
  styles: [`
    :host { position: absolute; inset-inline: 8px; inset-block-end: 12px; z-index: 20; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
    .bar, .preview { pointer-events: auto; }
    .bar { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-radius: var(--radius-lg); background: var(--card); color: var(--foreground); border: 1px solid var(--border); box-shadow: var(--shadow-popover); }
    .sel { padding-inline: 8px; font-weight: 500; font-size: var(--tr-fs-body-sm); }
    .clr { inline-size: 28px; block-size: 28px; color: inherit; opacity: .75; }
    .clr:hover { background: var(--muted); }
    .sep { flex: 1 1 4px; }
    .a { display: inline-flex; align-items: center; gap: 6px; min-block-size: 32px; padding-inline: 8px; border-radius: var(--radius-sm); color: inherit; font-size: var(--tr-fs-body-sm); position: relative; }
    .a::after { content: ''; position: absolute; inset: -6px -2px; }
    .a:hover { background: var(--muted); }
    :host-context(tr-conversation-list) .a span { display: none; }
    .a span { display: inline; }
    @container (min-width: 360px) { }
    .prog { display: inline-flex; align-items: center; gap: 8px; font-size: var(--tr-fs-body-sm); }
    .track { inline-size: 80px; block-size: 4px; border-radius: 2px; background: var(--muted); overflow: hidden; } .fill { display: block; block-size: 100%; background: var(--primary); }
    .preview { padding: 12px 14px; border-radius: var(--radius-lg); background: var(--card); border: 1px solid var(--input); box-shadow: var(--shadow-popover); }
    .pt { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: var(--tr-fs-body-sm); }
    .pl { margin-block: 6px 0; padding-inline-start: 24px; list-style: disc; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .pa { display: flex; justify-content: flex-end; gap: 8px; margin-block-start: 10px; }
  `],
})
export class TrBulkBarComponent {
  protected readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);

  private readonly _ids = signal<string[]>(undefined as any);
  @Input() get ids(): Signal<string[]> { return this._ids; }
  set ids(v: any) { this._ids.set(v); }
  protected readonly preview = signal<BulkSimulation | null>(null);
  protected readonly menu = signal<{ kind: string; items: MenuItem[]; x: number; y: number } | null>(null);

  /** Labels shared by every selected conversation (toggling removes them, otherwise adds them to all). */
  private readonly common = computed<Set<string>>(() => {
    const sel = this.ids().map((id) => this.conv.byId().get(id)).filter((c): c is NonNullable<typeof c> => !!c);
    if (!sel.length) return new Set();
    return new Set(sel[0]!.labels.map((l: LabelVM) => l.id).filter((id) => sel.every((c) => c.labels.some((l) => l.id === id))));
  });

  protected start(action: BulkAction): void {
    const sim = this.conv.simulate(this.ids(), action);
    if (sim.warnings.length || sim.refused.length) this.preview.set(sim);
    else void this.run(sim.applicable, action);
  }

  protected async run(ids: string[], action: BulkAction): Promise<void> {
    this.preview.set(null);
    await this.conv.bulk(ids, action);
  }

  protected openMenu(e: MouseEvent, kind: 'snooze' | 'assign' | 'labels' | 'priority' | 'more'): void {
    const t = (k: string) => this.i18n.t(k);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let items: MenuItem[] = [];
    if (kind === 'snooze') items = [{ id: 'sn:1h', label: t('snooze.in1h') }, { id: 'sn:tonight', label: t('snooze.tonight') }, { id: 'sn:tomorrow', label: t('snooze.tomorrow') }, { id: 'sn:weekend', label: t('snooze.afterWeekend') }];
    if (kind === 'priority') items = (['urgent', 'high', 'medium', 'low'] as const).map((p) => ({ id: `pr:${p}`, label: t(`priority.${p}`), icon: 'flag' }));
    if (kind === 'labels') items = this.dir.labels().map((l) => ({ id: `lb:${l.id}`, label: l.name, checked: this.common().has(l.id) }));
    if (kind === 'assign') {
      items = [
        { id: 'as:agent:me', label: t('assign.toMe'), icon: 'user-round' },
        ...this.dir.agents().filter((a) => !a.isMe).map((a) => ({ id: `as:agent:${a.id}`, label: a.name, icon: 'user-round' })),
        { id: 'd', label: '', divider: true },
        ...this.dir.bots().map((b) => ({ id: `as:bot:${b.id}`, label: b.name, icon: 'bot' })),
        { id: 'd2', label: '', divider: true },
        ...this.dir.departments().map((d) => ({ id: `as:department:${d._id}`, label: d.name, icon: 'building-2' })),
      ];
    }
    if (kind === 'more')
      items = [
        { id: 'pending', label: t('actions.pending'), icon: 'circle-pause' },
        { id: 'unread', label: t('actions.markUnread'), icon: 'eye' },
        { id: 'priority', label: t('actions.priority'), icon: 'flag', children: (['urgent', 'high', 'medium', 'low'] as const).map((p) => ({ id: `pr:${p}`, label: t(`priority.${p}`) })) },
      ];
    this.menu.set({ kind, items, x: r.left, y: r.top - items.length * 36 - 24 });
  }

  protected onMenu(id: string): void {
    const [k, a, b] = id.split(':');
    if (k === 'sn') this.start({ type: 'snooze', until: resolveSnooze(a as SnoozePreset).toISOString() });
    else if (k === 'pr') this.start({ type: 'priority', value: a as 'urgent' });
    else if (k === 'lb') this.start(this.common().has(a!) ? { type: 'removeLabel', label: a! } : { type: 'addLabel', label: a! });
    else if (k === 'as') this.start({ type: 'assign', target: { kind: a as 'agent', id: b === 'me' ? this.dir.meId() : b! } });
    else if (k === 'pending') this.start({ type: 'pending' });
    else if (k === 'unread') this.start({ type: 'unread' });
  }
}
