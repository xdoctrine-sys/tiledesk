import { Signal, effect, signal } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { ConfirmService } from '../core/services/confirm.service';

/** Confirmation dialog (native <dialog>: focus trap, Esc, backdrop). Driven by ConfirmService.ask(). */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'tr-confirm-dialog',
  template: `
    <dialog #dlg class="tr-dialog" aria-labelledby="cf-title" (cancel)="finish('cancel', $event)" (click)="onBackdrop($event)">
      <ng-container *ngIf="confirm.pending() as p">
        <form method="dialog" class="box" (submit)="$event.preventDefault(); canConfirm() && finish('confirm')">
          <h2 id="cf-title" class="title">{{ p.options.title }}</h2>
          <ng-container *ngIf="p.options.text"> <p class="text">{{ p.options.text }}</p> </ng-container>
          <ng-container *ngIf="p.options.typeToConfirm">
            <label class="lbl">{{ p.options.typeToConfirm }}
              <input class="tr-field" [value]="typed()" (input)="typed.set($any($event.target).value)" autocomplete="off" />
            </label>
          </ng-container>
          <ng-container *ngFor="let f of p.options.fields ?? []; trackBy: __trk2">
            <label class="lbl">{{ f.label }}
              <ng-container *ngIf="f.multiline; else __e1"> <textarea class="tr-field" rows="3" [value]="values()[f.key] ?? f.value ?? ''" (input)="setValue(f.key, $any($event.target).value)"></textarea> </ng-container><ng-template #__e1> <input class="tr-field" [value]="values()[f.key] ?? f.value ?? ''" (input)="setValue(f.key, $any($event.target).value)" /> </ng-template>
            </label>
          </ng-container>
          <div class="actions">
            <button type="button" class="tr-btn" (click)="finish('cancel')">{{ p.options.cancelLabel }}</button>
            <ng-container *ngIf="p.options.altLabel"> <button type="button" class="tr-btn" (click)="finish('alt')">{{ p.options.altLabel }}</button> </ng-container>
            <button type="submit" class="tr-btn" [class.tr-btn--danger]="p.options.danger" [class.tr-btn--primary]="!p.options.danger" [disabled]="!canConfirm()">{{ p.options.confirmLabel }}</button>
          </div>
        </form>
      </ng-container>
    </dialog>
  `,
  styles: [`
    dialog { max-inline-size: min(440px, calc(100vw - 32px)); }
    .box { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
    .title { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .text { color: var(--muted-foreground); }
    .lbl { display: flex; flex-direction: column; gap: 6px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-block-start: 8px; }
  `],
})
export class TrConfirmDialogComponent {
  readonly __trk2 = (__i: number, f: any): any => f.key;
  protected readonly confirm = inject(ConfirmService);
  private readonly _dlg = signal<ElementRef<HTMLDialogElement>>(undefined as any);
  @ViewChild('dlg') private get dlg(): Signal<ElementRef<HTMLDialogElement>> { return this._dlg; }
  private set dlg(v: any) { this._dlg.set(v); }
  protected readonly typed = signal('');
  protected readonly values = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      const p = this.confirm.pending();
      const d = this.dlg().nativeElement;
      if (p && !d.open) {
        this.typed.set('');
        this.values.set(Object.fromEntries((p.options.fields ?? []).map((f) => [f.key, f.value ?? ''])));
        d.showModal();
      } else if (!p && d.open) d.close();
    });
  }

  protected canConfirm(): boolean {
    const need = this.confirm.pending()?.options.typeToConfirm;
    return !need || this.typed().trim() === need;
  }

  protected setValue(key: string, v: string): void {
    this.values.update((x) => ({ ...x, [key]: v }));
  }

  protected finish(result: 'confirm' | 'alt' | 'cancel', ev?: Event): void {
    ev?.preventDefault();
    this.confirm.answer({ result, values: this.values() });
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.finish('cancel');
  }
}
