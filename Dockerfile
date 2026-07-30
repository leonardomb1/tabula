# Multi-stage build: Bun installs, builds and serves.
#
# Debian-based images throughout, not Alpine: @myriaddreamin/typst-ts-node-compiler
# is a native N-API addon built against glibc, and PDF export needs it at runtime.
#
#   docker build -t tabula .
#   docker run --rm -p 3000:3000 --env-file .env tabula

# ── Dependencies ─────────────────────────────────────────────────────────────
# Its own layer keyed on the lockfile, so source edits do not reinstall.
FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
# Paraglide regenerates src/lib/paraglide from messages/ here, which is why that
# directory is gitignored and dockerignored rather than shipped.
FROM oven/bun:1-debian AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ── Tools ────────────────────────────────────────────────────────────────────
# Migration image: the runtime image ships only the built server, not scripts/ or
# drizzle/, so schema work gets its own image. Published alongside it under a
# `tools-` tag prefix, which is what lets a pull-only host apply migrations
# without ever building anything. Skips `bun run build` — nothing here serves HTTP.
FROM oven/bun:1-debian AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER bun
CMD ["bun", "run", "db:migrate"]

# ── Production dependencies ──────────────────────────────────────────────────
# Vite keeps the native compiler, the storage SDKs and the Postgres driver
# external to the SSR bundle, so they must exist as real modules at runtime.
FROM oven/bun:1-debian AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime
WORKDIR /app

# Typst embeds no text fonts, so a container without them renders PDFs in
# fallback shapes. Point TYPST_FONTS_PATH elsewhere to add the brand's own.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		fonts-dejavu-core \
		fonts-liberation \
	&& rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0 \
	TYPST_FONTS_PATH=/usr/share/fonts \
	TYPST_WORKSPACE=/tmp/tabula-typst-root

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json

# Read-only image, writable scratch: the typst workspace is the only path the
# server writes to when storage is remote.
# /app/content exists in the image so that a named volume mounted there inherits
# this ownership; an empty volume would otherwise arrive owned by root and STORAGE=local
# could not write to it.
RUN mkdir -p /tmp/tabula-typst-root /app/content \
	&& chown -R bun:bun /tmp/tabula-typst-root /app
USER bun

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
	CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT??3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "./build/index.js"]
