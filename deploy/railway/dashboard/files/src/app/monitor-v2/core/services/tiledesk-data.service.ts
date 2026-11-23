import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, Subject, Subscription, from, of, throwError } from 'rxjs';
import { catchError, filter, map, switchMap, take, timeout } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';
import { CannedResponsesService } from '../../../services/canned-responses.service';
import { ContactsService } from '../../../services/contacts.service';
import { DepartmentService } from '../../../services/department.service';
import { FaqKbService } from '../../../services/faq-kb.service';
import { GroupService } from '../../../services/group.service';
import { ProjectService } from '../../../services/project.service';
import { TagsService } from '../../../services/tags.service';
import { UsersService } from '../../../services/users.service';
import { WebSocketJs } from '../../../services/websocket/websocket-js';
import { WsMsgsService } from '../../../services/websocket/ws-msgs.service';
import { WsRequestsService } from '../../../services/websocket/ws-requests.service';
import { EXTENSIONS, READ_ONLY, WRITE_ENABLED } from '../../monitor-v2.config';
import {
  requestSignature,
  toTdAgent,
  toTdBot,
  toTdCanned,
  toTdDepartment,
  toTdHours,
  toTdLabel,
  toTdMessage,
  toTdRequest,
  toTdTeam,
} from '../mappers/tiledesk-api.mapper';
import {
  TD_STATUS,
  TdBot,
  TdCannedResponse,
  TdDepartment,
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

type Raw = Record<string, any>;

/** Error thrown by every write while the page is read only (phase A). `status: 403` makes the stores show "not allowed". */
export function readOnlyError(action: string): Error & { status: number; readOnly: true; action: string } {
  return Object.assign(new Error(`Monitor V2 is read only: "${action}" is disabled`), { status: 403, readOnly: true as const, action });
}

const ext = <T>(v: T): Observable<T> => of(v);

/**
 * Real data of the current Tiledesk project, through the dashboard's EXISTING services (none is modified).
 * Same contract as MockInboxApi (`InboxApi`).
 *
 *  - live conversations .... WsRequestsService.wsRequestsList$ (WebSocket /{project}/requests, already open in the dashboard)
 *  - closed conversations .. WsRequestsService.getHistoryAndNortRequests (REST, status 1000)
 *  - messages .............. WsMsgsService.geRequestMsgs (REST) + WebSocket topic /{project}/requests/{id}/messages
 *  - people / departments .. UsersService, FaqKbService, DepartmentService, GroupService, TagsService, CannedResponsesService
 *  - contact ............... ContactsService
 *
 * Writes are refused by `guard()` while READ_ONLY (phase A). The plumbing for phase B is in place but unreachable until an
 * action is added to WRITE_ENABLED. Server extensions (➕) use local storage or are hidden (see EXTENSIONS).
 */
@Injectable()
export class TiledeskDataService extends InboxApi implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly wsRequests = inject(WsRequestsService);
  private readonly wsMsgs = inject(WsMsgsService);
  private readonly ws = inject(WebSocketJs);
  private readonly users = inject(UsersService);
  private readonly depts = inject(DepartmentService);
  private readonly bots = inject(FaqKbService);
  private readonly groups = inject(GroupService);
  private readonly tags = inject(TagsService);
  private readonly canned = inject(CannedResponsesService);
  private readonly contacts = inject(ContactsService);
  private readonly projects = inject(ProjectService);

  private readonly bus = new Subject<RealtimeEvent>();
  readonly events$: Observable<RealtimeEvent> = this.bus.asObservable();
  private readonly subs = new Subscription();

  /** request_id → signature of what was last emitted. Seeded by the first `listRequests`, so the initial list is not replayed as events. */
  private known: Map<string, { sig: string; raw: Raw }> | null = null;
  private watchedRequest: string | null = null;
  private watchedLead: string | null = null;

  constructor() {
    super();
    this.subs.add(
      this.wsRequests.wsRequestsList$.subscribe((list) => this.onLiveList(list as unknown as Raw[])),
    );
    this.subs.add(
      this.wsRequests.wsRequesterStatus$.subscribe((s: Raw) => {
        if (!this.watchedLead || !s) return;
        const status = s['presence']?.['status'] ?? s['status'];
        if (status === undefined) return;
        this.bus.next({ type: 'presence', leadId: this.watchedLead, online: status === 'online', lastSeen: s['presence']?.['changedAt'] });
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.unwatchMessages();
    this.unwatchPresence();
  }

  // ------------------------------------------------------------------------------------------------------- helpers
  private get projectId(): string {
    return this.auth.project_bs.value?._id ?? '';
  }
  private get meUserId(): string {
    return this.auth.user_bs.value?._id ?? '';
  }

  /** The only gate of the write path. */
  private guard(action: string): void {
    if (READ_ONLY && !WRITE_ENABLED.includes(action)) throw readOnlyError(action);
  }
  private refuse<T>(action: string): Observable<T> {
    return throwError(() => readOnlyError(action));
  }
  private unsupported<T>(what: string): Observable<T> {
    return throwError(() => Object.assign(new Error(`Monitor V2: "${what}" needs a server extension`), { status: 501 }));
  }
  /**
   * The dashboard's services take the project id from `auth.project_bs` when it emits; on a direct visit of the page URL it
   * has not emitted yet (their URLs would contain "undefined"). Every request waits for the project first.
   */
  private whenProjectReady(): Observable<unknown> {
    return this.auth.project_bs.pipe(filter((p) => !!p && !!p._id), take(1));
  }
  private gated<T>(factory: () => Observable<T>): Observable<T> {
    return this.whenProjectReady().pipe(switchMap(() => factory()));
  }
  private safe<T>(source: () => Observable<any>, mapFn: (v: any) => T, fallback: T): Observable<T> {
    return this.gated(source).pipe(
      take(1),
      map((v) => mapFn(v)),
      catchError((e) => {
        console.warn('[monitor-v2] request failed, using an empty result', e);
        return of(fallback);
      }),
    );
  }

  // --------------------------------------------------------------------------------------------------------- directory
  me(): Observable<TdProjectUser> {
    const u = this.auth.user_bs.value;
    const base: TdProjectUser = {
      _id: u?._id ?? '',
      id_user: { _id: u?._id ?? '', firstname: u?.firstname ?? '', lastname: u?.lastname ?? '', email: u?.email ?? '' },
      role: 'agent',
      user_available: true,
    };
    return this.safe(() => this.users.getProjectUserByUserId(this.meUserId),
      (res: any) => {
        const pu = Array.isArray(res) ? res[0] : res;
        return pu ? { ...toTdAgent({ ...pu, id_user: { ...(pu.id_user ?? {}), ...base.id_user } }), _id: base._id } : base;
      },
      base,
    );
  }
  listAgents(): Observable<TdProjectUser[]> {
    return this.safe(() => this.users.getProjectUsersByProjectId(), (res: any[]) => asArr(res).filter((pu) => pu?.id_user).map((pu) => toTdAgent(pu)), []);
  }
  listBots(): Observable<TdBot[]> {
    return this.safe(() => this.bots.getAllBotByProjectId(), (res: any[]) => asArr(res).map(toTdBot), []);
  }
  listDepartments(): Observable<TdDepartment[]> {
    return this.safe(() => this.depts.getDeptsByProjectId(), (res: any[]) => asArr(res).map(toTdDepartment), []);
  }
  listTeams(): Observable<TdTeam[]> {
    return this.safe(() => this.groups.getGroupsByProjectId(), (res: any[]) => asArr(res).map(toTdTeam), []);
  }
  listLabels(): Observable<TdLabelDef[]> {
    return this.safe(() => this.tags.getTags(), (res: any[]) => asArr(res).map(toTdLabel), []);
  }
  listCanned(): Observable<TdCannedResponse[]> {
    return this.safe(() => this.canned.getCannedResponses(), (res: any[]) => asArr(res).map(toTdCanned), []);
  }
  projectName(): Observable<string | null> {
    return this.gated(() => of(this.auth.project_bs.value?.name ?? null));
  }
  getHours(): Observable<TdHours> {
    return this.safe(() => this.projects.getProjectById(this.projectId), (res: any) => toTdHours(Array.isArray(res) ? res[0] : res), toTdHours(undefined));
  }
  /** ➕ saved views are a Tarashli collection: kept in this browser only. */
  listSavedViews(): Observable<TdSavedView[]> {
    return ext(EXTENSIONS.localSavedViews ? this.local<TdSavedView[]>('views', []) : []);
  }
  saveView(view: Omit<TdSavedView, '_id' | 'owner'>): Observable<TdSavedView> {
    if (!EXTENSIONS.localSavedViews) return this.unsupported('saved views');
    const v: TdSavedView = { ...view, _id: uid('sv'), owner: this.meUserId };
    this.setLocal('views', [...this.local<TdSavedView[]>('views', []), v]);
    return ext(v);
  }
  listBotSteps(_botId: string): Observable<BotStepVM[]> {
    return ext([]);
  }

  // ----------------------------------------------------------------------------------------------------- conversations
  listRequests(page: number, perPage: number): Observable<RequestPage> {
    const closed$ = this.safe(() => this.wsRequests.getHistoryAndNortRequests('=', '1000', undefined, false, '', page - 1), // the REST pages start at 0
      (res: any) => ({ requests: asArr(res?.requests), count: Number(res?.count) || 0 }),
      { requests: [] as Raw[], count: 0 },
    );
    if (page > 1) {
      return closed$.pipe(
        map((c) => ({ requests: c.requests.map(toTdRequest), count: (this.known?.size ?? 0) + c.count, perPage, page })),
      );
    }
    // The live list arrives through the WebSocket (debounced 1 s by the dashboard): wait for it, but never more than 3 s
    // (an empty project is legitimate).
    const live$ = this.whenProjectReady().pipe(switchMap(() => this.wsRequests.wsRequestsList$)).pipe(
      filter((l) => (l as any[]).length > 0),
      timeout(3000),
      take(1),
      catchError(() => of(this.wsRequests.wsRequestsList$.value)),
    );
    return live$.pipe(
      switchMap((live) =>
        closed$.pipe(
          map((c) => {
            const liveRaw = (live as unknown as Raw[]).filter((r) => r['status'] !== TD_STATUS.CLOSED && !r['preflight']);
            this.seed(liveRaw);
            const seen = new Set(liveRaw.map((r) => r['request_id']));
            const all = [...liveRaw, ...c.requests.filter((r) => !seen.has(r['request_id']))].map(toTdRequest);
            return { requests: all, count: liveRaw.length + c.count, perPage, page };
          }),
        ),
      ),
    );
  }

  getRequest(requestId: string): Observable<TdRequest> {
    const hit = this.known?.get(requestId)?.raw ?? (this.wsRequests.wsRequestsList$.value as unknown as Raw[]).find((r) => r['request_id'] === requestId);
    if (hit) return ext(toTdRequest(hit));
    return this.gated(() => this.wsRequests.getConversationByIDWithRestRequest(requestId) as Observable<Raw>).pipe(take(1), map(toTdRequest));
  }

  listMessages(requestId: string): Observable<TdMessage[]> {
    return this.gated(() => {
      this.watchMessages(requestId);
      return this.wsMsgs.geRequestMsgs(requestId) as Observable<Raw[]>;
    }).pipe(
      take(1),
      map((list) =>
        asArr(list)
          .map((m) => toTdMessage(m, requestId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),
    );
  }

  reconnect(): void {
    /* the dashboard's WebSocketJs reconnects by itself (heartbeat) */
  }

  // ------------------------------------------------------------------------------------------------------ real time
  private seed(live: Raw[]): void {
    this.known = new Map(live.map((r) => [r['request_id'], { sig: requestSignature(r), raw: r }]));
  }

  private onLiveList(list: Raw[]): void {
    if (!this.known) return; // nothing displayed yet: the first listRequests seeds it
    const seenNow = new Set<string>();
    for (const r of list ?? []) {
      const id = r['request_id'];
      if (!id || r['preflight'] || r['status'] === TD_STATUS.CLOSED) continue;
      seenNow.add(id);
      const sig = requestSignature(r);
      const prev = this.known.get(id);
      if (!prev) this.bus.next({ type: 'request.created', request: toTdRequest(r) });
      else if (prev.sig !== sig) this.bus.next({ type: 'request.updated', request: toTdRequest(r) });
      this.known.set(id, { sig, raw: r });
    }
    // a request that left the live list was closed (the dashboard drops status 1000)
    for (const [id, { raw }] of Array.from(this.known)) {
      if (seenNow.has(id)) continue;
      this.known.delete(id);
      this.bus.next({ type: 'request.updated', request: toTdRequest({ ...raw, status: TD_STATUS.CLOSED, updatedAt: new Date().toISOString() }) });
    }
  }

  private watchMessages(requestId: string): void {
    if (this.watchedRequest === requestId) return;
    this.unwatchMessages();
    this.watchedRequest = requestId;
    const emit = (m: Raw) => this.bus.next({ type: 'message.created', requestId, message: toTdMessage(m, requestId) });
    this.ws.ref(`/${this.projectId}/requests/${requestId}/messages`, 'monitor-v2', (m: Raw) => m && emit(m), () => undefined, () => undefined);
    const lead = this.known?.get(requestId)?.raw?.['snapshot']?.['lead']?.['lead_id'] ?? this.known?.get(requestId)?.raw?.['requester_id'];
    this.unwatchPresence();
    if (lead) {
      this.watchedLead = lead;
      this.wsRequests.subscribeToWS_RequesterPresence(lead);
    }
  }
  private unwatchMessages(): void {
    if (this.watchedRequest) this.ws.unsubscribe(`/${this.projectId}/requests/${this.watchedRequest}/messages`);
    this.watchedRequest = null;
  }
  private unwatchPresence(): void {
    if (this.watchedLead) this.wsRequests.unsubscribeToWS_RequesterPresence(this.watchedLead);
    this.watchedLead = null;
  }

  // -------------------------------------------------------------------------------------------------------- contact
  updateLead(leadId: string, patch: Partial<TdLead>): Observable<TdLead> {
    try {
      this.guard('updateLead');
    } catch (e) {
      return throwError(() => e);
    }
    const fn = (name: string) => (this.contacts as unknown as Raw)[name]?.bind(this.contacts);
    const jobs: Observable<unknown>[] = [];
    if (patch.fullname !== undefined) jobs.push(fn('updateLeadFullname')(leadId, patch.fullname));
    if (patch.email !== undefined) jobs.push(fn('updateLeadEmail')(leadId, patch.email));
    if (patch.phone !== undefined) jobs.push(fn('updateLeadPhone')(leadId, patch.phone));
    if (patch.company !== undefined) jobs.push(fn('updateLeadCompany')(leadId, patch.company));
    if (patch.note !== undefined) jobs.push(fn('updateLeadNote')(leadId, patch.note));
    return (jobs.length ? from(Promise.all(jobs.map((j) => j.pipe(take(1)).toPromise()))) : of([])).pipe(
      switchMap(() => this.contacts.getLeadById(leadId) as Observable<any>),
      take(1),
      map((l: any) => ({ ...(Array.isArray(l) ? l[0] : l), ...patch }) as TdLead),
    );
  }

  listLeadRequests(leadId: string): Observable<TdRequest[]> {
    return this.safe(() => this.contacts.getRequestsByRequesterId(leadId, 0), (res: any) => asArr(res?.requests ?? res).map(toTdRequest), []);
  }

  listLeadNotes(leadId: string): Observable<{ _id: string; text: string; createdBy: string; createdAt: string }[]> {
    return this.safe(() => this.contacts.getLeadById(leadId),
      (res: any) => {
        const l = Array.isArray(res) ? res[0] : res;
        return l?.note ? [{ _id: `${leadId}_note`, text: String(l.note), createdBy: '', createdAt: l.updatedAt ?? l.createdAt ?? new Date().toISOString() }] : [];
      },
      [],
    );
  }

  // --------------------------------------------------------------------------------------------- writes (phase B)
  sendMessage(requestId: string, p: SendPayload): Observable<TdMessage> {
    try {
      this.guard('send');
    } catch (e) {
      return throwError(() => e);
    }
    if (p.attachments?.length) return this.unsupported('attachments');
    const isNote = p.subtype === 'private';
    const raw = this.known?.get(requestId)?.raw;
    const joined = !!raw && asArr(raw['participants']).includes(this.meUserId);
    return (this.wsMsgs.sendChatMessage(this.projectId, requestId, p.text, isNote ? 2 : 1, raw?.['requester_id'] ?? '', joined, undefined, 'text') as Observable<Raw>).pipe(
      take(1),
      map((m) => toTdMessage({ ...m, attributes: { ...(m['attributes'] ?? {}), tempUID: p.tempUID } }, requestId)),
    );
  }

  command(requestId: string, cmd: RequestCommand): Observable<TdRequest> {
    // Local read cursor: not a server write, allowed while read only (the ➕ unread counter does not exist on the server).
    if (cmd.type === 'markUnread') return this.getRequest(requestId);
    const action = cmd.type;
    try {
      this.guard(action);
    } catch (e) {
      return throwError(() => e);
    }
    const done = () => this.refresh(requestId);
    const me = this.meUserId;
    const call = (o: Observable<unknown> | undefined): Observable<TdRequest> => (o ? o.pipe(take(1), switchMap(done)) : this.unsupported(action));
    switch (cmd.type) {
      case 'close': return call(this.wsRequests.closeSupportGroup(requestId) as Observable<unknown>);
      case 'reopen': return call(this.wsRequests.unarchiveRequest(requestId) as Observable<unknown>);
      case 'pending': return call(this.wsRequests.updateRequestWorkingStatus(requestId, 'pending') as Observable<unknown>);
      case 'priority': return call(this.wsRequests.updatePriority(requestId, cmd.value) as Observable<unknown>);
      case 'tags': return call(this.wsRequests.updateRequestsById_UpdateTag(requestId, cmd.tags.map((t) => t.tag)) as Observable<unknown>);
      case 'addNote': return call(this.wsRequests.createNote(cmd.text, requestId) as Observable<unknown>);
      case 'deleteNote': return call(this.wsRequests.deleteNote(requestId, cmd.id) as Observable<unknown>);
      case 'addParticipant': return call(this.wsRequests.addParticipant(requestId, cmd.agentId) as Observable<unknown>);
      case 'leave': return call(this.wsRequests.leaveTheGroup(requestId, me) as Observable<unknown>);
      case 'takeOver': return call(this.wsRequests.setParticipants(requestId, me) as Observable<unknown>);
      case 'assign':
        if (cmd.target.kind === 'agent') return call(this.wsRequests.setParticipants(requestId, cmd.target.id) as Observable<unknown>);
        if (cmd.target.kind === 'bot') return call(this.wsRequests.setParticipants(requestId, `bot_${cmd.target.id}`) as Observable<unknown>);
        if (cmd.target.kind === 'department') return call(this.wsRequests.joinDept(cmd.target.id, requestId) as Observable<unknown>);
        return this.unsupported('assign to a team');
      case 'delete': return call(this.wsRequests.deleteRequest(requestId) as Observable<unknown>);
      // ➕ no equivalent on a stock server: snooze, hand back to the bot, ban, offline ticket, followers by user id, flags, pen
      default: return this.unsupported(action);
    }
  }

  createTicket(_ticket: NewTicket): Observable<TdRequest> {
    try {
      this.guard('createTicket');
    } catch (e) {
      return throwError(() => e);
    }
    return this.unsupported('createTicket');
  }

  // --------------------------------------------------------------------------------------------- ➕ extensions
  getTakeoverBrief(_requestId: string): Observable<TakeoverBriefVM> {
    return ext(null as unknown as TakeoverBriefVM); // no brief without the ➕ server extension: the block is not shown
  }
  ai(_action: AiAction, _text: string, _ctx: { register?: string; requestId?: string }): Observable<string> {
    return this.unsupported('ai');
  }
  translate(_text: string, _to: string): Observable<string> {
    return this.unsupported('translate');
  }

  // -------------------------------------------------------------------------------------------------------- utils
  private refresh(requestId: string): Observable<TdRequest> {
    return (this.wsRequests.getConversationByIDWithRestRequest(requestId) as Observable<Raw>).pipe(take(1), map(toTdRequest));
  }

  private key(name: string): string {
    return `monitor-v2.${name}.${this.projectId}`;
  }
  private local<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(this.key(name)) ?? 'null') ?? fallback;
    } catch {
      return fallback;
    }
  }
  private setLocal(name: string, value: unknown): void {
    try {
      localStorage.setItem(this.key(name), JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }
}

function asArr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}
