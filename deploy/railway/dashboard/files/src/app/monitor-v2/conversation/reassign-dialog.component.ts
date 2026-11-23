import { Signal, computed, effect, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { AgentVM } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { AssignTarget } from '../core/services/inbox-api';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { UiStore } from '../core/stores/ui.store';
import { TrAvatarComponent } from '../ui/avatar.component';

type Tab = 'humans' | 'bots' | 'departments' | 'teams';
interface Row { kind: AssignTarget['kind']; id: string; name: string; sub: string; agent?: AgentVM; disabled?: boolean }

/**
 * Assign / transfer (E-10, F-42) and "Add teammate" (F-43): tabs Humans / Bots / Departments / Teams with search; each human
 * shows presence, role, load gauge n/max, languages and a "Recommended" mark (available, lowest load, speaks the
 * customer's language). Agents on a break are greyed with their return time and still assignable after a confirmation.
 * Optional handover note (published as an internal note) and "Stay as follower".
 */
@Component({
  standalone: true,
  selector: 'tr-reassign-dialog',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, CommonModule],
  template: `
    <dialog #dlg class="tr-dialog wide" aria-labelledby="ra-t" (close)="ui.close()" (click)="$event.target === dlg ? ui.close() : null">
      <form class="box" (submit)="$event.preventDefault(); submit()">
        <header class="hd">
          <h2 id="ra-t">{{ (mode() === 'add' ? 'assign.addTitle' : 'assign.title') | t: { n: conv.selected()?.ticket ?? '' } }}</h2>
          <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="ui.close()"><tr-icon name="x" [size]="18"></tr-icon></button>
        </header>
        <label class="srch"><tr-icon name="search" [size]="16"></tr-icon><input class="tr-field" dir="auto" [placeholder]="'assign.search' | t" [value]="query()" (input)="query.set($any($event.target).value)" autocomplete="off" /></label>
        <ng-container *ngIf="mode() === 'assign'">
          <div class="tabs" role="tablist">
            <ng-container *ngFor="let t of tabs; trackBy: __trk1"> <button type="button" role="tab" class="tab" [class.on]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ ('assign.tab.' + t) | t }} <span class="n">{{ counts()[t] }}</span></button> </ng-container>
          </div>
        </ng-container>
        <ul class="list" role="listbox" [attr.aria-label]="'assign.title' | t: { n: '' }">
          <ng-container *ngFor="let r of rows(); trackBy: __trk6">
            <li>
              <button type="button" role="option" class="row" [class.on]="isSel(r)" [class.dim]="r.disabled" [attr.aria-selected]="isSel(r)" (click)="selected.set(r)">
                <ng-container *ngIf="r.agent as a; else __e2">
                  <tr-avatar [initials]="a.initials" [size]="36" [presence]="a.available && !a.breakType ? 'online' : 'offline'"></tr-avatar>
                </ng-container><ng-template #__e2><ng-container *ngIf="r.kind === 'bot'; else __e3"> <tr-avatar kind="bot" [size]="36"></tr-avatar> </ng-container><ng-template #__e3> <span class="ico"><tr-icon [name]="r.kind === 'team' ? 'users' : 'building-2'" [size]="18"></tr-icon></span> </ng-template></ng-template>
                <span class="who"><strong class="tr-truncate">{{ r.name }}</strong><span class="sub tr-truncate">{{ r.sub }}</span></span>
                <ng-container *ngIf="r.agent as a">
                  <ng-container *ngIf="a.breakType; else __e5"> <span class="brk">{{ 'assign.onBreak' | t: { type: ('presence.break.' + a.breakType | t), time: fmt.time(a.breakUntil!) } }}</span> </ng-container><ng-template #__e5>
                    <span class="gauge" [attr.aria-label]="'assign.load' | t: { n: a.load, max: a.maxLoad }"><span class="bar"><i [style.inline-size.%]="Math.min(100, (a.load / a.maxLoad) * 100)"></i></span><span class="ld">{{ a.load }}/{{ a.maxLoad }}</span></span>
                    <ng-container *ngIf="a.id === recommendedId(); else __e4"> <span class="rec">{{ 'assign.recommended' | t }}</span> </ng-container><ng-template #__e4><ng-container *ngIf="a.load >= a.maxLoad"> <span class="full">{{ 'assign.full' | t }}</span> </ng-container></ng-template>
                  </ng-template>
                </ng-container>
                <ng-container *ngIf="isSel(r)"> <tr-icon name="check" [size]="16" class="ok"></tr-icon> </ng-container>
              </button>
            </li>
          </ng-container><ng-container *ngIf="!(rows())?.length"> <li class="none">{{ 'search.empty' | t: { q: query() } }}</li> </ng-container>
        </ul>
        <ng-container *ngIf="mode() === 'assign'">
          <label class="note"><span>{{ 'assign.note' | t }}</span><textarea class="tr-field" rows="2" dir="auto" [value]="note()" (input)="note.set($any($event.target).value)" [placeholder]="'assign.notePlaceholder' | t"></textarea></label>
          <label class="follow"><input type="checkbox" [checked]="follow()" (change)="follow.set($any($event.target).checked)" />{{ 'assign.follow' | t }}</label>
        </ng-container>
        <footer class="ft">
          <button type="button" class="tr-btn" (click)="ui.close()">{{ 'common.cancel' | t }}</button>
          <button type="submit" class="tr-btn tr-btn--primary" [disabled]="!selected()">{{ (mode() === 'add' ? 'assign.addConfirm' : 'assign.confirm') | t: { name: selected()?.name ?? '' } }}</button>
        </footer>
      </form>
    </dialog>
  `,
  styles: [`
    dialog.wide { max-inline-size: min(560px, calc(100vw - 32px)); }
    .box { display: flex; flex-direction: column; gap: 12px; padding: 20px 24px 20px; max-block-size: calc(100vh - 48px); }
    .hd { display: flex; align-items: center; justify-content: space-between; } h2 { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .srch { position: relative; display: flex; align-items: center; } .srch tr-icon { position: absolute; inset-inline-start: 12px; color: var(--muted-foreground); pointer-events: none; } .srch .tr-field { padding-inline-start: 36px; }
    .tabs { display: flex; gap: 4px; border-block-end: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
    .tab { position: relative; flex: none; min-block-size: 40px; padding-inline: 10px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); white-space: nowrap; } .tab.on { color: var(--foreground); font-weight: 600; }
    .tab.on::after { content: ''; position: absolute; inset-inline: 6px; inset-block-end: -1px; block-size: 2px; background: var(--brand); border-radius: 2px; } .n { color: var(--muted-foreground); font-weight: 400; }
    .list { flex: 1; min-block-size: 120px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
    .row { display: flex; align-items: center; gap: 12px; inline-size: 100%; min-block-size: 56px; padding: 8px 10px; border-radius: var(--radius-md); }
    .row:hover { background: var(--muted); } .row.on { background: var(--accent); } .row.dim .who { opacity: .6; }
    .ico { display: inline-flex; align-items: center; justify-content: center; inline-size: 36px; block-size: 36px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); flex: none; }
    .who { display: flex; flex-direction: column; flex: 1; min-inline-size: 0; } .who .sub { color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .gauge { display: inline-flex; align-items: center; gap: 8px; flex: none; } .bar { inline-size: 56px; block-size: 6px; border-radius: 3px; background: var(--muted); overflow: hidden; } .bar i { display: block; block-size: 100%; background: var(--muted-foreground); }
    .ld { min-inline-size: 28px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .rec { color: var(--foreground); font-size: var(--tr-fs-caption); font-weight: 600; } .full, .brk { color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .ok { color: var(--brand); flex: none; }
    .none { padding: 24px; text-align: center; color: var(--muted-foreground); }
    .note { display: flex; flex-direction: column; gap: 6px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } textarea { resize: vertical; }
    .follow { display: flex; align-items: center; gap: 10px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); min-block-size: 32px; } .follow input { accent-color: var(--brand); inline-size: 18px; block-size: 18px; }
    .ft { display: flex; justify-content: flex-end; gap: 8px; }
  `],
})
export class TrReassignDialogComponent {
  readonly __trk1 = (__i: number, t: any): any => t;
  readonly __trk6 = (__i: number, r: any): any => r.kind + r.id;
  protected readonly ui = inject(UiStore);
  protected readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  protected readonly fmt = inject(FormatService);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly _dlg = signal<ElementRef<HTMLDialogElement>>(undefined as any);
  @ViewChild('dlg') private get dlg(): Signal<ElementRef<HTMLDialogElement>> { return this._dlg; }
  private set dlg(v: any) { this._dlg.set(v); }
  protected readonly Math = Math;

