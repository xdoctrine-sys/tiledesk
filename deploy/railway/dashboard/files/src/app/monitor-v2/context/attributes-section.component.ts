import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { MessageStore } from '../core/stores/message.store';

const HIDDEN = new Set(['tarashli', 'botSlots', 'pagesViewed', 'payload', 'client', 'subtype']);

/**
 * Raw conversation attributes (F-104, `request.attributes`): readable key / value pairs, a filter, click a value to copy
 * it, "View JSON" for the raw object, and the access log of sensitive data shown to the agent (I-6).
 */
@Component({
  standalone: true,
  selector: 'tr-attributes-section',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <input class="tr-field q" type="search" [placeholder]="'attrs.search' | t" [value]="q()" (input)="q.set($any($event.target).value)" />
    <ng-container *ngIf="rows().length; else __e2">
      <dl class="g"><ng-container *ngFor="let r of rows(); trackBy: __trk1"> <div class="r"><dt class="tr-ltr">{{ r[0] }}</dt><dd><button type="button" class="v tr-ltr" [title]="'msg.copy' | t" (click)="copy(r[1])">{{ r[1] }}</button></dd></div> </ng-container></dl>
    </ng-container><ng-template #__e2> <p class="none">{{ 'attrs.none' | t }}</p> </ng-template>
    <button type="button" class="js" [attr.aria-expanded]="json()" (click)="json.set(!json())"><tr-icon name="chevron-right" [size]="14" class="tr-mirror" [class.open]="json()"></tr-icon>{{ 'attrs.json' | t }}</button>
    <ng-container *ngIf="json()"> <pre class="pre tr-ltr">{{ raw() }}</pre> </ng-container>
    <ng-container *ngIf="store.piiLog().length">
      <h4 class="lg">{{ 'attrs.piiLog' | t }}</h4>
      <ul class="log"><ng-container *ngFor="let l of store.piiLog(); trackBy: __trk3"> <li><tr-icon name="shield" [size]="12"></tr-icon>{{ l.agent }} · {{ ('pii.reason.' + l.reason) | t }} · {{ fmt.time(l.at) }}</li> </ng-container></ul>
    </ng-container>
  `,
  styles: [`
    :host { display: block; padding: 0 20px 12px; } .q { min-block-size: 34px; padding-block: 4px; margin-block-end: 8px; }
    .g { margin: 0; } .r { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-block-size: 30px; padding-block: 3px; border-block-end: 1px solid var(--border); } .r:last-child { border-block-end: 0; }
    dt { color: var(--muted-foreground); font-family: var(--tr-font-mono); font-size: var(--tr-fs-caption); flex: none; padding-block-start: 3px; } dd { margin: 0; min-inline-size: 0; }
    .v { font-size: var(--tr-fs-body-sm); text-align: end; padding: 1px 6px; border-radius: 6px; overflow-wrap: anywhere; max-inline-size: 200px; } .v:hover { background: var(--muted); }
    .none { margin: 0; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .js { display: inline-flex; align-items: center; gap: 4px; margin-block-start: 8px; color: var(--brand); font-size: var(--tr-fs-body-sm); font-weight: 600; min-block-size: 32px; } .js .open { transform: rotate(90deg); }
    .pre { max-block-size: 220px; overflow: auto; margin: 4px 0 0; padding: 10px; border-radius: var(--radius-md); background: var(--muted); font-family: var(--tr-font-mono); font-size: 11px; line-height: 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .lg { margin: 12px 0 4px; font-size: var(--tr-fs-caption); font-weight: 600; color: var(--muted-foreground); } .log { display: flex; flex-direction: column; gap: 4px; font-size: var(--tr-fs-caption); color: var(--muted-foreground); } .log li { display: flex; align-items: center; gap: 6px; }
  `],
})
export class TrAttributesSectionComponent {
  readonly __trk1 = (__i: number, r: any): any => r[0];
  readonly __trk3 = (__i: number, l: any): any => __i;
  protected readonly store = inject(MessageStore);
  protected readonly fmt = inject(FormatService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly q = signal('');
  protected readonly json = signal(false);
  protected readonly rows = computed<[string, string][]>(() => {
    const q = this.q().trim().toLowerCase();
    return Object.entries(this.c().raw.attributes)
      .filter(([k, v]) => !HIDDEN.has(k) && v !== undefined && v !== null && typeof v !== 'object')
      .map(([k, v]) => [k, String(v)] as [string, string])
      .filter(([k, v]) => !q || k.toLowerCase().includes(q) || v.toLowerCase().includes(q));
  });
  protected readonly raw = computed(() => JSON.stringify(this.c().raw.attributes, null, 2));

  protected async copy(v: string): Promise<void> {
    await navigator.clipboard?.writeText(v).catch(() => undefined);
    this.toast.show(this.i18n.t('toast.copied'));
  }
}
