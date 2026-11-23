import { computed, signal } from '../../core/signals';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from '../../core/rxjs-compat';
import { toConversationVM } from '../mappers/conversation.mapper';
import { MapContext } from '../mappers/map-context';
import { FilterRow, SortKey, TD_STATUS, TdLead, TdPriority, TdRequest, TdTag } from '../models/tiledesk.models';
import { ConversationVM, ListQuery, Priority, QuickChip, StatusTab, ViewCounts, ViewId } from '../models/view-models';
import { ClockService } from '../services/clock.service';
import { I18nService } from '../services/i18n.service';
import { AssignTarget, InboxApi, NewTicket, RealtimeEvent, RequestCommand } from '../services/inbox-api';
import { FormatService } from '../services/format.service';
import { HoursService } from '../services/hours.service';
import { ToastService } from '../services/toast.service';
import { isUntilReply } from '../util/snooze';
import { normalizeArabic } from '../util/text';
import { DirectoryStore } from './directory.store';
import { DraftStore } from './draft.store';

export type BulkAction =
  | { type: 'resolve' }
  | { type: 'pending' }
  | { type: 'snooze'; until: string }
  | { type: 'priority'; value: TdPriority }
  | { type: 'assign'; target: AssignTarget }
  | { type: 'addLabel'; label: string }
  | { type: 'removeLabel'; label: string }
  | { type: 'unread' };

