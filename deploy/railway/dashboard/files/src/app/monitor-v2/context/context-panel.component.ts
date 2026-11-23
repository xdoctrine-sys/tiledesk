import { computed, effect, signal, untracked } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Output, EventEmitter } from '@angular/core';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { MessageStore } from '../core/stores/message.store';
import { UiStore } from '../core/stores/ui.store';
import { parseUserAgent } from '../core/util/ua';
import { TrAttributesSectionComponent } from './attributes-section.component';
import { TrBotDataSectionComponent } from './bot-data-section.component';
import { TrParticipantsSectionComponent } from './participants-section.component';
import { TrContactCardComponent } from './contact-card.component';
import { TrHistorySectionComponent } from './history-section.component';
import { TrNotesSectionComponent } from './notes-section.component';
import { TrTechContextComponent } from './tech-context.component';
import { TrTicketSectionComponent } from './ticket-section.component';

interface Sec { id: string; title: string; summary: string }

/**
 * Context panel (E-03). ONE title, "Contact" (18/600), then the identity block (avatar 56, name, city · language, copy buttons)
 * and collapsible sections separated by 1 px lines (title 14/500, chevron at the end). "Details" (the editable contact fields) and
 * "AI collected data" are open by default; every other section is folded and shows a one-word summary. Closed by default
 * below 1280 px (it becomes a drawer / bottom sheet).
 */
@Component({
  standalone: true,
  selector: 'tr-context-panel',
  imports: [TrIconComponent, TranslatePipe, TrContactCardComponent, TrBotDataSectionComponent, TrTicketSectionComponent, TrNotesSectionComponent, TrHistorySectionComponent, TrTechContextComponent, TrAttributesSectionComponent, TrParticipantsSectionComponent, CommonModule],
  template: `
    <aside class="cp" [attr.aria-label]="'panel.title' | t">
      <ng-container *ngIf="ui.isMobile()"> <span class="grip" aria-hidden="true"></span> </ng-container>
      <header class="hd">
        <h2>{{ 'panel.title' | t }}</h2>
        <button type="button" class="tr-icon-btn" [attr.aria-label]="'common.close' | t" [title]="('common.close' | t) + ' (Alt+I)'" (click)="ui.closeContext()"><tr-icon name="x" [size]="18"></tr-icon></button>
      </header>
      <ng-container *ngIf="conv.selected() as c; else __e2">
        <div class="scroll">
          <tr-contact-card [c]="c"></tr-contact-card>
          <ng-container *ngFor="let s of sections(); trackBy: __trk1">
            <section class="sec">
              <button type="button" class="sh" [attr.aria-expanded]="isOpen(s.id)" [attr.aria-controls]="'sec-' + s.id" (click)="toggle(s.id)">
                <span class="st">{{ s.title | t }}</span>
                <span class="sm">{{ s.summary }}</span>
                <tr-icon name="chevron-down" [size]="16" class="chev" [class.open]="isOpen(s.id)"></tr-icon>
              </button>
              <ng-container *ngIf="isOpen(s.id)">
                <div [id]="'sec-' + s.id">
                  <ng-container [ngSwitch]="s.id"><ng-container *ngSwitchCase="'bot'"> <tr-bot-data-section [slots]="c.raw.attributes.botSlots ?? []" (jump)="messages.jump($event)"></tr-bot-data-section> </ng-container><ng-container *ngSwitchCase="'ticket'"> <tr-ticket-section [c]="c"></tr-ticket-section> </ng-container><ng-container *ngSwitchCase="'notes'"> <tr-notes-section [c]="c"></tr-notes-section> </ng-container><ng-container *ngSwitchCase="'history'"> <tr-history-section [c]="c" (open)="openConversation.emit($event)"></tr-history-section> </ng-container><ng-container *ngSwitchCase="'tech'"> <tr-tech-context [c]="c"></tr-tech-context> </ng-container><ng-container *ngSwitchCase="'attrs'"> <tr-attributes-section [c]="c"></tr-attributes-section> </ng-container><ng-container *ngSwitchCase="'people'"> <tr-participants-section [c]="c"></tr-participants-section> </ng-container></ng-container>
                </div>
              </ng-container>
            </section>
          </ng-container>
        </div>
      </ng-container><ng-template #__e2>
        <p class="none">{{ 'panel.none' | t }}</p>
      </ng-template>
    </aside>
  `,
  styles: [`
    :host { display: block; block-size: 100%; }
    .cp { display: flex; flex-direction: column; block-size: 100%; }
    .grip { align-self: center; inline-size: 40px; block-size: 4px; margin-block: 8px 0; border-radius: 2px; background: var(--input); }
    .hd { display: flex; align-items: center; justify-content: space-between; block-size: 64px; padding-inline: 20px 12px; } h2 { font-size: var(--tr-fs-title-lg); line-height: var(--tr-lh-title-lg); font-weight: 600; }
    .scroll { flex: 1; overflow-y: auto; padding-block-end: 24px; }
    .sec { border-block-start: 1px solid var(--border); }
    .sh { display: flex; align-items: center; gap: 8px; inline-size: 100%; min-block-size: 44px; padding-inline: 20px 16px; text-align: start; }
    .sh:hover { background: color-mix(in srgb, var(--accent) 60%, transparent); }
    .st { flex: none; font-size: var(--tr-fs-body); font-weight: 500; white-space: nowrap; }
    .sm { flex: 0 1 auto; min-inline-size: 0; margin-inline-start: auto; color: var(--muted-foreground); font-size: var(--tr-fs-caption); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chev { flex: none; color: var(--muted-foreground); transition: transform var(--tr-motion-fast); } .chev.open { transform: rotate(180deg); }
    .none { padding: 24px 20px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrContextPanelComponent {
  readonly __trk1 = (__i: number, s: any): any => s.id;
  protected readonly ui = inject(UiStore);
  protected readonly conv = inject(ConversationStore);
  protected readonly messages = inject(MessageStore);
  private readonly i18n = inject(I18nService);

  @Output() openConversation = new EventEmitter<string>();
  /** Only "AI collected data" is unfolded by default (the contact card has no fold). */
  private readonly open = signal<ReadonlySet<string>>(new Set(['bot']));

  protected readonly sections = computed<Sec[]>(() => {
    const c = this.conv.selected();
    if (!c) return [];
    const t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);
    const slots = (c.raw.attributes.botSlots ?? []).filter((s) => s.value).length;
    return [
      { id: 'bot', title: 'bot.title', summary: slots ? t('panel.count', { n: slots }) : '' },
      { id: 'ticket', title: 'ticket.title', summary: `#${c.ticket} · ${t(`priority.${c.priority}`)}` },
      { id: 'notes', title: 'notes.title', summary: c.raw.notes.length ? t('panel.count', { n: c.raw.notes.length }) : '' },
      { id: 'history', title: 'history.title', summary: '' },
      { id: 'tech', title: 'tech.title', summary: parseUserAgent(c.raw.userAgent).browser },
      { id: 'attrs', title: 'attrs.title', summary: '' },
      { id: 'people', title: 'participants.title', summary: t('panel.count', { n: c.agents.length + c.bots.length }) },
    ];
  });

  constructor() {
    let first = true;
    effect(() => {
      this.ui.labelsRequest();
      untracked(() => (first ? (first = false) : this.open.update((s) => new Set(s).add('ticket'))));
    });
  }

  protected isOpen(id: string): boolean {
    return this.open().has(id);
  }
  protected toggle(id: string): void {
    this.open.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
}
