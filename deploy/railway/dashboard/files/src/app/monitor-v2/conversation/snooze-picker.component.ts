import { computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Output, EventEmitter } from '@angular/core';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { UiStore } from '../core/stores/ui.store';
import { SnoozePreset, SNOOZE_UNTIL_REPLY, parseSnoozeText, resolveSnooze } from '../core/util/snooze';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

const PRESETS: SnoozePreset[] = ['next_reply', '1h', 'tonight', 'tomorrow', 'weekend'];

/**
 * Snooze (F-41): free text in Arabic or English ("tomorrow 10am", "بعد ساعتين") whose interpretation is shown before
 * validating, presets (until next reply, 1 h, tonight, tomorrow at opening, after the weekend) and a date-time picker.
 * Opening-hour and Ramadan-aware presets are computed in core/util/snooze.ts.
 */
@Component({
  standalone: true,
  selector: 'tr-snooze-picker',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'close.emit()' },
  template: `
    <div class="tr-menu pop" role="dialog" [attr.aria-label]="'snooze.title' | t" (trClickOutside)="close.emit()">
      <label class="free">
        <tr-icon name="alarm-clock" [size]="16"></tr-icon>
        <input class="tr-field" dir="auto" [placeholder]="'snooze.placeholder' | t" [value]="text()" (input)="text.set($any($event.target).value)" (keydown.enter)="applyText()" />
      </label>
      <ng-container *ngIf="text().trim()">
        <p class="interp" [class.bad]="!parsed()">
          <ng-container *ngIf="parsed() as p; else __e1"> <tr-icon name="check" [size]="14"></tr-icon>{{ 'snooze.interpreted' | t: { when: fmt.fullDateTime(p) } }}<ng-container *ngIf="hijriText()"> <span class="hj"> · {{ hijriText() }}</span> </ng-container> <button type="button" class="go" (click)="applyText()">{{ 'common.confirm' | t }}</button> </ng-container><ng-template #__e1> {{ 'snooze.notUnderstood' | t }} </ng-template>
        </p>
      </ng-container>
      <ul class="presets">
        <ng-container *ngFor="let p of presets; trackBy: __trk2">
          <li><button type="button" class="tr-menu__item" (click)="pick(p)"><span>{{ ('snooze.' + p) | t }}</span><span class="tr-menu__kbd">{{ hint(p) }}</span></button></li>
        </ng-container>
        <li><button type="button" class="tr-menu__item" (click)="custom.set(!custom())"><tr-icon name="calendar" [size]="16"></tr-icon>{{ 'snooze.custom' | t }}</button></li>
      </ul>
      <ng-container *ngIf="custom()">
        <div class="cust"><input type="datetime-local" class="tr-field" [value]="customValue()" (input)="customValue.set($any($event.target).value)" /><button type="button" class="tr-btn tr-btn--primary" [disabled]="!customValue()" (click)="applyCustom()">{{ 'snooze.set' | t }}</button></div>
      </ng-container>
    </div>
  `,
  styles: [`
    :host { position: absolute; inset-inline-end: 0; inset-block-start: 100%; z-index: 100; margin-block-start: 4px; }
    .pop { position: static; inline-size: 300px; padding: 10px; max-inline-size: none; }
    .free { position: relative; display: flex; align-items: center; } .free tr-icon { position: absolute; inset-inline-start: 12px; color: var(--muted-foreground); pointer-events: none; } .free .tr-field { padding-inline-start: 36px; }
    .interp { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 4px 4px; color: var(--foreground); font-size: var(--tr-fs-body-sm); } .interp.bad { color: var(--muted-foreground); }
    .hj { color: var(--muted-foreground); } .go { margin-inline-start: auto; font-weight: 600; color: var(--brand); min-block-size: 28px; padding-inline: 8px; }
    .presets { margin-block-start: 6px; } .cust { display: flex; gap: 8px; margin-block-start: 8px; } .cust .tr-field { flex: 1; min-inline-size: 0; }
  `],
})
export class TrSnoozePickerComponent {
  readonly __trk2 = (__i: number, p: any): any => p;
  protected readonly fmt = inject(FormatService);
  private readonly ui = inject(UiStore);

  @Output() picked = new EventEmitter<Date>();
  @Output() close = new EventEmitter<void>();
  protected readonly presets = PRESETS;
  protected readonly text = signal('');
  protected readonly custom = signal(false);
  protected readonly customValue = signal('');
  protected readonly parsed = computed(() => parseSnoozeText(this.text()));
  protected readonly hijriText = computed(() => {
    const p = this.parsed();
    return p && this.ui.hijri() ? new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(p) : '';
  });

  /** Shown on the right of each preset so the agent sees the real wake-up time. */
  protected hint(p: SnoozePreset): string {
    if (p === 'next_reply') return '';
    return this.fmt.time(resolveSnooze(p)) + (p === 'tomorrow' || p === 'weekend' ? ` · ${this.fmt.shortDate(resolveSnooze(p))}` : '');
  }
  protected pick(p: SnoozePreset): void {
    this.picked.emit(p === 'next_reply' ? new Date(SNOOZE_UNTIL_REPLY) : resolveSnooze(p));
  }
  protected applyText(): void {
    const p = this.parsed();
    if (p) this.picked.emit(p);
  }
  protected applyCustom(): void {
    if (this.customValue()) this.picked.emit(new Date(this.customValue()));
  }
}