export interface BulkSimulation {
  action: BulkAction;
  applicable: string[];
  warnings: { id: string; reason: 'bot_held' | 'colleague' }[];
  refused: { id: string; reason: 'no_permission' | 'already_resolved' }[];
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
const OPEN_KINDS = new Set(['bot', 'human', 'waiting_human']);
const PAGE_SIZE = 10;
const SORT_KEY = 'monitor-v2.sort';

/**
 * Owns the conversation list: raw Tiledesk requests, the active view / tabs / chips / filters / sort, selection,
 * bulk actions and real-time updates. Components read computed signals and call methods; they never call the API.
 */
@Injectable()
export class ConversationStore {
  private readonly api = inject(InboxApi);
  private readonly dir = inject(DirectoryStore);
  private readonly drafts = inject(DraftStore);
  private readonly clock = inject(ClockService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly fmt = inject(FormatService);
  private readonly hours = inject(HoursService);

  // ---- raw state
  readonly requests = signal<TdRequest[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loadingMore = signal(false);
  readonly selectedId = signal<string | null>(null);
  readonly checked = signal<ReadonlySet<string>>(new Set());
  readonly presence = signal<Map<string, { online: boolean; lastSeen?: Date; typing?: boolean }>>(new Map());
  readonly pendingNew = signal(0);
  readonly listScrolled = signal(false);
  /** Conversations whose take-over / assignment is awaiting the server ("Transfer in progress", 13.6) */
  readonly transitioning = signal<ReadonlySet<string>>(new Set());
  readonly bulkProgress = signal<{ done: number; total: number } | null>(null);
  readonly liveTyping = signal<Record<string, { customer?: boolean; bot?: boolean; agentId?: string }>>({});

  // ---- query state
  readonly view = signal<ViewId>('all');
  readonly statusTab = signal<StatusTab>('open');
  readonly quick = signal<ReadonlySet<QuickChip>>(new Set());
  readonly rows = signal<FilterRow[]>([]);
  readonly conjunction = signal<'and' | 'or'>('and');
  readonly search = signal('');
  private readonly sortByView = signal<Record<string, SortKey>>(this.loadSort());

  readonly sort = computed<SortKey>(() => this.sortByView()[this.view()] ?? (this.view() === 'waiting' ? 'longest_wait' : 'last_activity'));
  readonly query = computed<ListQuery>(() => ({ view: this.view(), status: this.statusTab(), quick: [...this.quick()], rows: this.rows(), conjunction: this.conjunction(), search: this.search(), sort: this.sort() }));

  // ---- derived
  readonly mapContext = computed<MapContext>(() => ({
    now: this.clock.now(),
    meId: this.dir.meId(),
    agents: this.dir.agentsById(),
    bots: this.dir.botsById(),
    labels: this.dir.labelsByName(),
    presence: this.presence(),
    slaPause: this.hours.status().prayer ? 'prayer' : this.hours.status().open ? undefined : 'closed_hours',
  }));

  readonly all = computed<ConversationVM[]>(() => {
    const ctx = this.mapContext();
    const drafts = this.drafts.drafts();
    return this.requests().map((r) => toConversationVM(r, ctx, drafts[r.request_id]?.reply || undefined));
  });
  readonly byId = computed(() => new Map(this.all().map((c) => [c.id, c])));
  readonly selected = computed(() => (this.selectedId() ? (this.byId().get(this.selectedId()!) ?? null) : null));

  /** Conversations of the active view, before the status tab. */
  private readonly inView = computed(() => {
    const view = this.view();
    const savedViews = this.dir.savedViews();
    return this.all().filter((c) => this.matchView(c, view, savedViews.find((v) => `saved:${v._id}` === view)));
  });

  readonly statusCounts = computed<Record<StatusTab, number>>(() => {
    const base = this.applyChipsRowsSearch(this.inView());
    const n = (tab: StatusTab) => base.filter((c) => this.matchTab(c, tab)).length;
    return { open: n('open'), pending: n('pending'), snoozed: n('snoozed'), resolved: n('resolved'), all: base.length };
  });

  readonly visible = computed<ConversationVM[]>(() => {
    const items = this.applyChipsRowsSearch(this.inView()).filter((c) => this.matchTab(c, this.statusTab()));
    return this.sortItems(items, this.sort());
  });

  readonly hasActiveFilters = computed(() => this.quick().size > 0 || this.rows().length > 0 || this.search().trim().length > 0);

  readonly counts = computed<ViewCounts>(() => {
    const all = this.all();
    const open = (c: ConversationVM) => c.state !== 'closed' && c.state !== 'abandoned';
    const out: ViewCounts = {
      mine: all.filter((c) => c.agents.some((a) => a.isMe) && open(c)).length,
      waiting: all.filter((c) => c.state === 'waiting_human').length,
      bot: all.filter((c) => c.state === 'bot').length,
      all: all.filter(open).length,
      mentions: all.filter((c) => c.mentionsMe).length,
    };
    for (const c of all.filter(open)) {
      out[`channel:${c.channel.kind}`] = (out[`channel:${c.channel.kind}`] ?? 0) + 1;
      if (c.department) out[`dept:${c.department.id}`] = (out[`dept:${c.department.id}`] ?? 0) + 1;
      for (const l of c.labels) out[`label:${l.id}`] = (out[`label:${l.id}`] ?? 0) + 1;
    }
    for (const team of this.dir.teams()) out[`team:${team._id}`] = all.filter((c) => open(c) && c.agents.some((a) => team.members.includes(a.id))).length;
    for (const v of this.dir.savedViews()) out[`saved:${v._id}`] = all.filter((c) => open(c) && this.matchView(c, `saved:${v._id}`, v)).length;
    return out;
  });
  /** A human wait is beyond its SLA → the "Waiting for human" counter turns red (and only then). */
  readonly waitingBreached = computed(() => this.all().some((c) => c.state === 'waiting_human' && c.sla?.level === 'breached'));
  readonly selectedIndex = computed(() => this.visible().findIndex((c) => c.id === this.selectedId()));

  /** Channels present in the data: other channels than web are shown only when connected. */
  readonly connectedChannels = computed(() => [...new Set(this.all().map((c) => c.channel.kind))]);

  constructor() {
    this.api.events$.subscribe((e) => this.onEvent(e));
  }

  // ------------------------------------------------------------ loading
  async load(): Promise<void> {
    this.status.set('loading');
    try {
      const res = await firstValueFrom(this.api.listRequests(1, PAGE_SIZE));
      this.requests.set(res.requests);
      this.total.set(res.count);
      this.page.set(1);
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  get hasMore(): boolean {
    return this.requests().length < this.total();
  }

  async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore) return;
    this.loadingMore.set(true);
    try {
      const res = await firstValueFrom(this.api.listRequests(this.page() + 1, PAGE_SIZE));
      const known = new Set(this.requests().map((r) => r.request_id));
      this.requests.update((r) => [...r, ...res.requests.filter((x) => !known.has(x.request_id))]);
      this.total.set(res.count);
      this.page.update((p) => p + 1);
    } finally {
      this.loadingMore.set(false);
    }
  }

  // ------------------------------------------------------------ query setters
  setView(view: ViewId): void {
    this.view.set(view);
    this.statusTab.set('open');
    this.clearChecked();
  }
  setTab(tab: StatusTab): void {
    this.statusTab.set(tab);
  }
  toggleQuick(chip: QuickChip): void {
    this.quick.update((q) => {
      const next = new Set(q);
      next.has(chip) ? next.delete(chip) : next.add(chip);
      return next;
    });
  }
  setFilters(rows: FilterRow[], conjunction: 'and' | 'or'): void {
    this.rows.set(rows);
    this.conjunction.set(conjunction);
  }
  clearFilters(): void {
    this.quick.set(new Set());
    this.rows.set([]);
    this.search.set('');
  }
  setSort(sort: SortKey): void {
    this.sortByView.update((s) => ({ ...s, [this.view()]: sort }));
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(this.sortByView()));
    } catch {
      /* storage unavailable */
    }
  }

