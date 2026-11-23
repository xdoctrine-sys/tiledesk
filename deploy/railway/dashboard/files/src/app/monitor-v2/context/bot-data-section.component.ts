import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { BotSlotVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';

/**
 * "AI collected data" (I-2, F-109): the variables the bot flow filled in for this conversation, as a key / value
 * table. Click a value to copy it; the arrow jumps to the message it came from. Empty → one grey line.
 */
@Component({
  standalone: true,
  selector: 'tr-bot-data-section',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container *ngIf="rows().length; else __e3">
      <dl class="tbl">
        <ng-container *ngFor="let s of rows(); trackBy: __trk2">
          <div class="r">
            <dt>{{ label(s.key) }}</dt>
            <dd>
              <ng-container *ngIf="s.value; else __e1"> <button type="button" class="v" [attr.title]="'msg.copy' | t" (click)="copy(s.value)" dir="auto">{{ s.value }}</button> </ng-container><ng-template #__e1> <span class="none">—</span> </ng-template>
              <ng-container *ngIf="s.messageId"> <button type="button" class="tr-icon-btn go" [attr.aria-label]="'bot.jump' | t" [title]="'bot.jump' | t" (click)="jump.emit(s.messageId!)"><tr-icon name="corner-up-left" [size]="14" class="tr-mirror"></tr-icon></button> </ng-container>
            </dd>
          </div>
        </ng-container>
      </dl>
    </ng-container><ng-template #__e3>
      <p class="empty">{{ 'bot.noData' | t }}</p>
    </ng-template>
  `,
  styles: [`
    :host { display: block; padding: 0 20px 12px; }
    .tbl { margin: 0; display: flex; flex-direction: column; }
    .r { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-block-size: 34px; border-block-end: 1px solid var(--border); } .r:last-child { border-block-end: 0; }
    dt { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); flex: none; } dd { margin: 0; display: flex; align-items: center; gap: 2px; min-inline-size: 0; }
    .v { font-size: var(--tr-fs-body); font-weight: 600; text-align: end; padding: 2px 6px; border-radius: 6px; overflow-wrap: anywhere; } .v:hover { background: var(--muted); }
    .none { color: var(--muted-foreground); padding-inline: 6px; } .go { inline-size: 28px; block-size: 28px; color: var(--muted-foreground); }
    .empty { margin: 0; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrBotDataSectionComponent {
  readonly __trk2 = (__i: number, s: any): any => s.key;
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly _slots = signal<BotSlotVM[]>(undefined as any);
  @Input() get slots(): Signal<BotSlotVM[]> { return this._slots; }
  set slots(v: any) { this._slots.set(v); }
  @Output() jump = new EventEmitter<string>();
  protected readonly rows = computed(() => this.slots());

  protected label(key: string): string {
    const k = `bot.slot.${key}`;
    return this.i18n.has(k) ? this.i18n.t(k) : key.charAt(0).toUpperCase() + key.slice(1);
  }
  protected async copy(v: string): Promise<void> {
    await navigator.clipboard?.writeText(v).catch(() => undefined);
    this.toast.show(this.i18n.t('toast.copied'));
  }
}
