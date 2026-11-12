# Railway-adapted Tiledesk reverse proxy.
#
# Base is the official proxy image (pinned by digest in the Railway service),
# we only replace its routing configuration because the upstream file hardcodes
# Docker Compose short hostnames (dashboard, server, webwidget, ...) and a
# resolver (127.0.0.11) that do not exist on Railway, where internal DNS uses
# <service>.railway.internal.
#
# Everything else (entrypoint, nginx user, ports, logging) is inherited unchanged.
FROM tiledesk/tiledesk-docker-proxy:v1.1.2@sha256:ae3610c23c4226711a903b2a4c5cc391fb7462d3c73f252a5dadc318382ef94c

COPY nginx.conf /etc/nginx/nginx.conf
