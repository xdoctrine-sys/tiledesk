# Monitor V2

New page of the Tiledesk dashboard: `/project/:projectid/monitor-v2` (menu entry "Monitor V2", right under "Monitor").
The existing Monitor (`/wsrequests`) is untouched. Everything of this page lives in `src/app/monitor-v2` and `src/assets/monitor-v2`;
outside of them only two files changed: one lazy route in `app.routing.ts`, one menu entry in `components/sidebar/sidebar.component.html`.

## Switches (`monitor-v2.config.ts`)

| Flag | Now | Meaning |
|---|---|---|
| `DATA_SOURCE` | `'tiledesk'` | `'tiledesk'` = real data (`TiledeskDataService`), `'mock'` = demo data (`MockInboxApi`). `?mv2source=mock` in the URL forces the demo data. |
| `READ_ONLY` | `true` | **Phase A.** Every write is refused before any request is made (toast "Read-only mode"), the composer is disabled and a banner says so. |
| `WRITE_ENABLED` | `[]` | **Phase B.** Names of the writes allowed even while READ_ONLY (`send`, `close`, `reopen`, `priority`, `tags`, `addNote`, `assign`, `takeOver`...). |
| `EXTENSIONS` | local / off | Features that need a server extension (➕): SLA, server drafts, mentions, pen lock, bot data, AI, translation, handover brief. Local storage or hidden. The server is never modified. |

## Where the data comes from (existing dashboard services, none modified)

| Need | Service |
|---|---|
| Live conversations | `WsRequestsService.wsRequestsList$` (WebSocket `/{project}/requests`) |
| Closed conversations | `WsRequestsService.getHistoryAndNortRequests` (REST, status 1000) |
| One conversation | `WsRequestsService.getConversationByIDWithRestRequest` |
| Messages | `WsMsgsService.geRequestMsgs` + WebSocket topic `/{project}/requests/{id}/messages` |
| Presence of the contact | `WsRequestsService.subscribeToWS_RequesterPresence` |
| Agents, bots, departments, teams, tags, canned replies, hours | `UsersService`, `FaqKbService`, `DepartmentService`, `GroupService`, `TagsService`, `CannedResponsesService`, `ProjectService` |
| Contact | `ContactsService` |

Agents are identified by their **user id** (that is what `participantsAgents`, `followers` and message senders contain), bots by `bot_<id>`.

## How it is isolated

* **Shadow DOM** (`ViewEncapsulation.ShadowDom` on `monitor-v2.component.ts`): the dashboard's Bootstrap 3 / material-dashboard CSS cannot reach the page and the page's CSS cannot reach the dashboard.
* Design tokens are declared on `.tr-monitor-v2` (inside the shadow root), never on `:root`. Language, direction and theme are attributes of that element, never of `<html>`.
* Fonts are added to `<head>` when the page opens and removed when it closes. Icons are inline SVG (`ui/icons.data.ts`, Lucide, ISC licence): no new dependency.
* Own translations (`src/assets/monitor-v2/i18n/en.json`, `ar.json`) and own language service. Storage keys start with `monitor-v2.`.
* Every store, timer and listener is provided by the page component (`monitor-v2.providers.ts`): leaving the page destroys them.
* Global listeners (shortcuts, click outside) only react to events that happen inside the page.

## Angular 14 notes

The template this comes from is written for Angular 22 (signals, `@if/@for`). The dashboard is on Angular 14, which was not upgraded:
`core/signals.ts` provides `signal` / `computed` / `effect` with the same call shape, inputs are `@Input()` accessors that keep the `x()` shape,
control flow is `*ngIf` / `*ngFor`, and all components use default change detection.

## Phase B (after validation): actions ready, one by one

`send`, `close`, `reopen`, `pending`, `priority`, `tags`, `addNote`, `deleteNote`, `addParticipant`, `leave`, `takeOver`, `assign` (agent, bot, department),
`delete`, `updateLead`. Each is wired to an existing service method in `TiledeskDataService.command()` and stays refused until its name is in `WRITE_ENABLED`.
Not available without a server extension: snooze, hand back to the bot, ban, offline ticket, followers, bot-reply flags, pen request, attachments, create ticket.
