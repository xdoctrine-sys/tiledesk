# Tiledesk Community trial on Railway (self-hosted)

Trial deployment of the **Tiledesk Community** stack, running next to (and fully
independent from) the existing Chatwoot/Tarshli services in the same Railway
project. Purpose: determine which Tiledesk features work self-hosted and which
require a licence or an external paid service.

This directory is deployment configuration only. It is **not** the Tiledesk
product source: the product runs from the official public images listed below.

## Sources and versions

| Item | Source | Retrieved |
|---|---|---|
| Docker Compose reference | https://github.com/Tiledesk/tiledesk-deployment (`docker-compose/docker-compose.yml`, commit `cbdca12`) | 2026-11-12 |
| Tiledesk product / docs | https://tiledesk.com/ , https://developer.tiledesk.com/ | 2026-11-12 |

The pinned `docker-compose/docker-compose.yml` was used as the base
(`docker-compose-latest.yml` tracks floating `:latest` tags and was deliberately
avoided).

### Images used (pinned)

| Railway service | Image | Digest |
|---|---|---|
| `tiledesk-trial-mongo` | `mongo:7.0.2` | `sha256:d341a86584b96eb665345a8f5b35fba8695ee1d0618fd012ec4696223a3d6c62` |
| `tiledesk-trial-redis` | `redis:7.0.5` | `sha256:dfeb5451fce377ab47c5bb6b6826592eea534279354bbfc3890c0b5e9b57c763` |
| `tiledesk-trial-rabbitmq` | `chat21/chat21-rabbitmq:latest` (floating tag -> pinned by digest) | `sha256:49fdc43789c1c31f783e0cf8e451cd9322d87281ab71678fdacaec3da847f088` |
| `tiledesk-trial-chat21server` | `chat21/chat21-server:0.2.53` | `sha256:9ebb054f2e5bb13bb386fed3618243b6318b14ed56e455d71e8a1d3cbb8ecbde` |
| `tiledesk-trial-chat21http` | `chat21/chat21-http-server:0.2.37` | `sha256:2aac2fdce94791d5a33c28012cd58c45a2c1ef460f76714fbe78b328d55ae77a` |
| `tiledesk-trial-server` | `tiledesk/tiledesk-server:2.13.23-op1` | `sha256:848f95da6d4e8590d9f12b5f4b3445481d11fecfe2d3db5fd6dc81410ff22b2c` |
| `tiledesk-trial-chatbot` | `tiledesk/tiledesk-chatbot:2.0.32-rc8` | `sha256:4375836c749311950eb34cc9ed2486b58a2bd68194de01940acfc3f23197a8fd` |
| `tiledesk-trial-dashboard` | `tiledesk/tiledesk-dashboard:2.7.134-stage` | `sha256:9fd0f5140e040279a6d051afd560df89e5e8a8c4bb51b3186983d539a22acf79` |
| `tiledesk-trial-widget` | `chat21/chat21-web-widget:5.1.2` | `sha256:a855d984cc6d17205cb2738f8cfb7dc1112f8a307661dfad3db5cd842cb7b3c7` |
| `tiledesk-trial-proxy` | **built from this fork** (`deploy/railway/proxy/Dockerfile`) | base `tiledesk/tiledesk-docker-proxy:v1.1.2@sha256:ae3610c23c4226711a903b2a4c5cc391fb7462d3c73f252a5dadc318382ef94c` |

All of the above resolve anonymously on Docker Hub (verified 2026-11-12): no
Enterprise credentials, licence purchase or activation bypass is involved.

## Deviation from the upstream Compose file (and why)

The upstream compose is a single-host Docker Compose file. Railway is not a
Compose host, so each container became an individual service, and the following
services were **deliberately not deployed**:

| Compose service | Status | Reason |
|---|---|---|
| `cds` (design studio) | not deployed | extra cost; only the dashboard's visual widget designer depends on it |
| `ionic` (mobile web chat at `/chat/`) | not deployed | mobile client, not needed to evaluate the platform |
| `backend-llm-train` / `backend-llm-qa` | not deployed | knowledge-base training/QA backend; needs a paid AI key to be meaningful |
| `qdrant` | not deployed | vector store, only used by the LLM backend |

