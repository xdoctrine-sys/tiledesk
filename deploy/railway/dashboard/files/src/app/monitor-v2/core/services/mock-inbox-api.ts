import { Injectable } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  HandoffReason,
  TD_STATUS,
  TdBot,
  TdCannedResponse,
  TdDepartment,
  TdEventKey,
  TdHours,
  TdLabelDef,
  TdLead,
  TdMessage,
  TdProjectUser,
  TdRequest,
  TdSavedView,
  TdTeam,
} from '../models/tiledesk.models';
import { BotStepVM, TakeoverBriefVM } from '../models/view-models';
import { uid } from '../util/text';
import { AiAction, InboxApi, NewTicket, RealtimeEvent, RequestCommand, RequestPage, SendPayload } from './inbox-api';
import { MockData, buildMockData } from './mock-data';

/** Query-string switches (see DemoStateService). */
export interface MockOptions {
  whatsapp: boolean;
  latencyMs: number;
  /** `list` = the list request never answers well (error state); `loading` = never resolves */
  listMode: 'ok' | 'empty' | 'error' | 'loading';
  script: boolean;
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory implementation of InboxApi. Behaves like a small server: commands mutate the data, create the same system
 * events Tiledesk would create, and push them on `events$` (real time). A few scripted events (bot typing, a new
 * conversation) show the live behaviours of document section 13.6.
 */
@Injectable()
export class MockInboxApi extends InboxApi {
  readonly events$: Observable<RealtimeEvent>;
  private readonly bus = new Subject<RealtimeEvent>();
  private data!: MockData;
  private opts: MockOptions = { whatsapp: false, latencyMs: 160, listMode: 'ok', script: true };
  private online = true;
  private failNext = new Set<string>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private started = false;

  constructor() {
    super();
    this.events$ = this.bus.asObservable();
    this.data = buildMockData(new Date(), { whatsapp: false });
  }

  /** Called once by DemoStateService before the first request. */
  configure(opts: Partial<MockOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.data = buildMockData(new Date(), { whatsapp: this.opts.whatsapp });
  }

  /** Switch the fake socket (demo: ?state=offline). */
  setConnection(online: boolean): void {
    this.online = online;
    this.bus.next({ type: 'connection', status: online ? 'online' : 'offline' });
  }

  reconnect(): void {
    this.after(900, () => this.setConnection(true));
  }

