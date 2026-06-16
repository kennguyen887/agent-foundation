# agent-foundation

Everything that boosts an AI coding agent — **rules, hooks, skills, MCP, and tools** — exported from a working setup and sanitized for open source.

The source of truth is a Claude Code config (`~/.claude`), but the layout here is intentionally agent-agnostic: rules are plain Markdown, hooks are plain scripts, skills are portable folders, and MCP server definitions are standard JSON. Adopt the whole thing or cherry-pick a piece.

## Layout

| Path | What it is |
|---|---|
| `rules/CLAUDE.md` | Global engineering rules (workflow, release safety, code style, testing). Sanitized. |
| `skills/` | Authored, reusable skills (portable folders with a `SKILL.md`). |
| `hooks/` | Authored hook scripts. |
| `settings/settings.json` | Settings template — absolute paths replaced with `${HOME}`, node path normalized. |
| `mcp/servers.json` | MCP server definitions. Secret env values are `${PLACEHOLDER}` refs. |
| `.env.example` | The secrets `mcp/servers.json` expects. Copy to `.env` and fill in. |
| `plugins/manifest.json` | **Reference only** — third-party plugins/marketplaces + versions. Their source is *not* vendored. |
| `bootstrap.sh` | Reproduce the setup on a fresh machine (rules, settings, skills, plugins). |
| `sync.mjs` | The exporter. Re-run to refresh the repo from your live config. |

## Why plugins aren't vendored

Most installed capabilities (the `gsd-*` skills/agents/hooks from get-shit-done, plus the `superpowers` / `ecc` / `compound-engineering` / `warp` plugins) come from public marketplaces. Copying their source here would republish other people's code under this repo's license and go stale on every upstream update. Instead, `plugins/manifest.json` records exactly what to install and `bootstrap.sh` reinstalls it. Only first-party, authored content is vendored.

## Using it

```bash
# Reproduce the setup on a new machine
./bootstrap.sh

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

> Skills tagged `⚠ community` in the sync report are public downloads, not original work — review their licenses before publishing.

## License

See `LICENSE`. Third-party plugins referenced in `plugins/manifest.json` retain their own licenses.
