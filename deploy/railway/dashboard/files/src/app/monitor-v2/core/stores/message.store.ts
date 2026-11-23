import { computed, effect, signal, untracked } from '../../core/signals';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from '../../core/rxjs-compat';
import { toMessageVMs } from '../mappers/message.mapper';
import { buildRelay } from '../mappers/relay.mapper';
import { TdMessage } from '../models/tiledesk.models';
import { MessageVM, RelaySegmentVM, TakeoverBriefVM } from '../models/view-models';
import { I18nService } from '../services/i18n.service';
import { InboxApi, RealtimeEvent, SendPayload } from '../services/inbox-api';
import { ToastService } from '../services/toast.service';
import { normalizeArabic, uid } from '../util/text';
import { ConversationStore } from './conversation.store';
import { DirectoryStore } from './directory.store';
import { ComposerMode, DraftStore } from './draft.store';
import { PresenceStore } from './presence.store';

export type LocalStatus = 'sending' | 'queued' | 'failed' | 'sent';

export interface SendOptions {
  text: string;
  mode: ComposerMode;
  attachments?: SendPayload['attachments'];
  statusAfter?: 'open' | 'pending' | 'resolved';
  scheduledAt?: string;
}

const UNDO_MS = 5000;

/**
 * The open conversation's thread: messages, relay ribbon, typing, optimistic sending with retry and offline queue,
 * the handover brief and per-message actions. Late answers for a previously opened conversation are ignored.
 */
@Injectable()
export class MessageStore {
  private readonly api = inject(InboxApi);
  private readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  private readonly drafts = inject(DraftStore);
  private readonly presence = inject(PresenceStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly raw = signal<TdMessage[]>([]);
  readonly loading = signal(false);
  readonly notFound = signal(false);
  readonly loadError = signal(false);
  readonly localStatus = signal<Record<string, LocalStatus>>({});
  readonly quoting = signal<MessageVM | null>(null);
  readonly scrollTarget = signal<{ id: string; nonce: number } | null>(null);
  /** First unread message of the conversation when it was opened (the thread opens there). */
  readonly firstUnreadId = signal<string | null>(null);
  readonly brief = signal<TakeoverBriefVM | null>(null);
  readonly briefOpen = signal(false);
  readonly translations = signal<Record<string, { state: 'loading' | 'done' | 'error'; text?: string; shown: boolean }>>({});
  readonly highlight = signal<string | null>(null);
  /** Id of the attachment open in the full-screen viewer (← → move between the media of the thread). */
  readonly viewerId = signal<string | null>(null);
  // in-conversation search (F-64)
  readonly searchOpen = signal(false);
  readonly searchQuery = signal('');
  readonly searchIndex = signal(0);
  /** Access log of sensitive data shown to this agent (I-6, ➕ pii_access_log) */
  readonly piiLog = signal<{ messageId: string; reason: string; at: Date; agent: string }[]>([]);

  private seq = 0;
  private openedId: string | null = null;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly conversation = computed(() => this.conv.selected());

  readonly vms = computed<MessageVM[]>(() => {
    const c = this.conv.selected();
    if (!c) return [];
    const local = this.localStatus();
    const tr = this.translations();
    return toMessageVMs(this.raw(), c.raw, this.conv.mapContext()).map((m) => {
      const key = m.tempId ?? m.id;
      const ls = local[key];
      const t = tr[m.id];
      return { ...m, status: ls === 'sending' ? 'sending' : ls === 'queued' ? 'queued' : ls === 'failed' ? 'failed' : m.status, translation: t?.shown && t.text ? t.text : m.translation };
    });
  });

  readonly searchMatches = computed(() => {
    const q = normalizeArabic(this.searchQuery().trim());
    return q ? this.vms().filter((m) => m.type !== 'event' && normalizeArabic(m.text).includes(q)).map((m) => m.id) : [];
  });

  readonly media = computed(() => this.vms().flatMap((m) => m.attachments.filter((a) => a.kind === 'image' || a.kind === 'video').map((a) => ({ ...a, messageId: m.id }))));

  readonly relay = computed<RelaySegmentVM[]>(() => {
    const c = this.conv.selected();
    return c ? buildRelay(c.raw, this.raw(), this.conv.mapContext()) : [];
  });

  readonly typing = computed(() => {
    const id = this.conv.selectedId();
    return id ? (this.conv.liveTyping()[id] ?? {}) : {};
  });

  constructor() {
    effect(() => {
      const id = this.conv.selectedId();
      untracked(() => void this.open(id));
    });
    this.api.events$.subscribe((e) => this.onEvent(e));
    // Flush the offline queue once the connection is back (reconcile first: never a duplicate in the thread).
    effect(() => {
      if (this.presence.connection().status === 'restored') untracked(() => void this.flushQueue());
    });
  }

  // ------------------------------------------------------------ opening
  async open(id: string | null): Promise<void> {
    this.flushUndoWindow();
    const token = ++this.seq;
    this.openedId = id;
    this.raw.set([]);
    this.notFound.set(false);
    this.loadError.set(false);
    this.quoting.set(null);
    this.brief.set(null);
    this.briefOpen.set(false);
    this.firstUnreadId.set(null);
    this.closeSearch();
    this.piiLog.set([]);
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const unreadAtOpen = this.conv.byId().get(id)?.unread ?? 0;
      if (!this.conv.byId().has(id)) {
        const r = await firstValueFrom(this.api.getRequest(id));
        if (token !== this.seq) return;
        this.conv.replace(r);
      }
      const msgs = await firstValueFrom(this.api.listMessages(id));
      if (token !== this.seq) return; // late answer for another conversation → ignored
      this.raw.set(msgs);
      const customerMsgs = msgs.filter((m) => !m.attributes?.subtype && m.sender !== 'system' && !m.sender.startsWith('bot_') && !this.dir.agentsById().has(m.sender));
      if (unreadAtOpen > 0 && customerMsgs.length) this.firstUnreadId.set(customerMsgs[Math.max(0, customerMsgs.length - unreadAtOpen)]!._id);
      this.loading.set(false);
      this.maybeOpenBrief(id);
    } catch (err) {
      if (token !== this.seq) return;
      this.loading.set(false);
      (err as { status?: number })?.status === 404 ? this.notFound.set(true) : this.loadError.set(true);
    }
  }