  protected readonly tabs: Tab[] = ['humans', 'bots', 'departments', 'teams'];
  protected readonly tab = signal<Tab>('humans');
  protected readonly query = signal('');
  protected readonly selected = signal<Row | null>(null);
  protected readonly note = signal('');
  protected readonly follow = signal(true);
  protected readonly mode = computed<'assign' | 'add'>(() => (this.ui.dialog() === 'addTeammate' ? 'add' : 'assign'));

  /** Recommendation rule (E-10): available, not on a break, lowest load, speaks the customer's language, department team. */
  protected readonly recommendedId = computed(() => {
    const c = this.conv.selected();
    const lang = c?.customer.language;
    const cands = this.dir.agents().filter((a) => a.available && !a.busy && !a.breakType && a.load < a.maxLoad);
    const scored = cands.map((a) => ({ a, s: (lang && a.languages.includes(lang) ? 0 : 10) + a.load / a.maxLoad }));
    return scored.sort((x, y) => x.s - y.s)[0]?.a.id ?? null;
  });

  private readonly all = computed<Record<Tab, Row[]>>(() => {
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const humans: Row[] = this.dir.agents().map((a) => ({ kind: 'agent', id: a.id, name: a.isMe ? `${a.name} (${t('actor.you')})` : a.name, sub: `${t(`role.${a.role}`)} · ${a.languages.map((l) => l.toUpperCase()).join(' ')}`, agent: a }));
    return {
      humans,
      bots: this.dir.bots().map((b) => ({ kind: 'bot', id: b.id, name: b.name, sub: t('assign.bot') })),
      departments: this.dir.departments().map((d) => ({ kind: 'department', id: d._id, name: d.name, sub: d.hasBot ? t('assign.deptWithBot') : t('assign.dept') })),
      teams: this.dir.teams().map((x) => ({ kind: 'team', id: x._id, name: x.name, sub: t('assign.members', { n: x.members.length }) })),
    };
  });

