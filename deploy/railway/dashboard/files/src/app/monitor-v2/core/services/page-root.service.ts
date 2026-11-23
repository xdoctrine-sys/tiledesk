import { Injectable } from '@angular/core';

/** The `.tr-monitor-v2` element of the page (set by the page component). Used to scope global listeners to the page. */
@Injectable()
export class PageRoot {
  el: HTMLElement | null = null;
  contains(e: Event): boolean {
    return !!this.el && e.composedPath().includes(this.el);
  }
}
