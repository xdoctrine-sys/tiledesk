import { signal } from '../../core/signals';
import { Injectable } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warn' | 'error';
  actionLabel?: string;
  action?: () => void;
  /** Extra lines (e.g. partial bulk results), collapsed by default */
  details?: string[];
  sticky: boolean;
}

@Injectable()
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, opts: Partial<Omit<Toast, 'id' | 'text'>> & { duration?: number } = {}): number {
    const id = ++this.seq;
    const toast: Toast = { id, text, kind: opts.kind ?? 'info', actionLabel: opts.actionLabel, action: opts.action, details: opts.details, sticky: !!opts.sticky };
    this.toasts.update((t) => [...t.slice(-2), toast]);
    if (!toast.sticky) setTimeout(() => this.dismiss(id), opts.duration ?? (opts.action ? 6000 : 3500));
    return id;
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
