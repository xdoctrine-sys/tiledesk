import { Signal, computed, effect, signal, untracked } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, inject, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { AttachmentVM, ConversationVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { ComposerMode, DraftStore } from '../core/stores/draft.store';
import { MessageStore } from '../core/stores/message.store';
import { uid } from '../core/util/text';
import { AiService } from '../core/services/ai.service';
import { UiStore } from '../core/stores/ui.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { Register, TrAiAssistComponent } from './ai-assist.component';
import { TrAttachmentTrayComponent } from './attachment-tray.component';
import { TrCannedPickerComponent } from './canned-picker.component';
import { TrEmojiPickerComponent } from './emoji-picker.component';
import { MentionTarget, TrMentionPickerComponent } from './mention-picker.component';
import { SendAfter, TrSendButtonComponent } from './send-button.component';
import { TrVoiceRecorderComponent, VoiceResult } from './voice-recorder.component';

type Lock = { kind: 'resolved' | 'colleague' | 'blocked' | 'window' | 'pen'; text: string; action?: { label: string; emit: () => void } };
const CANNED_RE = /(?:^|\s)\/([^\s/]*)$/;
const MENTION_RE = /(?:^|\s)@([^\s@]*)$/;

/**
 * Composer (F-75 to F-93). Segmented Reply / Internal note (a note tints the field --warning at 8 %). One rounded field with at most
 * four icons inside (emoji, attachment, voice, AI) plus "+" on its start side (saved replies "/", signature, editor size, register)
 * and the square Send button: 6 visible icons in all. The character counter appears only above 80 % of the channel limit.
 * One draft per conversation is kept.
 * Enter sends on chat channels, Shift+Enter inserts a line, ⌘↵ sends (⌘⇧↵ and resolve, ⌘⌥↵ and set pending).
 */
@Component({
  standalone: true,
  selector: 'tr-composer',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, TrAiAssistComponent, TrSendButtonComponent, TrCannedPickerComponent, TrMentionPickerComponent, TrEmojiPickerComponent, TrAttachmentTrayComponent, TrVoiceRecorderComponent, CommonModule],
  host: { '[class.note]': 'mode() === "note"', '[class.drag]': 'dragging()', '(dragover)': 'onDragOver($event)', '(dragleave)': 'dragging.set(false)', '(drop)': 'onDrop($event)' },
  template: `
    <ng-container *ngIf="resume() as r">
      <div class="resume" role="status"><tr-icon name="clock" [size]="14"></tr-icon><span class="rt tr-truncate">{{ 'resume.since' | t: { time: fmt.time(r.time) } }} · {{ 'resume.new' | t: { n: r.n } }}</span><button type="button" class="tr-icon-btn rx" [attr.aria-label]="'common.close' | t" (click)="resumeDismissed.set(true)"><tr-icon name="x" [size]="14"></tr-icon></button></div>
    </ng-container>
    <ng-container *ngIf="lock() as l">
      <div class="lock" role="status"><tr-icon name="lock" [size]="16"></tr-icon><span class="lt">{{ l.text }}</span><ng-container *ngIf="l.action as a"> <button type="button" class="la" (click)="a.emit()">{{ a.label }}</button> </ng-container></div>
    </ng-container>
    <div class="tabs">
      <div class="seg2" role="tablist">
        <button type="button" role="tab" class="tab" [class.on]="mode() === 'reply'" [attr.aria-selected]="mode() === 'reply'" [disabled]="!!lock() && mode() !== 'reply'" (click)="setMode('reply')">{{ 'comp.reply' | t }}</button>
        <button type="button" role="tab" class="tab" [class.on]="mode() === 'note'" [attr.aria-selected]="mode() === 'note'" (click)="setMode('note')">{{ 'comp.internalNote' | t }}</button>
      </div>
      <span class="sp"></span>
      <ng-container *ngIf="c().window && mode() === 'reply'"> <span class="win" [title]="'win.title' | t">{{ 'win.open' | t: { h: win().h, m: win().m } }}</span> </ng-container>
    </div>

    <ng-container *ngIf="store.quoting() as q">
      <div class="quote"><tr-icon name="corner-up-left" [size]="14" class="tr-mirror"></tr-icon><span class="qt tr-truncate"><strong>{{ q.author.name }}</strong> <span dir="auto">{{ q.text || ('att.attachment' | t) }}</span></span><button type="button" class="tr-icon-btn qx" [attr.aria-label]="'common.cancel' | t" (click)="store.quoting.set(null)"><tr-icon name="x" [size]="14"></tr-icon></button></div>
    </ng-container>

    <ng-container *ngIf="recording(); else __e2">
      <tr-voice-recorder (cancel)="recording.set(false)" (done)="onVoice($event)"></tr-voice-recorder>
    </ng-container><ng-template #__e2><ng-container *ngIf="!(lock() && mode() === 'reply')">
      <div class="ed">
        <ng-container *ngIf="attachments().length"> <tr-attachment-tray [items]="attachments()" [channelName]="c().channel.name" (remove)="removeAttachment($event)"></tr-attachment-tray> </ng-container>
        <div class="row">
          <!-- visible icons: + · emoji · attach · mic · AI · Send  (6 at most; saved replies, signature, editor size and register live in "+") -->
          <div class="mw">
            <button type="button" class="tr-icon-btn plus" aria-haspopup="menu" [attr.aria-expanded]="moreOpen()" [attr.aria-label]="'comp.more' | t" [title]="'comp.more' | t" (click)="moreOpen.set(!moreOpen())"><tr-icon name="plus" [size]="18"></tr-icon></button>
            <ng-container *ngIf="moreOpen()">
              <div class="tr-menu mm" role="menu" (trClickOutside)="moreOpen.set(false)">
                <button type="button" role="menuitem" class="tr-menu__item" (click)="moreOpen.set(false); openCanned()"><tr-icon name="slash" [size]="16"></tr-icon>{{ 'comp.canned' | t }}<span class="tr-menu__kbd">/</span></button>
                <button type="button" role="menuitemcheckbox" class="tr-menu__item" [attr.aria-checked]="ui.signature()" (click)="ui.set('signature', !ui.signature())"><tr-icon name="signature" [size]="16"></tr-icon>{{ 'comp.signature' | t }}<span class="tr-menu__kbd">{{ (ui.signature() ? 'common.on' : 'common.off') | t }}</span></button>
                <button type="button" role="menuitemcheckbox" class="tr-menu__item" [attr.aria-checked]="expanded()" (click)="expanded.set(!expanded()); moreOpen.set(false)"><tr-icon name="expand" [size]="16"></tr-icon>{{ 'comp.expand' | t }}</button>
                <div class="tr-menu__sep"></div>
                <div class="tr-menu__title">{{ 'ai.register' | t }}</div>
                <div class="seg" role="radiogroup">
                  <ng-container *ngFor="let r of registers; trackBy: __trk1"> <button type="button" role="radio" [attr.aria-checked]="register() === r" [class.on]="register() === r" (click)="register.set(register() === r ? null : r)">{{ ('ai.register.' + r) | t }}</button> </ng-container>
                </div>
              </div>
            </ng-container>
          </div>
          <div class="field">
            <textarea #ta class="ta" [class.big]="expanded()" rows="1" dir="auto" [value]="text()" [placeholder]="placeholder()" [attr.aria-label]="(mode() === 'note' ? 'comp.note' : 'comp.reply') | t" (input)="onInput()" (keydown)="onKey($event)" (click)="detect()" (keyup)="onKeyUp($event)" (paste)="onPaste($event)"></textarea>
            <div class="ico">
              <ng-container *ngIf="showCounter()"> <span class="cnt" [class.over]="tooLong()" aria-live="polite">{{ fmt.number(len()) }} / {{ fmt.number(c().channel.maxLength) }}</span> </ng-container>
              <button type="button" class="tr-icon-btn" [attr.aria-label]="'comp.emoji' | t" [title]="'comp.emoji' | t" [attr.aria-expanded]="emojiOpen()" (click)="emojiOpen.set(!emojiOpen())"><tr-icon name="smile" [size]="18"></tr-icon></button>
              <button type="button" class="tr-icon-btn" [attr.aria-label]="'comp.attach' | t" [title]="('comp.attach' | t) + ' (⌘⌥A)'" (click)="fileInput.click()"><tr-icon name="paperclip" [size]="18"></tr-icon></button>
              <ng-container *ngIf="mode() === 'reply'"> <button type="button" class="tr-icon-btn" [attr.aria-label]="'comp.voice' | t" [title]="'comp.voice' | t" (click)="recording.set(true)"><tr-icon name="mic" [size]="18"></tr-icon></button> </ng-container>
              <tr-ai-assist *ngIf="ui.ext.ai" #aiAssist [text]="text()" [conversationId]="c().id" [register]="register()" (replace)="replaceText($event)" (insertNote)="insertAsNote($event)"></tr-ai-assist>
            </div>
          </div>
          <tr-send-button [mode]="mode()" [disabled]="!canSend()" (send)="send($event)"></tr-send-button>
        </div>
        <ng-container *ngIf="registerPreview() as rp">
          <div class="rp"><span class="rl">{{ 'comp.registerPreview' | t }}</span><p dir="auto">{{ rp }}</p><button type="button" class="tr-btn" (click)="replaceText(rp)">{{ 'comp.useThis' | t }}</button></div>
        </ng-container>
        <ng-container *ngIf="tooLong()"> <p class="lint">{{ 'comp.lint.tooLong' | t: { max: fmt.number(c().channel.maxLength), channel: ('channel.' + c().channel.kind) | t } }}</p> </ng-container>
        <ng-container *ngIf="canned() !== null"> <tr-canned-picker #cp [query]="canned()!" [fill]="fill()" [context]="lastCustomerText()" (pick)="insertCanned($event)" (close)="canned.set(null)"></tr-canned-picker> </ng-container>
        <ng-container *ngIf="mention() !== null"> <tr-mention-picker #mp [query]="mention()!" (pick)="insertMention($event)" (close)="mention.set(null)"></tr-mention-picker> </ng-container>
        <ng-container *ngIf="emojiOpen()"> <tr-emoji-picker (pick)="insertAtCaret($event)" (close)="emojiOpen.set(false)"></tr-emoji-picker> </ng-container>
        <ng-container *ngIf="dragging()"> <div class="drop">{{ 'comp.drop' | t }}</div> </ng-container>
      </div>
    </ng-container></ng-template>
    <input #fileInput type="file" class="tr-sr-only" multiple tabindex="-1" (change)="onFiles($any($event.target).files); $any($event.target).value = ''" />
  `,
  styles: [`
    :host { position: relative; display: block; padding: 8px 16px 16px; }
    :host(.drag) { outline: 1px solid var(--brand); outline-offset: -4px; border-radius: var(--radius); }
    /* Reply / Internal note: small segmented control (--muted track, white active segment) */
    .tabs { display: flex; align-items: center; gap: 8px; margin-block-end: 8px; }
    .seg2 { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--radius-md); background: var(--muted); }
    .tab { position: relative; display: inline-flex; align-items: center; min-block-size: 28px; padding-inline: 12px; border-radius: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); }
    .tab::after { content: ''; position: absolute; inset-inline: 0; inset-block: -8px; } .tab:hover:not(:disabled) { color: var(--foreground); }
    .tab.on { background: var(--card); color: var(--foreground); font-weight: 500; }
    .tab:disabled { opacity: .45; } .sp { flex: 1; } .win { color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .mw { position: relative; flex: none; align-self: flex-end; }
    .plus { inline-size: 40px; block-size: 40px; color: var(--muted-foreground); }
    .mm { inset-block-end: 100%; inset-inline-start: 0; margin-block-end: 6px; inline-size: 280px; }
    .seg { display: flex; gap: 2px; margin: 2px 10px 8px; padding: 2px; border-radius: var(--radius-md); background: var(--muted); } .seg button { flex: 1; min-block-size: 30px; border-radius: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); text-align: center; } .seg button.on { background: var(--card); color: var(--foreground); font-weight: 500; }
    .resume { display: flex; align-items: center; gap: 8px; margin-block-end: 8px; padding-block: 2px; padding-inline: 10px 4px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .rt { flex: 1; } .rx { inline-size: 28px; block-size: 28px; }
    .rp { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-block-start: 8px; padding: 8px 10px; border-radius: var(--radius-md); background: var(--muted); } .rp p { margin: 0; font-size: var(--tr-fs-body-sm); line-height: var(--tr-lh-body-sm); } .rl { color: var(--muted-foreground); font-size: var(--tr-fs-caption); font-weight: 500; } .rp .tr-btn { min-block-size: 30px; padding-inline: 10px; align-self: flex-end; }
    .lock { display: flex; align-items: center; gap: 10px; min-block-size: 44px; margin-block-end: 8px; padding: 6px 12px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .lt { flex: 1; } .la { color: var(--brand); font-weight: 500; padding-inline: 8px; min-block-size: 32px; }
    .quote { display: flex; align-items: center; gap: 8px; margin-block-end: 8px; padding-block: 4px; padding-inline: 10px 4px; border-inline-start: 1px solid var(--muted-foreground); border-radius: var(--radius-sm); background: var(--muted); font-size: var(--tr-fs-caption); color: var(--muted-foreground); }
    .qt { flex: 1; } .qx { inline-size: 28px; block-size: 28px; }
    .ed { position: relative; }
    .row { display: flex; align-items: flex-end; gap: 8px; }
    /* the field: --card, 1 px --border, radius 14, 48 px minimum, grows up to 40 % of the panel; icons sit inside, at the end */
    .field { flex: 1; min-inline-size: 0; display: flex; align-items: flex-end; gap: 2px; min-block-size: 48px; padding-inline: 14px 6px; padding-block: 0; border: 1px solid var(--border); border-radius: 14px; background: var(--card); }
    .field:focus-within { border-color: var(--ring); }
    .ta { flex: 1; min-inline-size: 0; display: block; align-self: stretch; min-block-size: 22px; max-block-size: 40vh; padding-block: 12px; padding-inline: 0; border: 0; outline: none; background: transparent; color: var(--foreground); resize: none; font-size: var(--tr-fs-body-lg); line-height: var(--tr-lh-body-lg); unicode-bidi: plaintext; }
    .ta::placeholder { color: var(--muted-foreground); }
    .ta.big { min-block-size: 34vh; }
    .ico { flex: none; display: flex; align-items: center; gap: 0; padding-block-end: 6px; }
    .ico .tr-icon-btn { inline-size: 32px; block-size: 32px; }
    :host(.note) .field { background: color-mix(in srgb, var(--warning) 8%, transparent); border-color: color-mix(in srgb, var(--warning) 25%, transparent); }
    /* phones: the icons drop under the text so the placeholder keeps one line */
    @media (max-width: 767px) {
      .field { flex-wrap: wrap; padding-inline-end: 14px; }
      .ta { flex: 1 1 100%; }
      .ico { margin-inline-start: auto; padding-block-end: 4px; }
    }
    .lint { margin: 6px 2px 0; color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .cnt { margin-inline-end: 6px; color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .cnt.over { color: var(--destructive); }
    .drop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: color-mix(in srgb, var(--accent) 90%, transparent); color: var(--foreground); font-weight: 500; pointer-events: none; }
  `],
})
export class TrComposerComponent implements OnDestroy {
  readonly __trk1 = (__i: number, r: any): any => r;
  protected readonly store = inject(MessageStore);
  private readonly conv = inject(ConversationStore);
  private readonly drafts = inject(DraftStore);
  private readonly dir = inject(DirectoryStore);
  private readonly i18n = inject(I18nService);
  protected readonly fmt = inject(FormatService);
  private readonly toast = inject(ToastService);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  @Output() join = new EventEmitter<void>();
  @Output() reopen = new EventEmitter<void>();
  @Output() unblock = new EventEmitter<void>();

