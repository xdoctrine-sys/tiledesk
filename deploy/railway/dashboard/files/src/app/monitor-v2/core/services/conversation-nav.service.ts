import { Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * The only route of Monitor V2 is /project/:projectid/monitor-v2: the open conversation is the `?c=<request id>` query
 * parameter (the dashboard's routing file only gets ONE new route, no child routes).
 */
@Injectable()
export class ConversationNav {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly loc = inject(Location);

  open(id: string | null): Promise<boolean> {
    return this.router.navigate([], { relativeTo: this.route, queryParams: { c: id }, queryParamsHandling: 'merge' });
  }

  /** Absolute URL of a conversation (copy link, open in a new tab). */
  href(id: string): string {
    const tree = this.router.createUrlTree([], { relativeTo: this.route, queryParams: { c: id }, queryParamsHandling: 'merge' });
    return new URL(this.loc.prepareExternalUrl(this.router.serializeUrl(tree)), document.baseURI).toString();
  }
}
