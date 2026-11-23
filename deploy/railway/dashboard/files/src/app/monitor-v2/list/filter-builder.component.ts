import { computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Output, EventEmitter } from '@angular/core';
import { FilterAttribute, FilterRow } from '../core/models/tiledesk.models';
import { QuickChip } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { parseNaturalFilter } from './natural-filter';

const ATTRS: FilterAttribute[] = ['status', 'priority', 'assignee', 'actor', 'department', 'team', 'channel', 'label', 'language', 'country', 'created'];

/**
 * Advanced filters (F-23, F-18): rows of attribute / operator / value, AND / OR, a natural-language line (AR / EN),
 * "Save as view". Edits are local until "Apply". Active filters are shown as removable chips above the list.
 */
@Component({
  standalone: true,
  selector: 'tr-filter-builder',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'close.emit()' },
  template: `
    <div class="tr-menu panel" role="dialog" [attr.aria-label]="'filters.title' | t" (trClickOutside)="close.emit()">
      <h2 class="ttl">{{ 'filters.title' | t }}</h2>
      <div class="quick" role="group" [attr.aria-label]="'chips.label' | t">
        <ng-container *ngFor="let c of quickChips(); trackBy: __trk1">
          <button type="button" class="qchip" [class.on]="conv.quick().has(c)" [attr.aria-pressed]="conv.quick().has(c)" (click)="conv.toggleQuick(c)">{{ ('chips.' + c) | t }}</button>
        </ng-container>
      </div>
      <label class="nl">
        <tr-icon name="wand-2" [size]="16"></tr-icon>
        <input class="tr-field" [placeholder]="'filters.natural' | t" [value]="nl()" (input)="nl.set($any($event.target).value)" (keydown.enter)="parse()" dir="auto" />
      </label>
      <ng-container *ngIf="nlMiss()"> <p class="miss">{{ 'filters.naturalMiss' | t }}</p> </ng-container>

      <ul class="rows">
        <ng-container *ngFor="let r of rows(); trackBy: __trk5; let i = index">
          <li class="row">
            <ng-container *ngIf="i > 0"> <button type="button" class="conj" (click)="toggleConj()" [attr.aria-label]="'filters.conjunction' | t">{{ (conj() === 'and' ? 'filters.and' : 'filters.or') | t }}</button> </ng-container>
            <select class="tr-field sel" [attr.aria-label]="'filters.attribute' | t" [value]="r.attribute" (change)="setAttr(i, $any($event.target).value)">
              <ng-container *ngFor="let a of attrs; trackBy: __trk2"> <option [value]="a" [selected]="a === r.attribute">{{ ('filters.attr.' + a) | t }}</option> </ng-container>
            </select>
            <ng-container *ngIf="r.attribute === 'created'; else __e3">
              <select class="tr-field sel" [value]="r.operator" (change)="setOp(i, $any($event.target).value)">
                <option value="after" [selected]="r.operator === 'after'">{{ 'filters.op.within' | t }}</option>
                <option value="before" [selected]="r.operator === 'before'">{{ 'filters.op.olderThan' | t }}</option>
              </select>
            </ng-container><ng-template #__e3>
              <select class="tr-field sel narrow" [value]="r.operator" (change)="setOp(i, $any($event.target).value)">
                <option value="is" [selected]="r.operator === 'is'">{{ 'filters.op.is' | t }}</option>
                <option value="is_not" [selected]="r.operator === 'is_not'">{{ 'filters.op.isNot' | t }}</option>
              </select>
            </ng-template>
            <select class="tr-field sel" [attr.aria-label]="'filters.value' | t" [value]="r.values[0] ?? ''" (change)="setValue(i, $any($event.target).value)">
              <ng-container *ngFor="let o of options(r.attribute); trackBy: __trk4"> <option [value]="o.value" [selected]="o.value === r.values[0]">{{ o.label }}</option> </ng-container>
            </select>
            <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.delete' | t" (click)="remove(i)"><tr-icon name="trash-2" [size]="16"></tr-icon></button>
          </li>
        </ng-container>
      </ul>
      <button type="button" class="add" (click)="add()"><tr-icon name="plus" [size]="14"></tr-icon>{{ 'filters.add' | t }}</button>

      <footer class="ft">
        <button type="button" class="tr-btn tr-btn--ghost" (click)="clear()">{{ 'filters.clear' | t }}</button>
        <span class="sp"></span>
        <button type="button" class="tr-btn" [disabled]="!rows().length" (click)="saveView()"><tr-icon name="bookmark" [size]="14"></tr-icon>{{ 'filters.saveView' | t }}</button>
        <button type="button" class="tr-btn tr-btn--primary" (click)="apply()">{{ 'filters.apply' | t }}</button>
      </footer>
    </div>
  `,
  styles: [`
    :host { position: absolute; inset-inline: 8px; inset-block-start: calc(100% - 4px); z-index: 100; }
    .panel { position: static; inline-size: 100%; max-inline-size: none; padding: 16px; display: flex; flex-direction: column; gap: 12px; max-block-size: calc(100vh - 140px); overflow: auto; }
    .ttl { font-size: var(--tr-fs-title); line-height: var(--tr-lh-title); font-weight: 600; }
    .quick { display: flex; flex-wrap: wrap; gap: 6px; }
    .qchip { display: inline-flex; align-items: center; min-block-size: 32px; padding-inline: 12px; border-radius: var(--radius-md); border: 1px solid var(--border); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .qchip:hover { background: var(--muted); }
    .qchip.on { background: var(--accent); color: var(--foreground); border-color: var(--input); font-weight: 500; }
    .nl { position: relative; display: flex; align-items: center; } .nl tr-icon { position: absolute; inset-inline-start: 12px; color: var(--muted-foreground); pointer-events: none; } .nl .tr-field { padding-inline-start: 36px; }
    .miss { color: var(--muted-foreground); font-size: var(--tr-fs-caption); margin-block-start: -6px; }
    .rows { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .conj { flex: 0 0 100%; align-self: flex-start; color: var(--foreground); font-size: var(--tr-fs-caption); font-weight: 600; padding-inline: 4px; min-block-size: 24px; text-align: start; }
    .sel { flex: 1 1 110px; min-inline-size: 0; inline-size: auto; padding-block: 6px; min-block-size: 36px; } .sel.narrow { flex: 0 1 90px; }
    .add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; color: var(--brand); font-weight: 600; min-block-size: 32px; }
    .ft { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-block-start: 12px; border-block-start: 1px solid var(--border); } .sp { flex: 1; } .ft .tr-btn { padding-inline: 12px; }
  `],
})
export class TrFilterBuilderComponent {
  readonly __trk1 = (__i: number, c: any): any => c;
  readonly __trk2 = (__i: number, a: any): any => a;
  readonly __trk4 = (__i: number, o: any): any => o.value;
  readonly __trk5 = (__i: number, r: any): any => __i;
  protected readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  @Output() close = new EventEmitter<void>();
  protected readonly attrs = ATTRS;
  protected readonly rows = signal<FilterRow[]>(structuredClone(this.conv.rows()));
  protected readonly conj = signal<'and' | 'or'>(this.conv.conjunction());
  protected readonly nl = signal('');
  protected readonly nlMiss = signal(false);
  /** Quick filters (they used to be a row of chips above the list). The 24 h chip belongs to WhatsApp / Meta: only when such a channel is connected. */
  protected readonly quickChips = computed<QuickChip[]>(() => {
    const base: QuickChip[] = ['unread', 'bot', 'waiting', 'high'];
    return this.conv.all().some((c) => c.channel.hasServiceWindow) ? [...base, 'window'] : base;
  });

