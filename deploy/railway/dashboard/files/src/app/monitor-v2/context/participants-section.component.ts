import { Signal, signal } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { TrAvatarComponent } from '../ui/avatar.component';

/** Participants (F-106): the agents and AI bots on this conversation with their role, and "Join" when you are not one of them. */
@Component({
  standalone: true,
  selector: 'tr-participants-section',
  imports: [TranslatePipe, TrAvatarComponent, CommonModule],
  template: `
    <ul class="ls">
      <ng-container *ngFor="let b of c().bots; trackBy: __trk1"> <li><tr-avatar kind="bot" [size]="32"></tr-avatar><span class="n">{{ b.name }}</span><span class="r">{{ 'assign.bot' | t }}</span></li> </ng-container>
      <ng-container *ngFor="let a of c().agents; trackBy: __trk2"> <li><tr-avatar [initials]="a.initials" [size]="32" [presence]="a.available ? 'online' : 'offline'"></tr-avatar><span class="n">{{ a.isMe ? a.name + ' (' + i18n.t('actor.you') + ')' : a.name }}</span><span class="r">{{ ('role.' + a.role) | t }}</span></li> </ng-container>
    </ul>
    <ng-container *ngIf="!c().bots.length && !c().agents.length"> <p class="none">{{ 'participants.none' | t }}</p> </ng-container>
    <ng-container *ngIf="!mine()"> <button type="button" class="tr-btn join" (click)="join()">{{ 'actions.join' | t }}</button> </ng-container>
  `,
  styles: [`
    :host { display: block; padding: 0 20px 12px; } .ls { display: flex; flex-direction: column; gap: 8px; } li { display: flex; align-items: center; gap: 10px; }
    .n { flex: 1; min-inline-size: 0; font-size: var(--tr-fs-body); } .r { color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .none { margin: 0; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } .join { margin-block-start: 10px; }
  `],
})
export class TrParticipantsSectionComponent {
  readonly __trk1 = (__i: number, b: any): any => b.id;
  readonly __trk2 = (__i: number, a: any): any => a.id;
  protected readonly i18n = inject(I18nService);
  private readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);
  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected mine = () => this.c().agents.some((a) => a.isMe);
  protected join(): void {
    void this.conv.exec(this.c().id, { type: 'addParticipant', agentId: this.dir.meId() });
  }
}
