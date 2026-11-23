import { HandoffReason, TD_STATUS, TdMessage, TdRequest } from '../models/tiledesk.models';
import { RelayKind, RelaySegmentVM } from '../models/view-models';
import { MapContext } from './map-context';
import { authorKindOfMessage, isFlowCommand } from './message.mapper';

/**
 * Relay ribbon data (improvement I-1). A new segment starts at each system event that changes who is
 * responsible: a bot/agent joins or leaves, a pending/snooze/reopen/close event. The kind of a segment:
 * `bot` if only bots are participants, `waiting_human` between the bot leaving and an agent joining,
 * `human` otherwise. `handoff_reason` (➕) comes from the flow or from the assign action.
 */
export function buildRelay(request: TdRequest, messages: TdMessage[], ctx: MapContext): RelaySegmentVM[] {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const bots = new Set<string>();
  const agents = new Set<string>();
  let pending = false;
  let snoozed = false;
  let closed = false;
  let reason: HandoffReason | undefined;

  const segments: RelaySegmentVM[] = [];
  const holder: { cur: RelaySegmentVM | null } = { cur: null };

  const kindNow = (): RelayKind | null => (closed ? null : snoozed ? 'snoozed' : pending ? 'customer_pending' : agents.size ? 'human' : bots.size ? 'bot' : 'waiting_human');
  const labelNow = (k: RelayKind): string => {
    if (k === 'bot') return ctx.bots.get([...bots][0] ?? '')?.name ?? '';
    if (k === 'human' || k === 'customer_pending') return ctx.agents.get([...agents][0] ?? '')?.firstName ?? '';
    return '';
  };

  const transition = (at: string) => {
    const k = kindNow();
    const label = k ? labelNow(k) : '';
    if (holder.cur && holder.cur.kind === k && holder.cur.actorLabel === label) return;
    if (holder.cur) holder.cur.end = new Date(at);
    if (k) {
      holder.cur = { kind: k, actorLabel: label, start: new Date(at), reason, messageCount: 0 };
      segments.push(holder.cur);
      reason = undefined;
    } else {
      holder.cur = null;
    }
  };

  for (const m of sorted) {
    if (authorKindOfMessage(m, ctx) === 'system' && m.attributes?.messagelabel) {
      const { key, parameters } = m.attributes.messagelabel;
      const member = parameters?.['member_id'] ?? '';
      switch (key) {
        case 'CHAT_CREATED':
          transition(m.createdAt);
          break;
        case 'MEMBER_JOINED_GROUP':
          (member.startsWith('bot_') ? bots : agents).add(member);
          if (!member.startsWith('bot_') && holder.cur?.kind === 'bot') reason = reason ?? 'agent_transfer';
          if (!member.startsWith('bot_')) pending = false;
          transition(m.createdAt);
          break;
        case 'MEMBER_LEFT_GROUP':
          (member.startsWith('bot_') ? bots : agents).delete(member);
          transition(m.createdAt);
          break;
        case 'TARASHLI_HANDOFF_REQUESTED':
          reason = m.attributes.tarashli_reason ?? 'customer_asked';
          break;
        case 'TARASHLI_HANDED_BACK':
          reason = 'handed_back';
          break;
        case 'TARASHLI_PENDING':
          pending = true;
          transition(m.createdAt);
          break;
        case 'TARASHLI_SNOOZED':
          snoozed = true;
          transition(m.createdAt);
          break;
        case 'CHAT_REOPENED':
          closed = false;
          snoozed = false;
          pending = false;
          reason = reason ?? 'snooze_end';
          transition(m.createdAt);
          break;
        case 'CHAT_CLOSED':
          closed = true;
          transition(m.createdAt);
          break;
      }
    } else if (holder.cur && !isFlowCommand(m)) {
      holder.cur.messageCount += 1;
      holder.cur.firstMessageId ??= m._id;
    }
  }

  // The segment in progress has no end. A closed conversation ends at closed_at.
  if (holder.cur && request.status === TD_STATUS.CLOSED && request.closed_at) (holder.cur as RelaySegmentVM).end = new Date(request.closed_at);

  // Drop zero-length transitions (bot leaves and agent joins in the same second)
  return segments.filter((s) => !s.end || s.end.getTime() - s.start.getTime() >= 1000 || s.kind !== 'waiting_human');
}