  private lat<T>(value: T, ms = this.opts.latencyMs): Observable<T> {
    return of(clone(value)).pipe(delay(ms));
  }
  private after(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  // ------------------------------------------------ directory
  me(): Observable<TdProjectUser> {
    this.startScript();
    return this.lat(this.data.agents.find((a) => a._id === this.data.meId)!);
  }
  listAgents(): Observable<TdProjectUser[]> {
    return this.lat(this.data.agents);
  }
  listBots(): Observable<TdBot[]> {
    return this.lat(this.data.bots);
  }
  listDepartments(): Observable<TdDepartment[]> {
    return this.lat(this.data.departments);
  }
  listTeams(): Observable<TdTeam[]> {
    return this.lat(this.data.teams);
  }
  listLabels(): Observable<TdLabelDef[]> {
    return this.lat(this.data.labels);
  }
  listCanned(): Observable<TdCannedResponse[]> {
    return this.lat(this.data.canned);
  }
  listSavedViews(): Observable<TdSavedView[]> {
    return this.lat(this.data.savedViews);
  }
  saveView(view: Omit<TdSavedView, '_id' | 'owner'>): Observable<TdSavedView> {
    const v: TdSavedView = { ...view, _id: uid('sv'), owner: this.data.meId };
    this.data.savedViews.push(v);
    return this.lat(v);
  }
  projectName(): Observable<string | null> {
    return of(null);
  }
  getHours(): Observable<TdHours> {
    return this.lat(this.data.hours);
  }
  listBotSteps(botId: string): Observable<BotStepVM[]> {
    return this.lat(this.data.botSteps[botId] ?? this.data.botSteps['bot_assistant']!);
  }

  // ------------------------------------------------ conversations
  listRequests(page: number, perPage: number): Observable<RequestPage> {
    if (this.opts.listMode === 'error') return throwError(() => new Error('mock list error')).pipe(delay(400));
    if (this.opts.listMode === 'loading') return new Observable<RequestPage>(() => undefined);
    const all = this.opts.listMode === 'empty' ? [] : [...this.data.requests].filter((r) => r.status !== TD_STATUS.TEMP && !r.preflight);
    all.sort((a, b) => this.activity(b) - this.activity(a));
    const slice = all.slice((page - 1) * perPage, page * perPage);
    return this.lat({ requests: slice, count: all.length, perPage, page }, this.opts.latencyMs * 2);
  }
  private activity(r: TdRequest): number {
    return new Date(r.attributes.tarashli?.last_message?.createdAt ?? r.updatedAt).getTime();
  }
  private find(id: string): TdRequest | undefined {
    return this.data.requests.find((r) => r.request_id === id);
  }
  getRequest(requestId: string): Observable<TdRequest> {
    const r = this.find(requestId);
    return r ? this.lat(r) : throwError(() => ({ status: 404 })).pipe(delay(200));
  }
  listMessages(requestId: string): Observable<TdMessage[]> {
    return this.lat(this.data.messages[requestId] ?? []);
  }

  sendMessage(requestId: string, p: SendPayload): Observable<TdMessage> {
    const r = this.find(requestId);
    if (!r) return throwError(() => ({ status: 404 }));
    // Demo: a text containing "#fail" fails once, so the "Failed to send · Retry" state can be shown.
    if (p.text.includes('#fail') && !this.failNext.has(p.tempUID + p.text)) {
      this.failNext.add(p.tempUID + p.text);
      return throwError(() => new Error('mock send failure')).pipe(delay(700));
    }
    const me = this.data.agents.find((a) => a._id === this.data.meId)!;
    const isNote = p.subtype === 'private';
    // Replying from the queue takes the conversation over (document 9.3 "En attente d'un humain").
    if (!isNote && !r.participantsAgents.includes(me._id)) this.run(r, { type: 'takeOver' });
    const att = p.attachments?.[0];
    const msg: TdMessage = {
      _id: uid(`${requestId}_m`),
      sender: me._id,
      senderFullname: me.id_user.firstname,
      recipient: requestId,
      text: p.text,
      type: att ? (att.type.startsWith('image/') ? 'image' : att.type.startsWith('audio/') ? 'audio' : 'file') : 'text',
      metadata: att ? { name: att.name, type: att.type, size: att.size, src: att.src, duration: att.duration, waveform: att.waveform, transcript: att.transcript } : undefined,
      attributes: { tempUID: p.tempUID, subtype: isNote ? 'private' : undefined, tarashli_quoted: p.quotedId },
      status: 150,
      createdAt: new Date().toISOString(),
    };
    this.data.messages[requestId]!.push(msg);
    const ext = (r.attributes.tarashli ??= {});
    ext.last_message = { text: p.text || (att ? att.name : ''), sender: me._id, createdAt: msg.createdAt, isNote };
    ext.unread = 0;
    if (!isNote) {
      ext.waiting_since = undefined;
      if (r.workingStatus === 'pending') r.workingStatus = 'open';
    }
    if (p.statusAfter === 'resolved') this.run(r, { type: 'close' });
    else if (p.statusAfter === 'pending') this.run(r, { type: 'pending' });
    this.scriptedCustomerReply(r, isNote);
    return this.lat(msg, 350);
  }

  command(requestId: string, cmd: RequestCommand): Observable<TdRequest> {
    const r = this.find(requestId);
    if (!r) return throwError(() => ({ status: 404 }));
    if (!this.online) return throwError(() => new Error('offline')).pipe(delay(300));
    const me = this.data.agents.find((a) => a._id === this.data.meId)!;
    const heldByColleague = r.participantsAgents.length > 0 && !r.participantsAgents.includes(me._id);
    if (heldByColleague && me.role === 'agent' && ['close', 'pending', 'snooze'].includes(cmd.type)) return throwError(() => ({ status: 403 })).pipe(delay(250));
    this.run(r, cmd);
    return this.lat(r, 200);
  }

  /** Applies a command and creates the system events the server would create. */
  private run(r: TdRequest, cmd: RequestCommand): void {
    const rid = r.request_id;
    const me = this.data.meId;
    const ext = (r.attributes.tarashli ??= {});
    const emitEvent = (key: TdEventKey, params: Record<string, string> = {}, reason?: HandoffReason) => {
      const m: TdMessage = {
        _id: uid(`${rid}_e`), sender: 'system', senderFullname: 'System', recipient: rid, text: key, type: 'text', status: 200,
        attributes: { subtype: 'info', messagelabel: { key, parameters: params }, tarashli_reason: reason }, createdAt: new Date().toISOString(),
      };
      this.data.messages[rid]!.push(m);
      this.bus.next({ type: 'message.created', requestId: rid, message: clone(m) });
    };
    const leaveBots = () => {
      for (const b of r.participantsBots) emitEvent('MEMBER_LEFT_GROUP', { member_id: b });
      r.participantsBots = [];
    };
    const setAgents = (ids: string[]) => {
      for (const old of r.participantsAgents.filter((a) => !ids.includes(a))) emitEvent('MEMBER_LEFT_GROUP', { member_id: old });
      for (const id of ids.filter((a) => !r.participantsAgents.includes(a))) emitEvent('MEMBER_JOINED_GROUP', { member_id: id });
      r.participantsAgents = ids;
    };
    const sync = () => {
      r.participants = [...r.participantsBots, ...r.participantsAgents];
      r.participatingAgents = r.participantsAgents.map((id) => {
        const a = this.data.agents.find((x) => x._id === id)!;
        return { _id: a._id, id_user: a.id_user };
      });
      r.participatingBots = r.participantsBots.map((id) => this.data.bots.find((b) => `bot_${b._id}` === id)!).filter(Boolean);
      r.updatedAt = new Date().toISOString();
    };

    switch (cmd.type) {
      case 'close':
        r.status = TD_STATUS.CLOSED;
        r.closed_at = new Date().toISOString();
        r.closed_by = me;
        ext.snoozed_until = undefined;
        emitEvent('CHAT_CLOSED', { agent_id: me });
        break;
      case 'reopen':
        r.status = r.participantsAgents.length || r.participantsBots.length ? TD_STATUS.ASSIGNED : TD_STATUS.QUEUED;
        r.closed_at = undefined;
        r.workingStatus = 'open';
        ext.snoozed_until = undefined;
        if (r.status === TD_STATUS.QUEUED) ext.waiting_since = new Date().toISOString();
        emitEvent('CHAT_REOPENED');
        break;
      case 'pending':
        r.workingStatus = 'pending';
        emitEvent('TARASHLI_PENDING', { agent_id: me });
        break;
      case 'snooze':
        ext.snoozed_until = cmd.until ?? undefined;
        if (cmd.until) emitEvent('TARASHLI_SNOOZED', { agent_id: me, until: cmd.until });
        else emitEvent('CHAT_REOPENED');
        break;
      case 'priority':
        r.priority = cmd.value;
        break;
      case 'tags':
        r.tags = cmd.tags;
        break;
      case 'takeOver':
        leaveBots();
        setAgents([me]);
        r.status = TD_STATUS.ASSIGNED;
        r.workingStatus = 'open';
        ext.waiting_since = undefined;
        ext.unread = 0;
        break;
      case 'handBack': {
        const botId = r.department?.id_bot ? `bot_${r.department.id_bot}` : 'bot_assistant';
        setAgents([]);
        r.participantsBots = [botId];
        emitEvent('TARASHLI_HANDED_BACK', { agent_id: me, bot_id: botId });
        emitEvent('MEMBER_JOINED_GROUP', { member_id: botId });
        r.status = TD_STATUS.ASSIGNED;
        ext.waiting_since = undefined;
        break;
      }
      case 'assign': {
        const t = cmd.target;
        if (t.kind === 'agent') {
          leaveBots();
          setAgents([t.id]);
          r.status = TD_STATUS.ASSIGNED;
          ext.waiting_since = undefined;
        } else if (t.kind === 'bot') {
          setAgents([]);
          for (const b of r.participantsBots) emitEvent('MEMBER_LEFT_GROUP', { member_id: b });
          r.participantsBots = [t.id];
          emitEvent('MEMBER_JOINED_GROUP', { member_id: t.id });
          r.status = TD_STATUS.ASSIGNED;
        } else {
          const dept = this.data.departments.find((d) => d._id === t.id);
          if (t.kind === 'department' && dept) {
            r.department = dept;
            r.attributes.departmentId = dept._id;
            r.attributes.departmentName = dept.name;
          }
          leaveBots();
          setAgents([]);
          r.status = TD_STATUS.QUEUED;
          ext.waiting_since = new Date().toISOString();
        }
        if (cmd.note) {
          const m: TdMessage = { _id: uid(`${rid}_n`), sender: me, senderFullname: 'Sara', recipient: rid, text: cmd.note, type: 'text', status: 200, attributes: { subtype: 'private' }, createdAt: new Date().toISOString() };
          this.data.messages[rid]!.push(m);
          this.bus.next({ type: 'message.created', requestId: rid, message: clone(m) });
        }
        if (cmd.stayFollower && !r.followers.includes(me)) r.followers.push(me);
        break;
      }
      case 'addParticipant':
        if (!r.participantsAgents.includes(cmd.agentId)) setAgents([...r.participantsAgents, cmd.agentId]);
        break;
      case 'leave':
        setAgents(r.participantsAgents.filter((a) => a !== me));
        if (!r.participantsAgents.length && !r.participantsBots.length) {
          r.status = TD_STATUS.QUEUED;
          ext.waiting_since = new Date().toISOString();
        }
        break;
      case 'addNote':
        r.notes.push({ _id: uid('n'), text: cmd.text, createdBy: me, createdAt: new Date().toISOString() });
        break;
      case 'deleteNote':
        r.notes = r.notes.filter((n) => n._id !== cmd.id);
        break;
      case 'followers':
        r.followers = cmd.ids;
        break;
      case 'markUnread':
        ext.unread = cmd.unread ? Math.max(1, ext.unread ?? 0) : 0;
        if (!cmd.unread) ext.mentions_me = false;
        break;
      case 'ban':
        ext.blocked = true;
        break;
      case 'unban':
        ext.blocked = false;
        break;
      case 'offlineTicket':
        r.smartAssignment = false;
        break;
      case 'onlineTicket':
        r.smartAssignment = true;
        break;
      case 'delete':
        this.data.requests = this.data.requests.filter((x) => x.request_id !== rid);
        return;
      case 'flagBotReply': {
        const m = this.data.messages[rid]!.find((x) => x._id === cmd.messageId);
        if (m) (m.attributes ??= {}).tarashli_flagged = true;
        return;
      }
      case 'deleteMessage': {
        const m = this.data.messages[rid]!.find((x) => x._id === cmd.messageId);
        if (m) (m.attributes ??= {}).tarashli_deleted = true;
        return;
      }
      case 'requestPen':
        return;
    }
    sync();
  }

  createTicket(t: NewTicket): Observable<TdRequest> {
    const ticket = Math.max(...this.data.requests.map((r) => r.ticket_id)) + 1;
    const id = `support-group-r${ticket}`;
    const leadId = t.requester.leadId ?? uid('lead');
    const existing = this.data.requests.find((r) => r.lead.lead_id === leadId)?.lead;
    const lead: TdLead = existing ?? { _id: leadId, lead_id: leadId, fullname: t.requester.fullname ?? 'New requester', email: t.requester.email, phone: t.requester.phone, createdAt: new Date().toISOString() };
    const now = new Date().toISOString();
    const dept = t.assignee.kind === 'department' ? this.data.departments.find((d) => d._id === t.assignee.id) : this.data.departments[0];
    const isAgent = t.assignee.kind === 'agent';
    const isBot = t.assignee.kind === 'bot';
    const r: TdRequest = {
      _id: `req_${ticket}`, id: `req_${ticket}`, request_id: id, ticket_id: ticket,
      status: isAgent || isBot ? TD_STATUS.ASSIGNED : TD_STATUS.QUEUED, workingStatus: 'open', hasBot: isBot,
      participants: isAgent || isBot ? [t.assignee.id] : [], participantsAgents: isAgent ? [t.assignee.id] : [], participantsBots: isBot ? [t.assignee.id] : [],
      lead, first_text: t.message, subject: t.subject, department: dept, channel: { name: t.channel === 'form' ? 'chat21' : t.channel }, priority: t.priority, tags: t.tags,
      notes: [], followers: [], smartAssignment: false, attributes: { subtype: 'info', tarashli: { unread: 0, waiting_since: isAgent || isBot ? undefined : now, last_message: { text: t.message, sender: this.data.meId, createdAt: now } } },
      createdAt: now, updatedAt: now,
    };
    r.participatingAgents = r.participantsAgents.map((aid) => ({ _id: aid, id_user: this.data.agents.find((a) => a._id === aid)!.id_user }));
    this.data.requests.push(r);
    this.data.messages[id] = [
      { _id: uid('m'), sender: this.data.meId, senderFullname: 'Sara', recipient: id, text: t.message, type: 'text', status: 150, createdAt: now },
    ];
    return this.lat(r, 450);
  }

  // ------------------------------------------------ contact
  updateLead(leadId: string, patch: Partial<TdLead>): Observable<TdLead> {
    let out: TdLead | undefined;
    for (const r of this.data.requests) {
      if (r.lead.lead_id === leadId) {
        r.lead = { ...r.lead, ...patch, attributes: { ...r.lead.attributes, ...patch.attributes } };
        out = r.lead;
      }
    }
    return out ? this.lat(out, 120) : throwError(() => ({ status: 404 }));
  }
  listLeadRequests(leadId: string): Observable<TdRequest[]> {
    const own = this.data.requests.filter((r) => r.lead.lead_id === leadId);
    const seen = own[0];
    // fake a short history of earlier conversations for the same visitor
    const hist: TdRequest[] = seen
      ? [3, 11, 27].map((d, i) => ({ ...clone(seen), _id: `hist_${leadId}_${i}`, id: `hist_${leadId}_${i}`, request_id: `hist-${leadId}-${i}`, ticket_id: 44 - i * 5 - (seen.ticket_id % 3), status: TD_STATUS.CLOSED, first_text: ['Asked about Lusail prices', 'Where to sign the contract?', 'Parking question'][i]!, createdAt: new Date(Date.now() - d * 86_400_000).toISOString(), channel: { name: i === 1 ? 'chat21' : 'chat21' } }))
      : [];
    return this.lat(seen && seen.ticket_id % 2 === 0 ? hist.slice(0, 2) : hist.slice(0, seen && seen.lead.email ? 3 : 1), 220);
  }
  listLeadNotes(leadId: string) {
    return this.lat(this.data.leadNotes[leadId] ?? []);
  }

  // ------------------------------------------------ Tarashli extensions (➕)
  getTakeoverBrief(requestId: string): Observable<TakeoverBriefVM> {
    const r = this.find(requestId);
    const slots = (r?.attributes.botSlots ?? []).filter((s) => s.value);
    const ar = r?.language === 'ar';
    const brief: TakeoverBriefVM = {
      summary: r?.ticket_id === 50
        ? 'The customer is looking for an apartment to rent in Lusail, budget up to 10,000 QAR per month, and would like to visit tomorrow.'
        : `The customer asked: "${r?.first_text ?? ''}"`,
      slots,
      handoffReason: r?.attributes.tarashli?.handoff_reason,
      sentiment: r?.ticket_id === 51 ? 'negative' : 'neutral',
      suggestion: ar
        ? { text: 'هلا فيك! عندنا شقق في لوسيل ضمن ميزانيتك، تبي أرسل لك الخيارات؟', register: 'khaleeji' }
        : { text: 'Hello! I have two options in Lusail within your budget. Would you like me to send them?', register: 'en' },
    };
    return this.lat(brief, 300);
  }

  ai(action: AiAction, text: string, ctx: { register?: string }): Observable<string> {
    const t = text.trim();
    const sentence = t.split(/(?<=[.!?؟])\s+/)[0] ?? t;
    const out: Record<AiAction, string> = {
      suggest: 'Thanks for waiting! I can arrange a viewing tomorrow at 4 pm. Would that work for you?',
      rephrase: t ? `Certainly — ${t.charAt(0).toLowerCase()}${t.slice(1)}` : '',
      shorten: sentence,
      expand: t ? `${t} Please let me know if you have any questions, I am happy to help.` : '',
      fix: t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/\s+/g, ' ').replace(/([^.!?؟])$/, '$1.') : '',
      translate: t ? `${t} (translated)` : '',
      summarize: 'Summary: the customer wants a 2-bedroom apartment in Lusail (up to 10,000 QAR per month) and asked for a viewing.',
      tone_professional: t ? `Dear customer, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : '',
      tone_friendly: t ? `Hi there! ${t} 😊` : '',
      tone_casual: t ? `Hey, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : '',
      copilot: 'Suggested next step: confirm the budget period, then offer two options in Lusail Marina.',
    };
    // Demo: translating a text that contains 125 returns 152, to show the protected-values guard (F-147).
    if (action === 'translate' && t.includes('125')) return this.lat(`${t.replace('125', '152')} (translated)`, 500);
    if (ctx.register === 'khaleeji' && action !== 'summarize') return this.lat('هلا فيك! ' + (t ? t : 'تبي أرتب لك معاينة بكرة العصر؟'), 500);
    if (ctx.register === 'fusha' && action !== 'summarize') return this.lat('مرحباً بكم. ' + (t ? t : 'هل ترغبون بترتيب معاينة غداً عصراً؟'), 500);
    return this.lat(out[action], 500);
  }