  openSearch(): void {
    this.searchOpen.set(true);
  }
  closeSearch(): void {
    this.searchOpen.set(false);
    this.searchQuery.set('');
    this.searchIndex.set(0);
  }
  stepMatch(delta: 1 | -1): void {
    const n = this.searchMatches().length;
    if (!n) return;
    const i = (this.searchIndex() + delta + n) % n;
    this.searchIndex.set(i);
    this.jump(this.searchMatches()[i]!);
  }
  logPii(messageId: string, reason: string): void {
    this.piiLog.update((l) => [...l, { messageId, reason, at: new Date(), agent: this.dir.me()?.name ?? '' }]);
  }

  async reload(): Promise<void> {
    await this.open(this.conv.selectedId());
  }

  // ------------------------------------------------------------ handover brief (I-2)
  /** The brief shows when the current agent took the conversation over less than 2 minutes ago. */
  private async maybeOpenBrief(id: string): Promise<void> {
    const c = this.conv.byId().get(id);
    const seg = (() => { const r = this.relay(); return r[r.length - 1]; })();
    if (!c || c.actor.kind !== 'human' || !c.actor.isMe || seg?.kind !== 'human') return;
    if (this.conv.mapContext().now.getTime() - seg.start.getTime() > 2 * 60_000) return;
    await this.loadBrief(id);
    this.briefOpen.set(false); // v4: the hand-over brief is a folded one-line block until the agent opens it
  }

  async loadBrief(id: string): Promise<void> {
    const token = this.seq;
    try {
      const b = await firstValueFrom(this.api.getTakeoverBrief(id));
      if (token === this.seq) this.brief.set(b ?? null);
    } catch {
      if (token === this.seq) this.brief.set(null);
    }
  }

  async toggleBrief(): Promise<void> {
    const id = this.conv.selectedId();
    if (!id) return;
    if (!this.brief()) await this.loadBrief(id);
    this.briefOpen.update((o) => !o);
  }

