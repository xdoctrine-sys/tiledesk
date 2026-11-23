# Dashboard with "Monitor V2" (Railway)

Production runs the public image `tiledesk/tiledesk-dashboard:2.7.134-stage`. **Monitor V2** is a new page of the dashboard's Angular
source (`/project/:projectid/monitor-v2`, menu entry under "Monitor"), so the dashboard has to be rebuilt. `Dockerfile` does it from the
**same public tag** and adds only:

| What | Where |
|---|---|
| The page (new files) | `files/src/app/monitor-v2/`, `files/src/assets/monitor-v2/` |
| One route + one menu entry | `monitor-v2.patch` (`app.routing.ts`, `sidebar.component.html`) |

Everything else is the unmodified upstream release, built with upstream's own command and served by the same nginx.
The page is **read only** (phase A): its source and switches are documented in `files/src/app/monitor-v2/README.md`.

## Put it in production (Railway)

1. Service `tiledesk-trial-dashboard` → Settings → **Source**: this repository, branch `trial/railway-tarshli-2026-11`,
   **Root Directory** `deploy/railway/dashboard`. Builder: Dockerfile.
2. Keep the service variables as they are (`SERVER_BASE_URL`, `WS_URL_RELATIVE`, ... are read by the nginx start command, exactly like with the image).
3. Deploy. The build compiles Angular (about 4 GB of memory, a few minutes).
4. Open `<EXTERNAL_BASE_URL>/dashboard/`, sign in, click "Monitor V2".

**Roll back:** Settings → Source → switch back to the image `tiledesk/tiledesk-dashboard:2.7.134-stage` (the old Monitor is untouched either way).

## Update the page

Develop in the dashboard clone (branch `feature/monitor-v2`, base `main` = tag `2.7.134-stage`), then:

```sh
./sync-from-dashboard.sh /path/to/tiledesk-dashboard
git add . && git commit
```

To move to a newer dashboard release, change `DASHBOARD_TAG` in the Dockerfile and re-check that `monitor-v2.patch` still applies (`git apply --check`).
