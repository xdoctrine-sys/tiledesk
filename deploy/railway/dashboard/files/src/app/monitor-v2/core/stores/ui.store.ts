import { computed, signal } from '../../core/signals';
import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { EXTENSIONS, READ_ONLY, resolveDataSource } from '../../monitor-v2.config';
import { COLS, ColId, DEFAULT_WIDTHS, HANDLES_FROM, SIDEBAR_DOCK_FROM, Widths, clampCol } from '../util/layout';

export type Breakpoint = 'xl' | 'l' | 'm' | 's' | 'xs';
export type ThemePref = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type DialogId = 'assign' | 'addTeammate' | 'ticket' | 'shortcuts' | 'handBack' | 'snooze' | 'labels' | null;

const KEY = 'monitor-v2.prefs';
/** Column widths and the docked contact-panel state, remembered per agent (localStorage in the template). */
const LAYOUT_KEY = 'monitor-v2.layout';

interface SavedLayout extends Widths { ctxOpen: boolean }

interface Prefs {
  theme: ThemePref;
  density: Density;
  sounds: boolean;
  numerals: 'latn' | 'arab';
  sidebarCollapsed: boolean;
  hijri: boolean;
  autoAway: boolean;
  signature: boolean;
}

const DEFAULTS: Prefs = { theme: 'light', density: 'comfortable', sounds: true, numerals: 'latn', sidebarCollapsed: false, hijri: false, autoAway: true, signature: false };

/** Layout and preference state (breakpoints of document section 7.1, theme, density, sounds...). Persisted in localStorage. */
@Injectable()
export class UiStore implements OnDestroy {
  private readonly zone = inject(NgZone);
  /** Size of the page area (measured on `.tr-monitor-v2`, not the window: the dashboard has its own rail and navbar). */
  readonly width = signal(window.innerWidth);
  readonly height = signal(window.innerHeight);
  readonly breakpoint = computed<Breakpoint>(() => {
    const w = this.width();
    return w >= 1440 ? 'xl' : w >= 1280 ? 'l' : w >= 1024 ? 'm' : w >= 768 ? 's' : 'xs';
  });
  readonly isMobile = computed(() => this.breakpoint() === 'xs');
  /** Rail is hidden on S and XS. The sidebar is a drawer below 1360 px and the contact panel below 1280 px (E-04). */
  readonly sidebarIsDrawer = computed(() => this.width() < SIDEBAR_DOCK_FROM);
  readonly contextIsDrawer = computed(() => this.width() < HANDLES_FROM);
  /** Resize handles only exist when the columns are docked (>= 1280 px). */
  readonly showHandles = computed(() => this.width() >= HANDLES_FROM);

  /** Phase A: the page only reads. Never true on the demo data (mock source). */
  readonly readOnly = signal(READ_ONLY && resolveDataSource() === 'tiledesk');
  /** ➕ server extensions: all on with the demo data, as configured with the real data (see monitor-v2.config.ts). */
  readonly ext: { readonly [K in keyof typeof EXTENSIONS]: boolean } =
    resolveDataSource() === 'mock'
      ? (Object.fromEntries(Object.keys(EXTENSIONS).map((k) => [k, true])) as { [K in keyof typeof EXTENSIONS]: boolean })
      : EXTENSIONS;

  readonly sidebarDrawerOpen = signal(false);
  /** Saved column widths + docked contact-panel state (persisted). */
  private readonly saved = signal<SavedLayout>(this.loadLayout());
  readonly widths = computed<Widths>(() => ({ side: this.saved().side, list: this.saved().list, ctx: this.saved().ctx }));
  /** Contact panel: open by default when docked (persisted); as a drawer (< 1280 px) it starts closed and the choice is per session. */
  private readonly drawerChoice = signal(false);
  readonly contextOpen = computed(() => (this.contextIsDrawer() ? this.drawerChoice() : this.saved().ctxOpen));
  readonly dialog = signal<DialogId>(null);
  /** Bumped by the L shortcut: opens the Ticket section of the context panel with the label picker. */
  readonly labelsRequest = signal(0);
  readonly prefs = signal<Prefs>(this.load());