  // ------------------------------------------------------------ sending
  async send(opts: SendOptions): Promise<void> {
    const id = this.conv.selectedId();
    const me = this.dir.meId();
    if (!id || (!opts.text.trim() && !opts.attachments?.length)) return;
    const tempUID = uid('t');
    const isNote = opts.mode === 'note';
    const msg: TdMessage = {
      _id: tempUID,
      sender: me,
      senderFullname: this.dir.me()?.firstName ?? '',
      recipient: id,
      text: opts.text,
      type: opts.attachments?.[0] ? (opts.attachments[0].type.startsWith('image/') ? 'image' : opts.attachments[0].type.startsWith('audio/') ? 'audio' : 'file') : 'text',
      metadata: opts.attachments?.[0] ? { name: opts.attachments[0].name, type: opts.attachments[0].type, size: opts.attachments[0].size, src: opts.attachments[0].src, duration: opts.attachments[0].duration, waveform: opts.attachments[0].waveform, transcript: opts.attachments[0].transcript } : undefined,
      attributes: { tempUID, subtype: isNote ? 'private' : undefined, tarashli_quoted: this.quoting()?.id },
      status: 0,
      createdAt: new Date().toISOString(),
    };
    this.raw.update((m) => [...m, msg]);
    this.drafts.clear(id, opts.mode);
    const quotedId = this.quoting()?.id;
    this.quoting.set(null);
    this.briefOpen.set(false);
    const payload: SendPayload = { text: opts.text, subtype: isNote ? 'private' : undefined, tempUID, attachments: opts.attachments, quotedId, statusAfter: opts.statusAfter, scheduledAt: opts.scheduledAt };

    if (!this.presence.isOnline()) {
      this.setLocal(tempUID, 'queued');
      this.queued.set(tempUID, { id, payload });
      return;
    }
    if (isNote || opts.statusAfter || opts.scheduledAt) {
      this.setLocal(tempUID, 'sending');
      await this.dispatch(id, tempUID, payload);
      return;
    }
    // Undo window (F-87): the message looks sent, the request leaves after 5 s unless "Undo" is pressed.
    this.setLocal(tempUID, 'sent');
    const timer = setTimeout(() => void this.commit(id, tempUID, payload), UNDO_MS);
    this.timers.set(tempUID, timer);
    this.pendingText.set(tempUID, { id, text: opts.text, mode: opts.mode });
    this.toast.show(this.i18n.t('msg.undo'), { actionLabel: this.i18n.t('common.undo'), action: () => this.undoSend(tempUID), duration: UNDO_MS });
  }

  private readonly queued = new Map<string, { id: string; payload: SendPayload }>();
  private readonly pendingText = new Map<string, { id: string; text: string; mode: ComposerMode }>();

  private undoSend(tempUID: string): void {
    const t = this.timers.get(tempUID);
    if (!t) return;
    clearTimeout(t);
    this.timers.delete(tempUID);
    const p = this.pendingText.get(tempUID);
    this.pendingText.delete(tempUID);
    this.raw.update((m) => m.filter((x) => (x.attributes?.tempUID ?? x._id) !== tempUID));
    if (p) this.drafts.set(p.id, p.mode, p.text);
    this.dropLocal(tempUID);
  }

  private async commit(id: string, tempUID: string, payload: SendPayload): Promise<void> {
    this.timers.delete(tempUID);
    this.pendingText.delete(tempUID);
    await this.dispatch(id, tempUID, payload);
  }

  /** Switching conversation or going offline must not lose a message that is inside its undo window. */
  private flushUndoWindow(): void {
    for (const [tempUID, t] of this.timers) {
      clearTimeout(t);
      this.timers.delete(tempUID);
    }
  }

  private async dispatch(id: string, tempUID: string, payload: SendPayload): Promise<void> {
    try {
      const saved = await firstValueFrom(this.api.sendMessage(id, payload));
      if (this.openedId === id) this.raw.update((m) => m.map((x) => ((x.attributes?.tempUID ?? x._id) === tempUID ? saved : x)));
      this.dropLocal(tempUID);
      const r = await firstValueFrom(this.api.getRequest(id));
      this.conv.replace(r);
    } catch {
      this.setLocal(tempUID, 'failed');
    }
  }

  async retry(tempUID: string): Promise<void> {
    const m = this.raw().find((x) => (x.attributes?.tempUID ?? x._id) === tempUID);
    const id = this.conv.selectedId();
    if (!m || !id) return;
    this.setLocal(tempUID, 'sending');
    await this.dispatch(id, tempUID, { text: m.text, tempUID, subtype: m.attributes?.subtype === 'private' ? 'private' : undefined });
  }

