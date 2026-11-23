import { eventInside } from '../core/util/dom';
import { Directive, ElementRef, OnDestroy, OnInit, inject, Output, EventEmitter } from '@angular/core';

/** `(trClickOutside)` fires when the user presses outside the host, or presses Escape (menus, popovers). */
@Directive({ standalone: true, selector: '[trClickOutside]' })
export class ClickOutsideDirective implements OnInit, OnDestroy {
  @Output() trClickOutside = new EventEmitter<void>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly handler = (e: Event) => {
    if (!eventInside(e, this.el.nativeElement)) this.trClickOutside.emit();
  };

  private readonly onKey = (e: KeyboardEvent) => e.key === 'Escape' && this.trClickOutside.emit();

  ngOnInit(): void {
    // defer one tick so the click that opened the menu does not close it
    setTimeout(() => {
      document.addEventListener('pointerdown', this.handler, true);
      document.addEventListener('keydown', this.onKey);
    });
  }
  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.handler, true);
    document.removeEventListener('keydown', this.onKey);
  }
}
