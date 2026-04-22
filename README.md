# Docs

A lightweight Markdown documentation platform. SvelteKit + Bun. Built-in LDAP and OIDC auth, R2/S3-compatible storage, AI chat with citations, live wiki links, version history, PDF export.

## Quick start

```sh
cp .env.example .env  # then edit
bun install
bun run dev
```

Open http://localhost:5173.

## Branding

Three knobs, all env-driven. Defaults are neutral OSS values so you can `git clone` and run.

| Variable | Default | Notes |
|---|---|---|
| `BRAND_NAME` | `Docs` | Used in page titles, header, and back links. |
| `BRAND_COLOR` | `#2563eb` | Any CSS color. Injected as `--brand` at the document root. |
| `BRAND_LOGO_URL` | `/logo.svg` | Served by SvelteKit. Drop your SVG at `static/logo.svg`. Leave the file absent (or set the var to empty) to fall back to text-based brand name. |

> **Note:** Quote colors in `.env` — `BRAND_COLOR="#e63719"` — otherwise the `#` is treated as a line comment.

To rebrand a deployment:

1. Replace `static/logo.svg` with your SVG (any viewBox is fine — the header clamps to 28px height, PDF covers to 36px).
2. (Optional) Drop an inverted / all-white variant at `static/logo-negative.svg`. The PDF cover header has a dark background, so the negative variant is used there if present. Falls back to `logo.svg`, then to text.
3. Set `BRAND_NAME` and `BRAND_COLOR` in `.env`.
4. Restart.

The PDF export picks up the same branding — including the decorative cover-page SVG patterns, whose palettes are derived from `BRAND_COLOR` via HSL (simple `brandPalette()` helper in `src/lib/server/pdf.ts`).

## Auth

Three layers, each optional except the admin break-glass:

- **OIDC (primary).** Any OIDC-compliant provider works — [ZITADEL](https://zitadel.com) is my pick for self-hosters, but Authentik, Keycloak, Google, Okta, Auth0 all work. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. A "Entrar com SSO" button appears on the login page. Optional `OIDC_ALLOWED_GROUPS` (pipe-separated) gates access to members of specific groups.
- **LDAP (optional, enterprise).** Active Directory bind + group / OU filter. See `LDAP_*` in `.env.example`. Login form checks LDAP after the admin break-glass.
- **Admin break-glass.** `ADMIN_USER` / `ADMIN_PASSWORD` in env. Always available — use it to bootstrap your OIDC config on first boot, or recover when your provider is down.

**OIDC redirect URL** — set it to `{ORIGIN}/auth/oidc/callback` in your provider's app config.

Authorization code flow with PKCE; `openid-client` handles the protocol.

## Storage

Two backends, chosen by `STORAGE`:

- `local` (default) — Reads and writes `./content`.
- `s3` — Any S3-compatible bucket. For Cloudflare R2, set `S3_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com` and `S3_REGION=auto`.

One-shot migration from local to R2:

```sh
rclone sync ./content r2:<bucket>/content
```

Then flip `STORAGE=s3` in `.env` and restart.

All reads go through an in-memory cache + MiniSearch index built on first request, so S3 latency is paid once at boot.

## Deploy to Cloudflare Containers

The repo ships ready to deploy on [Cloudflare Containers](https://developers.cloudflare.com/containers/): a fronting Worker routes every request to one Bun container running the existing `Dockerfile`. Puppeteer, LDAP, the in-memory cache, and everything else work unchanged.

```sh
# 1. Once — login
bunx wrangler login

# 2. Set secrets (once per account; repeat if they change)
bunx wrangler secret put SESSION_SECRET       # openssl rand -hex 32
bunx wrangler secret put ANTHROPIC_API_KEY
bunx wrangler secret put AUTH_USERS           # JSON: [{"username":"..","password":".."}]
bunx wrangler secret put ADMIN_USER
bunx wrangler secret put ADMIN_PASSWORD
bunx wrangler secret put S3_ENDPOINT          # https://<account>.r2.cloudflarestorage.com
bunx wrangler secret put S3_BUCKET
bunx wrangler secret put S3_ACCESS_KEY_ID
bunx wrangler secret put S3_SECRET_ACCESS_KEY
bunx wrangler secret put ORIGIN               # https://docs.example.com

# 3. Deploy — builds the image, uploads to CF Registry, provisions the container
bunx wrangler deploy
```

Plaintext config (BRAND_*, STORAGE, AUTH_PROVIDER, etc.) lives in `wrangler.toml` under `[vars]`.

Notes:

- Cloudflare containers have ephemeral filesystems, so set `STORAGE=s3` (pre-set in `wrangler.toml`) and point at R2.
- Idle sleep is controlled by `sleepAfter` in `cloudflare/worker.ts` (default 10m). First request after idle pays a 1-3s cold-start.
- `max_instances = 3` in `wrangler.toml` caps scale-out. Raise for higher traffic.
