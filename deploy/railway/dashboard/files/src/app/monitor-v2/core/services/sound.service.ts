import { Injectable, inject } from '@angular/core';
import { UiStore } from '../stores/ui.store';
import { InboxApi } from './inbox-api';

/**
 * Notification sounds (F-05): a different short tone per event (new conversation, new message, mention), synthesised with
 * the Web Audio API so no audio files are needed. Silent when the rail's sound switch is off or the tab is in the foreground
 * on the same conversation is not required: the template simply plays when enabled.
 */
@Injectable()
export class SoundService {
  private readonly ui = inject(UiStore);
  private ctx?: AudioContext;

  constructor() {
    inject(InboxApi).events$.subscribe((e) => {
      if (e.type === 'request.created') this.play([660, 880]);
      else if (e.type === 'message.created' && e.message.sender !== 'system' && !e.message.attributes?.subtype) this.play([520]);
      else if (e.type === 'message.created' && e.message.attributes?.subtype === 'private' && /@\w/.test(e.message.text)) this.play([440, 660, 880]);
    });
  }

  play(freqs: number[]): void {
    if (!this.ui.sounds() || typeof AudioContext === 'undefined') return;
    try {
      this.ctx ??= new AudioContext();
      const t0 = this.ctx.currentTime;
      freqs.forEach((f, i) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.08, t0 + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.18);
        o.connect(g).connect(this.ctx!.destination);
        o.start(t0 + i * 0.12);
        o.stop(t0 + i * 0.12 + 0.2);
      });
    } catch {
      /* autoplay policy: ignore until the user interacts */
    }
  }
}
