import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';

/** Empty state: a small neutral line drawing, a title, one line of text, an optional action and a tip. */
@Component({
  standalone: true,
  selector: 'tr-empty-state',
  imports: [TrIconComponent, CommonModule],
  template: `
    <svg class="art" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <path d="M48 10l6 12 13-5-3 14 14 3-10 10 10 10-14 3 3 14-13-5-6 12-6-12-13 5 3-14-14-3 10-10-10-10 14-3-3-14 13 5 6-12z" stroke="var(--border)" stroke-width="2" stroke-linejoin="round"/>
      <path d="M26 40c0-7 6-12 14-12h16c8 0 14 5 14 12v10c0 7-6 12-14 12H46l-10 8v-8c-6-1-10-6-10-12V40z" stroke="var(--muted-foreground)" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="40" cy="45" r="2.5" fill="var(--muted-foreground)"/><circle cx="56" cy="45" r="2.5" fill="var(--muted-foreground)"/>
    </svg>
    <h3 class="title">{{ title() }}</h3>
    <ng-container *ngIf="text()"> <p class="text">{{ text() }}</p> </ng-container>
    <ng-container *ngIf="actionLabel()"> <button type="button" class="tr-btn tr-btn--primary" (click)="action.emit()">{{ actionLabel() }}</button> </ng-container>
    <ng-container *ngIf="hint()"> <p class="hint"><tr-icon name="keyboard" [size]="14"></tr-icon>{{ hint() }}</p> </ng-container>
    <ng-content></ng-content>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; text-align: center; color: var(--muted-foreground); }
    .art { inline-size: 88px; block-size: 88px; margin-block-end: 4px; }
    .title { font-size: var(--tr-fs-subtitle); line-height: var(--tr-lh-subtitle); font-weight: 600; color: var(--foreground); }
    .text { max-inline-size: 280px; font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .tr-btn { margin-block-start: 8px; }
    .hint { display: inline-flex; align-items: center; gap: 6px; margin-block-start: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
  `],
})
export class TrEmptyStateComponent {
  private readonly _title = signal<string>(undefined as any);
  @Input() get title(): Signal<string> { return this._title; }
  set title(v: any) { this._title.set(v); }
  private readonly _text = signal<string>('');
  @Input() get text(): Signal<string> { return this._text; }
  set text(v: any) { this._text.set(v); }
  private readonly _actionLabel = signal<string>('');
  @Input() get actionLabel(): Signal<string> { return this._actionLabel; }
  set actionLabel(v: any) { this._actionLabel.set(v); }
  private readonly _hint = signal<string>('');
  @Input() get hint(): Signal<string> { return this._hint; }
  set hint(v: any) { this._hint.set(v); }
  @Output() action = new EventEmitter<void>();
}
