import { TD_STATUS, TdRequest } from '../models/tiledesk.models';
import { ActorKind, ActorVM, ConversationVM, MessageAuthorKind, Priority, SlaVM, WindowVM } from '../models/view-models';
import { channelCapabilities } from '../util/channel';
import { colorIndexOf, guestSuffix, initialsOf } from '../util/text';
import { MapContext, tagToLabel } from './map-context';

const HOUR = 3_600_000;

/**
 * request → ConversationVM. All state rules follow the table of document section 12.3
 * ("États de conversation"). To plug the real API in, feed this function with `GET /requests` items.
 */
export function toConversationVM(r: TdRequest, ctx: MapContext, draft?: string): ConversationVM {
  const ext = r.attributes.tarashli ?? {};
  const now = ctx.now.getTime();
  const snoozedUntil = ext.snoozed_until ? new Date(ext.snoozed_until) : undefined;

  const agents = r.participantsAgents.map((id) => ctx.agents.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
  const bots = r.participantsBots.map((id) => ctx.bots.get(id) ?? { id, name: id });

  const kind = actorKind(r, snoozedUntil, now);
  const waitingSince = ext.waiting_since ? new Date(ext.waiting_since) : undefined;
  const actor = buildActor(kind, agents[0]?.firstName, agents.some((a) => a.id === ctx.meId), bots[0]?.name, waitingSince ?? new Date(r.updatedAt));

  const presence = ctx.presence.get(r.lead.lead_id);
  const guest = guestSuffix(r.lead.fullname);

  const lm = ext.last_message;
  const lastMessage = lm
    ? {
        text: lm.text,
        authorKind: authorKindOf(lm.sender, ctx, lm.isNote),
        authorName: authorName(lm.sender, ctx),
        at: new Date(lm.createdAt),
        type: lm.type ?? 'text',
      }
    : { text: r.first_text, authorKind: 'customer' as MessageAuthorKind, authorName: r.lead.fullname, at: new Date(r.createdAt), type: 'text' };

  return {
    id: r.request_id,
    ticket: r.ticket_id,
    subject: r.subject,
    customer: {
      id: r.lead.lead_id,
      name: r.lead.fullname,
      isGuest: !!guest,
      initials: initialsOf(r.lead.fullname),
      colorIndex: colorIndexOf(r.lead.lead_id),
      online: presence?.online ?? false,
      lastSeen: presence?.lastSeen,
      typing: presence?.typing ?? false,
      email: r.lead.email,
      phone: r.lead.phone,
      city: r.location?.city,
      country: r.location?.country,
      language: r.language,
    },
    channel: channelCapabilities(r.channel.name),
    actor,
    state: kind,
    priority: (r.priority ?? 'medium') as Priority,
    labels: r.tags.map((t) => tagToLabel(t, ctx)),
    lastMessage,
    unread: ext.unread ?? 0,
    draft,
    sla: buildSla(ext.sla ? { ...ext.sla, paused: ext.sla.paused || !!ctx.slaPause, pause_reason: ext.sla.pause_reason ?? ctx.slaPause } : undefined, now),
    window: buildWindow(r, ext.last_customer_at, now),
    viewers: (ext.viewers ?? []).map((id) => ctx.agents.get(id)).filter((a): a is NonNullable<typeof a> => !!a && a.id !== ctx.meId),
    penHolder: ext.pen_holder ? ctx.agents.get(ext.pen_holder) : undefined,
    snoozedUntil,
    department: r.department ? { id: r.department._id, name: r.department.name } : undefined,
    agents,
    bots,
    followers: r.followers,
    mentionsMe: !!ext.mentions_me,
    blocked: !!ext.blocked,
    smartAssignment: r.smartAssignment,
    hasBot: r.hasBot,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
    waitingSince: kind === 'waiting_human' ? (waitingSince ?? new Date(r.updatedAt)) : undefined,
    raw: r,
  };
}

/** Table "États de conversation" (section 12.3). Snoozed wins over every open state. */
export function actorKind(r: TdRequest, snoozedUntil: Date | undefined, now: number): ActorKind {
  if (snoozedUntil && snoozedUntil.getTime() > now && r.status !== TD_STATUS.CLOSED) return 'snoozed';
  if (r.status === TD_STATUS.CLOSED) return 'closed';
  if (r.status === TD_STATUS.ABANDONED) return 'abandoned';
  if (r.status === TD_STATUS.QUEUED) return 'waiting_human';
  if (r.workingStatus === 'pending') return 'customer_pending';
  if (r.participantsAgents.length > 0) return 'human';
  if (r.participantsBots.length > 0) return 'bot';
  return 'waiting_human';
}

function buildActor(kind: ActorKind, firstAgent: string | undefined, isMe: boolean, botName: string | undefined, since: Date): ActorVM {
  switch (kind) {
    case 'bot':
      return { kind, label: botName ?? '', isMe: false, since };
    case 'human':
    case 'customer_pending':
      return { kind, label: firstAgent ?? '', isMe, since };
    default:
      return { kind, label: '', isMe: false, since };
  }
}

function authorKindOf(sender: string, ctx: MapContext, isNote?: boolean): MessageAuthorKind {
  if (isNote) return 'note';
  if (sender === 'system') return 'system';
  if (sender.startsWith('bot_')) return 'bot';
  if (ctx.agents.has(sender)) return 'agent';
  return 'customer';
}

function authorName(sender: string, ctx: MapContext): string {
  if (sender.startsWith('bot_')) return ctx.bots.get(sender)?.name ?? 'Bot';
  return ctx.agents.get(sender)?.firstName ?? '';
}

function buildSla(sla: { due_at: string; policy_minutes: number; paused?: boolean; pause_reason?: 'prayer' | 'closed_hours' } | undefined, now: number): SlaVM | undefined {
  if (!sla) return undefined;
  const dueAt = new Date(sla.due_at);
  const remaining = dueAt.getTime() - now;
  const level: SlaVM['level'] = sla.paused ? 'ok' : remaining <= 0 ? 'breached' : remaining < sla.policy_minutes * 60_000 * 0.25 ? 'risk' : 'ok';
  return { dueAt, paused: !!sla.paused, level, pauseReason: sla.pause_reason };
}

/** 24 h service window, only for channels that have one (WhatsApp / Messenger / Instagram). Never shown on web. */
function buildWindow(r: TdRequest, lastCustomerAt: string | undefined, now: number): WindowVM | undefined {
  if (!channelCapabilities(r.channel.name).hasServiceWindow || !lastCustomerAt) return undefined;
  const expiresAt = new Date(new Date(lastCustomerAt).getTime() + 24 * HOUR);
  const remaining = expiresAt.getTime() - now;
  return { expiresAt, level: remaining <= 0 ? 'closed' : remaining < HOUR ? 'closing' : 'open' };
}
