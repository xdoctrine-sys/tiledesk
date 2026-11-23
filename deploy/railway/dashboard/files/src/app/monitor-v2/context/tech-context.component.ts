import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { parseUserAgent } from '../core/util/ua';

/**
 * Technical context (F-97, F-98): browser + OS, IP, language, entry department, source page (link) and title, viewed pages
 * (timestamped, click opens), widget version, and where the visitor connected from. The mini-map is left out
 * (the visitor map is outside this template): city and country are shown as text.
 */
@Component({
  standalone: true,
  selector: 'tr-tech-context',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <dl class="g">
      <div class="r"><dt><tr-icon [name]="ua().mobile ? 'smartphone' : 'monitor'" [size]="14"></tr-icon>{{ 'tech.device' | t }}</dt><dd>{{ ua().browser }} · {{ ua().os }}</dd></div>
      <ng-container *ngIf="r().attributes.ipAddress as ip"> <div class="r"><dt><tr-icon name="globe" [size]="14"></tr-icon>{{ 'tech.ip' | t }}</dt><dd class="tr-ltr">{{ ip }}</dd></div> </ng-container>
      <ng-container *ngIf="c().customer.city"> <div class="r"><dt><tr-icon name="map-pin" [size]="14"></tr-icon>{{ 'hover.location' | t }}</dt><dd><bdi>{{ c().customer.city }}, {{ c().customer.country }}</bdi></dd></div> </ng-container>
      <ng-container *ngIf="c().customer.language"> <div class="r"><dt><tr-icon name="languages" [size]="14"></tr-icon>{{ 'tech.language' | t }}</dt><dd>{{ ('lang.' + c().customer.language) | t }}</dd></div> </ng-container>
      <ng-container *ngIf="r().attributes.departmentName as d"> <div class="r"><dt><tr-icon name="building-2" [size]="14"></tr-icon>{{ 'tech.entryDept' | t }}</dt><dd>{{ d }}</dd></div> </ng-container>
      <ng-container *ngIf="r().sourcePage as sp"> <div class="r"><dt><tr-icon name="link" [size]="14"></tr-icon>{{ 'tech.sourcePage' | t }}</dt><dd><a class="tr-ltr tr-truncate" [href]="sp" target="_blank" rel="noopener noreferrer">{{ host(sp) }}</a></dd></div> </ng-container>
      <ng-container *ngIf="r().attributes.sourceTitle as st"> <div class="r"><dt>{{ 'tech.pageTitle' | t }}</dt><dd dir="auto">{{ st }}</dd></div> </ng-container>
      <ng-container *ngIf="r().attributes.widgetVer as w"> <div class="r"><dt>{{ 'tech.widget' | t }}</dt><dd class="tr-ltr">{{ w }}</dd></div> </ng-container>
    </dl>
    <ng-container *ngIf="pages().length">
      <button type="button" class="pg" [attr.aria-expanded]="pagesOpen()" (click)="pagesOpen.set(!pagesOpen())"><tr-icon name="chevron-right" [size]="14" class="tr-mirror" [class.open]="pagesOpen()"></tr-icon>{{ 'tech.pages' | t: { n: pages().length } }}</button>
      <ng-container *ngIf="pagesOpen()">
        <ul class="pl"><ng-container *ngFor="let p of pages(); trackBy: __trk1"> <li><a class="tr-ltr tr-truncate" [href]="p.url" target="_blank" rel="noopener noreferrer">{{ path(p.url) }}</a><time>{{ fmt.time(date(p.at)) }}</time></li> </ng-container></ul>
      </ng-container>
    </ng-container>
  `,
  styles: [`
    :host { display: block; padding: 0 20px 12px; }
    .g { margin: 0; display: flex; flex-direction: column; } .r { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-block-size: 32px; padding-block: 4px; border-block-end: 1px solid var(--border); } .r:last-child { border-block-end: 0; }
    dt { display: inline-flex; align-items: center; gap: 6px; flex: none; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); padding-block-start: 1px; } dd { margin: 0; text-align: end; font-size: var(--tr-fs-body-sm); min-inline-size: 0; overflow-wrap: anywhere; }
    a { color: var(--brand); }
    .pg { display: inline-flex; align-items: center; gap: 4px; margin-block-start: 8px; color: var(--brand); font-size: var(--tr-fs-body-sm); font-weight: 600; min-block-size: 32px; } .pg .open { transform: rotate(90deg); }
    .pl { display: flex; flex-direction: column; gap: 4px; margin-block-start: 4px; } .pl li { display: flex; justify-content: space-between; gap: 8px; font-size: var(--tr-fs-body-sm); } .pl time { color: var(--muted-foreground); flex: none; }
  `],
})
export class TrTechContextComponent {
  readonly __trk1 = (__i: number, p: any): any => p.at;
  protected readonly fmt = inject(FormatService);
  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly pagesOpen = signal(false);
  protected readonly r = computed(() => this.c().raw);
  protected readonly ua = computed(() => parseUserAgent(this.r().userAgent));
  protected readonly pages = computed(() => this.r().attributes.pagesViewed ?? []);
  protected host = (u: string) => { try { const x = new URL(u); return x.host + x.pathname; } catch { return u; } };
  protected path = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
  protected date = (s: string) => new Date(s);
}
