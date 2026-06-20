# agent-foundation

Everything that boosts an AI coding agent — **rules, hooks, skills, MCP, and tools** — exported from a working setup and sanitized for open source.

This is meant to serve **any** AI coding agent, not one in particular. Portable capabilities live at the top level (plain-Markdown rules, portable skill folders, standard MCP JSON). Anything that only works with a specific agent lives in its own namespaced directory — today that's `claude/` (Claude Code). Other agents get sibling dirs (`cursor/`, `codex/`, …) as they're added. Adopt the whole thing or cherry-pick a piece.

## Layout

**Portable (any agent):**

| Path | What it is |
|---|---|
| `rules/coding-guidelines.md` | Engineering rules (workflow, release safety, code style, testing). Sanitized, agent-neutral. |
| `skills/` | Reusable skills (portable folders with a `SKILL.md`). Includes **backend** conventions (`structure-a-backend-service`, `write-service-code`, `write-unit-tests`), **frontend** conventions (`structure-a-frontend-app`, `write-frontend-code`, `write-frontend-tests`, `structure-a-shared-ui-lib`), the shared `code-conventions` + `git-flow`, and rules extracted from the global guidelines (`release-safety`, `database-migrations`, `authoring-project-skills`). Language/framework-flexible. |
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
