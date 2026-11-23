import { Signal, signal } from '../core/signals';
import { PageRoot } from '../core/services/page-root.service';
import { Component, ElementRef, inject, Input, Output, EventEmitter } from '@angular/core';

/**
 * Column resize handle: the 8 px gap between two floating panels (v4 "Colonnes redimensionnables").
 * Invisible at rest; on hover, focus or while dragging a 2 px line appears in the middle of the gap.
 *
 *  - pointer: drag (pointer capture, one requestAnimationFrame per frame, no text selection), double-click = default width
 *  - keyboard: ← → = ±16 px, Shift + ← → = ±64 px, Home / End = min / max, Enter = fold (or default width when not foldable)
 *  - RTL: `panel` says on which side of the handle the controlled panel sits ("start" = before it in reading order);
 *    the sign of the drag is derived from the document direction, so the same markup works in Arabic.
 *
 * The component is purely presentational: it emits the width the agent asks for, the shell decides what to do with it.
 */
@Component({
  standalone: true,
  selector: 'tr-resize-handle',
  host: {
    role: 'separator',
    'aria-orientation': 'vertical',
    tabindex: '0',
    '[attr.aria-label]': 'label()',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-valuemin]': 'min()',
    '[attr.aria-valuemax]': 'max()',
    '[class.dragging]': 'dragging()',
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up($event)',
    '(pointercancel)': 'up($event)',
    '(lostpointercapture)': 'up($event)',
    '(dblclick)': 'reset.emit()',
    '(keydown)': 'key($event)',
  },
  template: `<span class="line" aria-hidden="true"></span>`,
  styles: [`
    :host { position: relative; display: block; inline-size: 8px; block-size: 100%; cursor: col-resize; touch-action: none; outline: none; z-index: 5; }
    /* a wider invisible hit area so the 8 px gap is easy to grab */
    :host::before { content: ''; position: absolute; inset-block: 0; inset-inline: -4px; }
    .line { position: absolute; inset-block: 0; inset-inline-start: 3px; inline-size: 2px; border-radius: 1px; background: transparent; transition: background var(--tr-motion-fast) var(--tr-ease-in); }
    :host(:hover) .line, :host(.dragging) .line { background: var(--ring); }
    :host(:focus-visible) .line { background: var(--brand); }
  `],
})
export class TrResizeHandleComponent {
  private readonly pageRoot = inject(PageRoot);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Accessible name, e.g. "Resize conversation list". */
  private readonly _label = signal<string>(undefined as any);
  @Input() get label(): Signal<string> { return this._label; }
  set label(v: any) { this._label.set(v); }
  /** Current (effective) width of the controlled panel, min and max in px: exposed as aria-value*. */
  private readonly _value = signal<number>(undefined as any);
  @Input() get value(): Signal<number> { return this._value; }
  set value(v: any) { this._value.set(v); }
  private readonly _min = signal<number>(undefined as any);
  @Input() get min(): Signal<number> { return this._min; }
  set min(v: any) { this._min.set(v); }
  private readonly _max = signal<number>(undefined as any);
  @Input() get max(): Signal<number> { return this._max; }
  set max(v: any) { this._max.set(v); }
  /** Where the controlled panel sits relative to the handle, in reading order. */
  private readonly _panel = signal<'start' | 'end'>('start');
  @Input() get panel(): Signal<'start' | 'end'> { return this._panel; }
  set panel(v: any) { this._panel.set(v); }
  /** Enter folds the panel when true, restores the default width otherwise. */
  private readonly _foldable = signal(false);
  @Input() get foldable() { return this._foldable; }
  set foldable(v: any) { this._foldable.set(v); }

  /** Raw width the agent is asking for (not clamped: the shell clamps, or folds when it is far under the minimum). */
  @Output() resized = new EventEmitter<number>();
  @Output() reset = new EventEmitter<void>();
  @Output() fold = new EventEmitter<void>();

  protected readonly dragging = signal(false);
  private startX = 0;
  private startW = 0;
  private raf = 0;
  private pending = 0;

  /** +1 when moving the pointer to the right makes the controlled panel wider. */
  private sign(): 1 | -1 {
    const rtl = getComputedStyle(this.el.nativeElement).direction === 'rtl';
    return (this.panel() === 'start') !== rtl ? 1 : -1;
  }

  protected down(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.el.nativeElement.focus({ preventScroll: true });
    this.el.nativeElement.setPointerCapture(e.pointerId);
    this.startX = e.clientX;
    this.startW = this.value();
    this.dragging.set(true);
    this.pageRoot.el?.classList.add('tr-resizing');
  }

  protected move(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.pending = this.startW + (e.clientX - this.startX) * this.sign();
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.resized.emit(this.pending);
    });
  }

  protected up(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    this.pageRoot.el?.classList.remove('tr-resizing');
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.resized.emit(this.pending);
    }
    if (this.el.nativeElement.hasPointerCapture?.(e.pointerId)) this.el.nativeElement.releasePointerCapture(e.pointerId);
  }

  protected key(e: KeyboardEvent): void {
    const step = e.shiftKey ? 64 : 16;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight': next = this.value() + step * this.sign(); break;
      case 'ArrowLeft': next = this.value() - step * this.sign(); break;
      case 'Home': next = this.min(); break;
      case 'End': next = this.max(); break;
      case 'Enter':
        e.preventDefault();
        return this.foldable() ? this.fold.emit() : this.reset.emit();
      default: return;
    }
    e.preventDefault();
    this.resized.emit(Math.min(this.max(), Math.max(this.min(), next)));
  }
}
