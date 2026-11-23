import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import { DemoStateService } from './core/services/demo-state.service';
import { I18nService, TranslatePipe } from './core/services/i18n.service';
import { InboxApi } from './core/services/inbox-api';
import { MockInboxApi } from './core/services/mock-inbox-api';
import { PageRoot } from './core/services/page-root.service';
import { UiStore } from './core/stores/ui.store';
import { TrInboxShellComponent } from './layout/inbox-shell.component';
import { TrIconComponent } from './ui/icon.component';
import { MONITOR_V2_PROVIDERS } from './monitor-v2.providers';

/** Fonts are loaded by this page only: a <style> in <head> while the page is open (fonts are document-wide, not per shadow root). */
const FONT_STYLE_ID = 'monitor-v2-fonts';
function fontCss(): string {
  const u = (f: string) => new URL(`assets/monitor-v2/fonts/${f}`, document.baseURI).toString();
  const arabic = 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F, U+2010-2011, U+204F, U+2E41';
  return `
@font-face { font-family: 'TR Inter'; font-style: normal; font-display: swap; font-weight: 100 900; src: url('${u('inter-latin-wght-normal.woff2')}') format('woff2-variations');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: 'TR Inter'; font-style: normal; font-display: swap; font-weight: 100 900; src: url('${u('inter-latin-ext-wght-normal.woff2')}') format('woff2-variations');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
${[400, 500, 600].map((w) => `@font-face { font-family: 'TR Arabic'; font-style: normal; font-weight: ${w}; font-display: swap; size-adjust: 105%; src: url('${u(`ibm-plex-sans-arabic-arabic-${w}-normal.woff2`)}') format('woff2'); unicode-range: ${arabic}; }`).join('\n')}
@font-face { font-family: 'TR Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('${u('jetbrains-mono-latin-400-normal.woff2')}') format('woff2'); }`;
}

/**
 * Page "Monitor V2" (/project/:projectid/monitor-v2): the validated Tarashli inbox, plugged on the dashboard's real data.
 *
 * Style isolation: Shadow DOM. The dashboard's global CSS (Bootstrap 3, material-dashboard) cannot reach the page and
 * the page's CSS cannot reach the dashboard. Design tokens, language, direction and theme live on `.tr-monitor-v2`.
 */
@Component({
  selector: 'tr-monitor-v2',
  standalone: true,
  imports: [CommonModule, TrInboxShellComponent, TrIconComponent, TranslatePipe],
  encapsulation: ViewEncapsulation.ShadowDom,
  providers: MONITOR_V2_PROVIDERS,
  styleUrls: ['./monitor-v2.component.scss'],
  template: `
    <div
      #root
      class="tr-monitor-v2"
      [attr.lang]="i18n.lang()"
      [attr.dir]="i18n.dir()"
      [attr.data-theme]="ui.resolvedTheme()"
      [attr.data-density]="ui.density()"
      [attr.data-bp]="ui.breakpoint()"
    >
      <div class="ro-banner" *ngIf="ui.readOnly() && i18n.ready()" role="status">
        <tr-icon name="lock" [size]="14"></tr-icon>
        <span>{{ 'app.readOnlyBanner' | t }}</span>
      </div>
      <tr-inbox-shell *ngIf="i18n.ready()"></tr-inbox-shell>
    </div>
  `,
})
export class MonitorV2Component implements OnInit, OnDestroy {
  protected readonly i18n = inject(I18nService);
  protected readonly ui = inject(UiStore);
  private readonly pageRoot = inject(PageRoot);
  private readonly demo = inject(DemoStateService);
  private readonly api = inject(InboxApi);
  @ViewChild('root', { static: true }) private root!: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.pageRoot.el = this.root.nativeElement;
    this.ui.observe(this.root.nativeElement);
    if (!document.getElementById(FONT_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = FONT_STYLE_ID;
      style.textContent = fontCss();
      document.head.appendChild(style);
    }
    if (this.api instanceof MockInboxApi) this.demo.init();
    void this.i18n.load();
  }

  ngOnDestroy(): void {
    document.getElementById(FONT_STYLE_ID)?.remove();
    this.pageRoot.el = null;
  }
}
