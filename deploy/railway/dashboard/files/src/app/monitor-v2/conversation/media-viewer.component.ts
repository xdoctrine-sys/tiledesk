import { Signal, computed, effect, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { TranslatePipe } from '../core/services/i18n.service';
import { FormatService } from '../core/services/format.service';
import { MessageStore } from '../core/stores/message.store';
import { isRtlNow } from '../core/util/dir';

/** Full-screen viewer for the thread's images (F-57): ← → between media, click to zoom, Esc to close. */
@Component({
  standalone: true,
  selector: 'tr-media-viewer',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <dialog #dlg class="viewer" aria-label="Media viewer" (close)="store.viewerId.set(null)" (keydown)="onKey($event)" (click)="$event.target === dlg ? close() : null">
      <ng-container *ngIf="current() as m">
        <header class="hd">
          <span class="cnt">{{ index() + 1 }} / {{ store.media().length }}</span>
          <span class="nm tr-ltr tr-truncate">{{ m.name }}<ng-container *ngIf="m.size"> · {{ fmt.bytes(m.size) }} </ng-container></span>
          <a class="tr-icon-btn" [href]="m.url" [attr.download]="m.name" [attr.aria-label]="'att.download' | t"><tr-icon name="download" [size]="18"></tr-icon></a>
          <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="close()"><tr-icon name="x" [size]="18"></tr-icon></button>
        </header>
        <div class="stage">
          <button type="button" class="nav prev tr-icon-btn" [disabled]="index() === 0" [attr.aria-label]="'common.previous' | t" (click)="go(-1)"><tr-icon name="chevron-left" [size]="22" class="tr-mirror"></tr-icon></button>
          <img [src]="m.url" [alt]="m.name" [class.zoom]="zoom()" (click)="zoom.set(!zoom())" />
          <button type="button" class="nav next tr-icon-btn" [disabled]="index() === store.media().length - 1" [attr.aria-label]="'common.next' | t" (click)="go(1)"><tr-icon name="chevron-right" [size]="22" class="tr-mirror"></tr-icon></button>
        </div>
      </ng-container>
    </dialog>
  `,
  styles: [`
    dialog.viewer { inline-size: min(1000px, 96vw); block-size: min(760px, 92vh); max-inline-size: none; max-block-size: none; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); color: var(--foreground); overflow: hidden; }
    dialog.viewer[open] { display: flex; flex-direction: column; }
    dialog.viewer::backdrop { background: var(--scrim); }
    .hd { display: flex; align-items: center; gap: 12px; padding-block: 8px; padding-inline: 20px 12px; } .cnt { font-weight: 500; } .nm { flex: 1; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .stage { position: relative; flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; }
    img { max-inline-size: 100%; max-block-size: 100%; object-fit: contain; cursor: zoom-in; transition: transform var(--tr-motion-base); } img.zoom { transform: scale(2); cursor: zoom-out; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); color: var(--foreground); background: var(--muted); inline-size: 44px; block-size: 44px; }
    .nav.prev { inset-inline-start: 12px; } .nav.next { inset-inline-end: 12px; }
  `],
})
export class TrMediaViewerComponent {
  protected readonly store = inject(MessageStore);
  protected readonly fmt = inject(FormatService);
  private readonly _dlg = signal<ElementRef<HTMLDialogElement>>(undefined as any);
  @ViewChild('dlg') private get dlg(): Signal<ElementRef<HTMLDialogElement>> { return this._dlg; }
  private set dlg(v: any) { this._dlg.set(v); }
  protected readonly zoom = signal(false);
  protected readonly index = computed(() => this.store.media().findIndex((m) => m.id === this.store.viewerId()));
  protected readonly current = computed(() => this.store.media()[this.index()] ?? null);

  constructor() {
    effect(() => {
      const id = this.store.viewerId();
      const d = this.dlg().nativeElement;
      if (id && !d.open) d.showModal();
      else if (!id && d.open) d.close();
    });
  }

  protected go(delta: number): void {
    const m = this.store.media()[this.index() + delta];
    if (m) { this.zoom.set(false); this.store.viewerId.set(m.id); }
  }
  protected close(): void {
    this.zoom.set(false);
    this.store.viewerId.set(null);
  }
  protected onKey(e: KeyboardEvent): void {
    const rtl = isRtlNow();
    if (e.key === 'ArrowRight') this.go(rtl ? -1 : 1);
    if (e.key === 'ArrowLeft') this.go(rtl ? 1 : -1);
  }
}
