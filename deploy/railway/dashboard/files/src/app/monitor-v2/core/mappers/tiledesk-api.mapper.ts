import {
  TD_STATUS,
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
  TdTag,
  TdTeam,
} from '../models/tiledesk.models';

/**
 * Raw objects of the Tiledesk REST / WebSocket API (as the dashboard's own services return them) → the models of the
 * template. Nothing here calls the network and nothing mutates its input: the WebSocket list is shared with the old Monitor.
 */
type Raw = Record<string, any>;

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const iso = (v: unknown, fallback = new Date(0).toISOString()): string => {
  if (!v) return fallback;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? fallback : d.toISOString();
};

/** A stable colour index (1..6) from a string: the dashboard stores hex colours, the template uses 6 muted label colours. */
export function colorIndexFrom(s: string): 1 | 2 | 3 | 4 | 5 | 6 {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ((h % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}

// ---------------------------------------------------------------------------------------------------------- directory
/** Agents are identified by their USER id (that is what `participantsAgents`, `followers` and message senders hold). */
export function toTdAgent(pu: Raw, available?: boolean): TdProjectUser {
  const u: Raw = pu['id_user'] ?? {};
  return {
    _id: str(u['_id'] ?? pu['_id']),
    id_user: { _id: str(u['_id'] ?? pu['_id']), firstname: str(u['firstname']), lastname: str(u['lastname']), email: str(u['email']) },
    role: pu['role'] === 'owner' || pu['role'] === 'admin' ? pu['role'] : 'agent',
    user_available: available ?? !!pu['user_available'],
    isBusy: !!pu['isBusy'],
    number_assigned_requests: typeof pu['number_assigned_requests'] === 'number' ? pu['number_assigned_requests'] : undefined,
    last_login_at: pu['last_login_at'],
    status: pu['status'],
    tags: asArray(pu['tags']),
  };
}

/** `_id` stays the raw faq_kb id: `toBotVM` adds the `bot_` prefix the participants use. */
export function toTdBot(b: Raw): TdBot {
  return { _id: str(b['_id']), name: str(b['name'], 'Bot'), description: b['description'] };
}

export function toTdDepartment(d: Raw): TdDepartment {
  return {
    _id: str(d['_id']),
    name: str(d['name']),
    description: d['description'],
    routing: d['routing'],
    default: !!d['default'],
    id_bot: d['id_bot'],
    bot_only: !!d['bot_only'],
    hasBot: !!d['hasBot'] || !!d['id_bot'],
    status: d['status'],
    tags: asArray(d['tags']),
  };
}

export function toTdTeam(g: Raw): TdTeam {
  return { _id: str(g['_id']), name: str(g['name']), members: asArray(g['members']).map((m) => str(typeof m === 'object' ? m?._id : m)) };
}

export function toTdLabel(t: Raw): TdLabelDef {
  const name = str(t['tag'] ?? t['name']);
  return { id: name, name, color: colorIndexFrom(str(t['color'], name)) };
}

export function toTdCanned(c: Raw): TdCannedResponse {
  const title = str(c['title']);
  return { _id: str(c['_id']), title, shortcut: title.toLowerCase().replace(/\s+/g, '-'), text: str(c['text'] ?? c['message']), language: c['language'] };
}

/**
 * Project operating hours. The dashboard stores `operatingHours` as a JSON string:
 * `{ "tzname": "Europe/Rome", "0": [{ "start": "09:00", "end": "13:00" }, ...], ... }` (key = day, 0 = Sunday).
 */
export function toTdHours(project: Raw | undefined): TdHours {
  const disabled: TdHours = { enabled: false, timezone: 'UTC', profile: 'standard', days: [] };
  if (!project || !project['activeOperatingHours']) return disabled;
  let oh: Raw;
  try {
    oh = typeof project['operatingHours'] === 'string' ? JSON.parse(project['operatingHours']) : (project['operatingHours'] ?? {});
  } catch {
    return disabled;
  }
  const mins = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const days: TdHours['days'] = [];
  for (let day = 0; day < 7; day++) {
    const slots = asArray(oh[String(day)]);
    if (!slots.length) continue;
    const [a, b] = slots;
    days.push({ day, open: mins(str(a.start)), close: mins(str(a.end)), ...(b ? { open2: mins(str(b.start)), close2: mins(str(b.end)) } : {}) });
  }
  return { enabled: true, timezone: str(oh['tzname'], 'UTC'), profile: 'standard', days };
}

// -------------------------------------------------------------------------------------------------------- conversations
export function toTdLead(raw: Raw | string | undefined, requestFallback: Raw): TdLead {
  const lead: Raw = raw && typeof raw === 'object' ? raw : {};
  const attrs: Raw = requestFallback['attributes'] ?? {};
  const requesterId = str(lead['lead_id'] ?? attrs['requester_id'] ?? requestFallback['requester_id'] ?? (typeof raw === 'string' ? raw : ''));
  return {
    _id: str(lead['_id'] ?? (typeof raw === 'string' ? raw : requesterId)),
    lead_id: requesterId,
    fullname: str(lead['fullname'] ?? attrs['userFullname'], requesterId ? `guest#${requesterId.slice(-4)}` : 'guest'),
    email: lead['email'] ?? attrs['userEmail'],
    phone: lead['phone'],
    company: lead['company'],
    streetAddress: lead['streetAddress'],
    city: lead['city'],
    region: lead['region'],
    zipcode: lead['zipcode'],
    country: lead['country'],
    note: lead['note'],
    attributes: lead['attributes'],
    tags: asArray(lead['tags']),
    status: lead['status'],
    createdAt: iso(lead['createdAt'], iso(requestFallback['createdAt'])),
  };
}

/** `tags` of a request are plain names; the colour comes from the project's tag list (DirectoryStore labels). */
function toTdTags(raw: unknown): TdTag[] {
  return asArray(raw).map((t) => (typeof t === 'string' ? { tag: t, color: '' } : { tag: str(t?.tag ?? t?.name), color: str(t?.color) }));
}

export function toTdRequest(r: Raw): TdRequest {
  const snap: Raw = r['snapshot'] ?? {};
  const lead = toTdLead(snap['lead'] ?? r['lead'], r);
  const dept: Raw | undefined = snap['department'] ?? (typeof r['department'] === 'object' ? r['department'] : undefined);
  const requestId = str(r['request_id'] ?? r['id'] ?? r['_id']);
  const participants = asArray(r['participants']).map((x) => str(x));
  const participantsAgents = r['participantsAgents'] ? asArray(r['participantsAgents']).map((x) => str(x)) : participants.filter((p) => !p.startsWith('bot_'));
  const participantsBots = r['participantsBots'] ? asArray(r['participantsBots']).map((x) => str(x)) : participants.filter((p) => p.startsWith('bot_'));
  const channelName = r['channel']?.['name'] ?? 'chat21';
  return {
    _id: str(r['_id'] ?? r['id'] ?? requestId),
    id: str(r['id'] ?? r['_id'] ?? requestId),
    request_id: requestId,
    ticket_id: Number(r['ticket_id']) || 0,
    status: [50, 100, 150, 200, 1000].includes(r['status']) ? r['status'] : TD_STATUS.ASSIGNED,
    workingStatus: r['workingStatus'] === 'pending' ? 'pending' : 'open',
    hasBot: !!r['hasBot'] || participantsBots.length > 0,
    participants,
    participantsAgents,
    participantsBots,
    requester_id: lead.lead_id,
    lead,
    first_text: str(r['first_text']),
    subject: r['subject'] || undefined,
    department: dept ? toTdDepartment(dept) : undefined,
    channel: { name: channelName },
    channelOutbound: r['channelOutbound'],
    priority: (['urgent', 'high', 'medium', 'low'].includes(r['priority']) ? r['priority'] : 'medium') as TdPriority,
    tags: toTdTags(r['tags']),
    notes: asArray(r['notes']).map((n) => ({ _id: str(n?._id), text: str(n?.text), createdBy: str(n?.createdBy), createdAt: iso(n?.createdAt) })),
    followers: asArray(r['followers']).map((x) => str(x)),
    location: r['location'],
    language: r['language'],
    userAgent: r['userAgent'],
    sourcePage: r['sourcePage'],
    // `attributes.tarashli` (➕ server extensions: SLA, unread cursor, mentions, pen lock...) does not exist on a real server:
    // the template's mapper falls back to first_text / updatedAt and shows nothing for what is missing.
    attributes: { ...(r['attributes'] ?? {}), departmentName: (r['attributes'] ?? {})['departmentName'] ?? dept?.['name'] },
    smartAssignment: r['smartAssignment'] !== false,
    preflight: !!r['preflight'],
    createdAt: iso(r['createdAt']),
    updatedAt: iso(r['updatedAt'], iso(r['createdAt'])),
    assigned_at: r['assigned_at'],
    first_response_at: r['first_response_at'],
    waiting_time: r['waiting_time'],
    closed_at: r['closed_at'],
    closed_by: r['closed_by'],
    duration: r['duration'],
    rating: r['rating'],
    rating_message: r['rating_message'],
  };
}

/** What changes the look of a list row: used to emit `request.updated` only when needed. */
export function requestSignature(r: Raw): string {
  return [r['updatedAt'], r['status'], r['workingStatus'], r['priority'], r['messages_count'], asArray(r['participants']).join(','), asArray(r['tags']).join(','), asArray(r['notes']).length, asArray(r['followers']).length].join('|');
}

// ----------------------------------------------------------------------------------------------------------- messages
export function toTdMessage(m: Raw, requestId: string): TdMessage {
  return {
    _id: str(m['_id'] ?? m['id']),
    sender: str(m['sender']),
    senderFullname: str(m['senderFullname']),
    recipient: str(m['recipient'], requestId),
    text: str(m['text']),
    type: ['text', 'image', 'file', 'frame', 'location', 'audio'].includes(m['type']) ? m['type'] : 'text',
    metadata: m['metadata'] && typeof m['metadata'] === 'object' ? m['metadata'] : undefined,
    attributes: m['attributes'] ?? undefined,
    // a message read from the server is stored, never "sending" (status 0 stays 0 on a server without the chat engine)
    status: [100, 150, 200].includes(m['status']) ? m['status'] : 150,
    channel_type: m['channel_type'],
    channel: m['channel'],
    language: m['language'],
    createdAt: iso(m['createdAt'] ?? m['timestamp']),
  };
}
