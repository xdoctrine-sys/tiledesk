import { signal } from '../../core/signals';
import { Injectable, OnDestroy } from '@angular/core';

/** One shared "now" signal, refreshed every 15 s, so durations, countdowns and SLA levels update without per-component timers. */
@Injectable()
export class ClockService implements OnDestroy {
  readonly now = signal(new Date());
  private readonly timer = setInterval(() => this.now.set(new Date()), 15_000);

  tick(): void {
    this.now.set(new Date());
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
