# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS builder

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# `bun run check` runs `svelte-kit sync` (generates .svelte-kit/tsconfig.json
# that tsconfig.json extends from) plus svelte-check. Type errors fail the
# image build early instead of at runtime.
RUN bun run check && bun run build


# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM oven/bun:1-debian AS runtime

# Runtime libs needed by Puppeteer's chrome-headless-shell. No mesa/llvm/gtk
# — headless-shell ships its own graphics stack inside the binary.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdrm2 \
        libgbm1 \
        libnspr4 \
        libnss3 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        libasound2 \
        fonts-liberation \
        fonts-noto \
        fonts-noto-cjk \
        fonts-urw-base35 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* /var/log/* /tmp/*

WORKDIR /app

ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && bunx puppeteer browsers install chrome-headless-shell \
    && rm -rf /root/.bun/install/cache /root/.cache/puppeteer/logs

COPY --from=builder /app/build ./build

# Non-root user. Only /app/content needs to be writable at runtime, so scope
# chown tightly — `chown -R /app` (or anything under /app/.cache, which holds
# the ~600MB chromium binary) would duplicate that size in a new layer.
# The chromium binary is world-readable/executable already, so the app user
# can launch it without owning it.
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app \
    && mkdir -p /app/content/covers \
    && chown -R app:app /app/content

USER app

ENV PORT=3000 \
    NODE_ENV=production

EXPOSE 3000

CMD ["bun", "build/index.js"]
