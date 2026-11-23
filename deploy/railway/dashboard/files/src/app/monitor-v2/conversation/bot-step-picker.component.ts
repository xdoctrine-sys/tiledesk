import { Signal, effect, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { BotStepVM } from '../core/models/view-models';
import { TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { I18nService } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { UiStore } from '../core/stores/ui.store';

/**
 * "Hand back to the AI" (I-2, F-127): pick the step of the bot's flow to resume from, see what the bot will say next,
 * and optionally keep the conversation in the agent's queue for 30 minutes in case the customer goes off-topic.
 */
@Component({
  standalone: true,
  selector: 'tr-bot-step-picker',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <dialog #dlg class="tr-dialog" aria-labelledby="bs-t" (close)="ui.close()" (click)="$event.target === dlg ? ui.close() : null">
      <form class="box" (submit)="$event.preventDefault(); confirm()">
        <header class="hd"><h2 id="bs-t">{{ 'handback.title' | t }}</h2><button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="ui.close()"><tr-icon name="x" [size]="18"></tr-icon></button></header>
        <p class="sub">{{ 'handback.text' | t: { bot: botName() } }}</p>
        <fieldset class="steps">
          <ng-container *ngFor="let s of steps(); trackBy: __trk1">
            <label class="step" [class.on]="picked() === s.id"><input type="radio" name="step" [checked]="picked() === s.id" (change)="picked.set(s.id)" /><span class="lbl">{{ s.label }}</span></label>
          </ng-container>
        </fieldset>
        <ng-container *ngIf="current() as s"> <div class="prev"><span class="pl">{{ 'handback.preview' | t }}</span><p dir="auto">“{{ s.preview }}”</p></div> </ng-container>
        <label class="keep"><input type="checkbox" [checked]="keep()" (change)="keep.set($any($event.target).checked)" />{{ 'handback.keep' | t }}</label>
        <footer class="ft"><button type="button" class="tr-btn" (click)="ui.close()">{{ 'common.cancel' | t }}</button><button type="submit" class="tr-btn tr-btn--primary" [disabled]="!picked()">{{ 'handback.confirm' | t }}</button></footer>
      </form>
    </dialog>
  `,
  styles: [`
    .box { display: flex; flex-direction: column; gap: 14px; padding: 20px 24px 24px; }
    .hd { display: flex; align-items: center; justify-content: space-between; } h2 { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .sub { color: var(--muted-foreground); } .steps { display: flex; flex-direction: column; gap: 6px; border: 0; padding: 0; margin: 0; }
    .step { display: flex; align-items: center; gap: 10px; min-block-size: 44px; padding-inline: 12px; border: 1px solid var(--input); border-radius: var(--radius-md); cursor: pointer; }
    .step.on { border-color: var(--brand); background: var(--accent); } .step input { accent-color: var(--brand); inline-size: 18px; block-size: 18px; }
    .prev { padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); color: var(--foreground); } .prev p { margin: 4px 0 0; } .pl { color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 600; }
    .keep { display: flex; align-items: center; gap: 10px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); min-block-size: 32px; } .keep input { accent-color: var(--brand); inline-size: 18px; block-size: 18px; }
    .ft { display: flex; justify-content: flex-end; gap: 8px; }
  `],
})
export class TrBotStepPickerComponent {
  readonly __trk1 = (__i: number, s: any): any => s.id;
  protected readonly ui = inject(UiStore);
  private readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly _dlg = signal<ElementRef<HTMLDialogElement>>(undefined as any);
  @ViewChild('dlg') private get dlg(): Signal<ElementRef<HTMLDialogElement>> { return this._dlg; }
  private set dlg(v: any) { this._dlg.set(v); }

  protected readonly steps = signal<BotStepVM[]>([]);
  protected readonly picked = signal<string | null>(null);
  protected readonly keep = signal(true);
  protected readonly botName = signal('');
  protected current = () => this.steps().find((s) => s.id === this.picked());

  constructor() {
    effect(() => {
      const open = this.ui.dialog() === 'handBack';
      const d = this.dlg().nativeElement;
      if (open && !d.open) {
        void this.load();
        d.showModal();
      } else if (!open && d.open) d.close();
    });
  }

  private async load(): Promise<void> {
    const c = this.conv.selected();
    const botId = c?.department ? `bot_${this.dir.departments().find((d) => d._id === c.department!.id)?.id_bot ?? 'assistant'}` : 'bot_assistant';
    this.botName.set(this.dir.botsById().get(botId)?.name ?? 'Assistant');
    const steps = await this.dir.botSteps(botId);
    this.steps.set(steps);
    this.picked.set(steps[1]?.id ?? steps[0]?.id ?? null);
  }

  protected async confirm(): Promise<void> {
    const c = this.conv.selected();
    const step = this.picked();
    if (!c || !step) return;
    this.ui.close();
    const ok = await this.conv.exec(c.id, { type: 'handBack', stepId: step, keepMinutes: this.keep() ? 30 : undefined });
    if (ok) this.toast.show(this.i18n.t('handback.done', { bot: this.botName() }), { kind: 'success' });
  }
}
