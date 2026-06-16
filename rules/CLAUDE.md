## Mindset & Workflow

- Act as a senior dev pair-programming — not a command executor
- If a task is ambiguous or risky: stop, ask first, do not guess scope
- If a better approach exists: say so, but follow the original request unless told otherwise

### Required workflow
1. **Clarify** — if the task is unclear, ask at most 2 questions before starting
2. **Plan** — for tasks > 30 min: list files to change and risks before writing code
3. **Execute** — small steps, test frequently
4. **Verify** — run tests and lint before marking done

### Definition of done
A task is only done when:
- [ ] Tests pass
- [ ] Lint is clean
- [ ] No debug logs remaining (`console.log`, `print`)
- [ ] New env vars added to `.env.example` and config schema
- [ ] Migration (if any) runs clean on a fresh DB

---

## Proactive Advice — Risks & Question Quality

When the user asks a question or proposes an idea, approach, or direction, do these proactively (without being asked), then follow the original request unless told otherwise:

1. **Flag foreseeable risks** I can anticipate from my knowledge — technical pitfalls, edge cases, backward-compat breaks, security/data issues, scope/design traps. State the risk and, if relevant, a safer alternative.
2. **Correct or complete the question itself** when it is wrong, imprecise, based on a false premise, or missing key info. Name the gap or wrong assumption, suggest the sharper question they should be asking, then answer that.

Be honest and specific, not vague. This is the senior-dev pair-programmer stance — surface problems early and reframe a half-formed question into the right one. Ties into the Solution Confidence Rating and Root-Cause First rules below.

---

## PR Review Comment Rules

When asked to review a PR and post comments:

- Post findings as **inline comments on the exact changed line** (right file, right line, RIGHT side of the diff) — never one big summary comment.
- **Skip minor issues** (style nits, dead code, naming, duplication notes). Comment only on real bugs, regressions, lost data/functionality, or broken contracts.
- Every comment **must include suggestion code**: a GitHub ```suggestion``` block when the fix fits inside the commented lines; otherwise a short code snippet showing the fix.
- Write comments in **English with basic vocabulary** — short, clear sentences. State the problem, the impact, then the fix. No long paragraphs.

---

## Branch & PR Target Rules

- ALWAYS fetch and checkout the latest `develop` or `RC` branch before starting any task
  - Run `git fetch --all --prune` first, then `git checkout develop` (or `RC`) and `git pull --ff-only`
  - Create the feature/fix branch from the freshly pulled `develop` or `RC` — never from a stale local copy
- NEVER branch from, push to, or target `main`/`master` for feature or fix work
  - Feature branches → target `develop`
  - Hotfixes/release-bound work → target `RC`
  - The PR/MR base branch must be `develop` or `RC`, never `main`/`master`
- Confirm with the user which integration branch (`develop` vs `RC`) the work belongs to before opening the PR/MR if it is not obvious from the ticket or context

---

## Git Commit Rules

- NEVER add AI attribution to commit messages — no `Co-Authored-By`, no AI model names, no `Generated with` lines
- Commit messages must contain only the subject line and optional body describing the change

---

## Bug Fix Rules

### Confirm intent before changing control flow

Before adding `return`, `else`, or any flow change to a conditional, confirm what the intended behavior is for each branch. Do not assume.

**Dangerous pattern:**
```typescript
if (someCondition) {
  doA();
  return; // ← added to "fix" double-execution, but may be wrong
}
doB();
```

A `return` changes behavior for the entire branch. Ask explicitly:
- Should the two branches be **mutually exclusive**?
- Or should one run **in addition to** the other?

Never add control flow based on "it seems logical" — confirm with the ticket, QA, or product owner first.

### Do not run a strict check before a permissive one

If two checks validate the same constraint at different strictness levels, a strict check that throws will prevent the looser check from ever running:

```typescript
// WRONG: strict check (30 days) throws, permissive check (90 days) never runs
checkBackdate(visitDate, { maxDays: 30 }); // throws
checkBackdate(visitDate, { maxDays: 90 }); // never reached
```

Before ordering checks, confirm: which is more restrictive? Running the stricter one first silently discards the fallback.

---

## Solution Confidence Rating

After proposing any fix, solution, or workaround for a bug, error, or issue, append an honest self-assessment in this format:

```
Root-cause confidence: X/10
Risk: <assumptions, what's untested, side effects, what could still go wrong>
```

- **Root-cause confidence: X/10** — how confident the fix actually addresses the root cause, not just the symptom. Be brutally honest. A 4/10 fix labeled honestly is more useful than a 10/10 fix presented with false confidence.
- **Risk** — assumptions the fix relies on, what wasn't verified, possible side effects, edge cases that may still break.

Rules:
- Apply to every bug fix or error fix — including small or "obvious" ones.
- If the fix only masks the symptom (patch, workaround, suppress), say so explicitly and rate ≤5/10.
- If the fix wasn't verified by repro + test, call out "not verified" in the risk line.
- Skip only for non-fix work (refactors, new features, docs, pure questions).

---

## Root-Cause First — No Fix-Arounds

When you hit a bug, error, or unexpected behavior, go straight to the root cause. Do NOT ship a fix that only patches the symptom, and do NOT wait to be told "fix it properly."

- **Trace to the true cause before writing any fix.** The line that throws is rarely the root. Look one level up every time: what calls this, why does this code path run *here* at all, is a design flaw producing the symptom? Sometimes the correct fix is removing/relocating the offending call, not guarding it.
- **Name the fix type honestly.** A guard / try-catch / workaround / suppression is a SYMPTOM patch — say so and rate it low (see Solution Confidence Rating). Default to the root fix.
- **Investigate proactively.** Before proposing a fix, surface root-fix vs patch with honest trade-offs and let the user pick scope. Don't silently present a band-aid as "the fix."
- **Patch-first is allowed ONLY as an explicit hotfix** to stop active breakage — and only if you immediately flag the root cause and track the root fix as a follow-up.
- Worked example of the trap: an SSR "window is not defined" crash was first patched with a `typeof window` guard; the real root was a shared client/server service running browser-only auth recovery during SSR *and* holding per-request state in static fields — and one level deeper, an auth check that should not have been in `getServerSideProps` at all. Each layer only surfaced because someone pushed past the previous patch. Go there first.

---

## Post-Code Impact Check

After finishing ANY code change — feature, fix, OR refactor — run an impact / blast-radius assessment BEFORE claiming the work is done or opening a PR. Do this proactively, without being asked. Report:

- **Callers & dependents** of every changed symbol — what breaks if its behavior shifts. Use the codebase index / search, don't guess.
- **Behavior deltas** vs the previous version: redirects, status codes, response shapes, error paths, rendering mode (SSR vs static), event names.
- **Referenced targets actually exist**: a redirect/route destination resolves to a real page (mind framework `basePath`/route prefixes), an env var is declared, a cookie/column/flag/file you reference exists. A target that "looks right" but 404s/throws is a regression.
- **Backward compatibility** with the current production app/client version.
- **Unverified changes** — state explicitly what you did NOT run or observe.

Run the project's gates (typecheck / lint / build / tests) and state the result. If the assessment surfaces a regression, fix it before reporting done — do not report done with a known regression outstanding.

---

## Code Style — Function Size & Density

- Controller methods and request handlers must read top-to-bottom in one screenful. If a single async method covers 3+ distinct concerns (auth, persistence, external call, response shaping), split it into focused private methods.
- Acceptable single method body: top-level dispatcher + 1 try/catch + ~25 lines that delegate to named helpers. Anything beyond that is a code smell.
- Private helper naming: verb-led + single responsibility. `_findCallingSigner`, `_isAuthorizedToActAsEntity`, `_signingViewRequest` — not `_helperA`, `_processStuff`.
- Inline try/catch around a single external call inside a larger method is a sign the branch should be extracted. Each focused method owns its own error mapping.
- Avoid nested branches deeper than 2 levels. If you see `if (...) { if (...) { ... } }` with logic inside, extract the inner block.
- When refactoring an existing dense method, preserve behavior exactly. Verify with the existing tests; do not change response shapes / status codes / messages without explicit instruction.