  protected readonly mode = signal<ComposerMode>('reply');
  protected readonly text = signal('');
  protected readonly attachments = signal<AttachmentVM[]>([]);
  protected readonly recording = signal(false);
  protected readonly emojiOpen = signal(false);
  protected readonly canned = signal<string | null>(null);
  protected readonly mention = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly moreOpen = signal(false);
  protected readonly expanded = signal(false);
  protected readonly register = signal<Register>(null);
  protected readonly registerPreview = signal('');
  protected readonly resumeDismissed = signal(false);
  protected readonly registers = ['khaleeji', 'fusha', 'en'] as const;
  protected readonly ui = inject(UiStore);
  private readonly aiSvc = inject(AiService);
  private readonly _aiAssist = signal<TrAiAssistComponent | undefined>(undefined);
  @ViewChild('aiAssist') private get aiAssist(): Signal<TrAiAssistComponent | undefined> { return this._aiAssist; }
  private set aiAssist(v: any) { this._aiAssist.set(v); }
  private rpTimer?: ReturnType<typeof setTimeout>;

  private readonly _ta = signal<ElementRef<HTMLTextAreaElement> | undefined>(undefined);
  @ViewChild('ta') private get ta(): Signal<ElementRef<HTMLTextAreaElement> | undefined> { return this._ta; }
  private set ta(v: any) { this._ta.set(v); }
  private readonly _fileInput = signal<ElementRef<HTMLInputElement> | undefined>(undefined);
  @ViewChild('fileInput') private get fileInput(): Signal<ElementRef<HTMLInputElement> | undefined> { return this._fileInput; }
  private set fileInput(v: any) { this._fileInput.set(v); }
  private readonly _cp = signal<TrCannedPickerComponent | undefined>(undefined);
  @ViewChild('cp') private get cp(): Signal<TrCannedPickerComponent | undefined> { return this._cp; }
  private set cp(v: any) { this._cp.set(v); }
  private readonly _mp = signal<TrMentionPickerComponent | undefined>(undefined);
  @ViewChild('mp') private get mp(): Signal<TrMentionPickerComponent | undefined> { return this._mp; }
  private set mp(v: any) { this._mp.set(v); }
  private persistTimer?: ReturnType<typeof setTimeout>;
  private readonly files = new Map<string, File>();
  private tokenStart = 0;

