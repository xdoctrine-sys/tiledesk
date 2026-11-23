import { TrIconComponent } from '../ui/icon.component';
import { Signal, computed, effect, signal, untracked } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { TD_STATUS, TdRequest } from '../core/models/tiledesk.models';
import { ConversationVM } from '../core/models/view-models';
import { ClockService } from '../core/services/clock.service';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { channelCapabilities } from '../core/util/channel';
import { TrChannelBadgeComponent } from '../ui/channel-badge.component';
import { TrSkeletonComponent } from '../ui/skeleton.component';

/** Previous conversations of the same visitor (F-103): channel, #ticket, first message, status, date. Click opens it. */
@Component({
  standalone: true,
  selector: 'tr-history-section',
  imports: [TrIconComponent, TranslatePipe, TrChannelBadgeComponent, TrSkeletonComponent, CommonModule],
  template: `
    <ng-container *ngIf="loading(); else __e2"> <tr-skeleton kind="section"></tr-skeleton> </ng-container><ng-template #__e2><ng-container *ngIf="items().length; else __e3">
      <ul class="ls">
        <ng-container *ngFor="let r of items(); trackBy: __trk1">
          <li>
            <button type="button" class="it" [attr.title]="r.first_text" (click)="open.emit(r.request_id)">
              <tr-channel-badge [kind]="kind(r)" [size]="14"></tr-channel-badge>
              <span class="tk tr-mono tr-ltr">#{{ r.ticket_id }}</span>
              <span class="tx tr-truncate" dir="auto">{{ r.first_text }}</span>
              <span class="st">{{ (r.status === closed ? 'actor.resolved' : 'actor.open') | t }}</span>
              <time class="dt">{{ fmt.relative(date(r), clock.now()) }}</time>
            </button>
          </li>
        </ng-container>
      </ul>
    </ng-container><ng-template #__e3> <p class="empty">{{ 'history.empty' | t }}</p> </ng-template></ng-template>
  `,
  styles: [`
    :host { display: block; padding: 0 12px 12px; }
    .it { display: grid; grid-template-columns: auto auto 1fr; grid-template-areas: 'ch tk tx' 'st st dt'; align-items: center; gap: 2px 8px; inline-size: 100%; padding: 8px; border-radius: var(--radius-md); text-align: start; }
    .it:hover { background: var(--muted); } tr-channel-badge { grid-area: ch; } .tk { grid-area: tk; color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .tx { grid-area: tx; font-size: var(--tr-fs-body-sm); }
    .st { grid-area: st; grid-column: 1 / 3; color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .dt { grid-area: dt; color: var(--muted-foreground); font-size: var(--tr-fs-caption); text-align: end; }
    .empty { margin: 0; padding: 0 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrHistorySectionComponent {
  readonly __trk1 = (__i: number, r: any): any => r.request_id;
  private readonly conv = inject(ConversationStore);
  protected readonly fmt = inject(FormatService);
  protected readonly clock = inject(ClockService);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  @Output() open = new EventEmitter<string>();
  protected readonly items = signal<TdRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly closed = TD_STATUS.CLOSED;

  constructor() {
    effect(() => {
      const id = this.c().customer.id;
      untracked(() => void this.load(id));
    });
  }

  private async load(leadId: string): Promise<void> {
    this.loading.set(true);
    const res = await this.conv.history(leadId);
    if (this.c().customer.id === leadId) this.items.set(res.filter((r) => r.request_id !== this.c().id));
    this.loading.set(false);
  }
  protected kind = (r: TdRequest) => channelCapabilities(r.channel.name).kind;
  protected date = (r: TdRequest) => new Date(r.createdAt);
  protected readonly count = computed(() => this.items().length);
}
