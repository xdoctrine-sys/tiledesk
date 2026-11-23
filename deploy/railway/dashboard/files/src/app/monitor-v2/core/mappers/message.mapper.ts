import { TdMessage, TdRequest } from '../models/tiledesk.models';
import { AttachmentVM, MessageAuthorKind, MessageVM } from '../models/view-models';
import { colorIndexOf, initialsOf } from '../util/text';
import { detectPii } from '../util/pii';
import { MapContext } from './map-context';

const STATUS_MAP: Record<number, MessageVM['status']> = { 0: 'sending', 100: 'sent', 150: 'delivered', 200: 'read' };

/** True for the command sent by the widget to start a flow, e.g. "/listing_en". */
export function isFlowCommand(m: TdMessage): boolean {
  return m.type === 'text' && /^\/[\w-]+$/.test(m.text.trim()) && !m.attributes?.subtype;
}

export function authorKindOfMessage(m: TdMessage, ctx: MapContext): MessageAuthorKind {
  const sub = m.attributes?.subtype;
  if (sub === 'info' || sub === 'info/support' || m.sender === 'system') return 'system';
  if (sub === 'private') return 'note';
  if (sub === 'whisper') return 'whisper';
  if (m.sender.startsWith('bot_')) return 'bot';
  if (ctx.agents.has(m.sender)) return 'agent';
  return 'customer';
}

/**
 * message[] → MessageVM[]. System events are localized from `attributes.messagelabel` (never from the raw
 * `senderFullname`, which carries technical ids). Quotes are resolved against the same list.
 */
export function toMessageVMs(messages: TdMessage[], request: TdRequest, ctx: MapContext): MessageVM[] {
  const byId = new Map(messages.map((m) => [m._id, m]));
  return messages.map((m) => toMessageVM(m, request, ctx, byId));
}

export function toMessageVM(m: TdMessage, request: TdRequest, ctx: MapContext, byId?: Map<string, TdMessage>): MessageVM {
  let kind = authorKindOfMessage(m, ctx);
  const flow = isFlowCommand(m) && kind === 'customer';
  if (flow) kind = 'system';

  const author = authorInfo(m, kind, request, ctx);
  const label = m.attributes?.messagelabel;
  let eventKey: string | undefined;
  let eventParams: Record<string, string> | undefined;

  if (flow) {
    eventKey = 'FLOW_TRIGGER';
    eventParams = { command: m.text.trim() };
  } else if (kind === 'system' && label) {
    eventKey = label.key;
    eventParams = { ...(label.parameters ?? {}) };
    const memberId = eventParams['member_id'];
    if (memberId) {
      const isBot = memberId.startsWith('bot_');
      eventParams['name'] = isBot ? (ctx.bots.get(memberId)?.name ?? memberId) : (ctx.agents.get(memberId)?.firstName ?? memberId);
      eventKey = `${label.key}.${isBot ? 'bot' : 'agent'}`;
    }
    if (label.key === 'TARASHLI_HANDOFF_REQUESTED' && m.attributes?.tarashli_reason) eventKey = `${label.key}.${m.attributes.tarashli_reason}`;
    if (label.key === 'TARASHLI_HANDED_BACK' && eventParams['bot_id']) eventParams['bot'] = ctx.bots.get(eventParams['bot_id'])?.name ?? '';
    if (eventParams['agent_id']) eventParams['agent'] = ctx.agents.get(eventParams['agent_id'])?.firstName ?? '';
  }

  const attachments = attachmentsOf(m);
  const quotedSrc = m.attributes?.tarashli_quoted ? byId?.get(m.attributes.tarashli_quoted) : undefined;
  const detected = m.attributes?.tarashli_detected;

  return {
    id: m._id,
    tempId: m.attributes?.tempUID,
    authorKind: kind,
    author,
    text: m.text,
    eventKey,
    eventParams,
    type: kind === 'system' ? 'event' : (m.type === 'frame' ? 'text' : m.type),
    rich: m.attributes?.attachment,
    attachments,
    status: m.attributes?.tarashli_failed ? 'failed' : (STATUS_MAP[m.status] ?? 'sent'),
    createdAt: new Date(m.createdAt),
    detectedLanguage: detected?.language ?? m.language,
    register: detected?.dialect,
    suggestedTranslation: m.attributes?.tarashli_translation,
    normalized: m.attributes?.tarashli_normalized,
    piiSpans: kind === 'customer' ? detectPii(m.text) : [],
    quoted: quotedSrc
      ? { id: quotedSrc._id, authorName: authorInfo(quotedSrc, authorKindOfMessage(quotedSrc, ctx), request, ctx).name, text: quotedSrc.text }
      : undefined,
    deleted: !!m.attributes?.tarashli_deleted,
    flagged: !!m.attributes?.tarashli_flagged,
    isOutgoing: kind === 'agent' || kind === 'bot' || kind === 'note' || kind === 'whisper',
    isFlowTrigger: flow,
  };
}

function authorInfo(m: TdMessage, kind: MessageAuthorKind, request: TdRequest, ctx: MapContext) {
  if (kind === 'customer') {
    return { id: request.lead.lead_id, name: request.lead.fullname, initials: initialsOf(request.lead.fullname), colorIndex: colorIndexOf(request.lead.lead_id) };
  }
  if (kind === 'bot') {
    const name = ctx.bots.get(m.sender)?.name ?? m.senderFullname;
    return { id: m.sender, name, initials: initialsOf(name), colorIndex: 0 };
  }
  if (kind === 'agent' || kind === 'note' || kind === 'whisper') {
    const a = ctx.agents.get(m.sender);
    const name = a?.firstName ?? m.senderFullname;
    return { id: m.sender, name, initials: a?.initials ?? initialsOf(name), colorIndex: a?.colorIndex ?? colorIndexOf(m.sender), avatarUrl: a?.avatarUrl };
  }
  return { id: 'system', name: '', initials: '', colorIndex: 0 };
}

function attachmentsOf(m: TdMessage): AttachmentVM[] {
  const md = m.metadata;
  if (!md) return [];
  if (m.type === 'image') return [{ id: `${m._id}_a`, kind: 'image', name: md.name ?? 'image', url: md.src, mime: md.type, size: md.size, width: md.width, height: md.height, sensitive: !!m.attributes?.tarashli_sensitive }];
  if (m.type === 'file') return [{ id: `${m._id}_a`, kind: 'file', name: md.name ?? 'file', url: md.src, mime: md.type, size: md.size }];
  if (m.type === 'audio')
    return [{ id: `${m._id}_a`, kind: 'audio', name: md.name ?? 'voice', url: md.src, duration: md.duration, transcript: md.transcript, waveform: md.waveform }];
  if (m.type === 'location') return [{ id: `${m._id}_a`, kind: 'location', name: md.name ?? '', lat: md.lat, lng: md.lng }];
  return [];
}