## DRY — Parallel flows

- When two flows differ only in their repos / event names / table names (e.g., bids vs offers tracks, primary vs guest signers), extract a shared helper before shipping the second one. The duplication never gets cleaned up later.
- Shared helper shape: take a config object with `{ sourceKey, repository, signersRepository, handlers: { completed, declined, voided } }` and inject behavior. The two public methods become 5-10 lines of config + a call to the helper.
- Same rule for event listeners: factory function (`registerXListener(cfg)`) over copy-pasted `events.on(...)` blocks.
- Same rule for inline parse helpers: when you find yourself writing `(process.env.X || "").split(",").map(s => s.trim()).filter(Boolean)` in 3+ places, extract a util module — even if it's only ~10 lines.

## Code Style — Iteration & Collections

- Prefer pipeline functions (`map`, `filter`, `reduce`, `find`, `some`, `every`, `flatMap`, etc.) over `for` / `for-in` / `while` loops for transforming or querying collections.
- Acceptable exceptions where imperative iteration is preferred:
  - **Side effects only** (logging, mutating external state, dispatching events) — use `forEach` or `for...of`, not classic `for (let i = 0; ...)` indices.
  - **Async work with sequencing** (each iteration must `await` before the next) — use `for...of` with `await`. Never use `forEach` with `async` callbacks.
  - **Early exit** when `some` / `every` / `find` does not express the intent clearly (rare).
  - **Hot paths** with measured perf wins from manual indexing — must be justified with a benchmark, not a guess.
- Keep pipeline callbacks pure: do not mutate the source array inside `map` / `filter` / `reduce`.
- If a chain becomes hard to read (3+ steps with non-trivial logic), extract intermediate stages to named variables instead of forcing a one-liner.

---

## Release Safety Rules

### 1. Backend Backward Compatibility

Every backend release MUST be compatible with both the current production app version and the new app version. There is always a gap between backend deployment and app rollout — the current app must keep working during that gap.

**Database changes:**
- Only additive migrations per release (add columns, add tables)
- NEVER rename or drop columns in the same release as the feature using them
- Sequence: add column → update reads/writes → remove old column in a later release

**API changes:**
- Preserve existing API contracts (fields, response shapes, endpoints)
- Do not remove or break old fields/endpoints until the old app version is fully deprecated

**Code requirement:**
When introducing backward-compatible logic, add a comment that explains:
- Why the change is needed
- Which app versions are affected
- When the old logic or fields can be safely removed

### 2. Test Current App Against New Backend

Before every release — including force-update releases — QA must verify that the current production app version works correctly against the new backend.

- Run all critical user flows with the current app version pointed at the new backend
- If any critical flow fails: **block the release**, fix the backend, and re-test
- No exceptions

### 3. Rollback Plan

Every release requires a documented rollback plan before it ships.

The plan must answer:
- Can the previous backend version be redeployed safely?
- If not, what is the forward-fix strategy?
- Who is the rollback owner (who has authority to trigger it)?
- What are the rollback conditions (error rate threshold, critical failure types)?

Do not release if any of the above is undefined.

### 4. Core Principle

> A backend release is only valid if the current production app continues to work after it deploys.

Any change that breaks the current app version is an **invalid release**, regardless of whether a force update is planned.

### 5. Config & Data Readiness

- NEVER assume staging DB, config, or seed data matches production — verify explicitly
- Validate all critical config at startup; fail fast if missing or invalid — no silent fallbacks
- Treat code readiness, DB migration readiness, and config readiness as **three separate release checks**
- Explicitly verify partner settings, category mappings, plan settings, and other business config before release
- Keep a golden staging/UAT dataset covering critical flows and known edge cases
- Do not rely on staging-only assumptions or seed data in production code paths

