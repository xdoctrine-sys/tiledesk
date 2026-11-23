/**
 * Raw Tiledesk REST models (document section 12.2 and corrections 13.7).
 * These are the shapes returned by `GET https://{host}/api/{project_id}/...`.
 * Fields marked "➕" do not exist in Tiledesk: they are Tarashli server extensions and live under
 * `attributes.tarashli` (or in dedicated collections). In this template they are faked by MockDataService.
 */

/** 50 = temporary (hidden), 100 = queued (waiting for a human), 150 = abandoned, 200 = assigned, 1000 = closed. */
export type TdRequestStatus = 50 | 100 | 150 | 200 | 1000;
export const TD_STATUS = { TEMP: 50, QUEUED: 100, ABANDONED: 150, ASSIGNED: 200, CLOSED: 1000 } as const;

/** `pending` = waiting for the requester. Closing goes through `status`. */
export type TdWorkingStatus = 'open' | 'pending';

/** 0 = sending, 100 = sent, 150 = delivered to server, 200 = acknowledged (depends on channel). No other code is observed. */
export type TdMessageStatus = 0 | 100 | 150 | 200;

export type TdPriority = 'urgent' | 'high' | 'medium' | 'low';

/** `chat21` is the web widget. */
export type TdChannelName = 'chat21' | 'whatsapp' | 'messenger' | 'instagram' | 'telegram' | 'email' | 'sms' | 'form' | 'voice';

export type TdRole = 'owner' | 'admin' | 'agent';

export interface TdTag {
  tag: string;
  color: string;
}

export interface TdNote {
  _id: string;
  text: string;
  createdBy: string; // project_user id
  createdAt: string; // ISO date
}

export interface TdLocation {
  city?: string;
  country?: string;
  region?: string;
  ipAddress?: string;
  /** GeoJSON order: [longitude, latitude] */
  geometry?: { type: 'Point'; coordinates: [number, number] };
}

export interface TdLead {
  _id: string;
  /** Visitor id in the messaging layer. */
  lead_id: string;
  /** `guest#a104` for anonymous visitors. */
  fullname: string;
  email?: string;
  phone?: string;
  company?: string;
  streetAddress?: string;
  city?: string;
  region?: string;
  zipcode?: string;
  country?: string;
  note?: string;
  attributes?: Record<string, unknown>;
  tags?: string[];
  status?: number;
  createdAt: string;
}

export interface TdDepartment {
  _id: string;
  name: string;
  description?: string;
  routing?: 'assigned' | 'pooled' | 'fixed';
  default?: boolean;
  id_bot?: string;
  bot_only?: boolean;
  hasBot?: boolean;
  status?: number;
  tags?: string[];
}

export interface TdUser {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
}

/** Team member (`project_user`). */
export interface TdProjectUser {
  _id: string;
  id_user: TdUser;
  role: TdRole;
  user_available: boolean;
  isBusy?: boolean;
  number_assigned_requests?: number;
  last_login_at?: string;
  status?: number;
  tags?: string[];
  /** ➕ typed breaks, spoken languages, busy status */
  attributes?: {
    tarashli?: {
      availability?: 'available' | 'busy' | 'away';
      break?: { type: 'pause' | 'training' | 'prayer' | 'meal'; until: string };
      languages?: string[];
      maxLoad?: number;
    };
  };
}

/** Bot (`faq_kb`). */
export interface TdBot {
  _id: string;
  name: string;
  description?: string;
}

export interface TdParticipantAgent {
  _id: string;
  id_user: TdUser;
}

export interface TdRequester {
  uuid_user: string;
  role: string;
  isAuthenticated: boolean;
}

/** Tarashli extension block stored in `request.attributes.tarashli` (➕). */
export interface TarashliRequestExt {
  snoozed_until?: string;
  last_message?: { text: string; sender: string; createdAt: string; type?: string; isNote?: boolean };
  /** Since when the conversation waits for a human (status 100). Derived from system events in the real API. */
  waiting_since?: string;
  /** Last message sent by the customer: starts the 24 h service window (WhatsApp / Messenger / Instagram only). */
  last_customer_at?: string;
  sla?: { policy: string; policy_minutes: number; due_at: string; paused?: boolean; breached_at?: string; pause_reason?: 'prayer' | 'closed_hours' };
  handoff_reason?: HandoffReason;
  /** Unread incoming messages after the current agent's read cursor (collection read_cursors). */
  unread?: number;
  /** Is the agent mentioned in a note of this conversation and has not read it (collection mentions). */
  mentions_me?: boolean;
  /** Visitor blocked (ban). */
  blocked?: boolean;
  /** Agents currently looking at / writing in the conversation (ephemeral real-time presence). */
  viewers?: string[];
  pen_holder?: string;
  /** Intent detected by the bot for its current turn (co-pilot bar, F-144). */
  bot_intent?: { name: string; confidence: number };
}

export type HandoffReason = 'customer_asked' | 'bot_failed' | 'agent_transfer' | 'snooze_end' | 'handed_back';

