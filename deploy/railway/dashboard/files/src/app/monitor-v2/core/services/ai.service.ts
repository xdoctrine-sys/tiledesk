import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from '../../core/rxjs-compat';
import { AiAction, InboxApi } from './inbox-api';

/** Thin wrapper over the ➕ AI endpoints of InboxApi (rewrite, tone, summarize, copilot, translate, suggest). */
@Injectable()
export class AiService {
  private readonly api = inject(InboxApi);
  run(action: AiAction, text: string, ctx: { register?: string; requestId?: string } = {}): Promise<string> {
    return firstValueFrom(this.api.ai(action, text, ctx));
  }
}