  discard(tempUID: string): void {
    this.raw.update((m) => m.filter((x) => (x.attributes?.tempUID ?? x._id) !== tempUID));
    this.dropLocal(tempUID);
  }

  private async flushQueue(): Promise<void> {
    for (const [tempUID, q] of [...this.queued]) {
      this.queued.delete(tempUID);
      this.setLocal(tempUID, 'sending');
      // reconcile: if the server already has it (uncertain send), do not send again
      const existing = await firstValueFrom(this.api.listMessages(q.id));
      const already = existing.find((m) => m.attributes?.tempUID === tempUID);
      if (already) {
        this.raw.update((m) => m.map((x) => ((x.attributes?.tempUID ?? x._id) === tempUID ? already : x)));
        this.dropLocal(tempUID);
      } else await this.dispatch(q.id, tempUID, q.payload);
    }
  }

  private setLocal(id: string, s: LocalStatus): void {
    this.localStatus.update((l) => ({ ...l, [id]: s }));
  }
  private dropLocal(id: string): void {
    this.localStatus.update((l) => {
      const { [id]: _, ...rest } = l;
      return rest;
    });
  }

  // ------------------------------------------------------------ per-message actions (F-66 .. F-74)
  quote(m: MessageVM): void {
    this.quoting.set(m);
  }

  jump(id: string): void {
    this.scrollTarget.set({ id, nonce: Date.now() });
    this.highlight.set(id);
    setTimeout(() => this.highlight.set(null), 1600);
  }

  async translate(m: MessageVM): Promise<void> {
    const cur = this.translations()[m.id];
    if (cur?.state === 'done') {
      this.translations.update((t) => ({ ...t, [m.id]: { ...cur, shown: !cur.shown } }));
      return;
    }
    if (m.suggestedTranslation) return void this.translations.update((t) => ({ ...t, [m.id]: { state: 'done', text: m.suggestedTranslation, shown: true } }));
    this.translations.update((t) => ({ ...t, [m.id]: { state: 'loading', shown: true } }));
    try {
      const text = await firstValueFrom(this.api.translate(m.text, this.i18n.lang() === 'ar' ? 'ar' : 'en'));
      this.translations.update((t) => ({ ...t, [m.id]: { state: 'done', text, shown: true } }));
    } catch {
      this.translations.update((t) => ({ ...t, [m.id]: { state: 'error', shown: true } }));
    }
  }

  async deleteMessage(m: MessageVM): Promise<void> {
    const id = this.conv.selectedId();
    if (!id) return;
    await firstValueFrom(this.api.command(id, { type: 'deleteMessage', messageId: m.id }));
    this.raw.update((l) => l.map((x) => (x._id === m.id ? { ...x, attributes: { ...x.attributes, tarashli_deleted: true } } : x)));
  }

  async flagBotReply(m: MessageVM, reason: string): Promise<void> {
    const id = this.conv.selectedId();
    if (!id) return;
    await firstValueFrom(this.api.command(id, { type: 'flagBotReply', messageId: m.id, reason }));
    this.raw.update((l) => l.map((x) => (x._id === m.id ? { ...x, attributes: { ...x.attributes, tarashli_flagged: true } } : x)));
  }

  unflag(m: MessageVM): void {
    this.raw.update((l) => l.map((x) => (x._id === m.id ? { ...x, attributes: { ...x.attributes, tarashli_flagged: false } } : x)));
  }

  // ------------------------------------------------------------ real time
  private onEvent(e: RealtimeEvent): void {
    if (e.type !== 'message.created' || e.requestId !== this.openedId) return;
    const key = e.message.attributes?.tempUID ?? e.message._id;
    // dedupe: the optimistic message and the server echo are the same message
    if (this.raw().some((m) => m._id === e.message._id || (m.attributes?.tempUID ?? m._id) === key)) return;
    this.raw.update((m) => [...m, e.message]);
    if (!e.message.attributes?.subtype && e.message.sender !== this.dir.meId()) void this.conv.exec(e.requestId, { type: 'markUnread', unread: false }, true);
  }
}