/** `request` (a conversation). */
export interface TdRequest {
  _id: string;
  id: string;
  request_id: string;
  ticket_id: number;
  status: TdRequestStatus;
  workingStatus: TdWorkingStatus;
  hasBot: boolean;
  /** Bots are prefixed `bot_`. */
  participants: string[];
  participantsAgents: string[];
  participantsBots: string[];
  participatingAgents?: TdParticipantAgent[];
  participatingBots?: TdBot[];
  requester?: TdRequester;
  requester_id?: string;
  lead: TdLead;
  first_text: string;
  subject?: string;
  department?: TdDepartment;
  channel: { name: TdChannelName };
  channelOutbound?: { name: TdChannelName };
  priority: TdPriority;
  tags: TdTag[];
  notes: TdNote[];
  followers: string[];
  location?: TdLocation;
  language?: string;
  userAgent?: string;
  sourcePage?: string;
  attributes: {
    subtype?: string;
    departmentId?: string;
    departmentName?: string;
    ipAddress?: string;
    client?: string;
    sourcePage?: string;
    sourceTitle?: string;
    projectId?: string;
    widgetVer?: string;
    payload?: Record<string, unknown>;
    userFullname?: string;
    requester_id?: string;
    environment?: string;
    site_language?: string;
    /** ➕ pages viewed (timestamped) */
    pagesViewed?: { url: string; at: string }[];
    /** ➕ variables collected by the bot flow */
    botSlots?: { key: string; value: string; messageId?: string }[];
    tarashli?: TarashliRequestExt;
    [key: string]: unknown;
  };
  smartAssignment: boolean;
  preflight?: boolean;
  createdAt: string;
  updatedAt: string;
  assigned_at?: string;
  first_response_at?: string;
  waiting_time?: number;
  closed_at?: string;
  closed_by?: string;
  duration?: number;
  rating?: number;
  rating_message?: string;
}

/** Keys of `attributes.messagelabel` for system events. Tarashli renders them as localized sentences. */
export type TdEventKey =
  | 'CHAT_CREATED'
  | 'MEMBER_JOINED_GROUP'
  | 'MEMBER_LEFT_GROUP'
  | 'CHAT_REOPENED'
  | 'CHAT_CLOSED'
  | 'FLOW_TRIGGER'
  | 'TARASHLI_HANDOFF_REQUESTED' // ➕ customer asked for a human / bot failed
  | 'TARASHLI_SNOOZED' // ➕
  | 'TARASHLI_PENDING' // ➕
  | 'TARASHLI_HANDED_BACK'; // ➕

export interface TdMessageButton {
  type: 'text' | 'action' | 'url';
  value: string;
  action?: string;
  link?: string;
  /** ➕ marks the button the customer picked */
  chosen?: boolean;
}

export interface TdMessageAttachmentRich {
  buttons?: TdMessageButton[];
  /** list / card gallery */
  cards?: { title: string; subtitle?: string; imageUrl?: string; buttons?: TdMessageButton[] }[];
}

export interface TdMessage {
  _id: string;
  /** sender id: `bot_…` for a bot, `system` for the system, a project_user id for an agent, a lead_id for the visitor. */
  sender: string;
  senderFullname: string;
  /** request_id of the conversation */
  recipient: string;
  text: string;
  type: 'text' | 'image' | 'file' | 'frame' | 'location' | 'audio';
  metadata?: {
    src?: string;
    name?: string;
    type?: string;
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
    transcript?: string;
    lat?: number;
    lng?: number;
    waveform?: number[];
  };
  attributes?: {
    /** `info` = system event; `private` = ➕ internal note (to be validated with the back-end) */
    subtype?: 'info' | 'info/support' | 'private' | 'whisper';
    messagelabel?: { key: TdEventKey; parameters?: Record<string, string> };
    attachment?: TdMessageAttachmentRich;
    lang?: string;
    /** de-duplication of the optimistic send */
    tempUID?: string;
    updateconversation?: boolean;
    flow_version?: number;
    /** ➕ */
    tarashli_reason?: HandoffReason;
    tarashli_quoted?: string;
    tarashli_deleted?: boolean;
    tarashli_flagged?: boolean;
    tarashli_detected?: { language: string; dialect?: 'khaleeji' | 'fusha' | 'arabizi' | 'en' };
    tarashli_translation?: string;
    tarashli_normalized?: string;
    tarashli_failed?: boolean;
    /** ID document / sensitive image: blurred until an agent reveals it with a reason (I-6) */
    tarashli_sensitive?: boolean;
  };
  status: TdMessageStatus;
  channel_type?: 'group' | 'direct';
  channel?: { name: TdChannelName };
  language?: string;
  createdAt: string;
}

/** Saved view (➕ collection saved_views). */
export interface TdSavedView {
  _id: string;
  name: string;
  owner: string;
  shared: boolean;
  filters: FilterRow[];
  conjunction: 'and' | 'or';
  sort: SortKey;
}

export interface FilterRow {
  attribute: FilterAttribute;
  operator: 'is' | 'is_not' | 'contains' | 'before' | 'after';
  values: string[];
}

export type FilterAttribute =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'actor'
  | 'department'
  | 'team'
  | 'channel'
  | 'label'
  | 'language'
  | 'country'
  | 'created';

export type SortKey = 'last_activity' | 'created' | 'unread' | 'priority' | 'longest_wait' | 'sla';

export interface TdCannedResponse {
  _id: string;
  title: string;
  /** Typed after "/" */
  shortcut: string;
  text: string;
  language?: string;
}

export interface TdTeam {
  _id: string;
  name: string;
  members: string[];
}

export interface TdLabelDef {
  id: string;
  name: string;
  /** index into --tr-label-N */
  color: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface TdHours {
  enabled: boolean;
  timezone: string;
  /** Ramadan profile (➕) */
  profile: 'standard' | 'ramadan' | 'eid';
  /** minutes from midnight */
  days: { day: number; open: number; close: number; open2?: number; close2?: number }[];
}