  private readonly opts = computed(() => {
    const t = (k: string) => this.i18n.t(k);
    const o: Record<FilterAttribute, { value: string; label: string }[]> = {
      status: ['open', 'pending', 'snoozed', 'resolved'].map((v) => ({ value: v, label: t(`tabs.${v}`) })),
      priority: ['urgent', 'high', 'medium', 'low'].map((v) => ({ value: v, label: t(`priority.${v}`) })),
      assignee: [{ value: 'me', label: t('filters.me') }, { value: 'none', label: t('filters.unassigned') }, ...this.dir.agents().filter((a) => !a.isMe).map((a) => ({ value: a.id, label: a.name }))],
      actor: ['bot', 'human', 'waiting'].map((v) => ({ value: v, label: t(`filters.actor.${v}`) })),
      department: this.dir.departments().map((d) => ({ value: d._id, label: d.name })),
      team: this.dir.teams().map((x) => ({ value: x._id, label: x.name })),
      channel: ['web', 'whatsapp', 'messenger', 'instagram', 'telegram', 'email', 'sms'].map((v) => ({ value: v, label: t(`channel.${v}`) })),
      label: this.dir.labels().map((l) => ({ value: l.id, label: l.name })),
      language: [{ value: 'ar', label: t('lang.ar') }, { value: 'en', label: t('lang.en') }],
      country: ['QA', 'AE', 'SA', 'KW', 'BH', 'OM'].map((v) => ({ value: v, label: v })),
      created: [{ value: '1', label: t('filters.days1') }, { value: '7', label: t('filters.days7') }, { value: '30', label: t('filters.days30') }],
    };
    return o;
  });

