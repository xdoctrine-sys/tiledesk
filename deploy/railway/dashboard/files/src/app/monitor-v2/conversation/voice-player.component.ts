import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, Input } from '@angular/core';
import { AttachmentVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';

const SPEEDS = [1, 1.5, 2] as const;

/**
 * Voice note (F-58): waveform, play / pause, speed 1× / 1.5× / 2×, collapsible transcription. The player itself is
 * always LTR, like on every platform (section 10.3). Playback is simulated here; bind it to an <audio> element in production.
 */
@Component({
  standalone: true,
  selector: 'tr-voice-player',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <div class="vp" dir="ltr">
      <button type="button" class="play" [attr.aria-label]="(playing() ? 'voice.pause' : 'voice.play') | t" (click)="toggle()"><tr-icon [name]="playing() ? 'pause' : 'play'" [size]="18"></tr-icon></button>
      <div class="wave" role="progressbar" [attr.aria-valuenow]="progress() * 100" aria-valuemin="0" aria-valuemax="100" (click)="seek($event)">
        <ng-container *ngFor="let h of bars(); trackBy: __trk1; let i = index"> <i [style.block-size.%]="h * 100" [class.on]="i / bars().length < progress()"></i> </ng-container>
      </div>
      <span class="tm">{{ fmt.clock(playing() || progress() > 0 ? progress() * dur() : dur()) }}</span>
      <button type="button" class="spd" [attr.aria-label]="'voice.speed' | t" (click)="cycle()">{{ speed() }}×</button>
    </div>
    <ng-container *ngIf="a().transcribing; else __e2">
      <p class="tx dim">{{ 'voice.transcribing' | t }}</p>
    </ng-container><ng-template #__e2><ng-container *ngIf="a().transcript">
      <button type="button" class="tgl" [attr.aria-expanded]="open()" (click)="open.set(!open())">{{ (open() ? 'voice.hideTranscript' : 'voice.showTranscript') | t }}</button>
      <ng-container *ngIf="open()"> <p class="tx" dir="auto">{{ a().transcript }}</p> </ng-container>
    </ng-container></ng-template>
  `,
  styles: [`
    :host { display: block; min-inline-size: 272px; max-inline-size: 100%; }
    .vp { display: flex; align-items: center; gap: 10px; }
    .play { inline-size: 36px; block-size: 36px; border-radius: var(--radius-md); display: inline-flex; align-items: center; justify-content: center; background: var(--primary); color: var(--primary-foreground); flex: none; position: relative; }
    .play::after { content: ''; position: absolute; inset: -4px; }
    .wave { flex: 1; min-inline-size: 80px; display: flex; align-items: center; gap: 2px; block-size: 32px; cursor: pointer; }
    .wave i { flex: 1; min-inline-size: 2px; border-radius: 2px; background: var(--input); }
    .wave i.on { background: var(--brand); }
    .tm { color: var(--muted-foreground); font-size: var(--tr-fs-caption); min-inline-size: 32px; text-align: end; }
    .spd { min-inline-size: 36px; block-size: 24px; padding-inline: 6px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 600; text-align: center; }
    .tgl { margin-block-start: 6px; color: var(--brand); font-size: var(--tr-fs-caption); font-weight: 600; min-block-size: 24px; }
    .tx { margin-block-start: 6px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); color: var(--foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); } .tx.dim { color: var(--muted-foreground); background: none; padding: 0; }
  `],
})
export class TrVoicePlayerComponent implements OnDestroy {
  readonly __trk1 = (__i: number, h: any): any => __i;
  protected readonly fmt = inject(FormatService);
  private readonly _a = signal<AttachmentVM>(undefined as any);
  @Input() get a(): Signal<AttachmentVM> { return this._a; }
  set a(v: any) { this._a.set(v); }
  protected readonly playing = signal(false);
  protected readonly progress = signal(0);
  protected readonly speed = signal<1 | 1.5 | 2>(1);
  protected readonly open = signal(false);
  protected readonly dur = computed(() => this.a().duration ?? 10);
  protected readonly bars = computed(() => this.a().waveform ?? Array.from({ length: 36 }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(i * 1.3))));
  private timer: ReturnType<typeof setInterval> | null = null;

  protected toggle(): void {
    if (this.playing()) return this.stop();
    if (this.progress() >= 1) this.progress.set(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      const next = this.progress() + (0.1 * this.speed()) / this.dur();
      if (next >= 1) { this.progress.set(1); this.stop(); } else this.progress.set(next);
    }, 100);
  }
  private stop(): void {
    this.playing.set(false);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  protected cycle(): void {
    this.speed.set(SPEEDS[(SPEEDS.indexOf(this.speed()) + 1) % SPEEDS.length]!);
  }
  protected seek(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.progress.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  }
  ngOnDestroy(): void {
    this.stop();
  }
}