  protected readonly len = computed(() => this.text().length);
  protected readonly max = computed(() => this.c().channel.maxLength);
  protected readonly showCounter = computed(() => this.max() > 0 && this.len() > this.max() * 0.8);
  protected readonly tooLong = computed(() => this.max() > 0 && this.len() > this.max());
  protected readonly canSend = computed(() => {
    const ready = this.attachments().every((a) => !a.error && (a.progress === undefined || a.progress >= 100));
    return (this.text().trim().length > 0 || this.attachments().some((a) => !a.error)) && !this.tooLong() && ready && !this.lockedReply() && !this.ui.readOnly();
  });

  /** Non-modal capsule when you come back to a draft: what happened since you last wrote (F-149). The draft is never overwritten. */
  protected readonly resume = computed(() => {
    if (this.resumeDismissed() || this.mode() !== 'reply') return null;
    const id = this.c().id;
    const at = this.drafts.updatedAt(id);
    if (!at || !this.drafts.reply(id)) return null;
    const newer = this.store.vms().filter((m) => m.createdAt.getTime() > at && m.authorKind !== 'note' && !(m.isOutgoing && m.author.id === this.dir.meId()));
    const n = newer.filter((m) => m.authorKind !== 'system').length;
    return n ? { time: new Date(at), n } : null;
  });