  translate(text: string, to: string): Observable<string> {
    const dict: Record<string, string> = {
      'أبي أكلم موظف': 'I want to talk to an employee',
      'أبي أحجز موعد معاينة لبرج في اللؤلؤة': 'I want to book a viewing appointment for a tower in The Pearl',
      'بكرة العصر': 'Tomorrow afternoon',
      'هل من أحد؟': 'Is anyone there?',
      '؟؟': '??',
      'مو مهم، المهم الموقع': "Doesn't matter, location is what matters",
    };
    return this.lat(to === 'en' ? (dict[text] ?? `${text} (translated)`) : `${text} (مترجم)`, 600);
  }

  // ------------------------------------------------ scripted real time
  /** Starts the few scripted live events once, after the first `me()` call. */
  private startScript(): void {
    if (this.started) return;
    this.started = true;
    // customer presence
    this.after(300, () => {
      for (const r of this.data.requests) {
        const online = r.status !== TD_STATUS.CLOSED && r.status !== TD_STATUS.ABANDONED && r.ticket_id !== 56 && r.ticket_id !== 58;
        this.bus.next({ type: 'presence', leadId: r.lead.lead_id, online, lastSeen: new Date(Date.now() - 5 * 60_000).toISOString() });
      }
    });
    if (!this.opts.script) return;
    const r53 = this.data.requests.find((r) => r.ticket_id === 53);
    const r51 = this.data.requests.find((r) => r.ticket_id === 51);
    if (r53) {
      // the bot types, then answers (customer message → bot reply)
      this.after(5000, () => this.bus.next({ type: 'typing', requestId: r53.request_id, who: 'bot', active: true }));
      this.after(9500, () => {
        this.bus.next({ type: 'typing', requestId: r53.request_id, who: 'bot', active: false });
        this.pushBotMessage(r53, 'assistant', 'We have a 2-bedroom available in March from 9,200 QAR per month in Lusail. Would you like to book a viewing?');
      });
    }
    if (r51) {
      this.after(7000, () => this.bus.next({ type: 'typing', requestId: r51.request_id, who: 'customer', active: true }));
      this.after(11000, () => this.bus.next({ type: 'typing', requestId: r51.request_id, who: 'customer', active: false }));
    }
    // a new conversation arrives (the list shows "↑ 1 new" instead of jumping when scrolled)
    this.after(22000, () => this.newVisitor());
  }

