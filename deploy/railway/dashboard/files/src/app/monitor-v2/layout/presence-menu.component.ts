import { Signal, computed, signal } from '../core/signals';
import { TrIconComponent } from '../ui/icon.component';
import { CommonModule } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { ConfirmService } from '../core/services/confirm.service';
import { I18nService, Lang, TranslatePipe } from '../core/services/i18n.service';
import { ToastService } from '../core/services/toast.service';
import { DirectoryStore } from '../core/stores/directory.store';
import { Availability, BreakType, PresenceStore } from '../core/stores/presence.store';
import { ThemePref, UiStore } from '../core/stores/ui.store';
import { ClickOutsideDirective } from '../shared/click-outside.directive';
import { TrAvatarComponent } from '../ui/avatar.component';

/**
 * Profile + preferences menu opened from the avatar (F-03, F-09, F-10, F-132, F-141): availability, typed breaks,
 * language (instant RTL/LTR switch), theme (dark mode lives here only), digits, sounds, shortcuts, log out with guard.
 */
@Component({
  standalone: true,
  selector: 'tr-presence-menu',
  imports: [TrIconComponent, TranslatePipe, ClickOutsideDirective, TrAvatarComponent, CommonModule],
  host: { '(keydown.escape)': 'open.set(false)', '[class.below]': 'placement() === "below"' },
  template: `
    <button type="button" class="trigger" [attr.aria-expanded]="open()" aria-haspopup="menu" [attr.aria-label]="'presence.menu' | t" (click)="open.set(!open())">
      <tr-avatar [initials]="me()?.initials ?? ''" [size]="36" [presence]="dot()"></tr-avatar>
    </button>
    <ng-container *ngIf="open()">
      <div class="tr-menu menu" role="menu" (trClickOutside)="open.set(false)">
        <div class="id">
          <tr-avatar [initials]="me()?.initials ?? ''" [size]="40"></tr-avatar>
          <div class="who"><strong class="tr-truncate">{{ me()?.name }}</strong><span class="tr-truncate tr-ltr">{{ me()?.email }}</span></div>
        </div>
        <div class="tr-menu__sep"></div>

        <div class="tr-menu__title">{{ 'presence.availability' | t }}</div>
        <ng-container *ngFor="let a of avail; trackBy: __trk1">
          <button type="button" role="menuitemradio" class="tr-menu__item" [class.is-selected]="presence.availability() === a.id && !presence.breakInfo()" [attr.aria-checked]="presence.availability() === a.id && !presence.breakInfo()" (click)="setAvail(a.id)">
            <tr-icon [name]="a.icon" [size]="16"></tr-icon>{{ ('presence.' + a.id) | t }}
          </button>
        </ng-container>
        <div class="tr-menu__title">{{ 'presence.breaks' | t }}</div>
        <div class="breaks">
          <ng-container *ngFor="let b of breaks; trackBy: __trk2">
            <button type="button" class="chipbtn" [class.on]="presence.breakInfo()?.type === b" (click)="presence.startBreak(b)">{{ ('presence.break.' + b) | t }}</button>
          </ng-container>
        </div>
        <div class="tr-menu__sep"></div>

        <div class="tr-menu__title">{{ 'prefs.language' | t }}</div>
        <div class="seg" role="radiogroup">
          <button type="button" role="radio" [attr.aria-checked]="i18n.lang() === 'ar'" [class.on]="i18n.lang() === 'ar'" (click)="setLang('ar')">العربية</button>
          <button type="button" role="radio" [attr.aria-checked]="i18n.lang() === 'en'" [class.on]="i18n.lang() === 'en'" (click)="setLang('en')">English</button>
        </div>
        <div class="tr-menu__title">{{ 'prefs.theme' | t }}</div>
        <div class="seg" role="radiogroup">
          <ng-container *ngFor="let th of themes; trackBy: __trk3">
            <button type="button" role="radio" [attr.aria-checked]="ui.theme() === th.id" [class.on]="ui.theme() === th.id" (click)="ui.set('theme', th.id)"><tr-icon [name]="th.icon" [size]="14"></tr-icon>{{ ('prefs.theme.' + th.id) | t }}</button>
          </ng-container>
        </div>
        <div class="tr-menu__title">{{ 'prefs.digits' | t }}</div>
        <div class="seg" role="radiogroup">
          <button type="button" role="radio" [attr.aria-checked]="ui.numerals() === 'latn'" [class.on]="ui.numerals() === 'latn'" (click)="ui.set('numerals', 'latn')">123</button>
          <button type="button" role="radio" [attr.aria-checked]="ui.numerals() === 'arab'" [class.on]="ui.numerals() === 'arab'" (click)="ui.set('numerals', 'arab')">١٢٣</button>
        </div>
        <button type="button" role="menuitemcheckbox" class="tr-menu__item" [attr.aria-checked]="ui.hijri()" (click)="ui.set('hijri', !ui.hijri())">
          <tr-icon name="calendar" [size]="16"></tr-icon>{{ 'prefs.hijri' | t }}<span class="tr-menu__kbd">{{ (ui.hijri() ? 'common.on' : 'common.off') | t }}</span>
        </button>
        <button type="button" role="menuitemcheckbox" class="tr-menu__item" [attr.aria-checked]="ui.sounds()" (click)="ui.set('sounds', !ui.sounds())">
          <tr-icon [name]="ui.sounds() ? 'volume-2' : 'volume-x'" [size]="16"></tr-icon>{{ 'prefs.sounds' | t }}
          <span class="tr-menu__kbd">{{ (ui.sounds() ? 'common.on' : 'common.off') | t }}</span>
        </button>
        <div class="tr-menu__sep"></div>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="open.set(false); ui.open('shortcuts')"><tr-icon name="keyboard" [size]="16"></tr-icon>{{ 'shortcuts.title' | t }}<span class="tr-menu__kbd">?</span></button>
        <button type="button" role="menuitem" class="tr-menu__item" (click)="logout()"><tr-icon name="log-out" [size]="16" class="tr-mirror"></tr-icon>{{ 'presence.logout' | t }}</button>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .trigger { display: inline-flex; border-radius: 50%; position: relative; }
    .trigger::after { content: ''; position: absolute; inset: -4px; }
    .menu { inset-block-end: 0; inset-inline-start: calc(100% + 12px); inline-size: 288px; max-block-size: calc(100vh - 24px); overflow: auto; }
    :host(.below) .menu { inset-block-end: auto; inset-block-start: calc(100% + 8px); inset-inline-start: auto; inset-inline-end: 0; }
    .id { display: flex; align-items: center; gap: 12px; padding: 10px; }
    .who { display: flex; flex-direction: column; min-inline-size: 0; } .who span { color: var(--muted-foreground); font-size: var(--tr-fs-caption); }
    .breaks { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 10px 8px; }
    .chipbtn { min-block-size: 30px; padding-inline: 10px; border-radius: var(--radius-md); background: var(--muted); color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
    .chipbtn.on, .chipbtn:hover { background: var(--accent); color: var(--foreground); }
    .seg { display: flex; gap: 2px; margin: 2px 10px 8px; padding: 2px; border-radius: var(--radius-md); background: var(--muted); }
    .seg button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-block-size: 32px; border-radius: 8px; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); text-align: center; }
    .seg button.on { background: var(--card); color: var(--foreground); font-weight: 600; box-shadow: var(--shadow-flat); }
  `],
})
export class TrPresenceMenuComponent {
  readonly __trk1 = (__i: number, a: any): any => a.id;
  readonly __trk2 = (__i: number, b: any): any => b;
  readonly __trk3 = (__i: number, th: any): any => th.id;
  protected readonly i18n = inject(I18nService);
  protected readonly ui = inject(UiStore);
  protected readonly presence = inject(PresenceStore);
  private readonly dir = inject(DirectoryStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  private readonly _placement = signal<'side' | 'below'>('side');
  @Input() get placement(): Signal<'side' | 'below'> { return this._placement; }
  set placement(v: any) { this._placement.set(v); }
  protected readonly open = signal(false);
  protected readonly me = this.dir.me;
  protected readonly dot = computed(() => (this.presence.away() ? 'offline' : 'online') as 'online' | 'offline');

  protected readonly avail: { id: Availability; icon: string }[] = [
    { id: 'available', icon: 'circle-check' }, { id: 'busy', icon: 'circle-pause' }, { id: 'away', icon: 'moon' },
  ];
  protected readonly breaks: BreakType[] = ['pause', 'training', 'prayer', 'meal'];
  protected readonly themes: { id: ThemePref; icon: string }[] = [
    { id: 'light', icon: 'sun' }, { id: 'dark', icon: 'moon' }, { id: 'system', icon: 'monitor' },
  ];

  protected setAvail(a: Availability): void {
    this.presence.setAvailability(a);
  }
  protected setLang(l: Lang): void {
    this.i18n.setLang(l);
  }

  /** Guard (F-141): an agent who is still "Available" is asked before logging out. */
  protected async logout(): Promise<void> {
    this.open.set(false);
    if (this.presence.availability() === 'available' && !this.presence.breakInfo()) {
      const r = await this.confirm.ask({
        title: this.i18n.t('logout.guard'),
        confirmLabel: this.i18n.t('logout.awayAndOut'),
        altLabel: this.i18n.t('logout.anyway'),
        cancelLabel: this.i18n.t('common.cancel'),
      });
      if (r.result === 'cancel') return;
      if (r.result === 'confirm') this.presence.setAvailability('away');
    }
    this.toast.show(this.i18n.t('logout.done'));
  }
}