### 6. Feature Flags & Observability

- Use feature flags for high-risk business logic changes — do not gate on `NODE_ENV`
- Add logs and alerts on every critical rule branch, fallback path, missing config, and unexpected behavior
- Post-release verification is mandatory for critical flows — run smoke tests before **and** after production release

### 7. Code Comment Policy

Add code comments **only** when needed for:
- Backward compatibility (explain affected versions and when it can be removed)
- Migration safety (explain what state the DB must be in)
- Release safety (explain the deploy order requirement)
- Temporary transition logic (add a `TODO: remove after <version>` marker)

---

## Config & Environment Rules

- NEVER hardcode config values; always read from environment variables
- ALWAYS add new env vars to `.env.example` with a descriptive placeholder value in the same PR/commit
- When adding a new env var, also add it to the config validation schema (Joi/Zod) — app must fail to boot if the env var is missing
- NEVER use `process.env.X` directly in business logic; always go through the config service

## Database & Migration Rules

- NEVER alter database schema manually — always generate a migration file
- Migration files are IMMUTABLE once merged to main; create a new one to fix, never edit an existing migration
- Every migration MUST be reversible — implement both `up` and `down`
- After generating a migration, verify it runs clean on a fresh DB before committing
- NEVER seed production-specific data inside migration files; use dedicated seed scripts
- Push row filters into the SQL WHERE — never fetch broadly and post-filter in application code (`rows.filter(...)` on a status/type/date condition the DB could evaluate). If the repository helper can't express the condition, extend the helper with an optional query/selector param; don't work around it in the service layer.

## Anti-patterns to Avoid

- NEVER use `if (process.env.NODE_ENV === 'production')` to gate business logic — use explicit feature flags or config values instead
- NEVER assume a third-party service is available without a health/readiness check
- NEVER use `any` type on config or DTO objects that map to external data sources
- When adding a new external integration, always add a corresponding config key with a clear staging-safe default

## Testing Rules

- Every new API endpoint MUST have at least one e2e test covering the happy path
- Critical flows (auth, payment, lease signing) require both happy path and error path e2e tests
- When fixing a bug caused by a staging/prod config mismatch, add a test that would have caught it

### HTTP-layer testing rule