  private pushBotMessage(r: TdRequest, botId: string, text: string): void {
    const m: TdMessage = {
      _id: uid(`${r.request_id}_m`), sender: `bot_${botId}`, senderFullname: 'Assistant', recipient: r.request_id, text, type: 'text', status: 200,
      createdAt: new Date().toISOString(), attributes: { attachment: { buttons: [{ type: 'text', value: 'Book a viewing' }, { type: 'text', value: 'See other areas' }] } },
    };
    this.data.messages[r.request_id]!.push(m);
    const ext = (r.attributes.tarashli ??= {});
    ext.last_message = { text, sender: m.sender, createdAt: m.createdAt };
    ext.unread = (ext.unread ?? 0) + 1;
    r.updatedAt = m.createdAt;
    this.bus.next({ type: 'message.created', requestId: r.request_id, message: clone(m) });
    this.bus.next({ type: 'request.updated', request: clone(r) });
  }

  private newVisitor(): void {
    const ticket = Math.max(...this.data.requests.map((x) => x.ticket_id)) + 1;
    const rid = `support-group-r${ticket}`;
    const now = new Date().toISOString();
    const lead: TdLead = { _id: `lead_f${ticket}`, lead_id: `lead_f${ticket}`, fullname: 'guest#f611', createdAt: now };
    const r: TdRequest = {
      _id: `req_${ticket}`, id: `req_${ticket}`, request_id: rid, ticket_id: ticket, status: TD_STATUS.ASSIGNED, workingStatus: 'open', hasBot: true,
      participants: ['bot_assistant'], participantsAgents: [], participantsBots: ['bot_assistant'], participatingBots: [this.data.bots[0]!], lead,
      first_text: 'Hi! Do you rent furnished studios?', department: this.data.departments[0], channel: { name: 'chat21' }, priority: 'medium', tags: [], notes: [], followers: [],
      location: { city: 'Doha', country: 'QA' }, language: 'en', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/131', smartAssignment: true,
      attributes: { subtype: 'info', tarashli: { unread: 1, last_message: { text: 'Hi! Do you rent furnished studios?', sender: lead.lead_id, createdAt: now } } }, createdAt: now, updatedAt: now,
    };
    this.data.requests.push(r);
    this.data.messages[rid] = [
      { _id: uid('m'), sender: 'system', senderFullname: 'System', recipient: rid, text: 'CHAT_CREATED', type: 'text', status: 200, attributes: { subtype: 'info', messagelabel: { key: 'CHAT_CREATED' } }, createdAt: now },
      { _id: uid('m'), sender: 'system', senderFullname: 'System', recipient: rid, text: 'MEMBER_JOINED_GROUP', type: 'text', status: 200, attributes: { subtype: 'info', messagelabel: { key: 'MEMBER_JOINED_GROUP', parameters: { member_id: 'bot_assistant' } } }, createdAt: now },
      { _id: uid('m'), sender: lead.lead_id, senderFullname: lead.fullname, recipient: rid, text: 'Hi! Do you rent furnished studios?', type: 'text', status: 200, createdAt: now },
    ];
    this.bus.next({ type: 'request.created', request: clone(r) });
    this.bus.next({ type: 'presence', leadId: lead.lead_id, online: true });
  }

