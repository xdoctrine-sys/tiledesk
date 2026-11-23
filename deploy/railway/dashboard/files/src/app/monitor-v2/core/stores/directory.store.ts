import { computed, signal } from '../../core/signals';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from '../../core/rxjs-compat';
import { toAgentVM, toBotVM } from '../mappers/map-context';
import { TdBot, TdCannedResponse, TdDepartment, TdHours, TdLabelDef, TdProjectUser, TdSavedView, TdTeam } from '../models/tiledesk.models';
import { AgentVM, BotStepVM, BotVM, CannedVM, LabelVM } from '../models/view-models';
import { InboxApi } from '../services/inbox-api';

/** Static-ish project data: team, bots, departments, teams, labels, saved replies, saved views, opening hours. */
@Injectable()
export class DirectoryStore {
  private readonly api = inject(InboxApi);

  readonly loaded = signal(false);
  readonly meRaw = signal<TdProjectUser | null>(null);
  readonly agentsRaw = signal<TdProjectUser[]>([]);
  readonly botsRaw = signal<TdBot[]>([]);
  readonly departments = signal<TdDepartment[]>([]);
  readonly teams = signal<TdTeam[]>([]);
  readonly labelDefs = signal<TdLabelDef[]>([]);
  readonly cannedRaw = signal<TdCannedResponse[]>([]);
  readonly savedViews = signal<TdSavedView[]>([]);
  readonly hours = signal<TdHours | null>(null);
  /** Real project name (null with the demo data: the generic label is shown). */
  readonly projectName = signal<string | null>(null);

  readonly meId = computed(() => this.meRaw()?._id ?? '');
  readonly agents = computed<AgentVM[]>(() => this.agentsRaw().map((a) => toAgentVM(a, this.meId())));
  readonly me = computed(() => this.agents().find((a) => a.isMe) ?? null);
  readonly bots = computed<BotVM[]>(() => this.botsRaw().map(toBotVM));
  readonly labels = computed<LabelVM[]>(() => this.labelDefs().map((l) => ({ id: l.id, name: l.name, color: l.color })));
  readonly canned = computed<CannedVM[]>(() => this.cannedRaw().map((c) => ({ id: c._id, title: c.title, shortcut: c.shortcut, text: c.text })));
  readonly agentsById = computed(() => new Map(this.agents().map((a) => [a.id, a])));
  readonly botsById = computed(() => new Map(this.bots().map((b) => [b.id, b])));
  readonly labelsByName = computed(() => new Map(this.labels().map((l) => [l.id, l])));

  async load(): Promise<void> {
    const [me, agents, bots, depts, teams, labels, canned, views, hours] = await Promise.all([
      firstValueFrom(this.api.me()),
      firstValueFrom(this.api.listAgents()),
      firstValueFrom(this.api.listBots()),
      firstValueFrom(this.api.listDepartments()),
      firstValueFrom(this.api.listTeams()),
      firstValueFrom(this.api.listLabels()),
      firstValueFrom(this.api.listCanned()),
      firstValueFrom(this.api.listSavedViews()),
      firstValueFrom(this.api.getHours()),
    ]);
    this.meRaw.set(me);
    this.agentsRaw.set(agents);
    this.botsRaw.set(bots);
    this.departments.set(depts);
    this.teams.set(teams);
    this.labelDefs.set(labels);
    this.cannedRaw.set(canned);
    this.savedViews.set(views);
    this.hours.set(hours);
    this.projectName.set(await firstValueFrom(this.api.projectName()).catch(() => null));
    this.loaded.set(true);
  }

  async saveView(view: Omit<TdSavedView, '_id' | 'owner'>): Promise<TdSavedView> {
    const saved = await firstValueFrom(this.api.saveView(view));
    this.savedViews.update((v) => [...v, saved]);
    return saved;
  }

  /** Steps of a bot's flow, for "Hand back to the AI" (I-2). */
  botSteps(botId: string): Promise<BotStepVM[]> {
    return firstValueFrom(this.api.listBotSteps(botId));
  }

  // Saved views are edited locally here; add the matching REST calls to InboxApi when wiring the real back-end.
  renameView(id: string, name: string): void {
    this.savedViews.update((v) => v.map((x) => (x._id === id ? { ...x, name } : x)));
  }
  toggleShareView(id: string): void {
    this.savedViews.update((v) => v.map((x) => (x._id === id ? { ...x, shared: !x.shared } : x)));
  }
  deleteView(id: string): void {
    this.savedViews.update((v) => v.filter((x) => x._id !== id));
  }

  /** Create a label on the fly (F-46, F-137: "+ Create"). Colours cycle through the muted palette. */
  createLabel(name: string): LabelVM {
    const existing = this.labelDefs().find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) return { id: existing.id, name: existing.name, color: existing.color };
    const def: TdLabelDef = { id: name, name, color: ((this.labelDefs().length % 6) + 1) as TdLabelDef['color'] };
    this.labelDefs.update((l) => [...l, def]);
    return { id: def.id, name: def.name, color: def.color };
  }

  createCanned(title: string, shortcut: string, text: string): void {
    this.cannedRaw.update((c) => [...c, { _id: `c_${Date.now()}`, title, shortcut, text }]);
  }
}
