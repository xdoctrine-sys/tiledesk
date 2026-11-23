import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TdMessageAttachmentRich } from '../core/models/tiledesk.models';
import { TranslatePipe } from '../core/services/i18n.service';

/**
 * Bot rich content (buttons, cards) drawn like the visitor sees it in the widget; the button the customer picked is
 * marked "chosen" (F-56). Display only: an agent does not click the customer's buttons.
 */
@Component({
  standalone: true,
  selector: 'tr-rich-message',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container *ngIf="rich().cards?.length">
      <div class="cards">
        <ng-container *ngFor="let c of rich().cards; trackBy: __trk2">
          <div class="card">
            <strong dir="auto">{{ c.title }}</strong>
            <ng-container *ngIf="c.subtitle"> <span class="sub" dir="auto">{{ c.subtitle }}</span> </ng-container>
            <ng-container *ngIf="c.buttons?.length"> <div class="btns"><ng-container *ngFor="let b of c.buttons; trackBy: __trk1"> <span class="btn" [class.chosen]="b.chosen"><ng-container *ngIf="b.chosen"> <tr-icon name="check" [size]="12"></tr-icon> </ng-container><span dir="auto">{{ b.value }}</span><ng-container *ngIf="b.chosen"> <span class="tag">{{ 'rich.chosen' | t }}</span> </ng-container></span> </ng-container></div> </ng-container>
          </div>
        </ng-container>
      </div>
    </ng-container>
    <ng-container *ngIf="rich().buttons?.length">
      <div class="btns">
        <ng-container *ngFor="let b of rich().buttons; trackBy: __trk3">
          <span class="btn" [class.chosen]="b.chosen"><ng-container *ngIf="b.chosen"> <tr-icon name="check" [size]="12"></tr-icon> </ng-container><span dir="auto">{{ b.value }}</span><ng-container *ngIf="b.chosen"> <span class="tag">{{ 'rich.chosen' | t }}</span> </ng-container></span>
        </ng-container>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: block; margin-block-start: 8px; }
    .btns { display: flex; flex-wrap: wrap; gap: 6px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; min-block-size: 30px; padding-inline: 12px; border-radius: var(--radius-md); background: var(--card); border: 1px solid var(--border); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .btn.chosen { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); font-weight: 500; }
    .tag { font-size: var(--tr-fs-micro); font-weight: 400; opacity: .85; }
    .cards { display: flex; flex-direction: column; gap: 8px; }
    .card { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--card); border: 1px solid var(--border); }
    .card .sub { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } .card .btns { margin-block-start: 6px; }
  `],
})
export class TrRichMessageComponent {
  readonly __trk1 = (__i: number, b: any): any => b.value;
  readonly __trk2 = (__i: number, c: any): any => c.title;
  readonly __trk3 = (__i: number, b: any): any => b.value;
  private readonly _rich = signal<TdMessageAttachmentRich>(undefined as any);
  @Input() get rich(): Signal<TdMessageAttachmentRich> { return this._rich; }
  set rich(v: any) { this._rich.set(v); }
}
