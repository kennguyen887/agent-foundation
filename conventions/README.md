# Backend service conventions

A portable set of engineering conventions for backend services — **folder layout, naming, DTO/entity
structure, code style, query performance, events, logging, testing, and git flow**. Written as
**language-agnostic principles** with an illustrative **TypeScript/NestJS** reference (neutral
`listing` example domain), so it adopts cleanly into a repo in **any** language.

These docs *extend* the global engineering rules in [`../rules/coding-guidelines.md`](../rules/coding-guidelines.md)
(workflow, release safety, iteration, function density, testing, config, DB). They don't repeat
those — they cross-reference them.

## What's here

| Doc | Use it when | Covers |
|---|---|---|
| [structure-a-backend-service.md](./structure-a-backend-service.md) | scaffolding a service or adding a feature | folder layout, feature modules, CQRS read/write split, multi-transport controllers, DTO/entity (+ domain models), `libs/` shared libraries, `migrations/` vs `seeds/`, config, test layout |
| [write-service-code.md](./write-service-code.md) | writing the code inside a feature | return-early, pipelines over loops, `Promise.all`, null-over-undefined + API-response defaults, private-method placement, query performance (N+1, upsert, select, single round-trip, joins, indexes), events/SQS (incl. don't-throw in consumers), structured logging, decimal/date libs, how to write an **integration** test (AAA, factories, faker, coverage) |
| [write-unit-tests.md](./write-unit-tests.md) | writing isolated **unit** tests (mocked deps, no DB) | `test/unit` layout & naming, jest projects (unit + integration), shared mock factories + `createHandlerTestingModule`, CQRS-handler / service / DTO-validation patterns, entity builders, jest.mock patterns, assertions, cleanup |
| [code-conventions.md](./code-conventions.md) | any code, as a quality baseline | style guide + linter (Airbnb/prettier), naming case table, file/function size, choosing the right array function, SOLID/KISS/SRP, magic numbers, casts & non-null assertions, negative conditionals, side effects, deep copy, TS gotchas |
| [git-flow.md](./git-flow.md) | branching, MRs, releases, hotfixes | `develop → staging → master` flow, tagging, semantic versioning, hotfix path, CI/CD triggers |

## How to apply to a project

1. **Read in order:** `structure` → `write-service-code` → `write-unit-tests` → `code-conventions`
   → `git-flow`. The first two are most useful when starting/extending a service; the rest apply to
   any change. (`write-service-code` §8 is the integration/boundary test layer; `write-unit-tests`
   is the isolated/mocked layer — a repo may use one or both.)
2. **Map the placeholders to your project.** The examples use a neutral `listing` domain, a
   `@org/*` path-alias scope, and `App*Exception` names — substitute your real domain, library
   scope, and base-class names. The *conventions* stay; only the names change.
3. **Pick the column that matches your stack.** Each rule has a portable **principle**, a
   **▸ Example (TS/NestJS)**, and a **▸ Other stacks** note:
   - *TypeScript / NestJS repo* → follow the examples directly; wire ESLint `airbnb-base` + prettier;
     adopt the folder layout and the `libs/` path-alias mechanism as written.
   - *Any other language* → ignore the TS realization, keep the principle, and apply the **▸ Other
     stacks** equivalent (feature packages, command/query handlers, a base model + migrations/seeds,
     your ecosystem's linter/decimal/date libs, the same git flow).
4. **Drop the relevant docs where your agent/team will find them** — e.g. a repo's `docs/skills/`,
   your AI agent's skills directory, or an engineering handbook. The frontmatter (`name` /
   `description`) lets an assistant discover the right doc by trigger.
5. **Verify against each doc's `Verification` section** — they list concrete, runnable checks
   (folder layout, no raw `process.env` in business code, queries that select only needed columns,
   tests that go through the boundary, lint clean, release tags that line up).

## Note on this repo's `sync.mjs`

This folder lives **outside** the directories `sync.mjs` regenerates (`rules/`, `skills/`, `mcp/`,
`claude/`), so a sync run won't overwrite it. To instead ship these as **synced agent skills**, place
them under `~/.claude/skills/<name>/SKILL.md` (the sync source) and re-run `node sync.mjs`.
