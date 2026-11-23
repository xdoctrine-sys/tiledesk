/**
 * Monitor V2 switches (the only place to change them).
 *
 * PHASE A (now): READ_ONLY = true. The page shows the real conversations, messages, contacts and agents but every action
 * that writes (send, resolve, assign, priority, labels, notes, ban, delete...) is refused before any request is made.
 * PHASE B (after validation): the actions are enabled one by one in `WRITE_ENABLED`, and tested on a test conversation.
 */
export type DataSource = 'tiledesk' | 'mock';

/** 'tiledesk' = TiledeskDataService (real data of the current project), 'mock' = MockInboxApi (demo data, no request). */
export const DATA_SOURCE: DataSource = 'tiledesk';

/** Master switch of phase A. While true, TiledeskDataService never calls a write endpoint. */
export const READ_ONLY = true;

/**
 * Phase B: write actions allowed even when READ_ONLY is false. Empty on purpose, each action is added here only after
 * it was tested on a test conversation. Names are the `RequestCommand` types plus `send` and `updateLead`.
 */
export const WRITE_ENABLED: readonly string[] = [];

/**
 * Features that need a server extension (marked ➕ in the design): SLA, server drafts, mentions, pen lock, bot data,
 * AI, translation, handover brief, saved views, snooze. The server is not modified: they use local storage or stay hidden.
 */
export const EXTENSIONS = {
  localDrafts: true,
  localSnooze: true,
  localSavedViews: true,
  ai: false,
  translate: false,
  takeoverBrief: false,
  botData: false,
  penLock: false,
  mentions: false,
} as const;

/** `?mv2source=mock` in the URL switches to the demo data (handy to see the page without touching production data). */
export function resolveDataSource(): DataSource {
  try {
    const q = new URLSearchParams(window.location.search).get('mv2source');
    if (q === 'mock' || q === 'tiledesk') return q;
  } catch {
    /* no window.location */
  }
  return DATA_SOURCE;
}
