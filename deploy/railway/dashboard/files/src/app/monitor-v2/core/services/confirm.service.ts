import { signal } from '../../core/signals';
import { Injectable } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Third button (e.g. "Log out anyway") */
  altLabel?: string;
  danger?: boolean;
  /** Ask the user to retype this value before enabling confirm (e.g. the ticket number to delete a conversation) */
  typeToConfirm?: string;
  /** Optional free-text input (e.g. "Add to saved replies": title + shortcut) */
  fields?: { key: string; label: string; value?: string; multiline?: boolean }[];
}

export type ConfirmResult = { result: 'confirm' | 'alt' | 'cancel'; values: Record<string, string> };

interface Pending {
  options: ConfirmOptions;
  resolve: (r: ConfirmResult) => void;
}

/** Imperative confirmation: `await confirm.ask({...})`. The single <tr-confirm-dialog> in the shell renders it. */
@Injectable()
export class ConfirmService {
  readonly pending = signal<Pending | null>(null);

  ask(options: ConfirmOptions): Promise<ConfirmResult> {
    return new Promise((resolve) => this.pending.set({ options, resolve }));
  }

  answer(result: ConfirmResult): void {
    const p = this.pending();
    this.pending.set(null);
    p?.resolve(result);
  }
}
