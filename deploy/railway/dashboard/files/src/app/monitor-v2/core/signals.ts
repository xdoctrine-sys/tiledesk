import { ChangeDetectorRef, InjectFlags, inject } from '@angular/core';

/**
 * Minimal signals for Angular 14 (the dashboard's version has no native signals).
 *
 * Same call shape as Angular's: `signal(v)`, `s()`, `s.set(v)`, `s.update(fn)`, `computed(fn)`, `effect(fn)`, `untracked(fn)`.
 * Reads are pull based (a computed re-validates the versions of what it read), so there is no subscription graph to leak.
 * Effects are re-run in one microtask after a signal changed. Views are not marked dirty by signals: every Monitor V2
 * component uses default change detection, which re-reads the signals on each zone turn.
 */

export interface Signal<T> {
  (): T;
}
export interface WritableSignal<T> extends Signal<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
  asReadonly(): Signal<T>;
}
export interface EffectRef {
  destroy(): void;
}

interface Producer {
  version: number;
  refresh(): void;
}
interface Tracker {
  track(p: Producer): void;
}

let active: Tracker | null = null;
let epoch = 0;

function withTracker<R>(t: Tracker | null, fn: () => R): R {
  const prev = active;
  active = t;
  try {
    return fn();
  } finally {
    active = prev;
  }
}

class DepList implements Tracker {
  readonly list: Array<[Producer, number]> = [];
  private readonly seen = new Set<Producer>();
  track(p: Producer): void {
    if (this.seen.has(p)) return;
    this.seen.add(p);
    this.list.push([p, p.version]);
  }
}

function depsChanged(deps: Array<[Producer, number]>): boolean {
  for (const [p, v] of deps) {
    p.refresh();
    if (p.version !== v) return true;
  }
  return false;
}

class SignalNode<T> implements Producer {
  version = 0;
  constructor(public value: T) {}
  refresh(): void {}
  get(): T {
    active?.track(this);
    return this.value;
  }
  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.version++;
    epoch++;
    scheduleFlush();
  }
}

export function signal<T>(initial: T): WritableSignal<T>;
export function signal<T = undefined>(): WritableSignal<T | undefined>;
export function signal<T>(initial?: T): WritableSignal<T> {
  const node = new SignalNode<T>(initial as T);
  const fn = (() => node.get()) as WritableSignal<T>;
  fn.set = (v: T) => node.set(v);
  fn.update = (f: (v: T) => T) => node.set(f(node.value));
  fn.asReadonly = () => fn as unknown as Signal<T>;
  return fn;
}

class ComputedNode<T> implements Producer {
  version = 0;
  private value!: T;
  private deps: Array<[Producer, number]> = [];
  private checkedEpoch = -1;
  private computed = false;
  constructor(private readonly fn: () => T) {}
  refresh(): void {
    if (this.checkedEpoch === epoch) return;
    if (this.computed && !depsChanged(this.deps)) {
      this.checkedEpoch = epoch;
      return;
    }
    const deps = new DepList();
    const next = withTracker(deps, this.fn);
    this.deps = deps.list;
    if (!this.computed || !Object.is(next, this.value)) {
      this.value = next;
      this.version++;
    }
    this.computed = true;
    this.checkedEpoch = epoch;
  }
  get(): T {
    this.refresh();
    active?.track(this);
    return this.value;
  }
}

export function computed<T>(fn: () => T): Signal<T> {
  const node = new ComputedNode<T>(fn);
  return (() => node.get()) as Signal<T>;
}

export function untracked<T>(fn: () => T): T {
  return withTracker(null, fn);
}

// ---------------------------------------------------------------------------------------------------------------- effects

class EffectNode {
  private deps: Array<[Producer, number]> = [];
  private first = true;
  destroyed = false;
  constructor(private readonly fn: () => void) {}
  stale(): boolean {
    return this.first || depsChanged(this.deps);
  }
  run(): void {
    this.first = false;
    const deps = new DepList();
    try {
      withTracker(deps, this.fn);
    } catch (e) {
      console.error('[monitor-v2] effect failed', e);
    }
    this.deps = deps.list;
  }
}

const effects = new Set<EffectNode>();
let flushQueued = false;
let flushing = false;

function scheduleFlush(): void {
  if (flushQueued || flushing) return;
  flushQueued = true;
  Promise.resolve().then(flushEffects);
}

/** Runs every stale effect (an effect may change signals, so it loops until nothing is stale, with a safety stop). */
export function flushEffects(): void {
  flushQueued = false;
  flushing = true;
  try {
    for (let pass = 0; pass < 50; pass++) {
      let ran = false;
      for (const e of Array.from(effects)) {
        if (!e.destroyed && e.stale()) {
          e.run();
          ran = true;
        }
      }
      if (!ran) break;
    }
  } finally {
    flushing = false;
  }
}

/**
 * Re-runs `fn` whenever a signal it read changes. Created in a component or in a service of the page, it is destroyed with
 * the host view (everything of Monitor V2 is provided by the page component, so nothing outlives the page).
 */
export function effect(fn: () => void): EffectRef {
  const node = new EffectNode(fn);
  effects.add(node);
  const destroy = () => {
    node.destroyed = true;
    effects.delete(node);
  };
  try {
    const cdr = inject(ChangeDetectorRef, InjectFlags.Optional) as unknown as { onDestroy?: (cb: () => void) => void } | null;
    cdr?.onDestroy?.(destroy);
  } catch {
    /* not in an injection context: the caller owns the EffectRef */
  }
  scheduleFlush();
  return { destroy };
}

/** `afterNextRender` does not exist in Angular 14: run after the current change detection turn. */
export function afterNextRender(fn: () => void): void {
  setTimeout(fn, 0);
}
