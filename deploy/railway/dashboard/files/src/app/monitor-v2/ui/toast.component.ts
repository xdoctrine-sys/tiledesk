import { signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';

/** Toast host: one per app. Text + optional action ("Undo"), optional expandable details for partial bulk results. */
@Component({
  standalone: true,
  selector: 'tr-toast',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <div class="stack" aria-live="polite" role="status">
      <ng-container *ngFor="let t of toasts.toasts(); trackBy: __trk2">
        <div class="toast" [class]="'k-' + t.kind">
          <tr-icon [name]="t.kind === 'error' ? 'circle-alert' : t.kind === 'warn' ? 'triangle-alert' : t.kind === 'success' ? 'circle-check' : 'info'" [size]="16"></tr-icon>
          <div class="body">
            <span>{{ t.text }}</span>
            <ng-container *ngIf="t.details?.length && open() === t.id">
              <ul class="det"><ng-container *ngFor="let d of t.details; trackBy: __trk1"> <li>{{ d }}</li> </ng-container></ul>
            </ng-container>
          </div>
          <ng-container *ngIf="t.details?.length">
            <button type="button" class="link" (click)="open.set(open() === t.id ? null : t.id)">{{ (open() === t.id ? 'common.hideDetails' : 'common.details') | t }}</button>
          </ng-container>
          <ng-container *ngIf="t.actionLabel">
            <button type="button" class="link act" (click)="t.action?.(); toasts.dismiss(t.id)">{{ t.actionLabel }}</button>
          </ng-container>
          <button type="button" class="x" [attr.aria-label]="'common.close' | t" (click)="toasts.dismiss(t.id)"><tr-icon name="x" [size]="14"></tr-icon></button>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .stack { position: fixed; inset-block-end: 20px; inset-inline: 0; z-index: 400; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; min-inline-size: 280px; max-inline-size: min(520px, calc(100vw - 24px)); padding: 10px 12px; border-radius: var(--radius-lg); background: var(--foreground); color: var(--canvas); box-shadow: var(--shadow-popover); font-size: var(--tr-fs-body); line-height: var(--tr-lh-body); animation: mv2-up var(--tr-motion-base) var(--tr-ease-in); }
    :host-context([data-theme='dark']) .toast { background: var(--muted); color: var(--foreground); border: 1px solid var(--input); }
    .toast tr-icon { flex: none; margin-block-start: 2px; }
    .body { flex: 1; }
    .det { margin-block-start: 6px; padding-inline-start: 0; font-size: var(--tr-fs-body-sm); opacity: .85; }
    .link { flex: none; color: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; font-size: var(--tr-fs-body-sm); }
    .link.act { text-decoration: none; padding-inline: 8px; border-radius: 6px; background: color-mix(in srgb, currentColor 14%, transparent); }
    .x { flex: none; color: inherit; opacity: .7; display: inline-flex; margin-block-start: 2px; } .x:hover { opacity: 1; }
    .k-error { background: var(--destructive); color: var(--primary-foreground); }
    @keyframes mv2-up { from { opacity: 0; transform: translateY(8px); } }
  `],
})
export class TrToastComponent {
  readonly __trk1 = (__i: number, d: any): any => d;
  readonly __trk2 = (__i: number, t: any): any => t.id;
  protected readonly toasts = inject(ToastService);
  protected readonly open = signal<number | null>(null);
}
