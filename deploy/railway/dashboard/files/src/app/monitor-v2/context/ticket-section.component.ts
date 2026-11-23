import { Signal, computed, effect, signal, untracked } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM, LabelVM } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { UiStore } from '../core/stores/ui.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { TrAvatarComponent } from '../ui/avatar.component';
import { TrLabelChipComponent } from '../ui/label-chip.component';
import { TrLabelPickerComponent } from '../ui/label-picker.component';
import { TrPrioritySelectComponent } from '../ui/priority-select.component';

/**
 * Ticket section (F-100, F-44, F-49, F-45, F-46): number (copyable), priority, labels, followers, department, and
 * "Convert to offline ticket" with its explanation. The L shortcut opens the label picker from anywhere.
 */
@Component({
  standalone: true,
  selector: 'tr-ticket-section',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, TrAvatarComponent, TrLabelChipComponent, TrLabelPickerComponent, TrPrioritySelectComponent, CommonModule],
  template: `
    <dl class="g">
      <div class="r"><dt>{{ 'ticket.number' | t }}</dt><dd><button type="button" class="num tr-mono tr-ltr" (click)="copy()" [title]="'msg.copy' | t">#{{ c().ticket }}<tr-icon name="copy" [size]="12"></tr-icon></button></dd></div>
      <ng-container *ngIf="c().department"> <div class="r"><dt>{{ 'hover.department' | t }}</dt><dd>{{ c().department!.name }}</dd></div> </ng-container>
      <div class="r"><dt>{{ 'actions.priority' | t }}</dt><dd><tr-priority-select variant="inline" [value]="c().priority" (changed)="conv.setPriority(c().id, $event)"></tr-priority-select></dd></div>
      <div class="r top"><dt>{{ 'actions.labels' | t }}</dt>
        <dd class="lbls">
          <ng-container *ngFor="let l of c().labels; trackBy: __trk1"> <tr-label-chip [label]="l" [removable]="true" (remove)="toggle(l)"></tr-label-chip> </ng-container>
          <span class="anc"><button type="button" class="add" [attr.aria-label]="'actions.labels' | t" (click)="picker.set(!picker())"><tr-icon name="plus" [size]="12"></tr-icon></button>
            <ng-container *ngIf="picker()"> <tr-label-picker [selected]="c().labels" (toggle)="toggle($event)" (create)="create($event)" (close)="picker.set(false)"></tr-label-picker> </ng-container></span>
        </dd>
      </div>
      <div class="r"><dt>{{ 'ticket.followers' | t }}</dt>
        <dd class="fol">
          <ng-container *ngFor="let a of followers(); trackBy: __trk2"> <tr-avatar [initials]="a.initials" [size]="24" [title]="a.name"></tr-avatar> </ng-container>
          <span class="anc"><button type="button" class="add" [attr.aria-label]="'ticket.addFollower' | t" [title]="'ticket.followersHint' | t" (click)="fmenu.set(!fmenu())"><tr-icon name="plus" [size]="12"></tr-icon></button>
            <ng-container *ngIf="fmenu()">
              <div class="tr-menu pop" role="menu" (trClickOutside)="fmenu.set(false)">
                <ng-container *ngFor="let a of dir.agents(); trackBy: __trk3"> <button type="button" role="menuitemcheckbox" class="tr-menu__item" [attr.aria-checked]="c().followers.includes(a.id)" (click)="follow(a.id)"><tr-avatar [initials]="a.initials" [size]="24"></tr-avatar>{{ a.name }}<ng-container *ngIf="c().followers.includes(a.id)"> <tr-icon name="check" [size]="14" class="tr-menu__kbd"></tr-icon> </ng-container></button> </ng-container>
              </div>
            </ng-container></span>
        </dd>
      </div>
    </dl>
    <button type="button" class="off" (click)="convert()"><tr-icon name="ticket" [size]="14"></tr-icon>{{ (c().smartAssignment ? 'actions.offlineTicket' : 'conv.backToChat') | t }}</button>
    <p class="hint">{{ (c().smartAssignment ? 'ticket.offlineHint' : 'conv.offlineTicket') | t }}</p>
  `,
  styles: [`
    :host { display: block; padding: 0 20px 12px; }
    .g { margin: 0; display: flex; flex-direction: column; } .r { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-block-size: 36px; } .r.top { align-items: flex-start; padding-block: 6px; }
    dt { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); flex: none; padding-block-start: 2px; } dd { margin: 0; font-size: var(--tr-fs-body); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; min-inline-size: 0; }
    .num { display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px; border-radius: 6px; } .num:hover { background: var(--muted); } .num tr-icon { color: var(--muted-foreground); }
    .lbls { max-inline-size: 190px; } .fol { gap: 4px; } .anc { position: relative; display: inline-flex; }
    .add { display: inline-flex; align-items: center; justify-content: center; inline-size: 22px; block-size: 22px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--muted-foreground); position: relative; } .add::after { content: ''; position: absolute; inset: -9px; }
    .pop { inset-block-start: 100%; inset-inline-end: 0; margin-block-start: 4px; min-inline-size: 200px; }
    .off { display: inline-flex; align-items: center; gap: 6px; margin-block-start: 8px; color: var(--brand); font-size: var(--tr-fs-body-sm); font-weight: 600; min-block-size: 32px; }
    .hint { margin: 2px 0 0; color: var(--muted-foreground); font-size: var(--tr-fs-caption); line-height: var(--tr-lh-caption); }
  `],
})
export class TrTicketSectionComponent {
  readonly __trk1 = (__i: number, l: any): any => l.id;
  readonly __trk2 = (__i: number, a: any): any => a.id;
  readonly __trk3 = (__i: number, a: any): any => a.id;
  protected readonly conv = inject(ConversationStore);
  protected readonly dir = inject(DirectoryStore);
  private readonly ui = inject(UiStore);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly picker = signal(false);
  protected readonly fmenu = signal(false);
  protected readonly followers = computed(() => this.c().followers.map((id) => this.dir.agentsById().get(id)).filter((a): a is NonNullable<typeof a> => !!a));

  constructor() {
    let first = true;
    effect(() => {
      this.ui.labelsRequest();
      untracked(() => (first ? (first = false) : this.picker.set(true)));
    });
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard?.writeText(String(this.c().ticket)).catch(() => undefined);
    this.toast.show(this.i18n.t('toast.copied'));
  }

  protected toggle(l: LabelVM): void {
    const c = this.c();
    const on = c.labels.some((x) => x.id === l.id);
    void this.conv.setLabels(c.id, on ? c.raw.tags.filter((t) => t.tag !== l.id) : [...c.raw.tags, { tag: l.id, color: 'neutral' }]);
  }
  protected create(name: string): void {
    this.toggle(this.dir.createLabel(name));
  }

  protected follow(id: string): void {
    const c = this.c();
    void this.conv.exec(c.id, { type: 'followers', ids: c.followers.includes(id) ? c.followers.filter((x) => x !== id) : [...c.followers, id] });
  }

  protected async convert(): Promise<void> {
    const c = this.c();
    const t = (k: string) => this.i18n.t(k);
    const r = await this.confirm.ask({ title: c.smartAssignment ? t('confirm.offlineTitle') : t('conv.backToChat'), text: c.smartAssignment ? t('confirm.offlineText') : t('confirm.onlineText'), confirmLabel: t('common.confirm'), cancelLabel: t('common.cancel') });
    if (r.result === 'confirm') await this.conv.exec(c.id, { type: c.smartAssignment ? 'offlineTicket' : 'onlineTicket' });
  }
}
