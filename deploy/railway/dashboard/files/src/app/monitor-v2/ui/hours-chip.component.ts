import { signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { HoursService } from '../core/services/hours.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

/** Opening-hours chip in plain grey text (F-115, F-128, F-133). The popover explains the profile; editing is a Settings job. */
@Component({
  standalone: true,
  selector: 'tr-hours-chip',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'open.set(false)' },
  template: `
 <ng-container *ngIf="status().chip"><button type="button" class="chip" [attr.aria-expanded]="open()" (click)="open.set(!open())">
      <tr-icon [name]="status().open && status().profile === 'standard' ? 'clock' : 'moon-star'" [size]="14"></tr-icon>
      <span class="tr-truncate">{{ status().chip }}</span>
    </button>
    <ng-container *ngIf="open()">
      <div class="tr-menu pop" role="dialog" (trClickOutside)="open.set(false)">
        <p class="t">{{ status().profile === 'ramadan' ? ('hours.profileRamadan' | t) : ('hours.profileStandard' | t) }}</p>
        <p class="d">{{ status().detail }}</p>
        <ng-container *ngIf="status().prayer"> <p class="d"><tr-icon name="moon-star" [size]="12"></tr-icon> {{ 'hours.prayer' | t: { name: status().prayer!.name } }}</p> </ng-container>
      </div>
    </ng-container>
 </ng-container>
  `,
  styles: [`
    :host { position: relative; display: block; }
    .chip { display: flex; align-items: center; gap: 8px; inline-size: 100%; min-block-size: 32px; padding-inline: 4px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); border-radius: var(--radius-sm); }
    .chip:hover { color: var(--muted-foreground); }
    .pop { inset-block-end: 100%; inset-inline-start: 0; margin-block-end: 6px; padding: 12px; inline-size: 240px; }
    .t { font-size: var(--tr-fs-body); font-weight: 600; } .d { margin-block-start: 4px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
  `],
})
export class TrHoursChipComponent {
  protected readonly status = inject(HoursService).status;
  protected readonly open = signal(false);
}
