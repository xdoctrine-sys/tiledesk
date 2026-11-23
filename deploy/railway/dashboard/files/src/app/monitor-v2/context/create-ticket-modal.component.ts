import { Signal, computed, effect, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { TdPriority, TdTag } from '../core/models/tiledesk.models';
import { LabelVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { AssignTarget } from '../core/services/inbox-api';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { UiStore } from '../core/stores/ui.store';
import { TrLabelChipComponent } from '../ui/label-chip.component';
import { TrLabelPickerComponent } from '../ui/label-picker.component';
import { ConversationNav } from '../core/services/conversation-nav.service';

type Channel = 'form' | 'email' | 'whatsapp';

/**
 * Create ticket modal (E-09, F-116), 560 px: requester (existing contact or a new one with name / e-mail / E.164 phone),
 * reply channel (WhatsApp only if connected), subject *, assignee (human, bot or department), priority, labels, message *.
 * "Create ticket" stays disabled until subject and message are filled; ⌘↵ submits; errors show under the field.
 */
@Component({
  standalone: true,
  selector: 'tr-create-ticket-modal',
  imports: [TrIconComponent, TranslatePipe, TrLabelChipComponent, TrLabelPickerComponent, CommonModule],
  template: `
    <dialog #dlg class="tr-dialog" aria-labelledby="ct-t" (close)="ui.close()" (click)="$event.target === dlg ? ui.close() : null" (keydown)="onKey($event)">
      <form class="box" (submit)="$event.preventDefault(); submit()" novalidate>
        <header class="hd"><h2 id="ct-t">{{ 'ticket.create' | t }}</h2><button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" (click)="ui.close()"><tr-icon name="x" [size]="18"></tr-icon></button></header>
        <div class="body">
          <label class="fld">{{ 'ticket.requester' | t }}
            <ng-container *ngIf="!newReq(); else __e2">
              <select class="tr-field" [value]="requester()" (change)="requester.set($any($event.target).value)">
                <ng-container *ngFor="let r of requesters(); trackBy: __trk1"> <option [value]="r.id" [selected]="r.id === requester()">{{ r.name }} — {{ r.sub }}</option> </ng-container>
              </select>
              <button type="button" class="lnk" (click)="newReq.set(true)"><tr-icon name="plus" [size]="14"></tr-icon>{{ 'ticket.newRequester' | t }}</button>
            </ng-container><ng-template #__e2>
              <div class="nr">
                <input class="tr-field" [placeholder]="('contact.name' | t) + ' *'" [value]="nName()" (input)="nName.set($any($event.target).value)" dir="auto" />
                <input class="tr-field" type="email" [placeholder]="'contact.email' | t" [value]="nEmail()" (input)="nEmail.set($any($event.target).value)" dir="ltr" />
                <input class="tr-field" type="tel" inputmode="tel" [placeholder]="'+974 5512 3456'" [value]="nPhone()" (input)="nPhone.set($any($event.target).value)" dir="ltr" />
              </div>
              <button type="button" class="lnk" (click)="newReq.set(false)">{{ 'ticket.existingRequester' | t }}</button>
            </ng-template>
          </label>

          <fieldset class="fld chan"><legend>{{ 'ticket.channel' | t }}</legend>
            <label><input type="radio" name="ch" [checked]="channel() === 'form'" (change)="channel.set('form')" />{{ 'ticket.channel.internal' | t }}</label>
            <label><input type="radio" name="ch" [checked]="channel() === 'email'" (change)="channel.set('email')" />{{ 'channel.email' | t }}</label>
            <ng-container *ngIf="whatsapp()"> <label><input type="radio" name="ch" [checked]="channel() === 'whatsapp'" (change)="channel.set('whatsapp')" />{{ 'channel.whatsapp' | t }} *</label> </ng-container>
          </fieldset>

          <label class="fld">{{ 'ticket.subject' | t }} *
            <input class="tr-field" [class.bad]="submitted() && !subject().trim()" dir="auto" [value]="subject()" (input)="subject.set($any($event.target).value)" />
            <ng-container *ngIf="submitted() && !subject().trim()"> <span class="err">{{ 'ticket.required' | t }}</span> </ng-container>
          </label>

          <div class="two">
            <label class="fld">{{ 'ticket.assignee' | t }}
              <select class="tr-field" [value]="assignee()" (change)="assignee.set($any($event.target).value)">
                <optgroup [label]="'assign.tab.humans' | t"><ng-container *ngFor="let a of dir.agents(); trackBy: __trk3"> <option [value]="'agent:' + a.id" [selected]="assignee() === 'agent:' + a.id">{{ a.name }}</option> </ng-container></optgroup>
                <optgroup [label]="'assign.tab.bots' | t"><ng-container *ngFor="let b of dir.bots(); trackBy: __trk4"> <option [value]="'bot:' + b.id" [selected]="assignee() === 'bot:' + b.id">{{ b.name }} (bot)</option> </ng-container></optgroup>
                <optgroup [label]="'assign.tab.departments' | t"><ng-container *ngFor="let d of dir.departments(); trackBy: __trk5"> <option [value]="'department:' + d._id" [selected]="assignee() === 'department:' + d._id">{{ d.name }} (dept)</option> </ng-container></optgroup>
              </select>
            </label>
            <label class="fld">{{ 'actions.priority' | t }}
              <select class="tr-field" [value]="priority()" (change)="priority.set($any($event.target).value)">
                <ng-container *ngFor="let p of priorities; trackBy: __trk6"> <option [value]="p" [selected]="priority() === p">{{ ('priority.' + p) | t }}</option> </ng-container>
              </select>
            </label>
          </div>

          <div class="fld">{{ 'actions.labels' | t }}
            <div class="lbls">
              <ng-container *ngFor="let l of labels(); trackBy: __trk7"> <tr-label-chip [label]="l" [removable]="true" (remove)="toggleLabel(l)"></tr-label-chip> </ng-container>
              <span class="anc"><button type="button" class="add" [attr.aria-label]="'actions.labels' | t" (click)="picker.set(!picker())"><tr-icon name="plus" [size]="12"></tr-icon></button>
                <ng-container *ngIf="picker()"> <tr-label-picker class="up" [selected]="labels()" (toggle)="toggleLabel($event)" (create)="createLabel($event)" (close)="picker.set(false)"></tr-label-picker> </ng-container></span>
            </div>
          </div>

          <label class="fld">{{ 'ticket.message' | t }} *
            <textarea class="tr-field" rows="4" dir="auto" [class.bad]="submitted() && !message().trim()" [value]="message()" (input)="message.set($any($event.target).value)"></textarea>
            <ng-container *ngIf="submitted() && !message().trim()"> <span class="err">{{ 'ticket.required' | t }}</span> </ng-container>
          </label>
          <ng-container *ngIf="channel() === 'whatsapp'"> <p class="note">{{ 'ticket.whatsappNote' | t }}</p> </ng-container>
        </div>
        <footer class="ft"><button type="button" class="tr-btn" (click)="ui.close()">{{ 'common.cancel' | t }}</button><button type="submit" class="tr-btn tr-btn--primary" [disabled]="!valid() || busy()">{{ 'ticket.submit' | t }}</button></footer>
      </form>
    </dialog>
  `,
  styles: [`
    dialog { max-inline-size: min(560px, calc(100vw - 32px)); }
    .box { display: flex; flex-direction: column; max-block-size: calc(100vh - 48px); }
    .hd { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 8px; } h2 { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .body { display: flex; flex-direction: column; gap: 14px; padding: 8px 24px 16px; overflow: auto; }
    .fld { display: flex; flex-direction: column; gap: 6px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); border: 0; padding: 0; margin: 0; min-inline-size: 0; } .fld legend { padding: 0; margin-block-end: 6px; }
    .fld .tr-field { color: var(--foreground); font-size: var(--tr-fs-body); } .bad { border-color: var(--destructive) !important; } .err { color: var(--destructive); font-size: var(--tr-fs-caption); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } @media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
    .nr { display: flex; flex-direction: column; gap: 6px; } .lnk { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; color: var(--brand); font-weight: 600; min-block-size: 32px; }
    .chan { flex-direction: row; flex-wrap: wrap; gap: 16px; } .chan legend { flex: 0 0 100%; } .chan label { display: inline-flex; align-items: center; gap: 8px; color: var(--foreground); min-block-size: 32px; } .chan input { accent-color: var(--brand); inline-size: 18px; block-size: 18px; }
    .lbls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; } .anc { position: relative; } .add { display: inline-flex; align-items: center; justify-content: center; inline-size: 24px; block-size: 24px; border-radius: 50%; border: 1px solid var(--input); color: var(--muted-foreground); position: relative; } .add::after { content: ''; position: absolute; inset: -8px; }
    tr-label-picker.up { inset-block-start: auto; inset-block-end: 100%; margin-block: 0 4px; }
    .note { margin: 0; padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .ft { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 24px 20px; border-block-start: 1px solid var(--border); }
  `],
})
export class TrCreateTicketModalComponent {
  readonly __trk1 = (__i: number, r: any): any => r.id;
  readonly __trk3 = (__i: number, a: any): any => a.id;
  readonly __trk4 = (__i: number, b: any): any => b.id;
  readonly __trk5 = (__i: number, d: any): any => d._id;
  readonly __trk6 = (__i: number, p: any): any => p;
  readonly __trk7 = (__i: number, l: any): any => l.id;
  protected readonly ui = inject(UiStore);
  private readonly conv = inject(ConversationStore);
  protected readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly nav = inject(ConversationNav);
  private readonly _dlg = signal<ElementRef<HTMLDialogElement>>(undefined as any);
  @ViewChild('dlg') private get dlg(): Signal<ElementRef<HTMLDialogElement>> { return this._dlg; }
  private set dlg(v: any) { this._dlg.set(v); }

  protected readonly priorities: TdPriority[] = ['urgent', 'high', 'medium', 'low'];
  protected readonly newReq = signal(false);
  protected readonly requester = signal('');
  protected readonly nName = signal('');
  protected readonly nEmail = signal('');
  protected readonly nPhone = signal('');
  protected readonly channel = signal<Channel>('form');
  protected readonly subject = signal('');
  protected readonly assignee = signal('department:dept_rentals');
  protected readonly priority = signal<TdPriority>('medium');
  protected readonly labels = signal<LabelVM[]>([]);
  protected readonly message = signal('');
  protected readonly picker = signal(false);
  protected readonly submitted = signal(false);
  protected readonly busy = signal(false);

  /** WhatsApp is offered only when a WhatsApp channel is connected (conditional data set). */
  protected readonly whatsapp = computed(() => this.conv.all().some((c) => c.channel.kind === 'whatsapp'));
  protected readonly requesters = computed(() => {
    const seen = new Map<string, { id: string; name: string; sub: string }>();
    for (const c of this.conv.all()) if (!seen.has(c.customer.id)) seen.set(c.customer.id, { id: c.customer.id, name: this.i18n.customerName(c.customer), sub: c.customer.email ?? 'N/A' });
    return [...seen.values()];
  });
  protected readonly valid = computed(() => !!this.subject().trim() && !!this.message().trim() && (!this.newReq() || !!this.nName().trim()));

  constructor() {
    effect(() => {
      const open = this.ui.dialog() === 'ticket';
      const d = this.dlg().nativeElement;
      if (open && !d.open) {
        this.reset();
        d.showModal();
      } else if (!open && d.open) d.close();
    });
  }

  private reset(): void {
    this.newReq.set(false);
    this.requester.set(this.requesters()[0]?.id ?? '');
    this.nName.set(''); this.nEmail.set(''); this.nPhone.set('');
    this.channel.set('form'); this.subject.set(''); this.message.set(''); this.labels.set([]);
    this.priority.set('medium'); this.assignee.set(`agent:${this.dir.meId()}`); this.submitted.set(false); this.picker.set(false);
  }

  protected toggleLabel(l: LabelVM): void {
    this.labels.update((x) => (x.some((y) => y.id === l.id) ? x.filter((y) => y.id !== l.id) : [...x, l]));
  }
  protected createLabel(name: string): void {
    this.toggleLabel(this.dir.createLabel(name));
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void this.submit(); }
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    if (!this.valid() || this.busy()) return;
    const [kind, id] = this.assignee().split(':') as [AssignTarget['kind'], string];
    const tags: TdTag[] = this.labels().map((l) => ({ tag: l.id, color: 'neutral' }));
    this.busy.set(true);
    try {
      const rid = await this.conv.createTicket({
        requester: this.newReq() ? { fullname: this.nName().trim(), email: this.nEmail().trim() || undefined, phone: this.nPhone().trim() || undefined } : { leadId: this.requester() },
        subject: this.subject().trim(), message: this.message().trim(), assignee: { kind, id }, priority: this.priority(), tags, channel: this.channel(),
      });
      this.ui.close();
      const c = this.conv.byId().get(rid);
      this.toast.show(this.i18n.t('ticket.created', { n: c?.ticket ?? '' }), { kind: 'success' });
      void this.nav.open(rid);
    } catch {
      this.toast.show(this.i18n.t('app.error'), { kind: 'error' });
    } finally {
      this.busy.set(false);
    }
  }
}
