import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConversationVM } from '../core/models/view-models';
import { FormatService } from '../core/services/format.service';
import { TranslatePipe } from '../core/services/i18n.service';
import { ConversationStore } from '../core/stores/conversation.store';
import { DirectoryStore } from '../core/stores/directory.store';
import { TrAvatarComponent } from '../ui/avatar.component';

interface Note { id: string; text: string; by: string; at: Date }

/**
 * Notes (F-101, F-102): two tabs, "This conversation" (request.notes) and "Contact" (persistent across conversations,
 * ➕ lead_notes: kept in memory here). Type, then Add or ⌘↵. Each note shows author, date and a delete action.
 */
@Component({
  standalone: true,
  selector: 'tr-notes-section',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, CommonModule],
  template: `
    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tab" [class.on]="scope() === 'conv'" [attr.aria-selected]="scope() === 'conv'" (click)="scope.set('conv')">{{ 'notes.conversation' | t }}</button>
      <button type="button" role="tab" class="tab" [class.on]="scope() === 'contact'" [attr.aria-selected]="scope() === 'contact'" (click)="scope.set('contact')">{{ 'notes.contact' | t }}</button>
    </div>
    <form class="add" (submit)="$event.preventDefault(); add()">
      <textarea class="tr-field" rows="2" dir="auto" [placeholder]="'notes.placeholder' | t" [value]="text()" (input)="text.set($any($event.target).value)" (keydown)="onKey($event)"></textarea>
      <button type="submit" class="tr-btn" [disabled]="!text().trim()">{{ 'notes.add' | t }}</button>
    </form>
    <ng-container *ngIf="list().length; else __e2">
      <ul class="ls">
        <ng-container *ngFor="let n of list(); trackBy: __trk1">
          <li class="n">
            <tr-avatar [initials]="author(n.by).initials" [size]="24"></tr-avatar>
            <div class="nb"><span class="nh"><strong>{{ author(n.by).name }}</strong><time>{{ fmt.dateTime(n.at) }}</time></span><p dir="auto">{{ n.text }}</p></div>
            <button type="button" class="tr-icon-btn del" [attr.aria-label]="'common.delete' | t" (click)="remove(n.id)"><tr-icon name="trash-2" [size]="14"></tr-icon></button>
          </li>
        </ng-container>
      </ul>
    </ng-container><ng-template #__e2>
      <p class="empty">{{ (scope() === 'conv' ? 'notes.empty' : 'notes.emptyContact') | t }}</p>
    </ng-template>
  `,
  styles: [`
    :host { display: block; padding: 0 20px 12px; }
    .tabs { display: flex; gap: 4px; margin-block-end: 8px; } .tab { min-block-size: 28px; padding-inline: 10px; border-radius: var(--radius-md); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); } .tab.on { background: var(--muted); color: var(--foreground); font-weight: 600; }
    .add { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; } .add .tr-field { resize: vertical; min-block-size: 56px; }
    .ls { display: flex; flex-direction: column; gap: 10px; margin-block-start: 12px; } .n { display: flex; gap: 8px; align-items: flex-start; }
    .nb { flex: 1; min-inline-size: 0; } .nh { display: flex; gap: 8px; align-items: baseline; font-size: var(--tr-fs-body-sm); } .nh time { color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .nb p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; } .del { inline-size: 28px; block-size: 28px; color: var(--muted-foreground); opacity: 0; } .n:hover .del, .del:focus-visible { opacity: 1; }
    .empty { margin: 12px 0 0; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrNotesSectionComponent {
  readonly __trk1 = (__i: number, n: any): any => n.id;
  protected readonly fmt = inject(FormatService);
  private readonly conv = inject(ConversationStore);
  private readonly dir = inject(DirectoryStore);

  private readonly _c = signal<ConversationVM>(undefined as any);
  @Input() get c(): Signal<ConversationVM> { return this._c; }
  set c(v: any) { this._c.set(v); }
  protected readonly scope = signal<'conv' | 'contact'>('conv');
  protected readonly text = signal('');
  private readonly contactNotes = signal<Record<string, Note[]>>({});

  protected readonly list = computed<Note[]>(() => {
    const c = this.c();
    return this.scope() === 'conv'
      ? c.raw.notes.map((n) => ({ id: n._id, text: n.text, by: n.createdBy, at: new Date(n.createdAt) }))
      : (this.contactNotes()[c.customer.id] ?? []);
  });

  protected author(id: string) {
    return this.dir.agentsById().get(id) ?? { name: '?', initials: '?', colorIndex: 0 };
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.add(); }
  }

  protected add(): void {
    const text = this.text().trim();
    if (!text) return;
    const c = this.c();
    if (this.scope() === 'conv') void this.conv.exec(c.id, { type: 'addNote', text });
    else this.contactNotes.update((m) => ({ ...m, [c.customer.id]: [{ id: `cn_${Date.now()}`, text, by: this.dir.meId(), at: new Date() }, ...(m[c.customer.id] ?? [])] }));
    this.text.set('');
  }

  protected remove(id: string): void {
    const c = this.c();
    if (this.scope() === 'conv') void this.conv.exec(c.id, { type: 'deleteNote', id });
    else this.contactNotes.update((m) => ({ ...m, [c.customer.id]: (m[c.customer.id] ?? []).filter((n) => n.id !== id) }));
  }
}
