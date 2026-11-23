import { Observable } from 'rxjs';
import {
  FilterRow,
  HandoffReason,
  TdBot,
  TdCannedResponse,
  TdDepartment,
  TdHours,
  TdLabelDef,
  TdLead,
  TdMessage,
  TdPriority,
  TdProjectUser,
  TdRequest,
  TdSavedView,
  TdTag,
  TdTeam,
} from '../models/tiledesk.models';
import { BotStepVM, TakeoverBriefVM } from '../models/view-models';

/**
 * THE integration seam. Components and stores only know this contract.
 * `MockInboxApi` implements it with fake data; to plug Tiledesk in, provide an `HttpInboxApi` that calls
 * `https://{host}/api/{project_id}/...` (paths verified in document section 12.1; no /v3/ paths) and
 * uses the Tiledesk WebSocket + chat21 MQTT for `events$`. See README "Replacing the mock".
 */

export interface RequestPage {
  requests: TdRequest[];
  count: number;
  perPage: number;
  page: number;
}

export interface SendPayload {
  text: string;
  /** `private` = internal note (➕ convention to validate with the back-end; falls back to request.notes) */
  subtype?: 'private';
  tempUID: string;
  attachments?: { name: string; type: string; size: number; src?: string; duration?: number; waveform?: number[]; transcript?: string }[];
  quotedId?: string;
  /** Applied by the server after the message is stored (F-76) */
  statusAfter?: 'open' | 'pending' | 'resolved';
  scheduledAt?: string;
}

export type AssignTarget = { kind: 'agent' | 'bot' | 'department' | 'team'; id: string };

/** Every mutation of a conversation. Each one maps to one existing Tiledesk action. */
export type RequestCommand =
  | { type: 'close' }
  | { type: 'reopen' }
  | { type: 'pending' }
  | { type: 'snooze'; until: string | null }
  | { type: 'priority'; value: TdPriority }
  | { type: 'tags'; tags: TdTag[] }
  | { type: 'assign'; target: AssignTarget; note?: string; stayFollower?: boolean }
  | { type: 'takeOver' }
  | { type: 'handBack'; stepId: string; keepMinutes?: number }
  | { type: 'addParticipant'; agentId: string }
  | { type: 'leave' }
  | { type: 'addNote'; text: string }
  | { type: 'deleteNote'; id: string }
  | { type: 'followers'; ids: string[] }
  | { type: 'markUnread'; unread: boolean }
  | { type: 'ban' }
  | { type: 'unban' }
  | { type: 'offlineTicket' }
  | { type: 'onlineTicket' }
  | { type: 'delete' }
  | { type: 'flagBotReply'; messageId: string; reason: string }
  | { type: 'deleteMessage'; messageId: string }
  | { type: 'requestPen' };

export interface NewTicket {
  requester: { leadId?: string; fullname?: string; email?: string; phone?: string };
  subject: string;
  message: string;
  assignee: AssignTarget;
  priority: TdPriority;
  tags: TdTag[];
  channel: 'form' | 'email' | 'whatsapp';
}

export type RealtimeEvent =
  | { type: 'connection'; status: 'online' | 'offline' }
  | { type: 'request.created'; request: TdRequest }
  | { type: 'request.updated'; request: TdRequest }
  | { type: 'message.created'; requestId: string; message: TdMessage }
  | { type: 'typing'; requestId: string; who: 'customer' | 'bot' | 'agent'; agentId?: string; active: boolean }
  | { type: 'presence'; leadId: string; online: boolean; lastSeen?: string };

export type AiAction = 'suggest' | 'rephrase' | 'shorten' | 'expand' | 'fix' | 'translate' | 'summarize' | 'tone_professional' | 'tone_friendly' | 'tone_casual' | 'copilot';

export abstract class InboxApi {
  // --- directory
  abstract me(): Observable<TdProjectUser>;
  abstract listAgents(): Observable<TdProjectUser[]>;
  abstract listBots(): Observable<TdBot[]>;
  abstract listDepartments(): Observable<TdDepartment[]>;
  abstract listTeams(): Observable<TdTeam[]>;
  abstract listLabels(): Observable<TdLabelDef[]>;
  abstract listCanned(): Observable<TdCannedResponse[]>;
  abstract listSavedViews(): Observable<TdSavedView[]>;
  abstract saveView(view: Omit<TdSavedView, '_id' | 'owner'>): Observable<TdSavedView>;
  abstract getHours(): Observable<TdHours>;
  /** Name of the current project (the sidebar header). `null` = use the generic label. */
  abstract projectName(): Observable<string | null>;
  abstract listBotSteps(botId: string): Observable<BotStepVM[]>;

  // --- conversations
  abstract listRequests(page: number, perPage: number): Observable<RequestPage>;
  abstract getRequest(requestId: string): Observable<TdRequest>;
  abstract listMessages(requestId: string): Observable<TdMessage[]>;
  abstract sendMessage(requestId: string, payload: SendPayload): Observable<TdMessage>;
  abstract command(requestId: string, cmd: RequestCommand): Observable<TdRequest>;
  /** Bulk commands run one request at a time so partial failures can be reported (F-29, F-150). */
  abstract createTicket(ticket: NewTicket): Observable<TdRequest>;

  // --- contact
  abstract updateLead(leadId: string, patch: Partial<TdLead>): Observable<TdLead>;
  abstract listLeadRequests(leadId: string): Observable<TdRequest[]>;
  abstract listLeadNotes(leadId: string): Observable<{ _id: string; text: string; createdBy: string; createdAt: string }[]>;

  // --- Tarashli extensions (➕): AI service, handover brief, translation
  abstract getTakeoverBrief(requestId: string): Observable<TakeoverBriefVM>;
  abstract ai(action: AiAction, text: string, ctx: { register?: string; requestId?: string }): Observable<string>;
  abstract translate(text: string, to: string): Observable<string>;

  // --- real time
  abstract readonly events$: Observable<RealtimeEvent>;
  /** Manual reconnect (connection banner "Retry") */
  abstract reconnect(): void;
}

export type { FilterRow, HandoffReason };
