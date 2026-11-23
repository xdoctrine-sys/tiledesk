import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { CannedVM } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { DirectoryStore } from '../core/stores/directory.store';
import { normalizeArabic } from '../core/util/text';

export interface CannedFill { agent: string; lead: string; ticket: string | number }

/** Replaces {{lead.fullname}}, {{agent.firstname}}, {{ticket.id}} so the agent sees the real text before inserting. */
export function fillCanned(text: string, f: CannedFill): string {
  return text.replace(/\{\{\s*lead\.fullname\s*\}\}/g, f.lead).replace(/\{\{\s*agent\.firstname\s*\}\}/g, f.agent).replace(/\{\{\s*ticket\.id\s*\}\}/g, String(f.ticket));
}

/**
 * Saved replies after "/" (F-77, F-137): fuzzy bilingual search (Arabic letter variants are equal), variables filled in
 * the preview, three suggestions based on the customer's last message, "+ Create". Keyboard: ↑ ↓ ↵ Esc, driven by the composer.
 */
@Component({
  standalone: true,
  selector: 'tr-canned-picker',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <div class="tr-menu panel" role="listbox" [attr.aria-label]="'canned.title' | t">
      <ng-container *ngIf="!query() && suggested().length"> <div class="tr-menu__title">{{ 'canned.suggested' | t }}</div> </ng-container>
      <ng-container *ngFor="let c of shown(); trackBy: __trk1; let i = index">
        <button type="button" role="option" class="tr-menu__item row" [class.is-active]="i === active()" [attr.aria-selected]="i === active()" (mouseenter)="active.set(i)" (click)="choose(i)">
          <span class="sc tr-ltr">/{{ c.shortcut }}</span><span class="ti tr-truncate">{{ c.title }}</span>
        </button>
      </ng-container><ng-container *ngIf="!(shown())?.length"> <div class="none">{{ 'canned.none' | t }}</div> </ng-container>
      <ng-container *ngIf="preview() as p"> <div class="pv" dir="auto"><span class="pl">{{ 'canned.preview' | t }}</span>{{ p }}</div> </ng-container>
      <div class="tr-menu__sep"></div>
      <button type="button" class="tr-menu__item" (click)="create()"><tr-icon name="plus" [size]="14"></tr-icon>{{ 'canned.create' | t }}</button>
    </div>
  `,
  styles: [`
    :host { position: absolute; inset-inline: 12px; inset-block-end: 100%; z-index: 100; margin-block-end: 6px; }
    .panel { position: static; inline-size: min(420px, 100%); max-inline-size: none; max-block-size: 340px; overflow: auto; }
    .row { gap: 12px; } .sc { flex: none; min-inline-size: 76px; color: var(--foreground); font-family: var(--tr-font-mono); font-size: var(--tr-fs-body-sm); } .ti { flex: 1; }
    .none { padding: 12px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .pv { margin: 4px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); max-block-size: 96px; overflow: auto; }
    .pl { display: block; color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 600; margin-block-end: 2px; }
  `],
})
export class TrCannedPickerComponent {
  readonly __trk1 = (__i: number, c: any): any => c.id;
  private readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);

  private readonly _query = signal('');
  @Input() get query() { return this._query; }
  set query(v: any) { this._query.set(v); }
  private readonly _fill = signal<CannedFill>(undefined as any);
  @Input() get fill(): Signal<CannedFill> { return this._fill; }
  set fill(v: any) { this._fill.set(v); }
  /** Last customer message: drives the 3 suggestions */
  private readonly _context = signal('');
  @Input() get context() { return this._context; }
  set context(v: any) { this._context.set(v); }
  @Output() pick = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  protected readonly active = signal(0);

  protected readonly suggested = computed<CannedVM[]>(() => {
    const words = new Set(normalizeArabic(this.context()).split(/\W+/).filter((w) => w.length > 2));
    const lang = this.i18n.lang();
    const pool = this.dir.canned().filter((c) => (lang === 'ar') === /[؀-ۿ]/.test(c.text));
    const score = (c: CannedVM) => normalizeArabic(`${c.title} ${c.text}`).split(/\W+/).filter((w) => words.has(w)).length;
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, 3);
  });

  protected readonly shown = computed<CannedVM[]>(() => {
    const q = normalizeArabic(this.query().trim());
    if (!q) return this.suggested().length ? this.suggested() : this.dir.canned().slice(0, 5);
    const sub = (s: string) => { let i = 0; for (const ch of s) if (ch === q[i]) i++; return i === q.length; }; // fuzzy: subsequence
    return this.dir.canned().filter((c) => { const h = normalizeArabic(`${c.shortcut} ${c.title}`); return h.includes(q) || sub(h); });
  });

  protected readonly preview = computed(() => {
    const c = this.shown()[this.active()];
    return c ? fillCanned(c.text, this.fill()) : '';
  });

  move(delta: number): void {
    const n = this.shown().length;
    if (n) this.active.set((this.active() + delta + n) % n);
  }
  choose(i = this.active()): void {
    const c = this.shown()[i];
    if (c) this.pick.emit(fillCanned(c.text, this.fill()));
  }
  hasItems(): boolean {
    return this.shown().length > 0;
  }

  protected async create(): Promise<void> {
    const t = (k: string) => this.i18n.t(k);
    const r = await this.confirm.ask({ title: t('canned.createTitle'), confirmLabel: t('common.save'), cancelLabel: t('common.cancel'), fields: [{ key: 'title', label: t('canned.fieldTitle') }, { key: 'shortcut', label: t('canned.fieldShortcut') }, { key: 'text', label: t('canned.fieldText'), multiline: true }] });
    const v = r.values;
    if (r.result === 'confirm' && v['title']?.trim() && v['text']?.trim()) this.dir.createCanned(v['title'].trim(), (v['shortcut'] || v['title']).trim().replace(/\s+/g, '-'), v['text'].trim());
    this.close.emit();
  }
}
