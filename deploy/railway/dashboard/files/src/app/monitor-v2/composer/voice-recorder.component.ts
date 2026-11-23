import { signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, Output, EventEmitter } from '@angular/core';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';

export interface VoiceResult { duration: number; waveform: number[] }

/**
 * Voice message recorder (F-81): timer, live waveform, cancel (trash, or Esc), send. The recording is simulated: replace
 * the timer by MediaRecorder + an AnalyserNode to get a real waveform. Layout is the same in RTL (timer + wave are LTR).
 */
@Component({
  standalone: true,
  selector: 'tr-voice-recorder',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  host: { '(keydown.escape)': 'cancel.emit()', role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.cancel' | t" (click)="cancel.emit()"><tr-icon name="trash-2" [size]="18"></tr-icon></button>
    <span class="dot" aria-hidden="true"></span>
    <span class="tm" dir="ltr">{{ fmt.clock(seconds()) }}</span>
    <div class="wave" dir="ltr" aria-hidden="true"><ng-container *ngFor="let h of bars(); trackBy: __trk1"> <i [style.block-size.%]="h * 100"></i> </ng-container></div>
    <span class="hint">{{ 'comp.slideCancel' | t }}</span>
    <button type="button" class="send" [attr.aria-label]="'comp.send' | t" (click)="done.emit({ duration: seconds(), waveform: history })"><tr-icon name="send-horizontal" [size]="18" class="tr-mirror"></tr-icon></button>
  `,
  styles: [`
    :host { display: flex; align-items: center; gap: 10px; min-block-size: 76px; padding-inline: 8px; }
    .dot { inline-size: 10px; block-size: 10px; border-radius: 50%; background: var(--destructive); animation: mv2-blink 1.2s ease-in-out infinite; flex: none; }
    @keyframes mv2-blink { 50% { opacity: .3; } } .tm { min-inline-size: 40px; font-variant-numeric: tabular-nums; font-weight: 600; }
    .wave { flex: 1; display: flex; align-items: center; gap: 2px; block-size: 36px; overflow: hidden; } .wave i { flex: none; inline-size: 3px; border-radius: 2px; background: var(--brand); min-block-size: 3px; }
    .hint { color: var(--muted-foreground); font-size: var(--tr-fs-caption); } @media (max-width: 520px) { .hint { display: none; } }
    .send { inline-size: 40px; block-size: 40px; border-radius: 12px; background: var(--primary); color: var(--primary-foreground); display: inline-flex; align-items: center; justify-content: center; flex: none; }
    @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  `],
})
export class TrVoiceRecorderComponent implements OnInit, OnDestroy {
  readonly __trk1 = (__i: number, h: any): any => __i;
  protected readonly fmt = inject(FormatService);
  private readonly i18n = inject(I18nService);
  protected label = () => this.i18n.t('comp.recording');
  @Output() cancel = new EventEmitter<void>();
  @Output() done = new EventEmitter<VoiceResult>();
  protected readonly seconds = signal(0);
  protected readonly bars = signal<number[]>(Array.from({ length: 40 }, () => 0.15));
  protected history: number[] = [];
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    let t = 0;
    this.timer = setInterval(() => {
      t += 0.1;
      this.seconds.set(Math.floor(t));
      const v = 0.2 + 0.8 * Math.abs(Math.sin(t * 3.1) * Math.cos(t * 1.3)) * (0.5 + Math.random() * 0.5);
      this.history.push(v);
      this.bars.update((b) => [...b.slice(1), v]);
    }, 100);
  }
  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
