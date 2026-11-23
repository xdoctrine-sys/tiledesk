import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { AttachmentVM, ChannelCapabilities, MessageVM } from '../core/models/view-models';
import { ConfirmService } from '../core/services/confirm.service';
import { MessageStore } from '../core/stores/message.store';
import { buildParts } from '../core/util/thread';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { TrAvatarComponent } from '../ui/avatar.component';
import { TrAttachmentViewComponent } from './attachment-view.component';
import { TrPiiMaskComponent } from './pii-mask.component';
import { MessageAction, TrMessageActionsComponent } from './message-actions.component';
import { TrRichMessageComponent } from './rich-message.component';
import { TrVoicePlayerComponent } from './voice-player.component';

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

/**
 * One message. Actor styles, told apart by shape + label, not only colour (F-54): customer = --muted, agent = --brand-soft with the
 * agent's avatar, AI = bordered card with "✦ AI", internal note = --warning at 8 % with a 1 px --warning border and a lock.
 * Name and time sit ABOVE the group. Delivery state (F-59): sending · sent ✓ · delivered ✓✓ · read ✓✓ in --brand · failed (retry) · queued.
 */
@Component({
  standalone: true,
  selector: 'tr-message-bubble',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, TrAttachmentViewComponent, TrRichMessageComponent, TrVoicePlayerComponent, TrMessageActionsComponent, TrPiiMaskComponent, CommonModule],
  host: {
    '[class]': '"k-" + m().authorKind + " g-" + group() + (m().isOutgoing ? " out" : " in")', '[class.hl]': 'highlight()', '[attr.data-mid]': 'm().id',
    '(contextmenu)': 'onContext($event)', '(pointerdown)': 'onDown($event)', '(pointerup)': 'cancelPress()', '(pointermove)': 'cancelPress()',
  },
  template: `
    <ng-container *ngIf="showHead()">
      <span class="head">
        <ng-container *ngIf="m().authorKind === 'agent'"> <tr-avatar [initials]="m().author.initials" [size]="24" [src]="m().author.avatarUrl"></tr-avatar> </ng-container>
        <ng-container *ngIf="m().authorKind === 'bot'"> <tr-icon name="sparkles" [size]="12" class="spk"></tr-icon> </ng-container>
        <ng-container *ngIf="m().authorKind === 'note'"> <tr-icon name="lock" [size]="12" class="lk"></tr-icon> </ng-container>
        <span class="nm">{{ whoLabel() }}</span>
        <time class="tm" [attr.title]="fmt.fullDateTime(m().createdAt)">{{ fmt.time(m().createdAt) }}</time>
      </span>
    </ng-container>
    <div class="row">
      <div class="bub" [class.failed]="m().status === 'failed'" [class.sending]="m().status === 'sending'">
        <ng-container *ngIf="m().deleted; else __e4">
          <span class="deleted">{{ 'msg.deleted' | t }}</span>
        </ng-container><ng-template #__e4>
          <ng-container *ngIf="m().quoted as q">
            <button type="button" class="quote" (click)="jump.emit(q.id)"><strong class="tr-truncate">{{ q.authorName }}</strong><span class="tr-truncate" dir="auto">{{ q.text }}</span></button>
          </ng-container>
          <ng-container *ngFor="let a of m().attachments; trackBy: __trk2">
            <ng-container *ngIf="a.kind === 'audio'; else __e1"> <tr-voice-player [a]="a"></tr-voice-player> </ng-container><ng-template #__e1> <tr-attachment-view [a]="a" [blur]="!!a.sensitive && !revealed().has(a.id)" (open)="onMedia($event)"></tr-attachment-view> </ng-template>
          </ng-container>
          <ng-container *ngIf="m().text"> <p class="txt" dir="auto"><ng-container *ngFor="let p of parts(); trackBy: __trk3"><ng-container [ngSwitch]="p.kind"><ng-container *ngSwitchCase="'pii'"><tr-pii-mask [kind]="p.piiKind" [value]="p.text" [last4]="p.last4" [messageId]="m().id"></tr-pii-mask></ng-container><ng-container *ngSwitchCase="'hit'"><mark [class.cur]="activeMatch()">{{ p.text }}</mark></ng-container><ng-container *ngSwitchDefault>{{ p.text }}</ng-container></ng-container></ng-container></p> </ng-container>
          <ng-container *ngIf="m().register && m().authorKind === 'customer'">
            <button type="button" class="reg" [attr.aria-expanded]="regOpen()" (click)="regOpen.set(!regOpen())">{{ ('register.' + m().register) | t }}</button>
            <ng-container *ngIf="regOpen()"> <div class="regbox" dir="auto"><ng-container *ngIf="m().normalized"> <p><span class="rl">{{ 'register.arabic' | t }}</span>{{ m().normalized }}</p> </ng-container><ng-container *ngIf="m().suggestedTranslation"> <p><span class="rl">{{ 'register.translation' | t }}</span>{{ m().suggestedTranslation }}</p> </ng-container></div> </ng-container>
          </ng-container>
          <ng-container *ngIf="m().translation"> <p class="tr" dir="auto"><span class="trlbl"><tr-icon name="languages" [size]="11"></tr-icon>{{ 'msg.translated' | t }}</span>{{ m().translation }}</p> </ng-container>
          <ng-container *ngIf="m().rich"> <tr-rich-message [rich]="m().rich!"></tr-rich-message> </ng-container>
        </ng-template>
        <ng-container *ngIf="showMeta()">
          <span class="meta">
            <ng-container *ngIf="m().isOutgoing && m().authorKind !== 'note'">
              <ng-container [ngSwitch]="m().status"><ng-container *ngSwitchCase="'sending'"> <tr-icon name="clock" [size]="12" [attr.aria-label]="'msg.sending' | t"></tr-icon> </ng-container><ng-container *ngSwitchCase="'queued'"> <tr-icon name="clock" [size]="12" [attr.aria-label]="'msg.queued' | t"></tr-icon> </ng-container><ng-container *ngSwitchCase="'sent'"> <tr-icon name="check" [size]="12" [attr.aria-label]="'msg.sent' | t"></tr-icon> </ng-container><ng-container *ngSwitchCase="'delivered'"> <tr-icon name="check-check" [size]="12" [attr.aria-label]="'msg.delivered' | t"></tr-icon> </ng-container><ng-container *ngSwitchCase="'read'"> <tr-icon name="check-check" [size]="12" class="read" [attr.aria-label]="'msg.read' | t"></tr-icon> </ng-container></ng-container>
            </ng-container>
          </span>
        </ng-container>
      </div>
      <ng-container *ngIf="!m().deleted && m().status !== 'sending'">
        <div class="act" [class.show]="pinned()"><tr-message-actions #actions [message]="m()" [channel]="channel()" (act)="act.emit($event)"></tr-message-actions></div>
      </ng-container>
    </div>
    <ng-container *ngIf="m().status === 'failed'; else __e5">
      <span class="err"><tr-icon name="triangle-alert" [size]="12"></tr-icon>{{ 'msg.failed' | t }}<button type="button" (click)="retry.emit()">{{ 'common.retry' | t }}</button><button type="button" (click)="discard.emit()">{{ 'common.delete' | t }}</button></span>
    </ng-container><ng-template #__e5><ng-container *ngIf="m().status === 'queued'">
      <span class="err dim"><tr-icon name="clock" [size]="12"></tr-icon>{{ 'msg.queued' | t }}</span>
    </ng-container></ng-template>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; padding-inline: 20px; max-inline-size: 100%; }
    :host(.in) { align-items: flex-start; } :host(.out) { align-items: flex-end; }
    :host(.g-single), :host(.g-first) { margin-block-start: 16px; } :host(.g-middle), :host(.g-last) { margin-block-start: 4px; }
    :host(.hl) .bub { box-shadow: 0 0 0 3px var(--accent); }
    /* name + time ABOVE the group of bubbles: 13 px, name 500, time muted */
    .head { display: inline-flex; align-items: center; gap: 6px; margin-block-end: 4px; padding-inline: 4px; color: var(--foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .nm { font-weight: 500; } .tm { color: var(--muted-foreground); font-weight: 400; }
    .spk { color: var(--muted-foreground); } :host(.k-note) .lk, :host(.k-note) .nm { color: var(--warning); }
    .row { display: flex; align-items: flex-start; max-inline-size: min(70%, 560px); min-inline-size: 0; position: relative; }
    :host(.k-note) .row { max-inline-size: 70%; }
    /* bubbles: 16 px radius, the sender-side top corner at 4 px (logical radii: they mirror in RTL), no shadow */
    .bub { position: relative; min-inline-size: 64px; padding: 8px 14px; border-radius: var(--radius-bubble); background: var(--muted); border: 1px solid transparent; color: var(--foreground); }
    :host(.in) .bub { border-start-start-radius: var(--radius-tail); }
    :host(.out) .bub { border-start-end-radius: var(--radius-tail); }
    :host(.k-agent) .bub { background: var(--brand-soft); }
    :host(.k-bot) .bub { background: var(--card); border-color: var(--border); }
    :host(.k-note) .bub, :host(.k-whisper) .bub { background: color-mix(in srgb, var(--warning) 8%, transparent); border-color: color-mix(in srgb, var(--warning) 25%, transparent); }
    .bub.failed { border-color: var(--destructive); }
    .bub.sending { opacity: .7; }
    mark { background: color-mix(in srgb, var(--muted-foreground) 38%, transparent); color: inherit; border-radius: 3px; padding-inline: 1px; } mark.cur { background: var(--muted-foreground); color: var(--primary-foreground); }
    .reg { display: inline-flex; align-items: center; margin-block-start: 4px; padding-inline: 8px; block-size: 20px; border-radius: var(--radius-sm); border: 1px solid var(--border); color: var(--muted-foreground); font-size: var(--tr-fs-micro); } .reg:hover { color: var(--foreground); }
    .regbox { margin-block-start: 6px; padding: 6px 8px; border-radius: var(--radius-md); background: var(--card); font-size: var(--tr-fs-body-sm); } .regbox p { margin: 2px 0; } .rl { display: block; color: var(--muted-foreground); font-size: var(--tr-fs-micro); font-weight: 500; }
    .txt { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--tr-fs-body-lg); line-height: var(--tr-lh-body-lg); }
    .tr { margin: 6px 0 0; padding-block-start: 6px; border-block-start: 1px solid color-mix(in srgb, currentColor 18%, transparent); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); opacity: .95; }
    .trlbl { display: flex; align-items: center; gap: 4px; margin-block-end: 2px; font-size: var(--tr-fs-micro); opacity: .75; }
    .deleted { color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    :host-context([lang='en']) .deleted { font-style: italic; }
    .quote { display: flex; flex-direction: column; inline-size: 100%; margin-block-end: 6px; padding: 4px 8px; border-inline-start: 1px solid var(--muted-foreground); border-radius: var(--radius-sm); background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; font-size: var(--tr-fs-caption); text-align: start; }
    .quote strong { font-weight: 500; }
    .meta { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-block-start: 2px; color: var(--muted-foreground); line-height: var(--tr-lh-micro); }
    .meta:empty { display: none; }
    .read { color: var(--brand); }
    /* the hover toolbar floats beside the bubble (it never takes width from it) */
    .act { position: absolute; inset-block-start: 50%; translate: 0 -50%; z-index: 2; opacity: 0; pointer-events: none; transition: opacity var(--tr-motion-fast); }
    :host(.in) .act { inset-inline-start: calc(100% + 4px); } :host(.out) .act { inset-inline-end: calc(100% + 4px); }
    :host(:hover) .act, :host(:focus-within) .act, .act.show { opacity: 1; pointer-events: auto; }
    .err { display: inline-flex; align-items: center; gap: 6px; margin-block-start: 2px; padding-inline: 6px; color: var(--destructive); font-size: var(--tr-fs-caption); }
    .err.dim { color: var(--muted-foreground); } .err button { text-decoration: underline; font-weight: 500; min-block-size: 24px; }
    @media (hover: none) { .act { display: none; } }
  `],
})
export class TrMessageBubbleComponent {
  readonly __trk2 = (__i: number, a: any): any => a.id;
  readonly __trk3 = (__i: number, p: any): any => __i;
  protected readonly fmt = inject(FormatService);
  private readonly i18n = inject(I18nService);

