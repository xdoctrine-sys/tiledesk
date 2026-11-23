import { computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { TranslatePipe } from '../core/services/i18n.service';
import { DirectoryStore } from '../core/stores/directory.store';
import { normalizeArabic } from '../core/util/text';
import { TrAvatarComponent } from '../ui/avatar.component';

export interface MentionTarget { kind: 'agent' | 'team' | 'department'; id: string; label: string }

/** "@" in an internal note: agents, teams and departments (F-78). The mentioned person is notified and sees it under "Mentions". */
@Component({
  standalone: true,
  selector: 'tr-mention-picker',
  imports: [TrIconComponent, TranslatePipe, TrAvatarComponent, CommonModule],
  template: `
    <div class="tr-menu panel" role="listbox" [attr.aria-label]="'mention.title' | t">
      <ng-container *ngFor="let t of items(); trackBy: __trk1; let i = index">
        <button type="button" role="option" class="tr-menu__item" [class.is-active]="i === active()" [attr.aria-selected]="i === active()" (mouseenter)="active.set(i)" (click)="choose(i)">
          <ng-container [ngSwitch]="t.kind"><ng-container *ngSwitchCase="'agent'"> <tr-avatar [initials]="t.initials!" [size]="24"></tr-avatar> </ng-container><ng-container *ngSwitchCase="'team'"> <tr-icon name="users" [size]="16"></tr-icon> </ng-container><ng-container *ngSwitchDefault> <tr-icon name="building-2" [size]="16"></tr-icon> </ng-container></ng-container>
          <span class="n tr-truncate">{{ t.label }}</span><span class="k">{{ ('mention.' + t.kind) | t }}</span>
        </button>
      </ng-container><ng-container *ngIf="!(items())?.length"> <div class="none">{{ 'mention.none' | t }}</div> </ng-container>
    </div>
  `,
  styles: [`
    :host { position: absolute; inset-inline: 12px; inset-block-end: 100%; z-index: 100; margin-block-end: 6px; }
    .panel { position: static; inline-size: min(320px, 100%); max-block-size: 280px; overflow: auto; }
    .n { flex: 1; } .k { color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .none { padding: 12px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrMentionPickerComponent {
  readonly __trk1 = (__i: number, t: any): any => t.kind + t.id;
  private readonly dir = inject(DirectoryStore);
  private readonly _query = signal('');
  @Input() get query() { return this._query; }
  set query(v: any) { this._query.set(v); }
  @Output() pick = new EventEmitter<MentionTarget>();
  @Output() close = new EventEmitter<void>();
  protected readonly active = signal(0);

  protected readonly items = computed(() => {
    const q = normalizeArabic(this.query().trim());
    const all = [
      ...this.dir.agents().filter((a) => !a.isMe).map((a) => ({ kind: 'agent' as const, id: a.id, label: a.firstName, initials: a.initials, color: a.colorIndex })),
      ...this.dir.teams().map((t) => ({ kind: 'team' as const, id: t._id, label: t.name, initials: undefined as string | undefined, color: undefined as number | undefined })),
      ...this.dir.departments().map((d) => ({ kind: 'department' as const, id: d._id, label: d.name, initials: undefined as string | undefined, color: undefined as number | undefined })),
    ];
    return all.filter((x) => !q || normalizeArabic(x.label).includes(q));
  });

  move(delta: number): void {
    const n = this.items().length;
    if (n) this.active.set((this.active() + delta + n) % n);
  }
  choose(i = this.active()): void {
    const t = this.items()[i];
    if (t) this.pick.emit({ kind: t.kind, id: t.id, label: t.label });
  }
  hasItems(): boolean {
    return this.items().length > 0;
  }
}
