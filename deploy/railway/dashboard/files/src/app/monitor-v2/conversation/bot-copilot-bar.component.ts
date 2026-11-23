import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';

/**
 * Bot co-pilot (F-144, observation level): above the composer while the AI is answering: who, the intent it detected and
 * its confidence, plus a one-click "Take over". Whispering a hint to the bot and reviewing its next answer need an
 * extension of the bot engine (➕, P2) and are not part of this template.
 */
@Component({
  standalone: true,
  selector: 'tr-bot-copilot-bar',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <div class="bar" role="status">
      <tr-icon name="sparkles" [size]="14" class="sp"></tr-icon>
      <span class="tx tr-truncate">{{ 'copilot.botReplying' | t: { bot: botName(), intent: intent() } }}<ng-container *ngIf="confidence()"> · {{ confidence() }} </ng-container></span>
      <button type="button" class="take" (click)="takeover.emit()">{{ 'actions.takeover' | t }} <kbd class="tr-kbd">T</kbd></button>
    </div>
  `,
  styles: [`
    :host { display: block; padding: 0 16px 8px; }
    .bar { display: flex; align-items: center; gap: 8px; min-block-size: 36px; padding-inline: 12px 6px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .sp { flex: none; } .tx { flex: 1; } .take { display: inline-flex; align-items: center; gap: 6px; min-block-size: 28px; padding-inline: 10px; border-radius: var(--radius-md); background: var(--card); color: var(--foreground); font-weight: 600; }
  `],
})
export class TrBotCopilotBarComponent {
  private readonly fmt = inject(FormatService);
  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  @Output() takeover = new EventEmitter<void>();
  protected readonly botName = computed(() => this.c().bots[0]?.name ?? '');
  protected readonly intent = computed(() => (this.c().raw.attributes.tarashli?.bot_intent?.name ?? '').replace(/_/g, ' '));
  protected readonly confidence = computed(() => {
    const v = this.c().raw.attributes.tarashli?.bot_intent?.confidence;
    return v ? `${this.fmt.number(Math.round(v * 100))}%` : '';
  });
}