  private readonly _m = signal<MessageVM>(undefined as any);
  @Input('message') get m(): Signal<MessageVM> { return this._m; }
  set m(v: any) { this._m.set(v); }
  private readonly _group = signal<GroupPosition>('single');
  @Input() get group(): Signal<GroupPosition> { return this._group; }
  set group(v: any) { this._group.set(v); }
  private readonly _channel = signal<ChannelCapabilities>(undefined as any);
  @Input() get channel(): Signal<ChannelCapabilities> { return this._channel; }
  set channel(v: any) { this._channel.set(v); }
  private readonly _highlight = signal(false);
  @Input() get highlight() { return this._highlight; }
  set highlight(v: any) { this._highlight.set(v); }
  private readonly _query = signal('');
  @Input() get query() { return this._query; }
  set query(v: any) { this._query.set(v); }
  private readonly _activeMatch = signal(false);
  @Input() get activeMatch() { return this._activeMatch; }
  set activeMatch(v: any) { this._activeMatch.set(v); }

  @Output() act = new EventEmitter<MessageAction>();
  @Output() retry = new EventEmitter<void>();
  @Output() discard = new EventEmitter<void>();
  @Output() openMedia = new EventEmitter<AttachmentVM>();
  @Output() jump = new EventEmitter<string>();

