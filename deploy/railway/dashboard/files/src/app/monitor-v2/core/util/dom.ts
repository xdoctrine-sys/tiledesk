/**
 * Monitor V2 lives in a shadow root, so a few DOM APIs behave differently from a normal page:
 *  - `document.activeElement` is the shadow host: use `activeElementOf(el)`;
 *  - listeners on `document` see `event.target` retargeted to the host: use `eventTarget(e)`;
 *  - `document.querySelector` does not reach inside: use `rootOf(el).querySelector`.
 */
export function rootOf(el: Node): Document | ShadowRoot {
  return el.getRootNode() as Document | ShadowRoot;
}
export function activeElementOf(el: Node): Element | null {
  return rootOf(el).activeElement;
}
export function eventTarget(e: Event): EventTarget | null {
  return e.composedPath()[0] ?? e.target;
}
/** True when the event happened inside `el` (also through shadow boundaries). */
export function eventInside(e: Event, el: Element): boolean {
  return e.composedPath().includes(el);
}