  protected readonly fill = computed(() => ({ agent: this.dir.me()?.firstName ?? '', lead: this.i18n.customerName(this.c().customer), ticket: this.c().ticket }));
  protected readonly lastCustomerText = computed(() => [...this.store.vms()].reverse().find((m) => m.authorKind === 'customer')?.text ?? '');
  protected readonly win = computed(() => {
    const w = this.c().window;
    const ms = w ? Math.max(0, w.expiresAt.getTime() - Date.now()) : 0;
    return { h: Math.floor(ms / 3_600_000), m: Math.floor((ms % 3_600_000) / 60_000) };
  });

  /** Reasons the reply side is unavailable (internal notes stay possible). */
  protected readonly lock = computed<Lock | null>(() => {
    const c = this.c();
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    if (c.blocked) return { kind: 'blocked', text: t('cust.blocked'), action: { label: t('cust.unblock'), emit: () => this.unblock.emit() } };
    if (c.state === 'closed') return { kind: 'resolved', text: t('conv.resolvedBanner', { agent: c.agents[0]?.firstName ?? '', date: this.fmt.dateTime(c.updatedAt) }), action: { label: t('actions.reopen'), emit: () => this.reopen.emit() } };
    if (c.window?.level === 'closed') return { kind: 'window', text: t('comp.templateOnly') };
    if (c.penHolder && !c.penHolder.isMe) return { kind: 'pen', text: t('coll.writing', { name: c.penHolder.firstName }), action: { label: t('comp.penRequest'), emit: () => void this.requestPen() } };
    if (c.state === 'human' && !c.actor.isMe && !c.agents.some((a) => a.isMe)) return { kind: 'colleague', text: t('conv.colleague', { name: c.agents[0]?.firstName ?? '' }), action: { label: t('actions.join'), emit: () => this.join.emit() } };
    return null;
  });
  protected readonly lockedReply = computed(() => !!this.lock() && this.mode() === 'reply');

