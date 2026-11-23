import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, Input } from '@angular/core';
import { PiiSpan } from '../core/models/view-models';
import { TranslatePipe } from '../core/services/i18n.service';
import { MessageStore } from '../core/stores/message.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

const REVEAL_SECONDS = 30;

/**
 * Gulf personal-data shield (I-6, F-130). National IDs (QID, Emirates ID, Iqama, Civil ID), IBAN, cards and passports
 * are replaced by "•••• 4821 · QID". Agents without the "sensitive data" permission see the pill only; the others press
 * "Show", give a reason, and the value is visible for 30 s then hidden again. Each access is logged (agent, time, reason).
 */
@Component({
  standalone: true,
  selector: 'tr-pii-mask',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, CommonModule],
  template: `
    <ng-container *ngIf="remaining() > 0; else __e2">
      <bdi class="val tr-ltr">{{ value() }}</bdi><span class="tm">{{ remaining() }}s</span>
    </ng-container><ng-template #__e2>
      <span class="pill"><tr-icon name="shield" [size]="12"></tr-icon><bdi class="tr-ltr">•••• {{ last4() }}</bdi> · {{ ('pii.kind.' + kind()) | t }}</span>
      <ng-container *ngIf="canReveal(); else __e1"> <button type="button" class="show" (click)="asking.set(true)">{{ 'pii.show' | t }}</button> </ng-container><ng-template #__e1> <span class="no" [title]="'pii.noPermission' | t">{{ 'pii.masked' | t }}</span> </ng-template>
    </ng-template>
    <ng-container *ngIf="asking()">
      <form class="ask tr-menu" (submit)="$event.preventDefault(); confirm()" (trClickOutside)="asking.set(false)">
        <strong>{{ 'pii.askTitle' | t }}</strong>
        <ng-container *ngFor="let r of reasons; trackBy: __trk3"> <label><input type="radio" name="reason" [checked]="reason() === r" (change)="reason.set(r)" />{{ ('pii.reason.' + r) | t }}</label> </ng-container>
        <p class="lg">{{ 'pii.logged' | t }}</p>
        <div class="ac"><button type="button" class="tr-btn" (click)="asking.set(false)">{{ 'common.cancel' | t }}</button><button type="submit" class="tr-btn tr-btn--primary">{{ 'pii.show' | t }}</button></div>
      </form>
    </ng-container>
  `,
  styles: [`
    :host { position: relative; display: inline; }
    .pill, .val { direction: var(--tr-dir, ltr); unicode-bidi: isolate; }
    .pill { display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: 22px; vertical-align: baseline; }
    :host-context(.k-agent) .pill { background: var(--card); }
    .show { margin-inline-start: 6px; color: var(--brand); font-size: var(--tr-fs-caption); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; min-block-size: 24px; }
    .no { margin-inline-start: 6px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .val { font-weight: 600; } .tm { margin-inline-start: 6px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .ask { position: absolute; inset-block-start: 100%; inset-inline-start: 0; z-index: 120; display: flex; flex-direction: column; gap: 6px; inline-size: 260px; padding: 12px; font-size: var(--tr-fs-body-sm); }
    .ask label { display: flex; align-items: center; gap: 8px; min-block-size: 28px; } .ask input { accent-color: var(--brand); inline-size: 16px; block-size: 16px; }
    .lg { margin: 0; color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .ac { display: flex; justify-content: flex-end; gap: 6px; }
  `],
})
export class TrPiiMaskComponent implements OnDestroy {
  readonly __trk3 = (__i: number, r: any): any => r;
  private readonly store = inject(MessageStore);
  private readonly _kind = signal<PiiSpan['kind']>(undefined as any);
  @Input() get kind(): Signal<PiiSpan['kind']> { return this._kind; }
  set kind(v: any) { this._kind.set(v); }
  private readonly _value = signal<string>(undefined as any);
  @Input() get value(): Signal<string> { return this._value; }
  set value(v: any) { this._value.set(v); }
  private readonly _last4 = signal('');
  @Input() get last4() { return this._last4; }
  set last4(v: any) { this._last4.set(v); }
  private readonly _canReveal = signal(true);
  @Input() get canReveal() { return this._canReveal; }
  set canReveal(v: any) { this._canReveal.set(v); }
  private readonly _messageId = signal('');
  @Input() get messageId() { return this._messageId; }
  set messageId(v: any) { this._messageId.set(v); }

  protected readonly reasons = ['identity', 'contract', 'other'] as const;
  protected readonly asking = signal(false);
  protected readonly reason = signal<(typeof this.reasons)[number]>('identity');
  protected readonly remaining = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  protected confirm(): void {
    this.asking.set(false);
    this.store.logPii(this.messageId(), this.reason());
    this.remaining.set(REVEAL_SECONDS);
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.remaining.update((n) => n - 1);
      if (this.remaining() <= 0) clearInterval(this.timer);
    }, 1000);
  }
  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
