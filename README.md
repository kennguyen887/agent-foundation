# agent-foundation

**Production-grade [Claude Code](https://claude.com/claude-code) skills for backend & frontend engineering** — language-flexible conventions plus **step-by-step third-party integration recipes**: payments (Stripe · Rapyd · CyberSource · UOB · Apple Pay / Google Pay), identity & SSO (Singpass · Keycloak · OIDC / OAuth2 · 3-D Secure), messaging (Twilio SMS), and Docker / CI-CD. Installable as a **Claude Code skills marketplace**.

Everything that boosts an AI coding agent — **rules, hooks, skills, MCP, and tools** — exported from a working setup and sanitized for open source.

This is meant to serve **any** AI coding agent, not one in particular. Portable capabilities live at the top level (plain-Markdown rules, portable skill folders, standard MCP JSON). Anything that only works with a specific agent lives in its own namespaced directory — today that's `claude/` (Claude Code). Other agents get sibling dirs (`cursor/`, `codex/`, …) as they're added. Adopt the whole thing or cherry-pick a piece.

## Install (run these in Claude Code)

This repo doubles as a **Claude Code marketplace** — the `skills/` folder ships as one plugin
(`engineering-skills`). Run these in Claude Code:

```text
# 1. add this marketplace (public repo — no auth needed)
/plugin marketplace add kennguyen887/agent-foundation

# 2. install the skills plugin
/plugin install engineering-skills@agent-foundation
```

Skills then load on demand, namespaced as `/engineering-skills:<skill>`. Pull updates later with
`/plugin marketplace update agent-foundation`. (Prefer files-only? Copy `skills/` into
`~/.claude/skills/` via `claude/bootstrap.sh` instead — no marketplace needed.)

## Third-party integration recipes

Most "integration" guidance is generic. These skills ship **concrete, step-by-step recipes** for real
providers — **environment variables, dashboard setup, request signing, webhook verification, and the
gotchas** — each grounded in production code and mapped back to a reusable pattern. They load on demand
from each skill's `references/`. Stacks shown are NestJS/TypeScript + React, but every recipe is
written principle-first so it ports to any language.

**Payments** — see [`integrate-external-services`](skills/integrate-external-services/)
- **Stripe** — PaymentIntents, raw-body webhook (`constructEvent`), idempotency keys, wallets, test cards + Stripe CLI.
- **Rapyd** — Rapyd Collect, HMAC-signed requests, hosted card tokenization, webhook HMAC verification.
- **CyberSource** — signed-JWT (P12) auth, Microform / Secure Acceptance tokenization, full **3-D Secure** (payer-auth) flow.
- **UOB PayNow** — PayNow QR collection, mutual-TLS + JWS-signed requests, encrypted + signed webhooks.
- **Apple Pay / Google Pay / WeChat Pay / Alipay** — device-wallet tokens, method→gateway routing, Apple merchant validation.

**Identity & SSO (OIDC / OAuth2)** — see [`integrate-identity-providers`](skills/integrate-identity-providers/)
- **Singpass (NDI OIDC)** — private-key-JWT client assertion, JWE-encrypted ID token (decrypt → verify), hosted JWKS, verified Myinfo (KYC) attributes.
- **Keycloak** — identity broker, `.well-known` discovery, JWKS token verification, client-credentials with latency-safe caching.
- **Social login** (Google / Apple / Facebook) — OIDC relying-party flow with PKCE + state/nonce, map `(provider, subject)` → user.

**Messaging** — **Twilio SMS** (Messaging Service send + `X-Twilio-Signature` status webhook), behind a provider-agnostic `send()` facade.

**Build & ship** — [`containerize-and-ship-a-service`](skills/containerize-and-ship-a-service/): multi-stage Docker, base via dependency proxy, build-secret scrubbing, a GitLab/GitHub CI pipeline, and branch→environment deploys.

> Also covered as reusable patterns: **inbound webhooks** (raw-body capture, signature verify, idempotent fast-ack), **outbound resilience** (circuit breaker, retry/backoff), **service-to-service** RPC + SNS→SQS event fan-out, and a typed **error model**.

## Layout

**Portable (any agent):**

| Path | What it is |
|---|---|
| `rules/coding-guidelines.md` | Engineering rules (workflow, release safety, code style, testing). Sanitized, agent-neutral. |
| `skills/` | Reusable skills (portable folders with a `SKILL.md`). Language/framework-flexible — full list in the **[Skills](#skills)** section below. |
| `mcp/servers.json` | MCP server definitions (open standard). Secret env values are `${PLACEHOLDER}` refs. |
| `.env.example` | The secrets `mcp/servers.json` expects. Copy to `.env` and fill in. |

**`claude/` — Claude Code-specific:**

| Path | What it is |
|---|---|
| `claude/settings.json` | Settings template — absolute paths → `${HOME}`, node path normalized. |
| `claude/hooks/` | Hook scripts (Claude Code hook format). |
| `claude/plugins.json` | **Reference only** — third-party plugins/marketplaces + versions. Source is *not* vendored. |
| `claude/bootstrap.sh` | Reproduce the Claude Code setup on a fresh machine. |

`sync.mjs` — the exporter. Re-run to refresh the repo from your live config (currently sources `~/.claude`).

## Skills

Every skill is a portable folder with a `SKILL.md`; only the one-line `description` is always loaded
(the trigger), and the body loads on demand. All examples follow **principle → example → other
stacks**, so they apply to any language/framework. 27 skills:

### Backend — structure & code

| Skill | What it covers |
|---|---|
| `structure-a-backend-service` | Scaffold a service / feature module — folder layout, file/class naming, DTO & entity structure, the CQRS read/write split. |
| `structure-a-shared-backend-lib` | Organize a shared infra lib (`@org/infra-*`) — split by dependency weight, one barrel per package, framework as peer dep, and the canonical primitives it ships (base entity, pagination/response DTOs, transformers, type helpers). |
| `write-service-code` | Feature-body code — control flow, `Promise.all`, query performance (N+1, upsert, joins, indexes), events/SQS, logging, decimal/date libs, nullability. |
| `write-cross-cutting-code` | Request-pipeline primitives — custom decorators (param/metadata/method-wrapper), guards (incl. OR-composition), pipes, interceptors, middleware, custom validators. |
| `design-an-error-model` | One error contract — typed exception hierarchy, validation-error flattener, global filter → uniform body (+ trace id), RPC twin, log-and-swallow decorator. |
| `write-unit-tests` | Isolated unit tests (mocked deps, no DB) for CQRS handlers/services/DTOs — mock factories, AAA, entity builders. |
| `background-jobs-and-caching` | Bull queues (multi-queue, delayed jobs, idempotency, graceful shutdown) + Redis cache (read-through wrap, key conventions, SCAN invalidation). |
| `import-data-from-csv` | Bulk CSV import — streaming parse, per-row error report, normalization, chunked atomic upsert, partial-success response, fan-out to workers. |
| `use-feature-flags` | Gate rollouts on a runtime flag from a central service (scoped by service / flag / user / properties), fail-safe default-off, cached — not a `NODE_ENV` branch; flag lifecycle + removal. |
| `render-transactional-emails` | Render emails (and PDFs) from per-locale templates (engine + CSS inliner) → subject/html/text, then dispatch via the notification facade; PDFs reuse the same render. |
| `schedule-effective-dated-changes` | Apply a future-dated change via a pending-changes table (payload + effectiveAt + status) + a due-sweep that applies rows transactionally, snapshots history, marks done — visible/cancellable/audited; vs a Redis delayed job. |

### Backend — integration (services & third-party)

| Skill | What it covers |
|---|---|
| `integrate-internal-services` | Service-to-service in the same platform — RPC envelope + server handlers, SNS→SQS fan-out, consumer ack/DLQ + lifecycle hooks, cross-service batch+cache reads, context propagation, worker shape. |
| `integrate-external-services` | Third-party systems — anti-corruption adapter, resilient HTTP (circuit breaker + retry/backoff), outbound signing + idempotency, inbound webhooks (verify/idempotent/fast-ack), partner/public API edge, wallet payments. |
| `integrate-identity-providers` | Third-party login + identity/KYC verification — OIDC relying-party flow (PKCE + state/nonce), token validation (JWKS / introspection), identity broker, map `(provider, subject)`→user, verified attributes (e.g. Singpass). |

> **Step-by-step vendor recipes** ship inside these skills under `references/` (loaded on demand, so they don't add to always-on cost). Each is a concrete how-to-implement guide — **env keys + setup/connect steps** included — mapped back to the pattern: **payments** — Stripe, Rapyd, CyberSource, UOB; **comms** — Twilio (SMS); **identity** — Keycloak. More added per provider.

### Frontend

| Skill | What it covers |
|---|---|
| `structure-a-frontend-app` | Scaffold a FE app — thin routing → feature modules (Component + `.actions` + `.hook` + styles + barrel), shared-vs-feature code, aliases, request/response models. |
| `structure-a-shared-ui-lib` | Internal shared UI / design-system lib — src layout, folder-per-component with version coexistence, store/query/Utils wrappers, versioned design tokens, subpath exports. |
| `write-frontend-code` | FE feature code — React Query, DTOs, Zustand + Context state, custom hooks, RHF + Yup forms, performance, Tailwind + tokens + CSS Modules, i18n, SSR/hydration. |
| `write-frontend-tests` | Jest + React Testing Library units (utils/hooks/components) + Cypress + Cucumber e2e — where tests live, router mocking, the lint/type/test gates. |
| `secure-a-frontend-app` | Auth/session — OIDC via NextAuth + token refresh/injection, route guards + permission-matrix RBAC, SSR cookie propagation + hydration, vault secrets + config split. |
| `handle-files-frontend` | One file-util module — CSV (papaparse), download (file-saver/jszip), PDF (pdf.js), upload with magic-number MIME + presigned URL + image resize. |

### Shared — conventions & process

| Skill | What it covers |
|---|---|
| `code-conventions` | General style — naming, file/function size, array functions, early return, SOLID/KISS, magic numbers, casts, TS gotchas. Also indexes the full convention set. |
| `git-flow` | Branching & release — develop→staging→master flow, tagging, semantic versioning, hotfix path. Tool-agnostic (plain git). |
| `containerize-and-ship-a-service` | Docker + CI/CD — multi-stage build (slim runtime), base via dependency proxy, build-time creds scrubbed before the final stage, lockfile-first caching, app/migration/test images, thin per-repo pipeline including a shared template, branch→env deploys + secrets via CI vars. |

### Rules (extracted from the global guidelines)

| Skill | What it covers |
|---|---|
| `release-safety` | Before cutting/deploying a backend release — backward compat with the live app, test current app vs new backend, rollback plan, config/data readiness, feature flags. |
| `database-migrations` | Migration rules (additive, reversible, immutable, seed-vs-migration, push filters into SQL) + the "null fields = unapplied migration" gotcha. |
| `authoring-project-skills` | Creating/updating/reviewing a project skill — file template, verb-led naming, the quality bar, a 5-weakness self-check, and when NOT to write one. |

### Tools

| Skill | What it covers |
|---|---|
| `send-slack` | Send a Slack message to a channel/DM via the local `send.js` script. |

## Why plugins aren't vendored

Most installed capabilities (the `gsd-*` skills/agents/hooks from get-shit-done, plus the `superpowers` / `ecc` / `compound-engineering` / `warp` plugins) come from public marketplaces. Copying their source here would republish other people's code under this repo's license and go stale on every upstream update. Instead, `plugins/manifest.json` records exactly what to install and `bootstrap.sh` reinstalls it. Only first-party, authored content is vendored.

## Community / marketplace skills (referenced, not vendored)

To keep this repo first-party and light, third-party skills are **not** copied here — only listed
below with where to reinstall them on a new machine. They stay in your local `~/.claude/skills/`;
`sync.mjs` skips anything in its `COMMUNITY_HINTS` set so it never republishes them.

| Skill(s) | Source | Reinstall |
|---|---|---|
| `ask-matt`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `prototype`, `to-prd`, `triage`, `to-issues`, `implement`, `grill-with-docs`, `improve-codebase-architecture`, `git-guardrails-claude-code`, `setup-pre-commit`, `setup-matt-pocock-skills` | **Matt Pocock** — <https://github.com/mattpocock/skills> | clone the repo and copy the folders into `~/.claude/skills/`, or run the `setup-matt-pocock-skills` skill (which installs the rest) |
| `resolving-merge-conflicts` | **superpowers** plugin (`claude-plugins-official` marketplace) | comes with the `superpowers` plugin — see `claude/plugins.json` + `claude/bootstrap.sh` |
| `stop-slop` | **Hardik Pandya** — <https://hvpandya.com> | copy into `~/.claude/skills/` |
| `sentry-cli` | **Sentry** CLI guide (sentry plugin/integration) | reinstall from the Sentry skill source |
| `caveman`, `zoom-out` | community (source not recorded) | locate in your marketplace/skill source and copy into `~/.claude/skills/` |

> `implement` is the third step of Matt Pocock's `to-prd` → `to-issues` → `implement` flow (inferred from its description; verify on reinstall).

## Using it

```bash
# Reproduce the Claude Code setup on a new machine
./claude/bootstrap.sh

# MCP secrets
cp .env.example .env   # then fill in SENTRY_ACCESS_TOKEN, LINEAR_API_KEY, ...
```

## Refreshing from your live config (`sync.mjs`)

```bash
node sync.mjs            # export + sanitize + secret-scan, then write the repo
node sync.mjs --dry-run  # preview the plan, write nothing
node sync.mjs --check    # run the secret scan over existing output only
```

`sync.mjs` (Node 18+, zero dependencies):

- **Excludes** logs, caches, history, sessions, projects, credentials, and every file listed in `gsd-file-manifest.json`.
- **Vendors** only authored skills/hooks; everything plugin-managed becomes a manifest entry.
- **Sanitizes** personal identifiers (email, org, username, absolute paths, project codenames, teammate handles) — configurable at the top of the script.
- **Redacts** MCP secret env values to `${KEY}` placeholders and regenerates `.env.example`.
- **Fails closed** (exit 1) if the secret/PII scan finds a leak in the output.
- **Flags** project-specific prose for manual review instead of mangling it.

> Community-download skills (listed in `sync.mjs` `COMMUNITY_HINTS`) are **referenced, not vendored** — `sync.mjs` skips them so this repo only republishes first-party, authored work. They stay installed locally; they're just not copied here.

## License

See `LICENSE`. Third-party plugins referenced in `plugins/manifest.json` retain their own licenses.