  protected readonly placeholder = computed(() => {
    if (this.mode() === 'note') return this.i18n.t('comp.noteHint');
    return this.i18n.t(['bot', 'waiting_human'].includes(this.c().state) ? 'comp.placeholderTakeover' : 'comp.placeholder');
  });

  constructor() {
    // hydrate the draft + mode whenever another conversation opens
    effect(() => {
      const id = this.c().id;
      untracked(() => {
        const mode = this.lock() ? 'note' : this.drafts.mode(id);
        this.mode.set(mode);
        this.text.set(mode === 'note' ? this.drafts.note(id) : this.drafts.reply(id));
        this.attachments.set([]);
        this.resumeDismissed.set(false);
        this.recording.set(false);
        this.emojiOpen.set(false);
        this.canned.set(null);
        this.mention.set(null);
        queueMicrotask(() => this.autoGrow());
      });
    });
    // Arabic register: show "what the customer will receive" for the draft (I-4), debounced
    effect(() => {
      const r = this.register();
      const t = this.text();
      const m = this.mode();
      untracked(() => {
        clearTimeout(this.rpTimer);
        this.registerPreview.set('');
        if (!r || m !== 'reply' || t.trim().length < 3) return;
        this.rpTimer = setTimeout(async () => this.registerPreview.set(await this.aiSvc.run('rephrase', t, { register: r })), 700);
      });
    });
    // a locked reply side forces the note tab
    effect(() => {
      if (this.lock() && this.mode() === 'reply') untracked(() => this.switchMode('note'));
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.persistTimer);
  }

  // ------------------------------------------------------------ public API (shell shortcuts, brief)
  setMode(mode: ComposerMode): void {
    if (mode === 'reply' && this.lock()) return;
    this.switchMode(mode);
    this.focus();
  }
  focus(): void {
    queueMicrotask(() => this.ta()?.nativeElement.focus());
  }
  insert(text: string): void {
    if (this.lock() && this.mode() === 'reply') return;
    this.insertAtCaret(text);
  }
  toggleAi(): void {
    this.aiAssist()?.toggle();
  }
  protected replaceText(text: string): void {
    this.text.set(text);
    const el = this.ta()?.nativeElement;
    if (el) el.value = text;
    this.registerPreview.set('');
    queueMicrotask(() => { this.autoGrow(); this.persist(); el?.focus(); });
  }
  protected insertAsNote(text: string): void {
    this.switchMode('note');
    this.replaceText(text);
  }
  protected async requestPen(): Promise<void> {
    await this.conv.exec(this.c().id, { type: 'requestPen' });
    this.toast.show(this.i18n.t('toast.penRequested', { name: this.c().penHolder?.firstName ?? '' }), { kind: 'success' });
  }

  /** ⌘B / ⌘I: the syntax follows the channel (WhatsApp *bold*, markdown channels **bold**); unsupported channels explain why (F-89). */
  private format(kind: 'bold' | 'italic'): void {
    const caps = this.c().channel;
    const m = caps.kind === 'whatsapp' ? { bold: '*', italic: '_' } : caps.supportsMarkdown ? { bold: '**', italic: '_' } : null;
    if (!m) return void this.toast.show(this.i18n.t('comp.formatUnsupported', { channel: this.i18n.t(`channel.${caps.kind}`) }));
    const el = this.ta()!.nativeElement;
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const w = m[kind];
    this.replaceText(el.value.slice(0, s) + w + el.value.slice(s, e) + w + el.value.slice(e));
    queueMicrotask(() => el.setSelectionRange(s + w.length, e + w.length));
  }

  attachFiles(): void {
    this.fileInput()?.nativeElement.click();
  }

  private switchMode(mode: ComposerMode): void {
    const id = this.c().id;
    this.persist();
    this.drafts.setMode(id, mode);
    this.mode.set(mode);
    this.text.set(mode === 'note' ? this.drafts.note(id) : this.drafts.reply(id));
    this.canned.set(null);
    this.mention.set(null);
    queueMicrotask(() => this.autoGrow());
  }

  // ------------------------------------------------------------ text handling
  protected onInput(): void {
    const el = this.ta()!.nativeElement;
    this.text.set(el.value);
    this.autoGrow();
    this.detect();
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 500); // 500 ms debounce (draftChange)
  }
  private persist(): void {
    this.drafts.set(this.c().id, this.mode(), this.text());
  }
  private autoGrow(): void {
    const el = this.ta()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }

