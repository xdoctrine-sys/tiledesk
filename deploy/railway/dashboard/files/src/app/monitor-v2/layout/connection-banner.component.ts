import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslatePipe } from '../core/services/i18n.service';
import { PresenceStore } from '../core/stores/presence.store';

/** Real-time connection state: lost / reconnecting / restored (3 s). Neutral grey, never alarm colours (F-11). */
@Component({
  standalone: true,
  selector: 'tr-connection-banner',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container *ngIf="presence.connection().status !== 'online'">
      <div class="bar" [class.ok]="presence.connection().status === 'restored'" role="status" aria-live="polite">
        <ng-container [ngSwitch]="presence.connection().status"><ng-container *ngSwitchCase="'restored'"> <tr-icon name="check" [size]="16"></tr-icon><span>{{ 'app.online' | t }}</span> </ng-container><ng-container *ngSwitchCase="'reconnecting'"> <tr-icon name="rotate-cw" [size]="16" class="spin"></tr-icon><span>{{ 'app.reconnecting' | t }}</span> </ng-container><ng-container *ngSwitchDefault>
            <tr-icon name="wifi-off" [size]="16"></tr-icon><span>{{ 'app.offline' | t }}</span>
            <button type="button" class="retry" (click)="presence.retry()">{{ 'common.retry' | t }}</button>
          </ng-container></ng-container>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .bar { display: flex; align-items: center; gap: 8px; block-size: 40px; padding-inline: 16px; background: var(--muted); color: var(--foreground); font-size: var(--tr-fs-body-sm); border-block-end: 1px solid var(--input); }
    .bar.ok { background: var(--accent); color: var(--foreground); border-color: var(--accent); }
    .retry { margin-inline-start: auto; font-weight: 600; color: var(--brand); padding-inline: 8px; border-radius: 6px; min-block-size: 28px; }
    .retry:hover { background: var(--muted); }
    .spin { animation: mv2-spin 1s linear infinite; } @keyframes mv2-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  `],
})
export class TrConnectionBannerComponent {
  protected readonly presence = inject(PresenceStore);
}