  private readonly _actions = signal<TrMessageActionsComponent | undefined>(undefined);
  @ViewChild('actions') private get actions(): Signal<TrMessageActionsComponent | undefined> { return this._actions; }
  private set actions(v: any) { this._actions.set(v); }
  protected readonly pinned = signal(false);
  protected readonly regOpen = signal(false);
  protected readonly revealed = signal<ReadonlySet<string>>(new Set());
  private readonly confirm = inject(ConfirmService);
  private readonly store = inject(MessageStore);
  protected readonly parts = computed(() => buildParts(this.m().text, this.m().piiSpans, this.query()));

  /** Opening a blurred (sensitive) image asks for a reason, logs the access, then shows it. */
  protected async onMedia(a: AttachmentVM): Promise<void> {
    if (a.sensitive && !this.revealed().has(a.id)) {
      const r = await this.confirm.ask({ title: this.i18n.t('pii.askTitle'), text: this.i18n.t('pii.logged'), confirmLabel: this.i18n.t('pii.show'), cancelLabel: this.i18n.t('common.cancel'), fields: [{ key: 'reason', label: this.i18n.t('pii.reasonField'), value: this.i18n.t('pii.reason.identity') }] });
      if (r.result !== 'confirm') return;
      this.store.logPii(this.m().id, 'identity');
      this.revealed.update((s) => new Set(s).add(a.id));
      return;
    }
    this.openMedia.emit(a);
  }
  private press: ReturnType<typeof setTimeout> | null = null;

  protected readonly showHead = computed(() => this.group() === 'single' || this.group() === 'first');
  /** Only the delivery state lives under the bubble (time moved above the group). */
  protected readonly showMeta = computed(() => this.m().status === 'failed' || (this.m().isOutgoing && this.m().authorKind !== 'note' && (this.group() === 'single' || this.group() === 'last')));
  protected readonly whoLabel = computed(() => {
    const m = this.m();
    if (m.authorKind === 'note') return `${this.i18n.t('msg.note')} · ${m.author.name}`;
    if (m.authorKind === 'bot') return this.i18n.t('msg.ai');
    return m.author.name;
  });

  protected onContext(e: MouseEvent): void {
    e.preventDefault();
    this.actions()?.openAt(e.clientX, e.clientY);
  }
  protected onDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    this.press = setTimeout(() => this.actions()?.openAt(e.clientX, e.clientY), 500);
  }
  protected cancelPress(): void {
    if (this.press) clearTimeout(this.press);
  }
}