  /** "/" opens saved replies, "@" (notes) opens mentions: the token before the caret decides. */
  protected detect(): void {
    const el = this.ta()?.nativeElement;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const cm = CANNED_RE.exec(before);
    const mm = this.mode() === 'note' ? MENTION_RE.exec(before) : null;
    this.canned.set(cm ? cm[1]! : null);
    this.mention.set(mm ? mm[1]! : null);
    this.tokenStart = (cm ?? mm) ? before.length - (cm ?? mm)![0].trimStart().length : 0;
  }
  protected onKeyUp(e: KeyboardEvent): void {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) this.detect();
  }

  protected onKey(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;
    const cp = this.cp();
    const mp = this.mp();
    const picker = this.canned() !== null && cp?.hasItems() ? cp : this.mention() !== null && mp?.hasItems() ? mp : null;
    if (picker) {
      if (e.key === 'ArrowDown') { e.preventDefault(); return picker.move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); return picker.move(-1); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return picker.choose(); }
    }
    if (e.key === 'Escape') {
      if (this.canned() !== null || this.mention() !== null || this.emojiOpen()) { this.canned.set(null); this.mention.set(null); this.emojiOpen.set(false); return; }
      if (this.store.quoting()) this.store.quoting.set(null);
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (e.code === 'KeyB' || e.code === 'KeyI') && this.mode() === 'reply') { e.preventDefault(); return this.format(e.code === 'KeyB' ? 'bold' : 'italic'); }
    if (e.altKey && e.code === 'KeyL') { e.preventDefault(); return this.setMode('reply'); }
    if (e.altKey && e.code === 'KeyP') { e.preventDefault(); return this.setMode('note'); }
    if (e.key === 'Enter' && !e.isComposing) {
      if (mod && e.shiftKey) { e.preventDefault(); return void this.send('resolved'); }
      if (mod && e.altKey) { e.preventDefault(); return void this.send('pending'); }
      if (mod) { e.preventDefault(); return void this.send('open'); }
      if (this.c().channel.enterSends && !e.shiftKey && this.mode() === 'reply') { e.preventDefault(); return void this.send('open'); }
    }
  }

  protected insertAtCaret(text: string): void {
    const el = this.ta()?.nativeElement;
    if (!el) return void this.text.update((t) => t + text);
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const next = el.value.slice(0, s) + text + el.value.slice(e);
    this.text.set(next);
    el.value = next;
    queueMicrotask(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length); this.autoGrow(); this.persist(); });
    this.emojiOpen.set(false);
  }

  protected insertCanned(filled: string): void {
    this.replaceToken(filled);
    this.canned.set(null);
  }
  protected insertMention(t: MentionTarget): void {
    this.replaceToken(`@${t.label} `);
    this.mention.set(null);
  }
  private replaceToken(text: string): void {
    const el = this.ta()!.nativeElement;
    const caret = el.selectionStart;
    const next = el.value.slice(0, this.tokenStart) + text + el.value.slice(caret);
    this.text.set(next);
    el.value = next;
    queueMicrotask(() => { el.focus(); const p = this.tokenStart + text.length; el.setSelectionRange(p, p); this.autoGrow(); this.persist(); });
  }
  protected openCanned(): void {
    const el = this.ta()?.nativeElement;
    if (!el) return;
    this.insertAtCaret(el.value && !/\s$/.test(el.value) ? ' /' : '/');
    queueMicrotask(() => this.detect());
  }

  // ------------------------------------------------------------ attachments, voice
  protected onFiles(list: FileList | null): void {
    if (!list) return;
    const caps = this.c().channel;
    for (const f of Array.from(list)) {
      const id = uid('att');
      let error: string | undefined;
      if (!caps.acceptedMimeTypes.length) error = this.i18n.t('att.reason.none');
      else if (!caps.acceptedMimeTypes.includes(f.type)) error = this.i18n.t('att.reason.type');
      else if (f.size > caps.maxFileSizeMb * 1024 * 1024) error = this.i18n.t('att.reason.size', { mb: caps.maxFileSizeMb });
      const att: AttachmentVM = { id, kind: f.type.startsWith('image/') ? 'image' : 'file', name: f.name, mime: f.type, size: f.size, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, progress: error ? undefined : 0, error };
      this.files.set(id, f);
      this.attachments.update((a) => [...a, att]);
      if (!error) this.fakeUpload(id);
    }
  }
  /** Simulated upload progress (replace with the real upload; the template has no back-end). */
  private fakeUpload(id: string): void {
    let p = 0;
    const t = setInterval(() => {
      p = Math.min(100, p + 20 + Math.random() * 25);
      this.attachments.update((a) => a.map((x) => (x.id === id ? { ...x, progress: p } : x)));
      if (p >= 100) clearInterval(t);
    }, 160);
  }
  protected removeAttachment(id: string): void {
    this.attachments.update((a) => a.filter((x) => x.id !== id));
    this.files.delete(id);
  }
  protected onPaste(e: ClipboardEvent): void {
    const files = e.clipboardData?.files;
    if (files?.length) { e.preventDefault(); this.onFiles(files); }
  }
  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); this.dragging.set(true); }
  }
  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    this.onFiles(e.dataTransfer?.files ?? null);
  }

  protected async onVoice(v: VoiceResult): Promise<void> {
    this.recording.set(false);
    if (v.duration < 1) return void this.toast.show(this.i18n.t('voice.tooShort'));
    await this.store.send({ text: '', mode: 'reply', attachments: [{ name: 'voice-message.webm', type: 'audio/webm', size: v.duration * 6000, duration: v.duration, waveform: v.waveform.filter((_, i) => i % Math.max(1, Math.floor(v.waveform.length / 36)) === 0).slice(0, 36) }] });
  }

  // ------------------------------------------------------------ sending
  protected async send(after: SendAfter = 'open'): Promise<void> {
    if (!this.canSend()) return;
    const text = this.text();
    const atts = this.attachments().filter((a) => !a.error);
    clearTimeout(this.persistTimer);
    this.text.set('');
    this.attachments.set([]);
    queueMicrotask(() => this.autoGrow());
    const signature = this.ui.signature() && this.mode() === 'reply' && text.trim() ? `\n\n— ${this.dir.me()?.firstName ?? ''}` : '';
    await this.store.send({
      text: text + signature,
      mode: this.mode(),
      attachments: atts.map((a) => ({ name: a.name, type: a.mime ?? 'application/octet-stream', size: a.size ?? 0, src: a.url })),
      statusAfter: this.mode() === 'note' ? undefined : after === 'open' ? undefined : after,
    });
    this.focus();
  }
}