- All tests for HTTP services MUST go through the HTTP layer using `supertest` (or the project's equivalent route harness).
- Never test by calling controller, DTO, or service methods directly if the behavior can be exercised through a real endpoint.
- Use the actual route path and real HTTP requests; mock repositories and external dependencies behind the HTTP app as needed.
- Do NOT add separate unit tests for DTOs / controllers / builders / extractors / handlers when one supertest case already pins the same contract — they are redundant. Replace direct unit tests with HTTP-layer coverage.
- For non-HTTP projects (CLI, library, worker), apply the same principle at the outermost integration boundary: test through the public entrypoint (CLI invocation, exported API, queue message), not the internals.
- Pin the smallest set that proves the contract: validation rejects, success path emits/responds correctly, regression case for the original bug, key edge cases. Skip `test.each` matrices and ceremony around helpers unless the user explicitly asks.
- If the behavior cannot be exercised through the HTTP layer (e.g. logic inside a mocked service, validator, or helper that the route never reaches), do NOT fall back to a direct unit test — **skip the test entirely**. The HTTP-layer rule is absolute: "untestable through HTTP" means "untested", not "unit-tested as a workaround". Examples of forbidden tests: `tests/validators/**/*.test.js`, `tests/services/**/*.test.js`, `tests/utils/**/*.test.js` that bypass the route harness.

## Null Fields After Migration

When API response fields appear as `null` for a specific record type, **check whether the migration that adds those columns has actually been applied** before assuming the data was never saved.

Root cause pattern: a new nullable column is added via migration, but the migration hasn't run on the environment being tested. JavaScript's `undefined != null` evaluates to `false` (loose equality), so an absent column (`undefined`) looks identical to a null column in conditional guards like `ctx.doc.field != null ? ... : null` — both silently return `null`. The bug is invisible until you inspect the DB schema.

**Rule:** Before testing or debugging any feature that reads new DB columns, run `pnpm migration:run` (or equivalent) on the local DB first. If response fields are unexpectedly null, check `SHOW COLUMNS FROM <table>` before investigating code or data.

**Before concluding there is a deployment or CI bug**, verify whether the migration file itself has actually been merged to a deployed branch. Run `git log origin/rc..HEAD --oneline` (or equivalent base branch) — if the migration commit appears there, the columns are absent simply because the PR hasn't merged yet, not because of a pipeline failure. Do not add CI steps or deployment changes to fix a missing migration that is still on a feature branch.

## Release Readiness

Before considering any feature "done", verify:
1. All env vars used are declared in `.env.example` and validated in config schema
2. All DB changes have migration files that run successfully on a clean DB
3. No logic branches on `NODE_ENV` directly
4. A smoke test or e2e test exists for the primary user-facing flow of the feature
5. Pending migrations have been applied on the local DB before testing schema-dependent features

## Pre-PR Checklist

Before finishing any task, confirm:
- No new env var added without updating `.env.example` and config schema
- No schema change without a corresponding migration file
- No existing migration file was edited after being committed
- Integration points (external services, queues, storage) are config-driven, not hardcoded

## Post-PR / Post-Merge Follow-up

After creating a PR/MR, keep ownership of the change until it is verified in the target environment.

- Immediately after opening a PR/MR, draft a ready-to-paste Slack message inviting the team to review: in English, short — the PR link plus one or two lines of context (what it changes, why, any urgency). No headers, no emoji walls, no long bullet lists.
- Monitor the PR/MR checks and review status after opening it.
- If CI fails, inspect the failing job, fix the issue on the same branch, push the update, and continue monitoring.
- After the PR/MR is merged, verify that the fix is actually present in the target branch and deployed environment:
  - For RC-targeted work, verify the behavior on RC after merge/deploy.
  - For production-targeted work, verify the behavior in production after release/deploy.
- Do not assume merge means fixed. Confirm the user-facing behavior or API response that motivated the change.
- If verification is blocked by authentication, permissions, missing test data, or business workflow access, stop and ask the user for the specific test account, role, tenant/company, listing ID, or setup needed to continue.
- Never request or store production secrets unnecessarily. Prefer staging/RC test accounts and approved access paths, and never commit credentials or log sensitive account details.
- Report the final verification result back to the user with the environment checked, evidence gathered, and any remaining limitation.

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture / trace questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore` for the source of the symbols it surfaces. Codegraph IS the pre-built index, so spawning a separate file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did and costs more for the same answer.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep — that's slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster and returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** when you just want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` call returns several symbols' source grouped in a single capped call, while each separate node/Read call re-reads the whole context and costs far more.
- **Index lag**: the file watcher debounces ~500ms behind writes; don't re-query immediately after editing a file in the same turn.

### If `.codegraph/` doesn't exist

The MCP server returns "not initialized." Ask the user: *"I notice this project doesn't have CodeGraph initialized. Want me to run `codegraph init -i` to build the index?"*
<!-- CODEGRAPH_END -->

## Skills (Repeatable Workflows)

Project skills live in `docs/skills/`. Each file documents a repeatable workflow for both humans and AI assistants.

### Before starting any task
Scan `docs/skills/` for relevant skills (filenames are verb-led; descriptions are in frontmatter). If a matching skill exists, follow it and treat it as authoritative. If it's incomplete or wrong for the current case, update it in place — do not improvise around it.

### After completing any task
If the workflow is likely to repeat, create or update the corresponding skill in `docs/skills/<kebab-case-name>.md` — do not ask for permission, just do it. End your response with one line:

  ✏️ Skill <created|updated>: docs/skills/<filename>.md — <one-line reason>

**Signals to skill it:**
- Hit a non-obvious gotcha (env mismatch, hidden dependency, undocumented step)
- Ran a multi-step sequence to set up, debug, deploy, or migrate
- Answered "how do I X here" by tracing through several files
- A teammate is likely to ask the same question later

**Scope: generalize before writing.** A skill must cover the *class* of problems, not the single incident that triggered it. Before writing, ask: "what is the general workflow this incident is one instance of?" — and write THAT. Parameterize the incident-specific parts (the specific package, workflow file, error code, branch) into steps that work for the whole class; keep concrete values only as examples inside the steps.
- Bad (incident-scoped): `fix-github-packages-401-in-ci.md` — one package, one workflow, one status code
- Good (class-scoped): `fix-ci-package-registry-auth.md` — any registry auth failure (401/403), any workflow, any repo
- If the generalized version would duplicate an existing skill, update that skill instead.

**No trash skills — skip when in doubt.** Skip skill creation when: the task is genuinely one-off (exploratory questions, throwaway scripts, trivial edits); the workflow is already adequately covered by code comments, existing docs, or an existing skill; the fix is a single obvious change anyone would find from the error message alone; or the knowledge will be stale within weeks (tied to a temporary state, a single ticket, or one secret's current value). A skill that will never be opened again is noise that buries the useful ones — when unsure whether it clears the bar, don't create it.

**"General" is necessary but NOT sufficient — the skill must also be project-specific AND non-obvious.** Do NOT write a skill that merely restates standard framework/library/language behavior (anything a competent dev knows from the framework docs, or that the error message alone would reveal), or that duplicates something already stated in a CLAUDE.md / AGENTS.md. Before writing, ask: "Would a competent dev already know this from the framework docs or the error?" If yes → it's trash, don't write it; at most link or extend an existing doc. (Real miss to avoid repeating: a skill documenting "Next.js basePath applies to `<Link>`/router but not raw `<a>`" — generic Next knowledge, already implied by the existing "mind Next basePath like /app" rule. Deleted as rác.)

### File template
Every skill file must follow this exact structure:

    ---
    name: <skill-name>
    description: <one line — when to use this>
    last-updated: YYYY-MM-DD
    ---

    ## When to use
    <one paragraph — the trigger condition, including phrases the AI or a user might say>

    ## Steps
    1. ...

    ## Verification
    <how to confirm it worked — a command + expected output, a file that should now exist, an HTTP status, etc.>

    ## Related (optional)
    - [other-skill](./other-skill.md) — short reason for the link

### Naming
Short, verb-led, kebab-case. Examples: `setup-local-dev.md`, `run-migrations.md`, `debug-failing-tests.md`, `add-env-var.md`. Bad: `notes.md`, `misc.md`, `useful.md`.

### Quality bar
- Steps must be specific enough for a fresh assistant or new teammate to execute without context. Replace "configure the env" with the exact env var name and an example value.
- Verification must be observable, not "looks good". Prefer a command + expected output over prose.
- One skill = one workflow. If you have two sets of steps in one file, split.
- Broad scope, concrete steps: the *trigger* and *steps* generalize to the whole problem class; the *examples* inside steps stay concrete (real commands, real file paths, real error strings from the incident).

### Updating existing skills
If you find a new gotcha or a step changes, update the existing skill in place — do not create a near-duplicate. Bump `last-updated` to today's date. If the workflow is fully superseded (tool replaced, approach abandoned), delete the file in the same commit and link the replacement from any related skill's `Related` section.

### When the project has no `docs/skills/` yet
First time you'd write a skill in a repo that doesn't have the folder: create `docs/skills/` and a minimal `README.md` pointing back to this rule, then add the first skill. Don't skip just because the folder is missing.
