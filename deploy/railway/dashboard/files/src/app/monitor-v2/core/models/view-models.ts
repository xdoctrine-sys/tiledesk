import { FilterRow, HandoffReason, SortKey, TdLabelDef, TdMessageAttachmentRich, TdRequest } from './tiledesk.models';

/**
 * View models (document section 12.4): what the components receive.
 * Components never call the API; mappers in core/mappers turn raw Tiledesk models into these.
 */

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export type ActorKind = 'bot' | 'human' | 'waiting_human' | 'customer_pending' | 'snoozed' | 'closed' | 'abandoned';

export interface ActorVM {
  kind: ActorKind;
  /** bot name / first name / "You" is resolved in the template */
  label: string;
  isMe: boolean;
  since?: Date;
}

export type ChannelKind = 'web' | 'whatsapp' | 'messenger' | 'instagram' | 'telegram' | 'email' | 'sms' | 'internal' | 'voice';

export interface ChannelCapabilities {
  kind: ChannelKind;
  /** Tiledesk channel.name */
  name: string;
  maxLength: number;
  maxButtons: number;
  maxButtonLength: number;
  supportsMarkdown: boolean;
  acceptedMimeTypes: string[];
  maxFileSizeMb: number;
  hasServiceWindow: boolean;
  supportsReactions: boolean;
  supportsReplyTo: boolean;
  supportsDelete: boolean;
  smsSegmentLength?: number;
  /** Enter sends (chat) or inserts a new line (e-mail) */
  enterSends: boolean;
}

export interface AgentVM {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  colorIndex: number;
  email: string;
  avatarUrl?: string;
  role: 'owner' | 'admin' | 'agent';
  available: boolean;
  busy: boolean;
  load: number;
  maxLoad: number;
  breakType?: 'pause' | 'training' | 'prayer' | 'meal';
  breakUntil?: Date;
  languages: string[];
  recommended?: boolean;
  isMe?: boolean;
}

export interface BotVM {
  id: string;
  name: string;
}

export interface LabelVM {
  id: string;
  name: string;
  color: TdLabelDef['color'];
}

export interface CustomerVM {
  id: string;
  name: string;
  isGuest: boolean;
  initials: string;
  colorIndex: number;
  avatarUrl?: string;
  online: boolean;
  lastSeen?: Date;
  typing: boolean;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  language?: string;
}

export interface SlaVM {
  dueAt: Date;
  paused: boolean;
  level: 'ok' | 'risk' | 'breached';
  /** why the clock is paused (prayer, Ramadan break...) */
  pauseReason?: 'prayer' | 'closed_hours';
}

export interface WindowVM {
  expiresAt: Date;
  level: 'open' | 'closing' | 'closed';
}

export interface ConversationVM {
  id: string;
  ticket: number;
  subject?: string;
  customer: CustomerVM;
  channel: ChannelCapabilities;
  actor: ActorVM;
  /** Same as actor.kind but kept for list tabs; 'closed' is used for resolved conversations */
  state: ActorKind;
  priority: Priority;
  labels: LabelVM[];
  lastMessage?: { text: string; authorKind: MessageAuthorKind; authorName: string; at: Date; type: string };
  unread: number;
  draft?: string;
  sla?: SlaVM;
  window?: WindowVM;
  viewers: AgentVM[];
  penHolder?: AgentVM;
  snoozedUntil?: Date;
  department?: { id: string; name: string };
  agents: AgentVM[];
  bots: { id: string; name: string }[];
  followers: string[];
  mentionsMe: boolean;
  blocked: boolean;
  smartAssignment: boolean;
  hasBot: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Waiting for a human since... (status 100) */
  waitingSince?: Date;
  /** Raw Tiledesk request for the context panel */
  raw: TdRequest;
}

export type MessageAuthorKind = 'customer' | 'bot' | 'agent' | 'note' | 'system' | 'whisper';

export interface QuoteVM {
  id: string;
  authorName: string;
  text: string;
}

export interface MessageVM {
  id: string;
  tempId?: string;
  authorKind: MessageAuthorKind;
  author: { id: string; name: string; initials: string; colorIndex: number; avatarUrl?: string };
  text: string;
  /** Localized sentence for system events */
  eventKey?: string;
  eventParams?: Record<string, string>;
  type: 'text' | 'image' | 'file' | 'location' | 'audio' | 'event';
  rich?: TdMessageAttachmentRich;
  attachments: AttachmentVM[];
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'queued';
  createdAt: Date;
  detectedLanguage?: string;
  register?: 'khaleeji' | 'fusha' | 'arabizi' | 'en';
  /** Translation shown after the agent clicks "Translate" */
  translation?: string;
  /** Machine translation / normalised Arabic delivered with the message (register pill, I-4) */
  suggestedTranslation?: string;
  normalized?: string;
  piiSpans: PiiSpan[];
  quoted?: QuoteVM;
  deleted: boolean;
  flagged: boolean;
  isOutgoing: boolean;
  /** FLOW_TRIGGER messages are folded into a collapsed event */
  isFlowTrigger: boolean;
}

export interface AttachmentVM {
  id: string;
  kind: 'image' | 'video' | 'file' | 'location' | 'audio';
  name: string;
  url?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  transcript?: string;
  waveform?: number[];
  lat?: number;
  lng?: number;
  /** upload state in the tray */
  progress?: number;
  error?: string;
  transcribing?: boolean;
  /** an ID document detected → blurred until click */
  sensitive?: boolean;
}

export interface PiiSpan {
  start: number;
  end: number;
  kind: 'qid' | 'emirates_id' | 'saudi_id' | 'kuwait_civil_id' | 'iban' | 'card' | 'passport';
  last4: string;
}

export type RelayKind = 'bot' | 'waiting_human' | 'human' | 'customer_pending' | 'snoozed';

export interface RelaySegmentVM {
  kind: RelayKind;
  actorLabel: string;
  start: Date;
  /** empty = in progress */
  end?: Date;
  /** why the segment started (handoff reason) */
  reason?: HandoffReason;
  messageCount: number;
  /** message id of the first message in the segment, for scroll-to */
  firstMessageId?: string;
}

export interface TakeoverBriefVM {
  summary: string;
  slots: { key: string; value: string; messageId?: string }[];
  handoffReason?: HandoffReason;
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestion?: { text: string; register: 'khaleeji' | 'fusha' | 'en' };
}

export interface BotStepVM {
  id: string;
  label: string;
  preview: string;
}

export interface CannedVM {
  id: string;
  title: string;
  shortcut: string;
  text: string;
}

export interface BotSlotVM {
  key: string;
  value: string;
  messageId?: string;
}

export interface ListQuery {
  view: ViewId;
  status: StatusTab;
  quick: QuickChip[];
  rows: FilterRow[];
  conjunction: 'and' | 'or';
  search: string;
  sort: SortKey;
}

export type StatusTab = 'open' | 'pending' | 'snoozed' | 'resolved' | 'all';
export type QuickChip = 'unread' | 'bot' | 'waiting' | 'high' | 'window';

/** `mine`, `waiting`, `bot`, `all`, `mentions` are system views; others are prefixed (channel:web, dept:ID, label:ID, team:ID, saved:ID). */
export type ViewId = string;

export interface ViewCounts {
  [view: string]: number;
}

export interface ConnectionState {
  status: 'online' | 'offline' | 'reconnecting' | 'restored';
  since?: Date;
  retryIn?: number;
}