  protected readonly counts = computed(() => ({ humans: this.all().humans.length, bots: this.all().bots.length, departments: this.all().departments.length, teams: this.all().teams.length }));
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const tab = this.mode() === 'add' ? 'humans' : this.tab();
    return this.all()[tab].filter((r) => !q || r.name.toLowerCase().includes(q));
  });

  constructor() {
    effect(() => {
      const open = this.ui.dialog() === 'assign' || this.ui.dialog() === 'addTeammate';
      const d = this.dlg().nativeElement;
      if (open && !d.open) {
        this.query.set('');
        this.note.set('');
        this.tab.set('humans');
        this.selected.set(null);
        d.showModal();
      } else if (!open && d.open) d.close();
    });
  }

  protected isSel(r: Row): boolean {
    const s = this.selected();
    return !!s && s.kind === r.kind && s.id === r.id;
  }

  protected async submit(): Promise<void> {
    const c = this.conv.selected();
    const sel = this.selected();
    if (!c || !sel) return;
    if (sel.agent?.breakType) {
      const r = await this.confirm.ask({ title: this.i18n.t('assign.breakConfirm', { name: sel.agent.name }), text: this.i18n.t('assign.breakConfirmText', { time: this.fmt.time(sel.agent.breakUntil!) }), confirmLabel: this.i18n.t('assign.confirm', { name: sel.agent.name }), cancelLabel: this.i18n.t('common.cancel') });
      if (r.result !== 'confirm') return;
    }
    this.ui.close();
    const ok = this.mode() === 'add'
      ? await this.conv.exec(c.id, { type: 'addParticipant', agentId: sel.id })
      : await this.conv.exec(c.id, { type: 'assign', target: { kind: sel.kind, id: sel.id }, note: this.note().trim() || undefined, stayFollower: this.follow() });
    if (ok) this.toast.show(this.i18n.t(this.mode() === 'add' ? 'toast.teammateAdded' : 'toast.assigned', { name: sel.name }), { kind: 'success' });
  }
}