  // ------------------------------------------------------------ selection
  select(id: string | null): void {
    this.selectedId.set(id);
    const c = id ? this.byId().get(id) : null;
    if (c && (c.unread > 0 || c.mentionsMe)) void this.exec(id!, { type: 'markUnread', unread: false }, true);
  }

  next(): string | null {
    return this.step(1);
  }
  prev(): string | null {
    return this.step(-1);
  }
  private step(dir: 1 | -1): string | null {
    const v = this.visible();
    if (!v.length) return null;
    const i = this.selectedIndex();
    const j = i < 0 ? (dir === 1 ? 0 : v.length - 1) : Math.min(v.length - 1, Math.max(0, i + dir));
    return v[j]!.id;
  }

  private lastChecked: string | null = null;
  toggleCheck(id: string, shift = false): void {
    const v = this.visible();
    this.checked.update((s) => {
      const next = new Set(s);
      if (shift && this.lastChecked) {
        const a = v.findIndex((c) => c.id === this.lastChecked);
        const b = v.findIndex((c) => c.id === id);
        if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(v[i]!.id);
      } else next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    this.lastChecked = id;
  }
  selectAll(): void {
    this.checked.set(new Set(this.visible().map((c) => c.id)));
  }
  clearChecked(): void {
    this.checked.set(new Set());
    this.lastChecked = null;
  }

  // ------------------------------------------------------------ single-conversation actions
  /**
   * Runs a command and replaces the request with the server answer. `optimistic` patches the list first, so the UI
   * answers at once; a failure restores the previous state and shows an error toast.
   */
  async exec(id: string, cmd: RequestCommand, silent = false): Promise<boolean> {
    const before = this.requests().find((r) => r.request_id === id);
    if (!before) return false;
    const slow = cmd.type === 'takeOver' || cmd.type === 'assign' || cmd.type === 'handBack';
    if (slow) this.transitioning.update((s) => new Set(s).add(id));
    else this.optimistic(id, cmd);
    try {
      const updated = await firstValueFrom(this.api.command(id, cmd));
      this.replace(updated);
      return true;
    } catch (err) {
      this.replace(before);
      if (!silent) this.toast.show(this.i18n.t((err as { readOnly?: boolean })?.readOnly ? 'app.readOnly' : this.permissionDenied(err) ? 'app.forbiddenAction' : 'app.error'), { kind: 'error' });
      return false;
    } finally {
      if (slow)
        this.transitioning.update((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
    }
  }

  private permissionDenied(err: unknown): boolean {
    return (err as { status?: number })?.status === 403;
  }

  private optimistic(id: string, cmd: RequestCommand): void {
    this.requests.update((list) =>
      list.map((r) => {
        if (r.request_id !== id) return r;
        const c: TdRequest = { ...r, attributes: { ...r.attributes, tarashli: { ...r.attributes.tarashli } } };
        const ext = c.attributes.tarashli!;
        switch (cmd.type) {
          case 'close': c.status = TD_STATUS.CLOSED; ext.snoozed_until = undefined; break;
          case 'reopen': c.status = TD_STATUS.ASSIGNED; ext.snoozed_until = undefined; c.workingStatus = 'open'; break;
          case 'pending': c.workingStatus = 'pending'; break;
          case 'snooze': ext.snoozed_until = cmd.until ?? undefined; break;
          case 'priority': c.priority = cmd.value; break;
          case 'tags': c.tags = cmd.tags; break;
          case 'markUnread': ext.unread = cmd.unread ? 1 : 0; if (!cmd.unread) ext.mentions_me = false; break;
        }
        return c;
      }),
    );
  }

  replace(updated: TdRequest): void {
    this.requests.update((list) => {
      const i = list.findIndex((r) => r.request_id === updated.request_id);
      if (i < 0) return [updated, ...list];
      const copy = [...list];
      copy[i] = updated;
      return copy;
    });
  }

  /** Resolves, then offers "Undo" (reopens). With `goNext` returns the id of the neighbour to open (Shift+E). */
  async resolve(id: string, goNext = false): Promise<string | null> {
    const nextId = goNext ? this.nextAfter(id) : null;
    const ticket = this.byId().get(id)?.ticket;
    const ok = await this.exec(id, { type: 'close' });
    if (ok) this.toast.show(this.i18n.t('toast.resolved', { n: ticket ?? '' }), { kind: 'success', actionLabel: this.i18n.t('common.undo'), action: () => void this.exec(id, { type: 'reopen' }, true), duration: 6000 });
    return nextId;
  }
  private nextAfter(id: string): string | null {
    const v = this.visible();
    const i = v.findIndex((c) => c.id === id);
    return v[i + 1]?.id ?? v[i - 1]?.id ?? null;
  }

  /** Snooze until a preset or a date; the toast shows the wake-up time and "Undo". */
  async snooze(id: string, until: Date): Promise<void> {
    const ok = await this.exec(id, { type: 'snooze', until: until.toISOString() });
    if (!ok) return;
    const label = isUntilReply(until) ? this.i18n.t('snooze.untilReply') : this.fmt.dateTime(until);
    this.toast.show(this.i18n.t('toast.snoozed', { when: label }), { kind: 'success', actionLabel: this.i18n.t('common.undo'), action: () => void this.exec(id, { type: 'snooze', until: null }, true), duration: 6000 });
  }

  async unsnooze(id: string): Promise<void> {
    await this.exec(id, { type: 'snooze', until: null });
  }

  /** Permanent delete (admin only, confirmation with the ticket number is asked by the caller). */
  async delete(id: string): Promise<void> {
    await firstValueFrom(this.api.command(id, { type: 'delete' }));
    this.requests.update((l) => l.filter((r) => r.request_id !== id));
    if (this.selectedId() === id) this.selectedId.set(null);
  }

  /** Edits the contact (name, e-mail, phone, company, address, custom properties) and refreshes the conversation. */
  async updateLead(c: ConversationVM, patch: Partial<TdLead>): Promise<boolean> {
    try {
      await firstValueFrom(this.api.updateLead(c.customer.id, patch));
      this.requests.update((list) => list.map((r) => (r.lead.lead_id === c.customer.id ? { ...r, lead: { ...r.lead, ...patch, attributes: { ...r.lead.attributes, ...patch.attributes } } } : r)));
      return true;
    } catch {
      this.toast.show(this.i18n.t('app.error'), { kind: 'error' });
      return false;
    }
  }

  /** Earlier conversations of the same visitor (F-103). */
  history(leadId: string): Promise<TdRequest[]> {
    return firstValueFrom(this.api.listLeadRequests(leadId));
  }

  /** Create ticket (F-116): returns the new request id. */
  async createTicket(t: NewTicket): Promise<string> {
    const r = await firstValueFrom(this.api.createTicket(t));
    this.replace(r);
    return r.request_id;
  }

  async takeOver(id: string): Promise<void> {
    const ok = await this.exec(id, { type: 'takeOver' });
    if (ok) this.toast.show(this.i18n.t('toast.takeover'), { kind: 'success' });
  }
  async setPriority(id: string, value: Priority): Promise<void> {
    await this.exec(id, { type: 'priority', value: value === 'none' ? 'medium' : value });
  }
  async setLabels(id: string, tags: TdTag[]): Promise<void> {
    await this.exec(id, { type: 'tags', tags });
  }

  // ------------------------------------------------------------ bulk (F-29, F-150)
  /** Dry run: which of the selected conversations the action can really be applied to (F-150). */
  simulate(ids: string[], action: BulkAction): BulkSimulation {
    const sim: BulkSimulation = { action, applicable: [], warnings: [], refused: [] };
    for (const id of ids) {
      const c = this.byId().get(id);
      if (!c) continue;
      if (action.type === 'resolve' && c.state === 'closed') sim.refused.push({ id, reason: 'already_resolved' });
      else if (this.notMine(c) && ['resolve', 'pending', 'snooze'].includes(action.type) && this.dir.me()?.role === 'agent') sim.refused.push({ id, reason: 'no_permission' });
      else if (c.state === 'bot' && action.type === 'resolve') {
        sim.warnings.push({ id, reason: 'bot_held' });
        sim.applicable.push(id);
      } else sim.applicable.push(id);
    }
    return sim;
  }
  private notMine(c: ConversationVM): boolean {
    return c.agents.length > 0 && !c.agents.some((a) => a.isMe);
  }

  /** Runs the action on `ids` one by one, reports partial success, and offers a 10 s undo. */
  async bulk(ids: string[], action: BulkAction): Promise<void> {
    const snapshot = new Map(this.requests().filter((r) => ids.includes(r.request_id)).map((r) => [r.request_id, structuredClone(r)]));
    this.bulkProgress.set({ done: 0, total: ids.length });
    const failed: string[] = [];
    let done = 0;
    for (const id of ids) {
      const c = this.byId().get(id);
      const ok = c && this.permitted(c, action) && (await this.exec(id, this.toCommand(c, action), true));
      if (!ok) failed.push(id);
      this.bulkProgress.set({ done: ++done, total: ids.length });
    }
    this.bulkProgress.set(null);
    this.clearChecked();
    const okCount = ids.length - failed.length;
    if (failed.length) {
      this.toast.show(this.i18n.t('bulk.partial', { done: okCount, total: ids.length }), {
        kind: 'warn',
        details: failed.map((id) => `#${this.byId().get(id)?.ticket ?? id} — ${this.i18n.t('bulk.reason.no_permission')}`),
        actionLabel: this.i18n.t('bulk.retryFailed'),
        action: () => void this.bulk(failed, action),
        duration: 10000,
      });
    } else {
      this.toast.show(this.i18n.t('bulk.done', { n: okCount }), { kind: 'success', actionLabel: this.i18n.t('common.undo'), action: () => void this.undo(snapshot, action), duration: 10000 });
    }
  }

  private permitted(c: ConversationVM, action: BulkAction): boolean {
    if (action.type === 'resolve' && c.state === 'closed') return false;
    return !(this.notMine(c) && ['resolve', 'pending', 'snooze'].includes(action.type) && this.dir.me()?.role === 'agent');
  }

  private toCommand(c: ConversationVM, a: BulkAction): RequestCommand {
    switch (a.type) {
      case 'resolve': return { type: 'close' };
      case 'pending': return { type: 'pending' };
      case 'snooze': return { type: 'snooze', until: a.until };
      case 'priority': return { type: 'priority', value: a.value };
      case 'assign': return { type: 'assign', target: a.target };
      case 'unread': return { type: 'markUnread', unread: true };
      case 'addLabel': return { type: 'tags', tags: [...c.raw.tags.filter((t) => t.tag !== a.label), { tag: a.label, color: 'neutral' }] };
      case 'removeLabel': return { type: 'tags', tags: c.raw.tags.filter((t) => t.tag !== a.label) };
    }
  }

  private async undo(snapshot: Map<string, TdRequest>, action: BulkAction): Promise<void> {
    for (const [id, before] of snapshot) {
      switch (action.type) {
        case 'resolve':
        case 'pending':
        case 'snooze':
          await this.exec(id, action.type === 'snooze' ? { type: 'snooze', until: null } : { type: 'reopen' }, true);
          break;
        case 'priority':
          await this.exec(id, { type: 'priority', value: before.priority }, true);
          break;
        case 'addLabel':
        case 'removeLabel':
          await this.exec(id, { type: 'tags', tags: before.tags }, true);
          break;
        case 'assign': {
          const prevAgent = before.participantsAgents[0];
          const prevBot = before.participantsBots[0];
          if (prevAgent) await this.exec(id, { type: 'assign', target: { kind: 'agent', id: prevAgent } }, true);
          else if (prevBot) await this.exec(id, { type: 'assign', target: { kind: 'bot', id: prevBot } }, true);
          break;
        }
        case 'unread':
          await this.exec(id, { type: 'markUnread', unread: false }, true);
      }
    }
  }

  // ------------------------------------------------------------ real time
  private onEvent(e: RealtimeEvent): void {
    switch (e.type) {
      case 'request.created':
        this.replace(e.request);
        if (this.listScrolled()) this.pendingNew.update((n) => n + 1);
        break;
      case 'request.updated':
        this.replace(e.request);
        break;
      case 'message.created': {
        // a customer reply lifts a snooze (document 13.6); one alert only
        const r = this.requests().find((x) => x.request_id === e.requestId);
        if (r?.attributes.tarashli?.snoozed_until && e.message.sender === r.lead.lead_id) void this.exec(r.request_id, { type: 'snooze', until: null }, true);
        break;
      }
      case 'presence':
        this.presence.update((m) => new Map(m).set(e.leadId, { ...m.get(e.leadId), online: e.online, lastSeen: e.lastSeen ? new Date(e.lastSeen) : undefined }));
        break;
      case 'typing': {
        this.liveTyping.update((t) => ({ ...t, [e.requestId]: { ...t[e.requestId], [e.who]: e.active, agentId: e.agentId } }));
        if (e.who === 'customer') {
          const lead = this.requests().find((r) => r.request_id === e.requestId)?.lead.lead_id;
          if (lead) this.presence.update((m) => new Map(m).set(lead, { online: true, ...m.get(lead), typing: e.active }));
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ filtering helpers
  private matchView(c: ConversationVM, view: ViewId, saved?: { filters: FilterRow[]; conjunction: 'and' | 'or' }): boolean {
    if (view === 'all') return true;
    if (view === 'mine') return c.agents.some((a) => a.isMe);
    if (view === 'waiting') return c.state === 'waiting_human';
    if (view === 'bot') return c.state === 'bot';
    if (view === 'mentions') return c.mentionsMe;
    const [kind, id] = [view.slice(0, view.indexOf(':')), view.slice(view.indexOf(':') + 1)];
    switch (kind) {
      case 'channel': return c.channel.kind === id;
      case 'dept': return c.department?.id === id;
      case 'label': return c.labels.some((l) => l.id === id);
      case 'team': return c.agents.some((a) => this.dir.teams().find((t) => t._id === id)?.members.includes(a.id));
      case 'saved': return saved ? this.matchRows(c, saved.filters, saved.conjunction) : false;
    }
    return true;
  }

  private matchTab(c: ConversationVM, tab: StatusTab): boolean {
    switch (tab) {
      case 'open': return OPEN_KINDS.has(c.state);
      case 'pending': return c.state === 'customer_pending';
      case 'snoozed': return c.state === 'snoozed';
      case 'resolved': return c.state === 'closed' || c.state === 'abandoned';
      case 'all': return true;
    }
  }

  private applyChipsRowsSearch(list: ConversationVM[]): ConversationVM[] {
    const quick = this.quick();
    const now = this.clock.now().getTime();
    let out = list;
    if (quick.size)
      out = out.filter((c) =>
        [...quick].every((q) => {
          switch (q) {
            case 'unread': return c.unread > 0;
            case 'bot': return c.state === 'bot';
            case 'waiting': return c.state === 'waiting_human';
            case 'high': return c.priority === 'high' || c.priority === 'urgent';
            case 'window': return !!c.window && c.window.expiresAt.getTime() - now < 3_600_000 && c.window.level !== 'closed';
          }
        }),
      );
    if (this.rows().length) out = out.filter((c) => this.matchRows(c, this.rows(), this.conjunction()));
    const q = this.search().trim();
    if (q) {
      const ticket = /^#?(\d+)$/.exec(q);
      const needle = normalizeArabic(q);
      out = out.filter((c) => {
        if (ticket && String(c.ticket).includes(ticket[1]!)) return true;
        const hay = normalizeArabic([this.i18n.customerName(c.customer), c.customer.name, c.lastMessage?.text ?? '', c.subject ?? '', c.customer.email ?? '', c.customer.phone ?? ''].join(' '));
        return hay.includes(needle);
      });
    }
    return out;
  }

  private matchRows(c: ConversationVM, rows: FilterRow[], conj: 'and' | 'or'): boolean {
    if (!rows.length) return true;
    const results = rows.filter((r) => r.values.length || r.operator === 'contains').map((r) => this.matchRow(c, r));
    if (!results.length) return true;
    return conj === 'and' ? results.every(Boolean) : results.some(Boolean);
  }

  private matchRow(c: ConversationVM, row: FilterRow): boolean {
    const vals = row.values;
    let hit = false;
    switch (row.attribute) {
      case 'status': hit = vals.includes(c.state === 'closed' ? 'resolved' : c.state === 'customer_pending' ? 'pending' : c.state === 'abandoned' ? 'resolved' : c.state === 'snoozed' ? 'snoozed' : 'open'); break;
      case 'priority': hit = vals.includes(c.priority); break;
      case 'assignee': hit = c.agents.some((a) => vals.includes(a.id) || (vals.includes('me') && a.isMe)) || (vals.includes('none') && c.agents.length === 0); break;
      case 'actor': hit = vals.includes(c.state === 'bot' ? 'bot' : c.state === 'waiting_human' ? 'waiting' : 'human'); break;
      case 'department': hit = !!c.department && vals.includes(c.department.id); break;
      case 'team': hit = c.agents.some((a) => vals.some((tid) => this.dir.teams().find((t) => t._id === tid)?.members.includes(a.id))); break;
      case 'channel': hit = vals.includes(c.channel.kind); break;
      case 'label': hit = c.labels.some((l) => vals.includes(l.id)); break;
      case 'language': hit = !!c.customer.language && vals.includes(c.customer.language); break;
      case 'country': hit = !!c.customer.country && vals.includes(c.customer.country); break;
      case 'created': {
        const days = Number(vals[0] ?? 0);
        const age = (this.clock.now().getTime() - c.createdAt.getTime()) / 86_400_000;
        hit = row.operator === 'before' ? age > days : age <= days;
        return hit;
      }
    }
    return row.operator === 'is_not' ? !hit : hit;
  }

  private sortItems(items: ConversationVM[], sort: SortKey): ConversationVM[] {
    const act = (c: ConversationVM) => (c.lastMessage?.at ?? c.updatedAt).getTime();
    const copy = [...items];
    switch (sort) {
      case 'created': return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'unread': return copy.sort((a, b) => b.unread - a.unread || act(b) - act(a));
      case 'priority': return copy.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || act(b) - act(a));
      case 'longest_wait': return copy.sort((a, b) => (a.waitingSince?.getTime() ?? Infinity) - (b.waitingSince?.getTime() ?? Infinity) || act(b) - act(a));
      case 'sla': return copy.sort((a, b) => (a.sla && !a.sla.paused ? a.sla.dueAt.getTime() : Infinity) - (b.sla && !b.sla.paused ? b.sla.dueAt.getTime() : Infinity) || act(b) - act(a));
      default: return copy.sort((a, b) => act(b) - act(a));
    }
  }

  private loadSort(): Record<string, SortKey> {
    try {
      return JSON.parse(localStorage.getItem(SORT_KEY) ?? '{}') as Record<string, SortKey>;
    } catch {
      return {};
    }
  }
}
