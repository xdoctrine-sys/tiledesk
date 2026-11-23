import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { AiService } from '../core/services/ai.service';
import { AiAction } from '../core/services/inbox-api';
import { TranslatePipe } from '../core/services/i18n.service';
import { diffProtected } from '../core/util/thread';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

export type Register = 'khaleeji' | 'fusha' | 'en' | null;
interface Result { action: AiAction; before: string; after: string }

/**
 * AI help (F-83, F-129, F-147). The ✦ button opens: Suggest a reply, rewrite tools (fix, shorten, expand, tone,
 * translate), conversation tools (summarize, ask the co-pilot) and the Arabic register (Khaleeji / Fusha / English).
 * A rewrite is shown BEFORE / AFTER and applied only on "Replace". If numbers, amounts or dates changed (e.g. 125 → 152 QAR)
 * a guard warns before anything is sent; ١٢٥ and 125 count as the same value.
 */
@Component({
  standalone: true,
  selector: 'tr-ai-assist',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'close()' },
  template: `
    <button type="button" class="tr-icon-btn" [attr.aria-expanded]="open()" aria-haspopup="menu" [attr.aria-label]="'ai.title' | t" [title]="('ai.title' | t) + ' (Alt+A)'" [class.busy]="busy()" (click)="toggle()"><tr-icon name="sparkles" [size]="18"></tr-icon></button>

    <ng-container *ngIf="open()">
      <div class="tr-menu menu" role="menu" (trClickOutside)="open.set(false)">
        <button type="button" role="menuitem" class="tr-menu__item" (click)="run('suggest')"><tr-icon name="sparkles" [size]="16"></tr-icon>{{ 'ai.suggest' | t }}</button>
        <div class="tr-menu__sep"></div>
        <div class="tr-menu__title">{{ 'ai.write' | t }}</div>
        <button type="button" role="menuitem" class="tr-menu__item" [disabled]="!text().trim()" (click)="run('rephrase')">{{ 'ai.rephrase' | t }}</button>
        <button type="button" role="menuitem" class="tr-menu__item" [disabled]="!text().trim()" (click)="run('fix')">{{ 'ai.fix' | t }}</button>
        <button type="button" role="menuitem" class="tr-menu__item" [disabled]="!text().trim()" (click)="run('shorten')">{{ 'ai.shorten' | t }}</button>
        <button type="button" role="menuitem" class="tr-menu__item" [disabled]="!text().trim()" (click)="run('expand')">{{ 'ai.expand' | t }}</button>
        <button type="button" role="menuitem" class="tr-menu__item" [disabled]="!text().trim()" (click)="run('translate')"><tr-icon name="languages" [size]="16"></tr-icon>{{ 'ai.translate' | t }}</button>
        <div class="tones" role="group" [attr.aria-label]="'ai.tone' | t">
          <span class="tl">{{ 'ai.tone' | t }}</span>
          <ng-container *ngFor="let t2 of tones; trackBy: __trk1"> <button type="button" class="chip" [disabled]="!text().trim()" (click)="run(t2)">{{ ('ai.' + t2) | t }}</button> </ng-container>
        </div>
        <div class="tr-menu__sep"></div>
        <div class="tr-menu__title">{{ 'ai.conversation' | t }}</div>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="run('summarize')">{{ 'ai.summarize' | t }}</button>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="run('copilot')">{{ 'ai.copilot' | t }}</button>
      </div>
    </ng-container>

    <ng-container *ngIf="result() as r">
      <section class="cmp" role="dialog" [attr.aria-label]="'ai.compare' | t">
        <ng-container *ngIf="info(); else __e3">
          <p class="info" dir="auto">{{ r.after }}</p>
          <div class="ac"><button type="button" class="tr-btn tr-btn--ghost" (click)="result.set(null)">{{ 'common.close' | t }}</button><button type="button" class="tr-btn" (click)="apply(true)">{{ 'ai.insertNote' | t }}</button></div>
        </ng-container><ng-template #__e3>
          <div class="cols">
            <ng-container *ngIf="r.before"> <div class="col"><span class="cl">{{ 'ai.before' | t }}</span><p dir="auto">{{ r.before }}</p></div> </ng-container>
            <div class="col after"><span class="cl">{{ 'ai.after' | t }}</span><p dir="auto">{{ r.after }}</p></div>
          </div>
          <ng-container *ngIf="diff().length">
            <div class="warn" role="alert">
              <tr-icon name="triangle-alert" [size]="16"></tr-icon>
              <span class="wt"><ng-container *ngFor="let d of diff(); trackBy: __trk2; let $last = last"> {{ 'ai.valueChanged' | t: { from: d.from, to: d.to } }}<ng-container *ngIf="!$last"> · </ng-container> </ng-container></span>
              <button type="button" class="lk" (click)="fixValues()">{{ 'ai.fixValues' | t }}</button>
            </div>
          </ng-container>
          <div class="ac">
            <button type="button" class="tr-btn tr-btn--ghost" (click)="result.set(null)">{{ (diff().length ? 'ai.revert' : 'common.cancel') | t }}</button>
            <button type="button" class="tr-btn tr-btn--primary" (click)="apply(false)">{{ (diff().length ? 'ai.keepAnyway' : 'ai.replace') | t }}</button>
          </div>
        </ng-template>
      </section>
    </ng-container>
  `,
  styles: [`
    :host { display: inline-flex; }
    .busy tr-icon { animation: mv2-spin 1.1s linear infinite; } @keyframes mv2-spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .busy tr-icon { animation: none; } }
    .menu { inset-inline-start: 8px; inset-block-end: 100%; margin-block-end: 6px; inline-size: 300px; max-block-size: 70vh; overflow: auto; }
    .tones { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 10px 8px; } .tl { color: var(--muted-foreground); font-size: var(--tr-fs-caption); margin-inline-end: 4px; }
    .chip { min-block-size: 28px; padding-inline: 10px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } .chip:hover:not(:disabled) { background: var(--accent); color: var(--foreground); }
    .cmp { position: absolute; inset-inline: 16px; inset-block-end: 60px; z-index: 110; padding: 12px; border-radius: var(--radius-lg); background: var(--card); border: 1px solid var(--input); box-shadow: var(--shadow-popover); display: flex; flex-direction: column; gap: 10px; animation: tr-pop var(--tr-motion-base) var(--tr-ease-in); }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .cols:has(.col:only-child) { grid-template-columns: 1fr; } @media (max-width: 520px) { .cols { grid-template-columns: 1fr; } }
    .col { padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); } .col.after { background: var(--accent); } .col p { margin: 4px 0 0; font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); white-space: pre-wrap; }
    .cl { color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 600; } .info { margin: 0; font-size: var(--tr-fs-body); line-height: var(--tr-lh-body); }
    .warn { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); color: var(--foreground); font-size: var(--tr-fs-body-sm); } .wt { flex: 1; } .lk { color: var(--brand); font-weight: 600; min-block-size: 28px; padding-inline: 6px; }
    .ac { display: flex; justify-content: flex-end; gap: 8px; }
  `],
})
export class TrAiAssistComponent {
  readonly __trk1 = (__i: number, t2: any): any => t2;
  readonly __trk2 = (__i: number, d: any): any => __i;
  private readonly ai = inject(AiService);

