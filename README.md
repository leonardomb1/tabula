# Tabula

Self-hosted documentation platform for organizations. Documents are written in
Markdown, stored in Postgres, organized into access-controlled workspaces, and
exported to typeset PDFs through [Typst](https://typst.app) templates. A built-in
[MCP](https://modelcontextprotocol.io) server lets AI agents search, read, and
write the same documents under the same permissions as the person who minted the
token.

## Features

- **Markdown documents with wikilinks** — `[[links]]` between documents build a
  knowledge graph: backlinks, outgoing links, related documents, and unlinked
  mentions, browsable in the UI and over MCP. Code blocks are highlighted with
  Shiki; embedded Typst snippets are compiled to SVG inline.
- **Workspaces with attribute-based RBAC** — roles are bound to identity claims
  (username, groups, department, or any claim the IdP provides), not to locally
  managed accounts. Every read path — UI, search, wiki, MCP — goes through the
  same access gate.
- **Versioned editing with drafts** — every save is one ACID transaction
  (source, history, search index, link edges). Drafts are ephemeral with a TTL,
  can be promoted or reverted, and published documents keep an approved snapshot.
- **Search** — Postgres full-text search out of the box; point
  `EMBEDDINGS_BASE_URL` at any OpenAI-compatible endpoint and it becomes hybrid
  (full-text fused with pgvector cosine similarity by reciprocal rank).
- **PDF export via Typst** — user-authored Typst templates own the whole page
  (cover, headers, signature pages) and receive document metadata through
  `sys.inputs`. Compiled natively server-side (no headless browser); artifacts
  are cached content-addressed in object storage.
- **Public wiki** — approved documents can be published to `/wiki`, either
  org-only (sign-in required) or anonymous/internet-facing, with an optional
  maintainer-approval flow per workspace.
- **Repo workspaces** — a workspace can mirror the Markdown of a git branch
  (GitHub/GitLab, token auth). Sync is one-way and incremental; mirrored docs
  are read-only in the app.
- **MCP server** — `POST /api/mcp` (stateless streamable HTTP) with ~20 tools:
  search (`search_docs`, `semantic_search`), graph navigation (`doc_neighbors`,
  `graph_overview`), reading, and full write flows (`create_doc`, `patch_doc`,
  drafts, publish requests, PDF rendering). Authenticated with personal API
  tokens minted in the UI.
- **Enterprise auth** — OIDC (authorization code + PKCE) and/or LDAPS
  (service-account or direct bind, Active Directory friendly). Both produce the
  same claim names, so RBAC bindings work identically for either door.
- **Pluggable storage** — binaries and compiled artifacts go to local disk, any
  S3-compatible store (AWS, MinIO, R2, Wasabi), or Azure Blob/ADLS Gen2.
  Document text itself always lives in Postgres.
- **Branding & i18n** — logo, accent color, and company name via env; UI strings
  managed with inlang/paraglide.

## Quick start (Docker Compose)

The compose file runs Caddy (automatic HTTPS) in front of two app instances,
pgbouncer in front of Postgres (pgvector), and a one-shot migration job. Images
are published to GHCR by CI, so a host only ever pulls.

```sh
cp .env.example .env
# Set at minimum: SITE_ADDRESS, ACME_EMAIL, ORIGIN, SESSION_SECRET,
# POSTGRES_PASSWORD, and one auth door (OIDC_* and/or LDAP_*).
docker compose pull
docker compose up -d
```

Migrations run automatically on every `up`; the app instances wait for the
migration job to finish. Nothing is published to the host except ports 80/443.

To run locally built images instead, add the build overlay:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Every setting is documented inline in [`.env.example`](.env.example) —
database/pgbouncer, TLS/ACME, auth (OIDC + LDAP), storage backends, semantic
search, wiki exposure, and branding.

## Connecting an AI agent (MCP)

1. Sign in and mint an API token (Settings → API tokens, or `POST /api/tokens`).
2. Point an MCP client at the endpoint with the token as a bearer:

```json
{
  "mcpServers": {
    "tabula": {
      "type": "http",
      "url": "https://docs.example.com/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

The token carries the minting user's identity, so the agent sees exactly the
workspaces and documents that user can see, and writes are attributed to them.

## Development

Requires [Bun](https://bun.sh) (version pinned in `.bun-version`) and Docker
for the database.

```sh
bun install
cp .env.example .env        # set DATABASE_URL, SESSION_SECRET, auth vars

# Local Postgres (pgvector) — the build overlay publishes it on 127.0.0.1:5433:
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d db
bun run db:migrate

bun run dev
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `bun run dev` | Vite dev server |
| `bun run check` | Compile messages, sync SvelteKit, type-check with svelte-check |
| `bun test src` | Unit tests (Bun test runner) |
| `bun run build` / `bun run start` | Production build (adapter-node) and serve |
| `bun run db:generate` | Generate a Drizzle migration from schema changes |
| `bun run db:migrate` / `db:migrate:status` | Apply / inspect SQL migrations in `drizzle/` |
| `bun run db:studio` | Drizzle Studio against `DATABASE_URL` |

## Architecture notes

- **Postgres is the source of truth for document text** — not files on disk.
  Object storage holds only attachments and the compiled SVG/PDF artifact
  cache. This is what makes saves transactional and search access-gated in the
  `WHERE` clause.
- **Typst replaces a headless browser** for typesetting: the native
  `@myriaddreamin/typst-ts-node-compiler` runs server-side, and
  [`cmarker`](https://typst.app/universe/package/cmarker) converts Markdown to
  Typst inside the user's template, so templates control the entire page.
- **The app connects through pgbouncer** (transaction pooling, prepared
  statements disabled); migrations connect directly to Postgres because DDL and
  advisory locks can't survive connection reassignment.

## Repository layout

```
src/lib/server/     core: docs, drafts, publication, access/RBAC, search,
                    markdown pipeline, typst, storage drivers, auth, MCP server
src/lib/components/ Svelte 5 UI (editor, command palette, graph, dialogs)
src/routes/         (app) UI, /wiki, /login + auth, /api/*
drizzle/            SQL migrations (applied by scripts/migrate.ts)
typst/              example PDF template (argos.typ)
deploy/             Caddyfile
db/init/            Postgres extension bootstrap
scripts/            migrations + smoke tests
```

## License

[Apache-2.0](LICENSE)
