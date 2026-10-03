# ─────────────────────────────────────────────────────────────────────────────
# BIC marketing site — the Express server on :4040.
#
# This is the container that was missing from the production path. The portal's
# compose stack built api/worker/web but nothing ever ran the site, and the
# Caddyfile pointed the whole domain at web:3000 — which, with basePath=/portal,
# cannot answer for "/" at all. The marketing site and the portal have never
# been deployable together from this repo until now.
#
# Topology (the approved one — a single origin, no subdomain):
#
#   browser → caddy:443 → site:4040 ─┬─ /            static public/
#                                    ├─ /api/*       site's own JSON API
#                                    ├─ /portal/api/*→ api:8080   (NestJS)
#                                    └─ /portal/*    → web:3000   (Next.js)
#
# Only the site is exposed to Caddy. web and api stay on the internal network
# and are reachable from outside only through the site's proxy.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --omit=dev: the deployed layer must not carry the dev toolchain. The portal's
# image does the same thing for the same reason.
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Non-root runtime user (container hardening), matching portal/Dockerfile.
RUN addgroup -S bic && adduser -S bic -G bic

COPY --from=deps --chown=bic:bic /app/node_modules ./node_modules
COPY --chown=bic:bic package.json package-lock.json server.js ./
COPY --chown=bic:bic public ./public
# The site's content lives in JSON files, and data/gallery-data.json is real
# site content — the school's curated albums, not runtime state. Without this
# the first deploy came up with an empty gallery and the homepage said "No
# gallery items yet." .dockerignore keeps the mutable files (posts, catalog,
# sessions) out of the build context, so this copies content only.
COPY --chown=bic:bic data ./data

# Writable state. The site keeps its content in JSON files and its uploads on
# disk, all under these paths — without a volume behind them every gallery
# image, news post and library PDF vanishes on the next redeploy.
#   data/                        posts.json, config.json, catalog.json, sessions
#   public/assets/img/gallery    gallery uploads
#   public/assets/uploads        news images
#   public/assets/library        library PDFs
RUN mkdir -p data/sessions data/news data/library \
             public/assets/img/gallery public/assets/uploads public/assets/library \
 && chown -R bic:bic data public
VOLUME ["/app/data"]

USER bic
EXPOSE 4040

# wget is present in the alpine base; /api/health is a plain 200 and does not
# touch the proxy targets, so an unhealthy site means the site itself is down
# rather than that the portal happens to be restarting.
HEALTHCHECK --interval=15s --timeout=4s --retries=5 --start-period=10s \
  CMD wget -qO- http://127.0.0.1:4040/api/health || exit 1

CMD ["node", "server.js"]
