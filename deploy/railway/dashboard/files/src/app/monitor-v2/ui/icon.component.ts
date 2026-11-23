import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { ICONS } from './icons.data';

/** Lucide renamed a few icons: templates may still use the old name. */
const ALIASES: Record<string, string> = { 'wand-2': 'wand-sparkles' };
const cache = new Map<string, string>();

function svgBody(name: string): string {
  const key = ALIASES[name] ?? name;
  let html = cache.get(key);
  if (html === undefined) {
    const node = ICONS[key];
    if (!node) {
      console.warn(`[monitor-v2] unknown icon: ${name}`);
      html = '';
    } else {
      html = node
        .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
        .join('');
    }
    cache.set(key, html);
  }
  return html;
}

/**
 * `<tr-icon name="check" [size]="18" />`: inline Lucide SVG (ISC licence) from the generated `icons.data.ts`.
 * It replaces `lucide-angular`, which is not a dependency of the dashboard (no package.json change).
 */
@Component({
  selector: 'tr-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: [':host { display: inline-flex; flex: none; align-items: center; justify-content: center; line-height: 0; }'],
})
export class TrIconComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private _name = '';
  private _size = 18;
  @HostBinding('innerHTML') html: SafeHtml = '';

  @Input() set name(v: string) {
    this._name = v ?? '';
    this.render();
  }
  @Input() set size(v: number) {
    this._size = Number(v) || 18;
    this.render();
  }

  private render(): void {
    const s = this._size;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${svgBody(this._name)}</svg>`;
    // static, app-owned markup (never user input), so bypassing the sanitizer is safe here
    this.html = this.sanitizer.bypassSecurityTrustHtml(svg);
  }
}
