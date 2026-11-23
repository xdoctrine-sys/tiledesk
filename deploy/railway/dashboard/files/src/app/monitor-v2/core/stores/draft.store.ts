import { signal } from '../../core/signals';
import { Injectable } from '@angular/core';

export type ComposerMode = 'reply' | 'note';
type Drafts = Record<string, { reply?: string; note?: string; mode?: ComposerMode; updatedAt?: number }>;

const KEY = 'monitor-v2.drafts';

/**
 * One draft per conversation, kept locally (and, in a real deployment, on the server: collection `drafts`, F-86).
 * A draft is never overwritten by incoming events (transition 13.6 "Résolution alors qu'un brouillon existe").
 */
@Injectable()
export class DraftStore {
  readonly drafts = signal<Drafts>(this.load());

  reply(id: string): string {
    return this.drafts()[id]?.reply ?? '';
  }
  note(id: string): string {
    return this.drafts()[id]?.note ?? '';
  }
  mode(id: string): ComposerMode {
    return this.drafts()[id]?.mode ?? 'reply';
  }
  updatedAt(id: string): number | undefined {
    return this.drafts()[id]?.updatedAt;
  }

  set(id: string, mode: ComposerMode, text: string): void {
    this.drafts.update((d) => ({ ...d, [id]: { ...d[id], [mode]: text, mode, updatedAt: Date.now() } }));
    this.persist();
  }
  setMode(id: string, mode: ComposerMode): void {
    this.drafts.update((d) => ({ ...d, [id]: { ...d[id], mode } }));
  }
  clear(id: string, mode: ComposerMode): void {
    this.drafts.update((d) => ({ ...d, [id]: { ...d[id], [mode]: '' } }));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.drafts()));
    } catch {
      /* storage unavailable */
    }
  }
  private load(): Drafts {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Drafts;
      // The demo ships with one draft (conversation #57) to show the "Draft:" preview in amber.
      return { 'support-group-r61': { reply: 'Thank you Khalid, could you also send your salary certificate?', mode: 'reply', updatedAt: Date.now() - 12 * 60_000 }, 'support-group-r57': { reply: 'Thank you Mariam, I will confirm the viewing for Thursday once I receive your documents.', mode: 'reply', updatedAt: Date.now() - 20 * 60_000 }, ...saved };
    } catch {
      return {};
    }
  }
}
