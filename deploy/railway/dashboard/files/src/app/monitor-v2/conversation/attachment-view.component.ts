import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { AttachmentVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';

/** Image thumbnail (opens the viewer), file card (name · size · type), location card, video poster (F-57). */
@Component({
  standalone: true,
  selector: 'tr-attachment-view',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container [ngSwitch]="a().kind"><ng-container *ngSwitchCase="'image'">
        <button type="button" class="thumb" [class.blur]="blur()" (click)="open.emit(a())" [attr.aria-label]="('att.open' | t) + ' ' + a().name">
          <img [src]="a().url" [alt]="a().name" loading="lazy" [style.aspect-ratio]="ratio()" />
          <ng-container *ngIf="blur()"> <span class="veil"><tr-icon name="shield" [size]="20"></tr-icon>{{ 'pii.imageHidden' | t }}</span> </ng-container>
        </button>
      </ng-container><ng-container *ngSwitchCase="'video'">
        <button type="button" class="thumb vid" (click)="open.emit(a())"><span class="poster"><tr-icon name="film" [size]="28"></tr-icon></span><span class="nm">{{ a().name }}</span></button>
      </ng-container><ng-container *ngSwitchCase="'location'">
        <div class="file loc">
          <span class="ic"><tr-icon name="map-pin" [size]="20"></tr-icon></span>
          <span class="meta"><strong>{{ 'att.location' | t }}</strong><span class="tr-ltr">{{ a().lat }}, {{ a().lng }}</span></span>
        </div>
      </ng-container><ng-container *ngSwitchDefault>
        <a class="file" [href]="a().url ?? null" [attr.download]="a().name" (click)="a().url ? null : $event.preventDefault()">
          <span class="ic"><tr-icon name="file-text" [size]="20"></tr-icon></span>
          <span class="meta"><strong class="tr-truncate tr-ltr">{{ a().name }}</strong><span>{{ typeLabel() }}<ng-container *ngIf="a().size"> · {{ fmt.bytes(a().size!) }} </ng-container></span></span>
          <tr-icon name="download" [size]="16"></tr-icon>
        </a>
      </ng-container></ng-container>
  `,
  styles: [`
    :host { display: block; }
    .thumb { position: relative; display: block; max-inline-size: 240px; border-radius: var(--radius-md); overflow: hidden; background: var(--muted); text-align: center; }
    .thumb img { display: block; inline-size: 100%; max-block-size: 220px; object-fit: cover; }
    .thumb.blur img { filter: blur(18px); transform: scale(1.1); }
    .veil { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; background: color-mix(in srgb, var(--card) 55%, transparent); color: var(--foreground); font-size: var(--tr-fs-caption); font-weight: 600; }
    .vid { inline-size: 220px; } .poster { display: flex; align-items: center; justify-content: center; block-size: 124px; color: var(--muted-foreground); } .nm { display: block; padding: 6px 10px; font-size: var(--tr-fs-caption); color: var(--muted-foreground); }
    .file { display: flex; align-items: center; gap: 10px; min-inline-size: 220px; max-inline-size: 300px; padding: 10px 12px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--card) 80%, transparent); border: 1px solid var(--border); color: var(--foreground); text-decoration: none; }
    .ic { display: inline-flex; align-items: center; justify-content: center; inline-size: 36px; block-size: 36px; border-radius: 8px; background: var(--muted); color: var(--muted-foreground); flex: none; }
    .meta { display: flex; flex-direction: column; min-inline-size: 0; flex: 1; font-size: var(--tr-fs-caption); color: var(--muted-foreground); } .meta strong { font-size: var(--tr-fs-body-sm); color: var(--foreground); font-weight: 600; }
  `],
})
export class TrAttachmentViewComponent {
  protected readonly fmt = inject(FormatService);
  private readonly _a = signal<AttachmentVM>(undefined as any);
  @Input() get a(): Signal<AttachmentVM> { return this._a; }
  set a(v: any) { this._a.set(v); }
  private readonly _blur = signal(false);
  @Input() get blur() { return this._blur; }
  set blur(v: any) { this._blur.set(v); }
  @Output() open = new EventEmitter<AttachmentVM>();
  protected ratio(): string | null {
    const a = this.a();
    return a.width && a.height ? `${a.width} / ${a.height}` : null;
  }
  protected typeLabel(): string {
    const m = this.a().mime ?? '';
    return m.includes('pdf') ? 'PDF' : m.split('/')[1]?.toUpperCase() ?? 'FILE';
  }
}