  protected options(a: FilterAttribute) {
    return this.opts()[a];
  }

  protected add(): void {
    const used = new Set(this.rows().map((r) => r.attribute));
    const attribute = ATTRS.find((a) => !used.has(a)) ?? 'priority';
    this.rows.update((r) => [...r, { attribute, operator: attribute === 'created' ? 'after' : 'is', values: [this.opts()[attribute][0]?.value ?? ''] }]);
  }
  protected remove(i: number): void {
    this.rows.update((r) => r.filter((_, j) => j !== i));
  }
  protected setAttr(i: number, attribute: FilterAttribute): void {
    this.rows.update((r) => r.map((x, j) => (j === i ? { attribute, operator: attribute === 'created' ? 'after' : 'is', values: [this.opts()[attribute][0]?.value ?? ''] } : x)));
  }
  protected setOp(i: number, operator: FilterRow['operator']): void {
    this.rows.update((r) => r.map((x, j) => (j === i ? { ...x, operator } : x)));
  }
  protected setValue(i: number, v: string): void {
    this.rows.update((r) => r.map((x, j) => (j === i ? { ...x, values: [v] } : x)));
  }
  protected toggleConj(): void {
    this.conj.update((c) => (c === 'and' ? 'or' : 'and'));
  }

  protected parse(): void {
    const rows = parseNaturalFilter(this.nl(), { departments: this.dir.departments().map((d) => ({ id: d._id, name: d.name })), labels: this.dir.labels() });
    this.nlMiss.set(rows.length === 0);
    if (rows.length) {
      this.rows.set(rows);
      this.conj.set('and');
      this.nl.set('');
    }
  }

  protected clear(): void {
    this.rows.set([]);
    this.conv.setFilters([], 'and');
    this.close.emit();
  }
  protected apply(): void {
    this.conv.setFilters(this.rows(), this.conj());
    this.close.emit();
  }

  protected async saveView(): Promise<void> {
    const r = await this.confirm.ask({ title: this.i18n.t('filters.saveView'), confirmLabel: this.i18n.t('common.save'), cancelLabel: this.i18n.t('common.cancel'), fields: [{ key: 'name', label: this.i18n.t('view.name') }] });
    const name = r.values['name']?.trim();
    if (r.result !== 'confirm' || !name) return;
    const saved = await this.dir.saveView({ name, shared: false, filters: this.rows(), conjunction: this.conj(), sort: this.conv.sort() });
    this.conv.setFilters([], 'and');
    this.conv.setView(`saved:${saved._id}`);
    this.toast.show(this.i18n.t('filters.saved', { name }), { kind: 'success' });
    this.close.emit();
  }
}
