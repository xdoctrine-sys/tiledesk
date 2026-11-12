#!/usr/bin/env bash
# Mint fresh RabbitMQ OAuth2 (HS256) tokens for a Tiledesk trial deployment.
#
# Why this exists
# ---------------
# docker-compose/docker-compose.yml ships long-lived, publicly known JWT values in
# AMQP_MANAGER_URL, RABBITMQ_URI, CHAT21_ADMIN_TOKEN and PUSH_WH_CHAT21_API_ADMIN_TOKEN.
# They must never be reused. This script regenerates them.
#
# Signing key: the public chat21/chat21-rabbitmq image enables
# rabbitmq_auth_backend_oauth2 with key_config default_key = legacy-token-key and
# signing key value "tokenKey" (verified in /etc/rabbitmq/advanced.config of the image).
# Tokens therefore have to be signed with HS256/secret "tokenKey" to be accepted.
#
# The JWT values are NOT committed anywhere. Write them to a local, mode-600 file.
#
# Usage:
#   ./gen-rabbitmq-tokens.sh            # human readable output
#   ./gen-rabbitmq-tokens.sh --json     # JSON object, for scripting
set -euo pipefail

python3 - "$@" <<'PY'
import base64, hashlib, hmac, json, sys, time, uuid

SECRET = "tokenKey"          # rabbitmq_auth_backend_oauth2 signing key value
APP_ID = "tilechat"          # chat21 tenant / app_id
TTL_DAYS = 1825              # 5 years: a trial, but a fresh value (not the shipped one)

def b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

def jwt(sub: str, roles: str) -> str:
    iat = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "jti": str(uuid.uuid4()),
        "sub": sub,
        "scope": [
            "rabbitmq.read:*/*/*",
            "rabbitmq.write:*/*/*",
            "rabbitmq.configure:*/*/*",
        ],
        "client_id": sub,
        "cid": sub,
        "azp": sub,
        "user_id": sub,
        "app_id": APP_ID,
        "iat": iat,
        "exp": iat + TTL_DAYS * 86400,
        "aud": ["rabbitmq", sub],
        "kid": "tiledesk-key",
        "tiledesk_api_roles": roles,
    }
    signing_input = f"{b64u(json.dumps(header, separators=(',', ':')).encode())}." \
                    f"{b64u(json.dumps(payload, separators=(',', ':')).encode())}"
    sig = hmac.new(SECRET.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{b64u(sig)}"

admin = jwt("100-APIADMIN", "admin")    # chatter/API admin: chat21httpserver, server
observer = jwt("01-OBSERVER", "user")   # observer: server AMQP manager, chat21server
webhook = base64.urlsafe_b64encode(uuid.uuid4().bytes + uuid.uuid4().bytes).rstrip(b"=").decode()

out = {
    "CHAT21_ADMIN_TOKEN": admin,
    "AMQP_MANAGER_URL": f"amqp://ignored:{observer}@tiledesk-trial-rabbitmq.railway.internal:5672?heartbeat=60",
    "CHAT21_HTTPSRV_RABBITMQ_URI": f"amqp://ignored:{admin}@tiledesk-trial-rabbitmq.railway.internal:5672?heartbeat=60",
    "CHAT21_SRV_RABBITMQ_URI": f"amqp://ignored:{observer}@tiledesk-trial-rabbitmq.railway.internal:5672?heartbeat=60",
    "PUSH_WH_CHAT21_API_ADMIN_TOKEN": admin,
    "PUSH_WH_WEBHOOK_TOKEN": webhook,
}

if "--json" in sys.argv:
    print(json.dumps(out, indent=2))
else:
    for k, v in out.items():
        print(f"{k}={v}")
PY
