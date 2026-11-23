import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { AgentVM } from '../core/models/view-models';
import { I18nService } from '../core/services/i18n.service';
import { TrAvatarComponent } from '../ui/avatar.component';

/**
 * Colleagues on this conversation (F-52, I-5): small avatars of who is viewing (eye) and who holds the pen (pen). Only one
 * agent writes at a time; the others see "Sara is writing a reply" and can ask for the pen.
 */
@Component({
  standalone: true,
  selector: 'tr-presence-stack',
  imports: [TrIconComponent, TrAvatarComponent, CommonModule],
  template: `
    <ng-container *ngFor="let p of people(); trackBy: __trk1">
      <span class="p" [attr.title]="p.title" role="img" [attr.aria-label]="p.title">
        <tr-avatar [initials]="p.agent.initials" [size]="24"></tr-avatar>
        <span class="b"><tr-icon [name]="p.writing ? 'pen-line' : 'eye'" [size]="9"></tr-icon></span>
      </span>
    </ng-container>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; padding-inline-end: 4px; }
    .p { position: relative; display: inline-flex; margin-inline-end: -6px; border-radius: 50%; box-shadow: 0 0 0 2px var(--card); }
    .b { position: absolute; inset-inline-end: -3px; inset-block-end: -3px; inline-size: 14px; block-size: 14px; border-radius: 50%; background: var(--muted-foreground); color: var(--card); display: inline-flex; align-items: center; justify-content: center; border: 1.5px solid var(--card); }
  `],
})
export class TrPresenceStackComponent {
  readonly __trk1 = (__i: number, p: any): any => p.agent.id;
  private readonly i18n = inject(I18nService);
  private readonly _viewers = signal<AgentVM[]>([]);
  @Input() get viewers(): Signal<AgentVM[]> { return this._viewers; }
  set viewers(v: any) { this._viewers.set(v); }
  private readonly _penHolder = signal<AgentVM | undefined>(undefined);
  @Input() get penHolder(): Signal<AgentVM | undefined> { return this._penHolder; }
  set penHolder(v: any) { this._penHolder.set(v); }
  protected readonly people = computed(() => {
    const pen = this.penHolder();
    const rest = this.viewers().filter((v) => v.id !== pen?.id);
    return [
      ...(pen ? [{ agent: pen, writing: true, title: this.i18n.t('coll.writing', { name: pen.firstName }) }] : []),
      ...rest.map((a) => ({ agent: a, writing: false, title: this.i18n.t('coll.viewing', { name: a.firstName }) })),
    ];
  });
}
