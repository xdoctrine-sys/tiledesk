import { TdBot, TdProjectUser, TdTag, TdUser } from '../models/tiledesk.models';
import { AgentVM, BotVM, LabelVM } from '../models/view-models';
import { colorIndexOf, initialsOf } from '../util/text';

/** Everything a mapper needs besides the raw object. Built once by the stores from the directory data. */
export interface MapContext {
  now: Date;
  meId: string;
  agents: Map<string, AgentVM>;
  bots: Map<string, BotVM>;
  labels: Map<string, LabelVM>;
  presence: Map<string, { online: boolean; lastSeen?: Date; typing?: boolean }>;
  /** While a prayer break or closed hours are running, SLA clocks are paused (I-3) */
  slaPause?: 'prayer' | 'closed_hours';
}

export function toAgentVM(pu: TdProjectUser, meId: string, activeCount = 0): AgentVM {
  const ext = pu.attributes?.tarashli;
  const name = `${pu.id_user.firstname} ${pu.id_user.lastname}`.trim();
  return {
    id: pu._id,
    name,
    firstName: pu.id_user.firstname,
    initials: initialsOf(name),
    colorIndex: colorIndexOf(pu._id),
    email: pu.id_user.email,
    role: pu.role,
    available: pu.user_available && ext?.availability !== 'away',
    busy: !!pu.isBusy || ext?.availability === 'busy',
    load: pu.number_assigned_requests ?? activeCount,
    maxLoad: ext?.maxLoad ?? 5,
    breakType: ext?.break?.type,
    breakUntil: ext?.break ? new Date(ext.break.until) : undefined,
    languages: ext?.languages ?? [],
    isMe: pu._id === meId,
  };
}

export function toBotVM(bot: TdBot): BotVM {
  return { id: `bot_${bot._id}`, name: bot.name };
}

export function userFullname(u: TdUser): string {
  return `${u.firstname} ${u.lastname}`.trim();
}

export function tagToLabel(tag: TdTag, ctx: MapContext): LabelVM {
  return ctx.labels.get(tag.tag) ?? { id: tag.tag, name: tag.tag, color: ((colorIndexOf(tag.tag) % 6) + 1) as LabelVM['color'] };
}
