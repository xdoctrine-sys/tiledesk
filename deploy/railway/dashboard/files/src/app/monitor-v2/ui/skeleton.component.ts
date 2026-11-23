import { Signal, computed, signal } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/** Loading placeholders with the exact shape of what is loading (list item, bubble, header, section). */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'tr-skeleton',
  host: { role: 'status', 'aria-busy': 'true', '[class]': '"k-" + kind()' },
  template: `
    <ng-container *ngFor="let i of items(); trackBy: __trk1">
      <ng-container [ngSwitch]="kind()"><ng-container *ngSwitchCase="'list-item'">
          <div class="li"><span class="sk c"></span><div class="col"><span class="sk l1"></span><span class="sk l2"></span></div></div>
        </ng-container><ng-container *ngSwitchCase="'bubble'">
          <div class="bub" [class.out]="i % 2 === 1"><span class="sk" [style.inline-size.%]="45 + ((i * 17) % 30)"></span></div>
        </ng-container><ng-container *ngSwitchCase="'header'">
          <div class="hd"><span class="sk c"></span><div class="col"><span class="sk l1"></span><span class="sk l2"></span></div></div>
        </ng-container><ng-container *ngSwitchCase="'section'">
          <div class="sec"><span class="sk l1"></span><span class="sk l2"></span><span class="sk l2"></span></div>
        </ng-container></ng-container>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .sk { display: block; border-radius: 6px; background: linear-gradient(90deg, var(--muted) 25%, var(--muted) 50%, var(--muted) 75%); background-size: 200% 100%; animation: mv2-sh 1.4s linear infinite; }
    @keyframes mv2-sh { to { background-position: -200% 0; } }
    .li { display: flex; gap: 12px; align-items: center; block-size: var(--tr-item-h); padding-inline: 16px; border-block-end: 1px solid var(--border); }
    .c { inline-size: 40px; block-size: 40px; border-radius: 50%; flex: none; }
    .col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .l1 { block-size: 12px; inline-size: 55%; } .l2 { block-size: 10px; inline-size: 85%; }
    .bub { padding: 6px 16px; display: flex; } .bub.out { justify-content: flex-end; }
    .bub .sk { block-size: 40px; border-radius: 18px; }
    .hd { display: flex; gap: 12px; align-items: center; padding: 14px 16px; } .hd .c { inline-size: 36px; block-size: 36px; }
    .sec { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
    @media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
  `],
})
export class TrSkeletonComponent {
  readonly __trk1 = (__i: number, i: any): any => i;
  private readonly _kind = signal<'list-item' | 'bubble' | 'header' | 'section'>('list-item');
  @Input() get kind(): Signal<'list-item' | 'bubble' | 'header' | 'section'> { return this._kind; }
  set kind(v: any) { this._kind.set(v); }
  private readonly _count = signal(1);
  @Input() get count() { return this._count; }
  set count(v: any) { this._count.set(v); }
  protected readonly items = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}