  private readonly _text = signal('');
  @Input() get text() { return this._text; }
  set text(v: any) { this._text.set(v); }
  private readonly _conversationId = signal('');
  @Input() get conversationId() { return this._conversationId; }
  set conversationId(v: any) { this._conversationId.set(v); }
  private readonly _register = signal<Register>(null);
  @Input() get register(): Signal<Register> { return this._register; }
  set register(v: any) { this._register.set(v); }
  @Output() replace = new EventEmitter<string>();
  @Output() insertNote = new EventEmitter<string>();

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly result = signal<Result | null>(null);
  protected readonly tones = ['tone_professional', 'tone_friendly', 'tone_casual'] as const;
  protected readonly info = computed(() => ['summarize', 'copilot'].includes(this.result()?.action ?? ''));
  protected readonly diff = computed(() => {
    const r = this.result();
    return r && !this.info() && r.before ? diffProtected(r.before, r.after) : [];
  });

  toggle(): void {
    this.open.update((o) => !o);
  }
  protected close(): void {
    this.open.set(false);
    this.result.set(null);
  }

  protected async run(action: AiAction): Promise<void> {
    this.open.set(false);
    this.busy.set(true);
    try {
      const before = action === 'suggest' || action === 'summarize' || action === 'copilot' ? '' : this.text();
      const after = await this.ai.run(action, this.text(), { register: this.register() ?? undefined, requestId: this.conversationId() });
      this.result.set({ action, before, after });
    } finally {
      this.busy.set(false);
    }
  }

  /** "Fix" restores the original numbers in the rewritten text. */
  protected fixValues(): void {
    const r = this.result();
    if (!r) return;
    let fixed = r.after;
    for (const d of diffProtected(r.before, r.after)) if (d.from !== '—' && d.to !== '—') fixed = fixed.replace(d.to, d.from);
    this.result.set({ ...r, after: fixed });
  }

  protected apply(asNote: boolean): void {
    const r = this.result();
    if (!r) return;
    asNote ? this.insertNote.emit(r.after) : this.replace.emit(r.after);
    this.result.set(null);
  }
}
