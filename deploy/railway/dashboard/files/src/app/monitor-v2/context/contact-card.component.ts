import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { TdLead } from '../core/models/tiledesk.models';
import { ConversationVM, LabelVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { TrAvatarComponent } from '../ui/avatar.component';
import { TrLabelChipComponent } from '../ui/label-chip.component';
import { TrLabelPickerComponent } from '../ui/label-picker.component';

type Field = 'fullname' | 'email' | 'phone' | 'company' | 'streetAddress';
const E164 = /^\+[1-9]\d{7,14}$/;
const GULF_PREFIXES = ['+974', '+971', '+966', '+965', '+973', '+968'];

/**
 * Contact card (F-94, F-95, F-96, F-99): editable in place (click a value, Enter saves, Esc cancels), copy buttons,
 * Gulf phone validation (E.164, with +974 / +971 / +966 / +965 / +973 / +968 suggested), custom properties, contact labels,
 * and the customer's review. It has NO heading of its own: the panel's single title "Contact" sits above it.
 */
@Component({
  standalone: true,
  selector: 'tr-contact-card',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, TrLabelChipComponent, TrLabelPickerComponent, CommonModule],
  template: `
    <div class="head">
      <tr-avatar [initials]="c().customer.initials" [size]="56" [presence]="c().customer.online ? 'online' : null" [src]="c().customer.avatarUrl"></tr-avatar>
      <div class="who">
        <ng-container *ngIf="editing() === 'fullname'; else __e1">
          <input class="tr-field ed" dir="auto" [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown.enter)="save('fullname')" (keydown.escape)="cancel()" (blur)="save('fullname')" autofocus />
        </ng-container><ng-template #__e1>
          <button type="button" class="nm" (click)="edit('fullname', c().raw.lead.fullname)" [attr.aria-label]="'contact.edit' | t"><span class="tr-truncate" dir="auto">{{ i18n.customerName(c().customer) }}</span><tr-icon name="pencil" [size]="12" class="pen"></tr-icon></button>
        </ng-template>
        <span class="loc tr-truncate">
          <ng-container *ngIf="c().customer.city"> <bdi>{{ c().customer.city }}</bdi> </ng-container>
          <ng-container *ngIf="c().customer.city && c().customer.language"> <span class="dotsep">·</span> </ng-container>
          <ng-container *ngIf="c().customer.language"> {{ ('lang.' + c().customer.language) | t }} </ng-container>
        </span>
      </div>
    </div>
    <div class="quick">
      <button type="button" class="tr-icon-btn qb" [disabled]="!value('phone')" [attr.aria-label]="'contact.copyPhone' | t" [title]="'contact.copyPhone' | t" (click)="copy(value('phone'))"><tr-icon name="phone" [size]="18"></tr-icon></button>
      <button type="button" class="tr-icon-btn qb" [disabled]="!value('email')" [attr.aria-label]="'contact.copyEmail' | t" [title]="'contact.copyEmail' | t" (click)="copy(value('email'))"><tr-icon name="mail" [size]="18"></tr-icon></button>
    </div>

    <section class="sec">
      <button type="button" class="sh" [attr.aria-expanded]="detailsOpen()" (click)="detailsOpen.set(!detailsOpen())">
        <span class="st">{{ 'contact.details' | t }}</span>
        <tr-icon name="chevron-down" [size]="16" class="chev" [class.open]="detailsOpen()"></tr-icon>
      </button>
    </section>
    <ng-container *ngIf="detailsOpen()">
    <ul class="fields">
      <ng-container *ngFor="let f of fields; trackBy: __trk3">
        <li class="f">
          <tr-icon [name]="f.icon" [size]="16" class="ic"></tr-icon>
          <ng-container *ngIf="editing() === f.key; else __e2">
            <div class="edwrap">
              <input class="tr-field ed" [class.bad]="!!error()" [attr.inputmode]="f.key === 'phone' ? 'tel' : null" [dir]="f.ltr ? 'ltr' : 'auto'" [value]="draft()" (input)="draft.set($any($event.target).value); error.set('')" (keydown.enter)="save(f.key)" (keydown.escape)="cancel()" (blur)="save(f.key)" [placeholder]="f.key === 'phone' ? '+974 5512 3456' : ''" autofocus />
              <ng-container *ngIf="error()"> <span class="err">{{ error() }}</span> </ng-container>
            </div>
          </ng-container><ng-template #__e2>
            <button type="button" class="val" [class.empty]="!value(f.key)" (click)="edit(f.key, value(f.key))" [attr.aria-label]="(f.label | t) + ': ' + (value(f.key) || ('contact.add' | t))">
              <span class="tr-truncate" [class.tr-ltr]="f.ltr && value(f.key)">{{ value(f.key) || (f.add | t) }}</span><tr-icon name="pencil" [size]="12" class="pen"></tr-icon>
            </button>
          </ng-template>
        </li>
      </ng-container>
      <ng-container *ngFor="let p of props(); trackBy: __trk4"> <li class="f"><tr-icon name="tag" [size]="16" class="ic"></tr-icon><span class="pk">{{ p[0] }}</span><span class="pv tr-truncate" dir="auto">{{ p[1] }}</span></li> </ng-container>
    </ul>

    <ng-container *ngIf="addingProp(); else __e5">
      <form class="addp" (submit)="$event.preventDefault(); saveProp()">
        <input class="tr-field" [placeholder]="'contact.propName' | t" [value]="pName()" (input)="pName.set($any($event.target).value)" />
        <input class="tr-field" [placeholder]="'contact.propValue' | t" [value]="pValue()" (input)="pValue.set($any($event.target).value)" />
        <button type="submit" class="tr-btn tr-btn--primary" [disabled]="!pName().trim()">{{ 'common.save' | t }}</button>
      </form>
    </ng-container><ng-template #__e5>
      <button type="button" class="addlink" (click)="addingProp.set(true)"><tr-icon name="plus" [size]="14"></tr-icon>{{ 'contact.addProp' | t }}</button>
    </ng-template>

    <div class="tags">
      <ng-container *ngFor="let l of tags(); trackBy: __trk6"> <tr-label-chip [label]="l" [removable]="true" (remove)="toggleTag(l)"></tr-label-chip> </ng-container>
      <span class="anc"><button type="button" class="addtag" [attr.aria-label]="'contact.addTag' | t" (click)="picker.set(!picker())"><tr-icon name="plus" [size]="12"></tr-icon>{{ tags().length ? '' : ('contact.addTag' | t) }}</button>
        <ng-container *ngIf="picker()"> <tr-label-picker [selected]="tags()" (toggle)="toggleTag($event)" (create)="createTag($event)" (close)="picker.set(false)"></tr-label-picker> </ng-container>
      </span>
    </div>

    <ng-container *ngIf="c().raw.rating">
      <div class="rev"><span class="stars" [attr.aria-label]="('contact.rating' | t) + ' ' + c().raw.rating + '/5'"><ng-container *ngFor="let n of [1,2,3,4,5]; trackBy: __trk7"> <tr-icon name="star" [size]="14" [class.on]="n <= c().raw.rating!"></tr-icon> </ng-container></span>
        <ng-container *ngIf="c().raw.rating_message"> <span class="rm" dir="auto">“{{ c().raw.rating_message }}”</span> </ng-container></div>
    </ng-container>
    </ng-container>
  `,
  styles: [`
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 12px; padding: 4px 20px 12px; }
    .who { display: flex; flex-direction: column; min-inline-size: 0; flex: 1; gap: 2px; }
    .nm { display: inline-flex; align-items: center; gap: 6px; max-inline-size: 100%; font-size: var(--tr-fs-title); line-height: var(--tr-lh-title); font-weight: 600; text-align: start; }
    .pen { color: var(--muted-foreground); opacity: 0; flex: none; } .nm:hover .pen, .val:hover .pen, .nm:focus-visible .pen, .val:focus-visible .pen { opacity: 1; }
    .loc { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); } .dotsep { margin-inline: 2px; }
    .quick { display: flex; gap: 8px; padding: 0 20px 16px; }
    .qb { background: var(--muted); color: var(--foreground); } .qb:hover:not(:disabled) { background: var(--accent); }
    .sec { border-block-start: 1px solid var(--border); }
    .sh { display: flex; align-items: center; gap: 8px; inline-size: 100%; min-block-size: 44px; padding-inline: 20px 16px; text-align: start; }
    .st { flex: 1; font-size: var(--tr-fs-body); font-weight: 500; }
    .chev { color: var(--muted-foreground); transition: transform var(--tr-motion-fast); } .chev.open { transform: rotate(180deg); }
    .fields { display: flex; flex-direction: column; padding-inline: 20px; } .f { display: flex; align-items: flex-start; gap: 10px; min-block-size: 36px; padding-block: 2px; }
    .ic { color: var(--muted-foreground); margin-block-start: 8px; flex: none; }
    .val { display: flex; align-items: center; gap: 6px; flex: 1; min-inline-size: 0; min-block-size: 32px; padding-inline: 4px; border-radius: var(--radius-sm); text-align: start; font-size: var(--tr-fs-body); } .val:hover { background: var(--muted); }
    .val.empty { color: var(--muted-foreground); }
    .edwrap { flex: 1; display: flex; flex-direction: column; gap: 4px; } .ed { min-block-size: 34px; padding-block: 4px; } .ed.bad { border-color: var(--destructive); } .err { color: var(--destructive); font-size: var(--tr-fs-caption); }
    .pk { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); margin-block-start: 8px; } .pv { margin-block-start: 6px; font-size: var(--tr-fs-body); }
    .addlink { display: inline-flex; align-items: center; gap: 6px; margin: 4px 20px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); min-block-size: 32px; } .addlink:hover { color: var(--foreground); }
    .addp { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; margin: 4px 20px; } .addp .tr-field { min-block-size: 34px; padding-block: 4px; }
    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 20px 0; } .anc { position: relative; }
    .addtag { display: inline-flex; align-items: center; gap: 4px; block-size: 22px; padding-inline: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--muted-foreground); font-size: var(--tr-fs-caption); position: relative; } .addtag::after { content: ''; position: absolute; inset: -8px; }
    .rev { display: flex; flex-direction: column; gap: 4px; margin: 12px 20px 8px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--muted); }
    .stars { display: inline-flex; gap: 2px; color: var(--input); } .stars .on { color: var(--muted-foreground); fill: var(--muted-foreground); } .rm { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrContactCardComponent {
  readonly __trk3 = (__i: number, f: any): any => f.key;
  readonly __trk4 = (__i: number, p: any): any => p[0];
  readonly __trk6 = (__i: number, l: any): any => l.id;
  readonly __trk7 = (__i: number, n: any): any => n;
  protected readonly i18n = inject(I18nService);
  private readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  private readonly toast = inject(ToastService);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly editing = signal<Field | null>(null);
  protected readonly draft = signal('');
  protected readonly error = signal('');
  protected readonly picker = signal(false);
  protected readonly addingProp = signal(false);
  protected readonly pName = signal('');
  protected readonly pValue = signal('');

  /** "Details" is a fold like the other sections of the panel, open by default. */
  protected readonly detailsOpen = signal(true);

  protected readonly fields: { key: Field; icon: string; label: string; add: string; ltr: boolean }[] = [
    { key: 'email', icon: 'mail', label: 'contact.email', add: 'contact.addEmail', ltr: true },
    { key: 'phone', icon: 'phone', label: 'contact.phone', add: 'contact.addPhone', ltr: true },
    { key: 'company', icon: 'building-2', label: 'contact.company', add: 'contact.addCompany', ltr: false },
    { key: 'streetAddress', icon: 'map-pin', label: 'contact.address', add: 'contact.addAddress', ltr: false },
  ];

  protected readonly props = computed<[string, string][]>(() => Object.entries(this.c().raw.lead.attributes ?? {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)]));
  protected readonly tags = computed<LabelVM[]>(() => (this.c().raw.lead.tags ?? []).map((t) => this.dir.labelsByName().get(t) ?? { id: t, name: t, color: 1 as const }));

  protected value(f: Field): string {
    return (this.c().raw.lead[f] as string | undefined) ?? '';
  }
  protected edit(f: Field, v: string): void {
    this.editing.set(f);
    this.draft.set(v);
    this.error.set('');
  }
  protected cancel(): void {
    this.editing.set(null);
  }
  protected async save(f: Field): Promise<void> {
    if (this.editing() !== f) return;
    const v = this.draft().trim();
    if (f === 'phone' && v && !E164.test(v.replace(/[\s-]/g, ''))) return void this.error.set(this.i18n.t('contact.phoneError', { prefixes: GULF_PREFIXES.join(' ') }));
    if (f === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return void this.error.set(this.i18n.t('contact.emailError'));
    this.editing.set(null);
    if (v === this.value(f)) return;
    await this.conv.updateLead(this.c(), { [f]: v } as Partial<TdLead>);
  }

  protected async copy(v: string): Promise<void> {
    await navigator.clipboard?.writeText(v).catch(() => undefined);
    this.toast.show(this.i18n.t('toast.copied'));
  }

  protected async saveProp(): Promise<void> {
    await this.conv.updateLead(this.c(), { attributes: { [this.pName().trim()]: this.pValue().trim() } });
    this.pName.set('');
    this.pValue.set('');
    this.addingProp.set(false);
  }

  protected async toggleTag(l: LabelVM): Promise<void> {
    const cur = this.c().raw.lead.tags ?? [];
    await this.conv.updateLead(this.c(), { tags: cur.includes(l.id) ? cur.filter((t) => t !== l.id) : [...cur, l.id] });
  }
  protected async createTag(name: string): Promise<void> {
    const l = this.dir.createLabel(name);
    await this.toggleTag(l);
  }
}