The proxy routing for the omitted services is removed from
`proxy/nginx.conf`; `/cds/` and `/chat/` therefore return 404 in the trial.

The proxy image is rebuilt from this fork for one reason only: the upstream
`/etc/nginx/nginx.conf` hardcodes Compose short hostnames (`dashboard`, `server`,
`webwidget`, ...) and Docker's embedded resolver `127.0.0.11`, neither of which
exist on Railway (`<service>.railway.internal`, IPv6). Note that `proxy_pass`
with a literal hostname is resolved at nginx start-up, so **all upstream
services must exist before the proxy can boot** - Railway's restart policy
(`ON_FAILURE`) converges this automatically.

## Secrets

`docker-compose/docker-compose.yml` embeds publicly known, long-lived JWT values
(`CHAT21_ADMIN_TOKEN`, `AMQP_MANAGER_URL`, `RABBITMQ_URI`, `PUSH_WH_*`). They are
**not** reused. `gen-rabbitmq-tokens.sh` mints replacements with a fresh `jti`
and a new validity window.

The signing key itself is not a secret we own: the public `chat21/chat21-rabbitmq`
image enables `rabbitmq_auth_backend_oauth2` with `default_key = legacy-token-key`
and value `tokenKey` (read from `/etc/rabbitmq/advanced.config` inside the image).
Tokens must therefore be HS256-signed with `tokenKey` to be accepted. Equally,
`chat21/chat21-server:0.2.53` verifies user tokens against a baked-in
`JWT_KEY=tokenKey`, so `CHAT21_JWT_SECRET`/`JWT_KEY`/`JWT_SECRET_KEY` stay at
`tokenKey` for interoperability.

No variable values are committed to this repository. `env.example` lists variable
**names** with placeholders only.

## Layout

```
mongo (volume /data/db)  redis  rabbitmq
   |                        |        |
   +-------- chat21server --+--------+
   |                        |
   +-- chat21http     server (tiledesk-server) -- chatbot
   |                        |
   +-------- dashboard  widget  -- proxy (public HTTPS, port 80)
```

Public entry point is the proxy only. MongoDB, Redis, RabbitMQ, the Tiledesk API,
the dashboard and the widget containers are private-network only.

## Deployment

1. Create the service skeleton (images + start commands + volume), then push
   variables **without deploying**, then deploy in dependency order
   (`mongo`, `redis`, `rabbitmq` -> `chat21server`, `chat21http` -> `server` ->
   `chatbot`, `dashboard`, `widget` -> `proxy`).
2. Generate the trial secrets locally:

   ```
   ./gen-rabbitmq-tokens.sh --json > ~/.iconnect_local_secrets/tiledesk_trial_tokens.json
   chmod 600 ~/.iconnect_local_secrets/tiledesk_trial_tokens.json
   ```

3. Set variables per `env.example`. Never echo the values in a shell that logs.
4. Give the proxy a public domain on port **80**, healthcheck `GET /healthz`.
5. Add the Railway DNS records for the custom subdomain (see the trial report).

## Operations

| Task | Command |
|---|---|
| Restart one trial service (no rebuild) | `railway restart -s tiledesk-trial-<name> -y` |
| Logs | `railway logs -s tiledesk-trial-<name> -n 200` |
| Update a component | change the image/digest, redeploy that service only |
| Stop the whole trial | `railway down -s tiledesk-trial-<name>` or delete the services / set replicas to 0 |

Nothing here restarts or reconfigures the pre-existing `chatwoot-*` services.

## Known limitations of this trial deployment

* No SMTP: email inboxes/conversations cannot be exercised.
* No `LICENSE_KEY` and no Enterprise images: Enterprise-only features are simply
  unavailable, which is the point of the trial.
* No AI keys (OpenAI/Gemini/...): GPT, knowledge-base training and RAG are not
  testable; the LLM services are not deployed either.
* No Meta/WhatsApp/Telegram credentials are attached to the trial, so external
  channel connections are not tested.
* `cds` (widget design studio) and `ionic` (`/chat/`) are not deployed.