  readonly theme = computed(() => this.prefs().theme);
  readonly density = computed(() => this.prefs().density);
  readonly sounds = computed(() => this.prefs().sounds);
  readonly numerals = computed(() => this.prefs().numerals);
  readonly sidebarCollapsed = computed(() => this.prefs().sidebarCollapsed);
  readonly hijri = computed(() => this.prefs().hijri);
  readonly autoAway = computed(() => this.prefs().autoAway);
  readonly signature = computed(() => this.prefs().signature);
  readonly systemDark = signal(window.matchMedia('(prefers-color-scheme: dark)').matches);

  /** `light` / `dark` after resolving "system". Bound to `[attr.data-theme]` on the page root. */
  readonly resolvedTheme = computed<'light' | 'dark'>(() => {
    const pref = this.theme();
    return pref === 'dark' || (pref === 'system' && this.systemDark()) ? 'dark' : 'light';
  });

  private observer?: ResizeObserver;
  private mq?: MediaQueryList;
  private readonly onMq = (e: MediaQueryListEvent) => this.zone.run(() => this.systemDark.set(e.matches));

  constructor() {
    this.mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.mq.addEventListener('change', this.onMq);
  }

  /** Called by the page root: measures the area the page really has (ResizeObserver callbacks run outside the zone). */
  observe(el: HTMLElement): void {
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 1) return;
      this.zone.run(() => {
        this.width.set(Math.round(r.width));
        this.height.set(Math.round(r.height));
      });
    };
    this.observer?.disconnect();
    this.observer = new ResizeObserver(update);
    this.observer.observe(el);
    update();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.mq?.removeEventListener('change', this.onMq);
  }

  set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs.update((p) => ({ ...p, [key]: value }));
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs()));
    } catch {
      /* storage unavailable */
    }
  }

  /** Applied from the URL (?theme=dark) without persisting. */
  setTransient<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs.update((p) => ({ ...p, [key]: value }));
  }

  toggleContext(): void {
    this.setContext(!this.contextOpen());
  }
  openContext(): void {
    this.setContext(true);
  }
  closeContext(): void {
    this.setContext(false);
  }
  private setContext(open: boolean): void {
    if (this.contextIsDrawer()) this.drawerChoice.set(open);
    else this.saveLayout({ ctxOpen: open });
  }

  /** Stores the width the agent dragged / typed for a column (clamped to its min / max). */
  setColWidth(id: ColId, w: number): void {
    this.saveLayout({ [id]: clampCol(id, w) } as Partial<SavedLayout>);
  }
  resetColWidth(id: ColId): void {
    this.saveLayout({ [id]: COLS[id].def } as Partial<SavedLayout>);
  }
  private saveLayout(patch: Partial<SavedLayout>): void {
    this.saved.update((l) => ({ ...l, ...patch }));
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.saved()));
    } catch {
      /* storage unavailable: widths simply are not remembered */
    }
  }
  private loadLayout(): SavedLayout {
    const base: SavedLayout = { ...DEFAULT_WIDTHS, ctxOpen: true };
    try {
      const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<SavedLayout>;
      return {
        side: clampCol('side', Number(raw.side) || base.side),
        list: clampCol('list', Number(raw.list) || base.list),
        ctx: clampCol('ctx', Number(raw.ctx) || base.ctx),
        ctxOpen: typeof raw.ctxOpen === 'boolean' ? raw.ctxOpen : true,
      };
    } catch {
      return base;
    }
  }

  open(dialog: Exclude<DialogId, null>): void {
    this.dialog.set(dialog);
  }
  close(): void {
    this.dialog.set(null);
  }

  private load(): Prefs {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
    } catch {
      return DEFAULTS;
    }
  }
}
