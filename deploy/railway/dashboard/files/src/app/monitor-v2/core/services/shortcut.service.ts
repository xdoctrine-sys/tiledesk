import { Injectable, OnDestroy, inject } from '@angular/core';
import { eventTarget } from '../util/dom';
import { PageRoot } from './page-root.service';
import { Subject } from 'rxjs';

export type ShortcutAction =
  | 'help'
  | 'next'
  | 'prev'
  | 'open'
  | 'escape'
  | 'select'
  | 'selectAll'
  | 'resolve'
  | 'resolveNext'
  | 'snooze'
  | 'assign'
  | 'assignMe'
  | 'takeover'
  | 'labels'
  | 'priority'
  | 'unread'
  | 'reply'
  | 'note'
  | 'createTicket'
  | 'toggleSidebar'
  | 'toggleContext'
  | 'nextTab'
  | 'ai'
  | 'attach'
  | 'threadSearch';

/**
 * Global keyboard shortcuts (document section 5 "Schéma de raccourcis"). Single-letter shortcuts only fire when the
 * focus is not in a text field, and are read from the physical key (`KeyboardEvent.code`), so they are identical on an
 * Arabic keyboard layout. Alt / ⌘ combinations also work while typing.
 */
@Injectable()
export class ShortcutService implements OnDestroy {
  private readonly bus = new Subject<ShortcutAction>();
  readonly action$ = this.bus.asObservable();

  private readonly root = inject(PageRoot);
  /** True while the pointer / focus last went into Monitor V2: the shortcuts never fire for the rest of the dashboard. */
  private active = false;
  private readonly onKeydown = (e: KeyboardEvent) => this.onKey(e);
  private readonly onPointer = (e: Event) => (this.active = this.root.contains(e));

  constructor() {
    document.addEventListener('keydown', this.onKeydown);
    document.addEventListener('pointerdown', this.onPointer, true);
    document.addEventListener('focusin', this.onPointer, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
    document.removeEventListener('pointerdown', this.onPointer, true);
    document.removeEventListener('focusin', this.onPointer, true);
  }

  private emit(e: KeyboardEvent, a: ShortcutAction): void {
    e.preventDefault();
    this.bus.next(a);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active && !this.root.contains(e)) return;
    const target = eventTarget(e) as HTMLElement | null;
    const typing = !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
    const modalOpen = !!this.root.el?.getRootNode && !!(this.root.el.getRootNode() as ShadowRoot | Document).querySelector('dialog[open]');
    const mod = e.metaKey || e.ctrlKey;

    if (e.code === 'Escape') return this.bus.next('escape');
    if (modalOpen) return;

    // combinations that work in a text field
    if (e.altKey && !mod) {
      const map: Record<string, ShortcutAction> = { KeyJ: 'next', KeyK: 'prev', ArrowDown: 'next', ArrowUp: 'prev', KeyO: 'toggleSidebar', KeyI: 'toggleContext', KeyN: 'nextTab', KeyA: 'ai' };
      const a = map[e.code];
      if (a) return this.emit(e, a);
    }
    if (mod && e.altKey && e.code === 'KeyA') return this.emit(e, 'attach');
    if (mod && e.shiftKey && e.code === 'KeyF') return this.emit(e, 'threadSearch');

    if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyA' && !typing) return this.emit(e, 'selectAll');

    if (typing || mod || e.altKey) return;
    if ((e.code === 'Slash' && e.shiftKey) || e.key === '?') return this.emit(e, 'help');
    const letter: Record<string, ShortcutAction> = {
      KeyJ: 'next',
      KeyK: 'prev',
      KeyE: e.shiftKey ? 'resolveNext' : 'resolve',
      KeyZ: 'snooze',
      KeyA: 'assign',
      KeyI: 'assignMe',
      KeyT: 'takeover',
      KeyL: 'labels',
      KeyP: 'priority',
      KeyU: 'unread',
      KeyX: 'select',
      KeyR: 'reply',
      KeyN: 'note',
      KeyC: 'createTicket',
      Enter: 'open',
    };
    const a = letter[e.code];
    if (a && !(e.shiftKey && e.code !== 'KeyE')) this.emit(e, a);
  }
}
