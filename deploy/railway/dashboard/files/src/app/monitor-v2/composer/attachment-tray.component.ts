import { Signal, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { AttachmentVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';

/** Files waiting to be sent (F-80): thumbnails, upload progress, channel errors (type / size) with a "Remove" action. */
@Component({
  standalone: true,
  selector: 'tr-attachment-tray',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <ng-container *ngFor="let a of items(); trackBy: __trk4">
      <div class="it" [class.err]="!!a.error">
        <ng-container *ngIf="a.kind === 'image' && a.url; else __e1"> <img [src]="a.url" alt="" /> </ng-container><ng-template #__e1> <span class="ic"><tr-icon name="file-text" [size]="18"></tr-icon></span> </ng-template>
        <span class="meta"><span class="nm tr-truncate tr-ltr">{{ a.name }}</span>
          <ng-container *ngIf="a.error; else __e2"> <span class="er">{{ 'att.rejected' | t: { channel: channelName(), reason: a.error } }}</span> </ng-container><ng-template #__e2><ng-container *ngIf="a.progress !== undefined && a.progress < 100; else __e3"> <span class="pg"><i [style.inline-size.%]="a.progress"></i></span> </ng-container><ng-template #__e3> <span class="sz">{{ fmt.bytes(a.size ?? 0) }}</span> </ng-template></ng-template>
        </span>
        <button type="button" class="x" [attr.aria-label]="'common.remove' | t" (click)="remove.emit(a.id)"><tr-icon name="x" [size]="14"></tr-icon></button>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: flex; flex-wrap: wrap; gap: 8px; padding-block-end: 8px; }
    .it { position: relative; display: flex; align-items: center; gap: 8px; max-inline-size: 240px; padding-block: 6px; padding-inline: 6px 28px; border-radius: var(--radius-md); background: var(--muted); border: 1px solid var(--border); }
    .it.err { border-color: var(--input); background: var(--muted); }
    img, .ic { inline-size: 36px; block-size: 36px; border-radius: 6px; object-fit: cover; flex: none; } .ic { display: inline-flex; align-items: center; justify-content: center; background: var(--card); color: var(--muted-foreground); }
    .meta { display: flex; flex-direction: column; min-inline-size: 0; font-size: var(--tr-fs-caption); } .nm { font-size: var(--tr-fs-body-sm); } .sz { color: var(--muted-foreground); } .er { color: var(--muted-foreground); font-weight: 600; text-decoration: line-through dotted; text-decoration: none; }
    .pg { display: block; inline-size: 90px; block-size: 4px; margin-block-start: 6px; border-radius: 2px; background: var(--muted); overflow: hidden; } .pg i { display: block; block-size: 100%; background: var(--brand); transition: inline-size var(--tr-motion-base); }
    .x { position: absolute; inset-inline-end: 4px; inset-block-start: 4px; inline-size: 22px; block-size: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--muted-foreground); } .x:hover { background: var(--muted); }
  `],
})
export class TrAttachmentTrayComponent {
  readonly __trk4 = (__i: number, a: any): any => a.id;
  protected readonly fmt = inject(FormatService);
  private readonly _items = signal<AttachmentVM[]>(undefined as any);
  @Input() get items(): Signal<AttachmentVM[]> { return this._items; }
  set items(v: any) { this._items.set(v); }
  private readonly _channelName = signal('');
  @Input() get channelName() { return this._channelName; }
  set channelName(v: any) { this._channelName.set(v); }
  @Output() remove = new EventEmitter<string>();
}
