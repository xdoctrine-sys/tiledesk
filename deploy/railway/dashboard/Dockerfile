# Tiledesk dashboard WITH the "Monitor V2" page.
#
# The production dashboard is the public image tiledesk/tiledesk-dashboard:2.7.134-stage. Monitor V2 is a new page of the
# dashboard's Angular source, so this Dockerfile rebuilds that exact release from its public tag and adds, on top of it,
#   - files/   : src/app/monitor-v2 and src/assets/monitor-v2 (new files only)
#   - monitor-v2.patch : the two touched files (one route in app.routing.ts, one menu entry in sidebar.component.html)
# Everything else is the unmodified upstream release, built the way upstream builds it (same Node, same command, same nginx).
#
# Railway: service tiledesk-trial-dashboard -> Settings -> Source: this repo, Root Directory deploy/railway/dashboard,
# Builder Dockerfile. The service variables stay the same as for the image (they are read by the nginx start command).

### STAGE 1: build ###
FROM node:14 AS builder

# Release of the dashboard that production runs. Change it only together with the patch.
ARG DASHBOARD_TAG=2.7.134-stage

RUN git clone --depth 1 --branch ${DASHBOARD_TAG} https://github.com/Tiledesk/tiledesk-dashboard.git /ng-app
WORKDIR /ng-app

RUN npm ci --no-audit --no-fund

# Monitor V2: new files, then the two small edits
COPY files/src/ ./src/
COPY monitor-v2.patch /tmp/monitor-v2.patch
RUN git apply --check /tmp/monitor-v2.patch && git apply /tmp/monitor-v2.patch

ENV NODE_OPTIONS=--max_old_space_size=4096
RUN npm run ng build -- --configuration production --output-path=dist --base-href ./

### STAGE 2: serve (identical to the upstream image) ###
FROM nginx:1.14.1-alpine
COPY --from=builder /ng-app/nginx.conf /etc/nginx/nginx.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /ng-app/dist /usr/share/nginx/html
CMD ["/bin/sh", "-c", "envsubst < /usr/share/nginx/html/dashboard-config-template.json > /usr/share/nginx/html/dashboard-config.json && exec nginx -g 'daemon off;'"]
