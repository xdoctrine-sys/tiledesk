import { Provider, inject } from '@angular/core';
import { AiService } from './core/services/ai.service';
import { ClockService } from './core/services/clock.service';
import { ConfirmService } from './core/services/confirm.service';
import { ConversationNav } from './core/services/conversation-nav.service';
import { DemoStateService } from './core/services/demo-state.service';
import { FormatService } from './core/services/format.service';
import { HoursService } from './core/services/hours.service';
import { I18nService } from './core/services/i18n.service';
import { InboxApi } from './core/services/inbox-api';
import { MockInboxApi } from './core/services/mock-inbox-api';
import { PageRoot } from './core/services/page-root.service';
import { ShortcutService } from './core/services/shortcut.service';
import { SoundService } from './core/services/sound.service';
import { TiledeskDataService } from './core/services/tiledesk-data.service';
import { ToastService } from './core/services/toast.service';
import { ConversationStore } from './core/stores/conversation.store';
import { DirectoryStore } from './core/stores/directory.store';
import { DraftStore } from './core/stores/draft.store';
import { MessageStore } from './core/stores/message.store';
import { PresenceStore } from './core/stores/presence.store';
import { UiStore } from './core/stores/ui.store';
import { resolveDataSource } from './monitor-v2.config';

/**
 * Everything of Monitor V2 is provided by the page component itself (not by the root injector): leaving the page
 * destroys every store, timer and listener, and coming back starts from a clean state.
 */
export const MONITOR_V2_PROVIDERS: Provider[] = [
  PageRoot,
  ConversationNav,
  I18nService,
  UiStore,
  ToastService,
  ConfirmService,
  ClockService,
  FormatService,
  HoursService,
  SoundService,
  AiService,
  PresenceStore,
  DirectoryStore,
  DraftStore,
  ConversationStore,
  MessageStore,
  ShortcutService,
  DemoStateService,
  MockInboxApi,
  TiledeskDataService,
  { provide: InboxApi, useFactory: () => (resolveDataSource() === 'mock' ? inject(MockInboxApi) : inject(TiledeskDataService)) },
];
