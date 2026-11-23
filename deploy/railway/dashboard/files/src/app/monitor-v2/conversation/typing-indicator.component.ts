import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

/** "The assistant is typing…" / "The customer is typing…": three softly bouncing dots + text. */
@Component({
  standalone: true,
  selector: 'tr-typing-indicator',
  imports: [TrIconComponent, CommonModule],
  host: { role: 'status', '[class.bot]': 'kind() === "bot"', '[attr.aria-label]': 'text()' },
  template: `
    <span class="b">
      <ng-container *ngIf="kind() === 'bot'"> <tr-icon name="sparkles" [size]="12" class="sp"></tr-icon> </ng-container>
      <i></i><i></i><i></i>
    </span>
    <span class="t">{{ text() }}</span>
  `,
  styles: [`
    :host { display: flex; align-items: center; gap: 8px; padding: 4px 16px 8px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
    .b { display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; border-radius: var(--radius-bubble); background: var(--card); border: 1px solid var(--border); }
    :host(.bot) .b { background: var(--muted); border-color: var(--border); color: var(--muted-foreground); }
    .sp { margin-inline-end: 2px; }
    i { inline-size: 6px; block-size: 6px; border-radius: 50%; background: currentColor; opacity: .5; animation: mv2-bounce 1.2s ease-in-out infinite; }
    i:nth-child(3) { animation-delay: .15s; } i:nth-child(4) { animation-delay: .3s; }
    @keyframes mv2-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .35; } 30% { transform: translateY(-3px); opacity: .9; } }
    @media (prefers-reduced-motion: reduce) { i { animation: none; } }
  `],
})
export class TrTypingIndicatorComponent {
  private readonly _kind = signal<'customer' | 'bot' | 'agent'>('customer');
  @Input() get kind(): Signal<'customer' | 'bot' | 'agent'> { return this._kind; }
  set kind(v: any) { this._kind.set(v); }
  private readonly _text = signal<string>(undefined as any);
  @Input() get text(): Signal<string> { return this._text; }
  set text(v: any) { this._text.set(v); }
}
