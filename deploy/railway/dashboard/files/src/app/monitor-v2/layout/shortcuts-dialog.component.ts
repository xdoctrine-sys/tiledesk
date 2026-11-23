import { Signal, effect, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { TranslatePipe } from '../core/services/i18n.service';
import { UiStore } from '../core/stores/ui.store';

interface Row { keys: string[]; label: string }

/**
 * Keyboard help (E-14, F-08), opened with "?". Only the shortcuts of the inbox are listed: the ones for modules that
 * are not part of this template (command palette, global search, module navigation) are left out.
 */
@Component({
  standalone: true,
  selector: 'tr-shortcuts-dialog',
  imports: [TrIconComponent, TranslatePipe, CommonModule],
  template: `
    <dialog #dlg class="tr-dialog" aria-labelledby="sc-title" (close)="ui.close()" (click)="$event.target === dlg ? ui.close() : null">
      <header class="hd"><h2 id="sc-title">{{ 'shortcuts.title' | t }}</h2><button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="ui.close()"><tr-icon name="x" [size]="18"></tr-icon></button></header>
      <div class="body">
        <ng-container *ngFor="let g of groups; trackBy: __trk3">
          <section>
            <h3>{{ g.title | t }}</h3>
            <dl>
              <ng-container *ngFor="let r of g.rows; trackBy: __trk2">
                <div class="r"><dt><ng-container *ngFor="let k of r.keys; trackBy: __trk1; let last = last"><kbd class="tr-kbd">{{ k }}</kbd><ng-container *ngIf="!last"><span class="or">/</span></ng-container></ng-container></dt><dd>{{ r.label | t }}</dd></div>
              </ng-container>
            </dl>
          </section>
        </ng-container>
      </div>
    </dialog>
  `,
  styles: [`
    dialog { max-inline-size: min(720px, calc(100vw - 32px)); }
    .hd { display: flex; align-items: center; justify-content: space-between; padding-block: 16px 8px; padding-inline: 24px 20px; }
    h2 { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .body { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px 32px; padding: 8px 24px 24px; overflow: auto; }
    h3 { font-size: var(--tr-fs-body-sm); color: var(--muted-foreground); font-weight: 600; margin-block: 12px 4px; }
    .r { display: flex; align-items: center; gap: 12px; min-block-size: 32px; }
    dt { display: flex; align-items: center; gap: 4px; min-inline-size: 96px; } dd { margin: 0; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .or { color: var(--muted-foreground); font-size: 12px; }
  `],
})
export class TrShortcutsDialogComponent {
  readonly __trk1 = (__i: number, k: any): any => k;
  readonly __trk2 = (__i: number, r: any): any => r.label;
  readonly __trk3 = (__i: number, g: any): any => g.title;
  protected readonly ui = inject(UiStore);
  private readonly _dlg = signal<ElementRef<HTMLDialogElement>>(undefined as any);
  @ViewChild('dlg') private get dlg(): Signal<ElementRef<HTMLDialogElement>> { return this._dlg; }
  private set dlg(v: any) { this._dlg.set(v); }

  protected readonly groups: { title: string; rows: Row[] }[] = [
    { title: 'shortcuts.g.list', rows: [
      { keys: ['J', 'K'], label: 'shortcuts.nextPrev' }, { keys: ['↵'], label: 'shortcuts.open' }, { keys: ['Esc'], label: 'shortcuts.back' },
      { keys: ['X'], label: 'shortcuts.select' }, { keys: ['⌘A'], label: 'shortcuts.selectAll' }, { keys: ['Alt+N'], label: 'shortcuts.nextTab' }, { keys: ['U'], label: 'shortcuts.unread' },
    ] },
    { title: 'shortcuts.g.conversation', rows: [
      { keys: ['E'], label: 'shortcuts.resolve' }, { keys: ['⇧E'], label: 'shortcuts.resolveNext' }, { keys: ['Z'], label: 'shortcuts.snooze' },
      { keys: ['A', 'I'], label: 'shortcuts.assign' }, { keys: ['T'], label: 'shortcuts.takeover' }, { keys: ['L', 'P'], label: 'shortcuts.labelsPriority' }, { keys: ['C'], label: 'shortcuts.createTicket' },
    ] },
    { title: 'shortcuts.g.composer', rows: [
      { keys: ['R', 'N'], label: 'shortcuts.replyNote' }, { keys: ['⌘↵'], label: 'shortcuts.send' }, { keys: ['⌘⇧↵', '⌘⌥↵'], label: 'shortcuts.sendResolve' },
      { keys: ['Alt+A'], label: 'shortcuts.ai' }, { keys: ['⌘⌥A'], label: 'shortcuts.attach' }, { keys: ['Alt+L', 'Alt+P'], label: 'shortcuts.replyNoteInside' }, { keys: ['/'], label: 'shortcuts.canned' }, { keys: ['@'], label: 'shortcuts.mention' },
    ] },
    { title: 'shortcuts.g.layout', rows: [
      { keys: ['?'], label: 'shortcuts.help' }, { keys: ['Alt+O', 'Alt+I'], label: 'shortcuts.panels' }, { keys: ['⌘⇧F'], label: 'shortcuts.threadSearch' },
    ] },
  ];

  constructor() {
    effect(() => {
      const d = this.dlg().nativeElement;
      const open = this.ui.dialog() === 'shortcuts';
      if (open && !d.open) d.showModal();
      else if (!open && d.open) d.close();
    });
  }
}