  /** After the agent answers #50 the customer replies a few seconds later (shows incoming messages live). */
  private scriptedCustomerReply(r: TdRequest, isNote: boolean): void {
    if (!this.opts.script || isNote || r.ticket_id !== 50) return;
    const key = 'reply50';
    if (this.failNext.has(key)) return;
    this.failNext.add(key);
    this.after(2500, () => this.bus.next({ type: 'typing', requestId: r.request_id, who: 'customer', active: true }));
    this.after(6500, () => {
      this.bus.next({ type: 'typing', requestId: r.request_id, who: 'customer', active: false });
      const m: TdMessage = { _id: uid(`${r.request_id}_m`), sender: r.lead.lead_id, senderFullname: r.lead.fullname, recipient: r.request_id, text: 'Tomorrow at 4 pm works for me, thank you!', type: 'text', status: 200, createdAt: new Date().toISOString() };
      this.data.messages[r.request_id]!.push(m);
      const ext = (r.attributes.tarashli ??= {});
      ext.last_message = { text: m.text, sender: m.sender, createdAt: m.createdAt };
      ext.unread = (ext.unread ?? 0) + 1;
      this.bus.next({ type: 'message.created', requestId: r.request_id, message: clone(m) });
      this.bus.next({ type: 'request.updated', request: clone(r) });
    });
  }
}
