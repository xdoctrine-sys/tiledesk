import { computed, signal } from '../core/signals';
import { CommonModule } from '@angular/common';
import { Component, inject, Output, EventEmitter } from '@angular/core';
import { I18nService, TranslatePipe } from '../core/services/i18n.service';
import { normalizeArabic } from '../core/util/text';
import { ClickOutsideDirective } from '../shared/click-outside.directive';

type Cat = 'recent' | 'smileys' | 'gestures' | 'objects' | 'symbols';
interface E { c: string; k: string }

const SMILEYS = '😀😃😄😁😆😅😂🙂😉😊😍🥰😘😎🤗🤔😐😮😢😭😡😴🙏'.match(/\p{Extended_Pictographic}/gu)!;
const GESTURES = '👍👎👏🙌👋🤝👌✌️💪👀🙋'.match(/\p{Extended_Pictographic}️?/gu)!;
const OBJECTS = '🏠🏢🔑📅📍📞📎📷💳🚗⏰📝📄'.match(/\p{Extended_Pictographic}/gu)!;
const SYMBOLS = '✅❌⭐❤️🔥🎉💯⚠️❓❗➕➖'.match(/\p{Extended_Pictographic}️?/gu)!;
// keywords in English and Arabic for search (name → emoji)
const KEYS: Record<string, string> = { '😀': 'smile happy ابتسامة سعيد', '😂': 'laugh joy ضحك', '😊': 'blush smile سعيد خجل', '😍': 'love eyes حب', '😢': 'sad cry حزين', '😡': 'angry غاضب', '🙏': 'thanks pray please شكرا دعاء', '👍': 'ok yes thumbs موافق جيد', '👋': 'hello wave مرحبا', '🏠': 'house home بيت منزل', '🏢': 'building office مبنى مكتب', '🔑': 'key keys مفتاح', '📅': 'calendar date تاريخ', '📍': 'pin location موقع', '📞': 'phone call هاتف', '✅': 'check done تم', '❤️': 'heart love قلب', '🎉': 'party celebrate مبروك', '⏰': 'clock time ساعة وقت', '📝': 'note memo ملاحظة' };
const RECENT_KEY = 'monitor-v2.emoji.recent';

/** Emoji picker (F-79): categories, recent, search in Arabic and English. */
@Component({
  standalone: true,
  selector: 'tr-emoji-picker',
  imports: [TranslatePipe, ClickOutsideDirective, CommonModule],
  host: { '(keydown.escape)': 'close.emit()' },
  template: `
    <div class="tr-menu panel" role="dialog" [attr.aria-label]="'emoji.title' | t" (trClickOutside)="close.emit()">
      <input class="tr-field" type="search" dir="auto" [placeholder]="'emoji.search' | t" [value]="q()" (input)="q.set($any($event.target).value)" />
      <div class="cats" role="tablist">
        <ng-container *ngFor="let c of cats; trackBy: __trk1"> <button type="button" role="tab" class="cat" [class.on]="cat() === c" [attr.aria-selected]="cat() === c" (click)="cat.set(c); q.set('')">{{ ('emoji.' + c) | t }}</button> </ng-container>
      </div>
      <div class="grid" role="listbox">
        <ng-container *ngFor="let e of list(); trackBy: __trk2"> <button type="button" class="em" role="option" [attr.aria-label]="e.c" (click)="choose(e.c)">{{ e.c }}</button> </ng-container><ng-container *ngIf="!(list())?.length"> <span class="none">{{ 'emoji.none' | t }}</span> </ng-container>
      </div>
    </div>
  `,
  styles: [`
    :host { position: absolute; inset-inline-start: 8px; inset-block-end: 100%; z-index: 100; margin-block-end: 6px; }
    .panel { position: static; inline-size: 300px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .cats { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; } .cat { flex: none; min-block-size: 28px; padding-inline: 8px; border-radius: var(--radius-md); color: var(--muted-foreground); font-size: var(--tr-fs-caption); } .cat.on { background: var(--accent); color: var(--foreground); font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; max-block-size: 188px; overflow: auto; }
    .em { aspect-ratio: 1; min-block-size: 38px; border-radius: 8px; font-size: 22px; line-height: 1; text-align: center; } .em:hover { background: var(--muted); }
    .none { grid-column: 1 / -1; padding: 16px; text-align: center; color: var(--muted-foreground); font-size: var(--tr-fs-body-sm); }
  `],
})
export class TrEmojiPickerComponent {
  readonly __trk1 = (__i: number, c: any): any => c;
  readonly __trk2 = (__i: number, e: any): any => e.c;
  private readonly i18n = inject(I18nService);
  @Output() pick = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  protected readonly cats: Cat[] = ['recent', 'smileys', 'gestures', 'objects', 'symbols'];
  protected readonly cat = signal<Cat>(this.recent().length ? 'recent' : 'smileys');
  protected readonly q = signal('');
  private readonly recents = signal<string[]>(this.recent());

  private readonly all = computed<Record<Cat, E[]>>(() => {
    const m = (xs: string[]): E[] => xs.map((c) => ({ c, k: KEYS[c] ?? '' }));
    return { recent: m(this.recents()), smileys: m(SMILEYS), gestures: m(GESTURES), objects: m(OBJECTS), symbols: m(SYMBOLS) };
  });
  protected readonly list = computed(() => {
    const q = normalizeArabic(this.q().trim());
    if (q) return Object.values(this.all()).flat().filter((e, i, a) => a.findIndex((x) => x.c === e.c) === i && normalizeArabic(e.k).includes(q));
    return this.all()[this.cat()];
  });

  protected choose(c: string): void {
    const next = [c, ...this.recents().filter((x) => x !== c)].slice(0, 14);
    this.recents.set(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    void this.i18n;
    this.pick.emit(c);
  }
  private recent(): string[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
  }
}
