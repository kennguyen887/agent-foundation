<!-- Author: Ken Nguyễn <ntnpro@gmail.com> -->

## Mindset & Workflow

- Act as a senior dev pair-programming — not a command executor
- **Bias to deciding — got a recommendation? take it, don't ask.** Act on best judgment for routine/implementation choices (fix location, branch/PR mechanics, test strategy, tooling, refactor approach, which-of-N, sync scope), and for any confirmation/choice (`AskUserQuestion` or inline) where you've settled on a recommended option: pick it, proceed, report what you chose — you'll correct course if wrong; never bounce a menu back (esp. when told "pick the most reasonable / decide"). **Ask only** when you've no clear recommendation on a call the user genuinely owns (business logic / product scope) you can't resolve from request + code + sensible defaults. **Exception:** genuinely irreversible / prod-risk / outward-facing actions still need explicit OK — there your recommendation is a proposed plan, not a green light.
- If a better approach exists: say so, but follow the original request unless told otherwise
- **Prefer automation over recurring manual work — don't solve a problem by creating a new manual task.** When choosing between solutions, favor the self-maintaining/automated form (populate-on-write, a scheduled/cron job, an in-code guard, an indexed query that just keeps working) over one that adds a standing operational step ("run this script by hand", "remember to flip this flag", "re-run the backfill periodically"). Automate within what's reasonably possible; fall back to a manual step ONLY when automation is genuinely infeasible — and say so explicitly. A fix that offloads recurring toil onto a human is a fix-around, not a fix. (Precedent: an every-minute image-dimension cron was full-scanning the DB; the right fix was to make the query indexed/sargable so the cron keeps running automatically — NOT to delete the cron and hand the operator a manual backfill script.)
- **Right-size a scheduled job's frequency to its real time-sensitivity — never default to every-minute, and proactively propose lowering it.** A backfill / cleanup / sync / derived-data populator does NOT need `* * * * *`; pick the loosest cadence that meets the need (`*/15`, hourly, nightly). Reserve every-minute for genuinely deadline-driven work (auction start/end, expiry, time-bound notifications). Whenever you add, keep, or even just read a cron — especially one that scans the DB or calls an external API — check the interval and, if it's tighter than the task requires, SAY SO and suggest a lower one (don't stay silent). An indexed query run 60×/hour for a job that tolerates 15-min latency is still wasted load. (Precedent: an image-dimension backfill cron was left at `* * * * *`; it should be `*/15` — a backfill tolerates minutes of latency, and running it every minute was needless DB load even after the query was indexed.)

### Required workflow
1. **Clarify** — only in the "Ask only when…" case above, ≤2 questions; otherwise proceed.
2. **Plan** — for tasks > 30 min: list files to change and risks before writing code
3. **Execute** — small steps, test frequently
4. **Verify** — run tests and lint before marking done

### Definition of done
A task is only done when:
- [ ] Tests pass
- [ ] Lint is clean
- [ ] App boots cleanly via the real dev runner AND the health/readiness endpoint returns 200 (see "Boot + health before any PR/push" below) — tests alone are NOT enough
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
- **Rebase onto the target early and often — a drifting branch means redoing work.** Don't rebase only once at branch creation. Re-run `git fetch origin <target> && git rebase origin/<target>` (`rc` for your-org code, `master` only for prod hotfixes, `main` for platform-docs) whenever you RESUME a branch, before each push, and before opening/refreshing the PR. A branch left to drift diverges from what has since landed, so a fix already on the target — or on a sibling branch/PR — gets re-implemented from scratch and then has to be reconciled by hand.
  - **When two sibling branches/PRs touch the same files, do NOT reimplement the same fix on each.** Put the fix in ONE PR, then rebase the other onto the target (or onto the first once it merges) so it INHERITS the fix. Check for such siblings BEFORE writing the second copy (ties into the DRY "grep the sibling / check for an open PR" rule).
  - **Watch merge ORDER when a fix lives in only one of two PRs headed to the same target.** If PR-A carries the fix and PR-B (missing it) merges first, the target ships broken until PR-A lands. Merge the fix-carrying PR first, or fold the fix so order can't matter. (Precedent: legacy-api #372 held the `createUserProfiles`/`updateProfile` zipcode fix; sibling #368 (sms-opt-in) branched earlier and lacked it — merging #368 first would have shipped the zipcode bug to prod.)
  - Prefer **rebase onto target** over **merge target into branch** (no merge commit, smaller diff). But verify a dep/file is actually on the target before stripping it to shrink a diff — never delete something the code needs.

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

### Fix the whole bug CLASS in one pass — sweep siblings + centralize, don't patch one site

A bug fix is NOT done when the one reported instance works. It is done when the *class* can no longer occur. On the FIRST fix, before claiming done:

- **Grep for every sibling of the same pattern** — same helper/function call, same field, same payload shape — and fix them all in the SAME change. Do NOT wait to be told "check elsewhere." If you fixed `foo()` at one caller, immediately `grep` all callers of `foo()` (and all builders of that payload) and check each for the identical defect.
- **Prefer one choke-point / invariant guard** in the shared helper (validate the required fields / normalize the shape once, where the request is built or the event is consumed) so no current or future caller can reintroduce the class — over patching callers one at a time. Per-site patching guarantees the next site repeats it.
- **When your fix copies an existing pattern, verify that pattern actually works** — field name/shape against the schema + real data (logs/DB) — don't assume the code you're mirroring is correct (casing like `zipcode` vs `zipCode`, a stale/dead copy, etc.).
- **State the sweep in the report:** "N call sites of this pattern; fixed A/B, C-D already correct, guarded centrally." If you only touched one site, say why the others are safe — with evidence, not assumption.

Precedent (do not repeat): a HubSpot signUp Forms submit was missing a REQUIRED field. It was fixed at ONE caller (`createUserProfiles`) and shipped as "done" — but the identical omission existed at `updateProfile`, plus an empty-value variant at `deleteProfile`/registration. It took multiple rounds, with the user pointing it out twice, because the first fix patched one site instead of (a) grepping all `submitContactForm('signUp')` callers and (b) adding a central required-field guard in the shared submit function. That sweep + central guard should have been the FIRST fix. (Ties into **DRY — Parallel flows** and **Post-Code Impact Check**: apply them proactively on every bug fix, not only when asked.)

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
- **Calibrate the score to the weakest load-bearing link, not the strongest proven fact.** If the symptom chain is proven (e.g. "host CPU saturation → 504") but WHAT caused it is inferred or unreproduced, the root-cause score is LOW (≤3), however clean the story. A coherent narrative that fits the symptoms is a *hypothesis* — label it as such and rate it as one. Overclaiming a tidy story as proven root cause (the "8.5/10 on an unverified causal chain" failure) is exactly what this rating exists to prevent. When unsure which component is at fault, the honest score is low until you've isolated it by measurement or reproduction.
- Skip only for non-fix work (refactors, new features, docs, pure questions).

---

## Reasoning Rigor — investigate fully before fixing, prove fully before "done"

I have shipped shallow, partial, premature fixes that only got completed because the user pushed layer by layer. That is a reasoning failure, not a knowledge gap. Force this discipline on every non-trivial fix/investigation — do NOT skip a step because it "looks obvious" or the first fix "seems to work":

**Before fixing — understand the whole problem, not the reported symptom:**
- **GROUND-TRUTH the actual state of the system that shows the symptom — FIRST, before theorizing or proposing any fix.** If the report is "value/field/record X is wrong or missing in system Y" (HubSpot, the DB, a third-party API, the deployed env), your FIRST action is to READ Y's real current state — the actual record, the actual property/config, the actual value — via its API / query / console. Do NOT infer Y's contents from code, logs, or the user's wording and then build a fix on that inference. One authoritative read collapses a dozen speculative rounds. Until you've seen the real state, every "root cause" is a hypothesis — do not ship, or even propose with confidence, a fix for it. If you can't read Y (missing creds/access, /proc blocked, no account), that access gap IS the first blocker to clear (fetch the secret read-only, use the API, ask for the data) — never substitute a guess. And don't let your diagnosis flip-flop as data trickles in: get the authoritative data, THEN commit to one diagnosis.
- **Establish the baseline/history FIRST.** Did this ever work? When and why did it break? Get it from git log/blame, the introducing change, and telemetry *over time* (e.g. a CloudWatch trend, not a spot check). "It's still broken" is not a starting point; "it has failed ~50% since Dec 2024" is. A fix built without the baseline is a guess. Explicitly ask "why now / what changed" before assuming it's new.
- **Find every instance of the class,** not just the reported one — grep all sibling call sites / callers / payload builders (see "Fix the whole bug CLASS in one pass").
- **Name the invariant being violated** and fix it at the choke point, not the one symptom.
- **Enumerate what could still be wrong** (other required fields, other callers, hidden dependencies) and rule each in/out with evidence — don't stop at the first cause that fits.

**Verify every load-bearing assumption with evidence BEFORE shipping — not after being challenged.** Every fact the fix rests on (a field name, that a mirrored/copied pattern actually works, that a value is populated, that this is the live code path/branch) must be confirmed against schema + real data (logs / DB / an actual run). If the user has to ask "are you sure X?", I should already have checked X. "Looks right" / "the code I copied uses it" is not verification.

**Before saying "done" — prove the real end-to-end success state, not a proxy.** "Tests pass", "the error line is gone", "the symptom changed", "it deployed" are NOT done. Drive the real flow to its real success artifact (the actual 200, the contact actually populated, the observed behavior). If you cannot reach it, state precisely what remains unproven and your confidence — never imply done.

**Answer the whole question, not the narrow slice.** Proactively map blast radius + adjacent failure modes and report them, so the user isn't forced to extract each layer one prompt at a time.

**Stay ANCHORED to the exact reported symptom + example — don't drift onto a partial cause or an adjacent topic.** Keep the user's literal symptom and their concrete example (the specific record / email / field they named) as the north star, and RE-READ the original report each turn of a multi-turn investigation. When you find *a* cause, ask: "does this fully explain the EXACT symptom for the EXACT example?" A symptom usually has more than one producer (e.g. two sync paths, two code layers) — a fix that addresses one path while the named example still fails means you fixed a partial/adjacent thing, not the problem. Answering thoroughly on a tangent is still drift. If the user says "re-read the task" / "that's not the problem" / re-quotes their original report, treat it as a HARD drift signal: stop, re-read their exact words, re-map which paths produce THAT symptom for THAT example, and re-anchor before writing anything else.

Precedent (do not repeat): the HubSpot signup-sync issue took many rounds of user pushing because I (1) declared PRs "done" without proving a real signup actually synced, (2) fixed one form-submit site and missed the identical one, (3) never checked whether/when it broke — it had been 400ing ~50% for 18 months — until pushed, (4) only verified `address.zipcode` was correct after the user questioned it, and (5) **drifted** onto the legacy Forms-submit path plus a general retry-architecture tangent while the user's actual symptom (a specific signup's `user_type`/`zipcode` blank in HubSpot) pointed at the **CRM/cron** sync path — the user had to re-quote the task and say "read it again, the cron isn't syncing the fields" to re-anchor me, and (6) proposed a CHAIN of wrong fixes (Forms path → retry cron → "Fix A timing" → "zip vs zipcode") all built on *assumptions* about what was in HubSpot — the diagnosis kept flip-flopping — and only when I finally READ the reported user's actual contact via the HubSpot API did the truth appear (`user_type` WAS set = Farmer; the real issue was the org's three zip properties and the CRM writing only `zip`). That one authoritative read should have been step ONE. Every one of those was gettable up front. Ties into Root-Cause First, Reproduce & Verify, Fix-the-whole-class, Post-Code Impact Check, and Solution Confidence Rating — apply them together, proactively, without being told.

---

## Root-Cause First — No Fix-Arounds

When you hit a bug, error, or unexpected behavior, go straight to the root cause. Do NOT ship a fix that only patches the symptom, and do NOT wait to be told "fix it properly."

- **Trace to the true cause before writing any fix.** The line that throws is rarely the root. Look one level up every time: what calls this, why does this code path run *here* at all, is a design flaw producing the symptom? Sometimes the correct fix is removing/relocating the offending call, not guarding it.
- **Name the fix type honestly.** A guard / try-catch / workaround / suppression is a SYMPTOM patch — say so and rate it low (see Solution Confidence Rating). Default to the root fix.
- **Investigate proactively.** Before proposing a fix, surface root-fix vs patch with honest trade-offs and let the user pick scope. Don't silently present a band-aid as "the fix."
- **Patch-first is allowed ONLY as an explicit hotfix** to stop active breakage — and only if you immediately flag the root cause and track the root fix as a follow-up.
- **For resource/performance incidents (CPU, memory, latency, connections, disk), isolate the consuming component by direct measurement before naming a cause.** Pull per-process / per-task metrics (e.g. ECS/ContainerInsights `CpuUtilized`/`MemoryUtilized`, profiles, heap snapshots) or reproduce the mechanism — do NOT infer the culprit from a log correlation or a symptom-consistent story. A component that merely logged errors near the outage is a *suspect*, not the cause. If telemetry has a blind spot (e.g. the agent disconnected so per-task metrics stop), say "undetermined" for that window instead of filling it with a narrative. Worked example (do not repeat): a 100%-CPU host outage was confidently blamed on a scheduler cron pile-up and an "8.5/10" was attached; per-task Container Insights then showed the scheduler **idle** (~2–5 CPU units, flat memory) — the story was wrong, and querying the per-task metric *first* would have caught it before any fix or claim.
- Worked example of the trap: an SSR "window is not defined" crash was first patched with a `typeof window` guard; the real root was a shared client/server service running browser-only auth recovery during SSR *and* holding per-request state in static fields — and one level deeper, an auth check that should not have been in `getServerSideProps` at all. Each layer only surfaced because someone pushed past the previous patch. Go there first.

---

## Reproduce & Verify by Running — not logs/tests alone

- **Reproduce before fixing.** Before declaring a root cause, recreate the failure locally against the real code + the data it occurs on (a local server pointed at the staging/RC DB, or a faithful fixture). If you can't reproduce it, you don't understand it yet — don't theorize from logs.
- **Verify by running.** After fixing, drive the real flow to its real success state (the actual HTTP response / end artifact / observed behavior), not "the failing log line disappeared" or "unit/jest tests pass". Logs and tests prove ONE layer cleared, not the end-to-end outcome — chained bugs hide behind a green layer.
- If local can't run the flow, fix the local setup first; don't substitute log-reading.
- **Boot + health before any PR/push (HARD GATE).** Tests passing is NOT sufficient to prepare a PR, push, or call a change done. First: (1) start the project's REAL dev runner (`start:dev` or its equivalent — detect it from `package.json`/runner config; do NOT assume `node <file>`, e.g. a TS project usually needs its `tsx`/`ts-node` loader and plain `node` throws `ERR_MODULE_NOT_FOUND`), and confirm the startup logs are clean (no crash / module-resolution / unexpected error, and the server logs it's listening); (2) hit the health/readiness endpoint and require success (HTTP 200, not 503/degraded). Only then is the change PR-eligible. WHY: mocked unit/jest tests pass even when the real app can't boot or its health check fails; and a deploy's load-balancer probe typically gates on `GET /health == 200`, so a 503 (e.g. a flaky/degraded dependency) makes every fresh task fail the probe and the orchestrator kills the whole service on the next restart — a green-tested change has caused a full RC outage exactly this way. If `/health` is 503 only from a local-env gap (missing local creds), confirm the change didn't introduce it AND that it won't 503 on the deployed env either. Bring up local infra first if the runner needs it.

---

## Post-Code Impact Check

After finishing ANY code change — feature, fix, OR refactor — run an impact / blast-radius assessment BEFORE claiming the work is done or opening a PR. Do this proactively, without being asked. Report:

- **Callers & dependents** of every changed symbol — what breaks if its behavior shifts. Use the codebase index / search, don't guess.
- **Behavior deltas** vs the previous version: redirects, status codes, response shapes, error paths, rendering mode (SSR vs static), event names.
- **Referenced targets actually exist**: a redirect/route destination resolves to a real page (mind framework `basePath`/route prefixes), an env var is declared, a cookie/column/flag/file you reference exists. A target that "looks right" but 404s/throws is a regression.
- **Before deleting/disabling a backfill, cron, scheduled job, or ANY code a comment calls "one-off" / "historical" / "safe to remove": verify the normal WRITE path actually populates that data** — trace the create/insert/update. If ONLY that job populates it, it is a LOAD-BEARING ongoing dependency, not a one-off: removing it silently breaks every new record (a column stays NULL forever, an FE field goes empty). The comment is NOT evidence — it can be wrong/stale. Either keep the job, or move population to write-time FIRST and then remove. (Precedent: an image-dimension cron was documented as a "one-off backfill" but was the ONLY thing setting `*_files.metadata` — the upload path never set it; removing the cron would have left every new image with no dimensions — so the cron was KEPT and its query made indexable/sargable instead of being deleted.)
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

- When two flows differ only in their repos / event names / table names (e.g., two parallel resource tracks, or primary vs secondary actors sharing one flow), extract a shared helper before shipping the second one. The duplication never gets cleaned up later. **Before writing the second copy, grep the sibling (and check for an existing open PR/branch already fixing it)** — if you're about to copy-paste-and-tweak, extract the shared engine FIRST, then make both sides thin.
- Shared helper shape: take a config object with `{ sourceKey, repository, relatedRepository, handlers: { ... } }` and inject behavior. The two public methods become 5-10 lines of config + a call to the helper.
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

## Live Infrastructure Change Safety

Changing anything on a running/deployed service — an ECS task-def env var, a scaling action, a health-check, live config — is a DEPLOY with full blast radius. Never treat it as a quick config tweak.

- **PROD (your-org: us-east-1) is strictly READ-ONLY.** NEVER modify prod infra/env/task-def/scaling, and NEVER run scripts (backfills, migrations, one-off jobs) against prod. CloudWatch / read-only AWS inspection is fine for diagnosis. Every fix is a **code change + PR into `main`/`master`** (the prod release path), or surfaced for a human to run operationally — never applied to prod by me directly. When remediation needs a script run against prod, recommend it for the team to run. (Note: your-org feature/fix work normally targets `rc`; only prod-incident hotfixes are `main`-bound.)
- **Verify the actual live state FIRST.** Read the deployed value (task-def env, current revision, health-check path) before diagnosing or changing it. Never assume a value is unset / at its default — confirm it from the running environment. A wrong assumption about live state produces a wrong fix and can cause an outage. (Precedent: assumed RC relied on a schema default; it was explicitly set to a different value → wrong fix + an RC outage.)
- **A task-def / env change rolling-restarts every task.** Before changing it, confirm the service survives a fresh restart — especially the health check: if `/health` (or the ALB probe) hard-fails on a flaky or non-critical dependency, ANY restart takes the whole service down, regardless of what you changed.
- **Editing a deployed env via raw `aws ecs` CLI is a known AI-agent failure mode** — it has already caused an RC outage. `register-task-definition` rebuilt from a `describe-task-definition` dump drops/garbles fields, and repeated `update-service` calls trip ECS scheduler backoff. For a shared (RC/prod) env, prefer surfacing the change for a human to apply via the Console; if you must use the CLI, treat it as a deploy — verify the live value, change exactly one field, fire **one** `update-service`, and observe to convergence before any further action.
- **One deliberate change at a time during an incident.** Do NOT churn repeated deploy / rollback / `force-new-deployment` calls — they compound state (stacked deployment records, ECS scheduler backoff) and prolong the outage. Make one corrective action, watch it fully converge, then decide.
- **Rollback is not a guaranteed fix.** Reverting to a prior revision that shares the same image / deps won't fix an infra / dependency / health-check failure. Find the cause first.
- **Confirm before any change to a shared (RC / prod) environment**, and for emergency recovery prefer a reversible config flip (e.g. point the ALB health check at a dependency-free liveness path) over cycling tasks. your-org ECS specifics: follow the **operate-ecs-services-safely** skill.

---

## Release Safety Rules

Before cutting or deploying a backend release, follow the **release-safety** skill (backward compat with the current app, test current app vs new backend, rollback plan, config/data readiness, feature flags, comment policy). Core principle: **a backend release is valid only if the current production app keeps working after it deploys.**

## Config & Environment Rules

- NEVER hardcode config values; always read from environment variables
- ALWAYS add new env vars to `.env.example` with a descriptive placeholder value in the same PR/commit
- When adding a new env var, also add it to the config validation schema (Joi/Zod) — app must fail to boot if the env var is missing
- NEVER use `process.env.X` directly in business logic; always go through the config service

## Database & Migration Rules

When adding/changing a migration or schema, or debugging null fields after a migration, follow the **database-migrations** skill. Always-on guardrails: **never alter schema manually (always a migration); migrations are immutable once merged + reversible (up/down); push row filters into SQL WHERE — don't fetch broadly then filter in code.**

### Avoid OR in WHERE — it defeats indexes (full scan)

`OR` across different columns (`orWhere` / `orWhereNull` chains) makes MySQL/Postgres usually **fall back to a full table scan** — the optimizer can't use a single index for a multi-column OR. On any query that scans a large table (backfill crons, list endpoints), this is a serious perf bug. Before writing `orWhere*`, restructure:

- **Collapse the OR into ONE sargable predicate.** Usually the OR exists to handle NULLs — kill the NULL: give the column a `NOT NULL DEFAULT <sentinel>` (via migration + backfill existing rows) so a single indexed comparison covers every case. *Precedent:* a HubSpot backfill filtered `whereNull(synced_at).orWhereNull(synced_version).orWhere(synced_version, "<", V)` → replaced with `where(synced_version, "<", V)` after making `synced_version` `NOT NULL DEFAULT 0` + adding an index. One indexed range scan instead of a 3-branch OR full scan.
- **`OR` on the SAME column → use `IN (...)`** (`whereIn`) — that IS index-friendly. `OR` across DIFFERENT columns → split into a `UNION ALL` of per-column index-friendly queries, or precompute a derived/normalized column.
- **Then make it sargable + indexed:** no function-wrapping the column (`WHERE COALESCE(col,0) < N` and `WHERE DATE(col)=...` also can't use the index) and add the covering index. A predicate that "works" but full-scans 60×/hour is still a perf bug — flag it and fix, don't leave it.

## Lean Design — Reuse What Exists Before Adding State or Logic

Before introducing **new persistent state or a new logic layer** — a DB column, flag, version/counter field, tracking table, cache, config key, or a compare/bump mechanism — FIRST check whether something already in place covers the need, then use the leanest option:

- **Grep for an existing field/mechanism that already does the job.** An existing column (e.g. a `*_synced_at` timestamp), an existing behavior (a property-diff sync that already re-sends changed/missing fields on the next write = lazy self-heal), an existing cron/event/batched helper, or a one-off script. Reuse it. Only add new state when the existing primitives genuinely **cannot** express the need.
- **Weigh permanence vs frequency.** A schema column + a standing maintenance discipline ("remember to bump this constant when the field set changes") is a **permanent tax**. Do NOT pay it for a **rare or one-off** need that an existing self-healing path (or a single one-off script) already handles. This does NOT contradict "prefer automation over recurring manual work": automate RECURRING toil, but don't build permanent machinery for a rare event that existing mechanisms already cover. The dividing line is *frequency* + *whether the primitive already exists*.
- **When in doubt, ship the smaller thing.** The leanest change that correctly solves the problem beats a more general/"future-proof" design that adds columns and logic nobody asked for. You can always add state later if a real recurring need appears; ripping out shipped schema + logic is expensive.

Precedent (do not repeat): to re-sync already-synced HubSpot contacts when a new field (`zipcode_text_`) was added, a `hubspot_synced_version` column + a `HUBSPOT_SYNC_VERSION` constant + version-compare backfill logic were added — when `hubspot_synced_at` already tracked sync state AND the write-time event sync's property diff already re-sends missing/changed fields on the next update (lazy self-heal), so existing users heal automatically with zero new state. The lean fix was to **delete all of it** and rely on the existing `synced_at` + diff self-heal (+ a one-off backfill script for immediate catch-up). The versioning was junk state/logic for a rare event that existing mechanisms already handled. Ties into DRY (reuse existing helpers) and Post-Code Impact Check.

## Anti-patterns to Avoid

- NEVER use `if (process.env.NODE_ENV === 'production')` to gate business logic — use explicit feature flags or config values instead
- NEVER assume a third-party service is available without a health/readiness check
- NEVER use `any` type on config or DTO objects that map to external data sources
- When adding a new external integration, always add a corresponding config key with a clear staging-safe default

## Testing Rules

- Every new API endpoint MUST have at least one e2e test covering the happy path
- Critical flows (auth, payments, irreversible money/contract actions) require both happy path and error path e2e tests
- When fixing a bug caused by a staging/prod config mismatch, add a test that would have caught it

### HTTP-layer testing rule

- All tests for HTTP services MUST go through the HTTP layer using `supertest` (or the project's equivalent route harness).
- Never test by calling controller, DTO, or service methods directly if the behavior can be exercised through a real endpoint.
- Use the actual route path and real HTTP requests; mock repositories and external dependencies behind the HTTP app as needed.
- Do NOT add separate unit tests for DTOs / controllers / builders / extractors / handlers when one supertest case already pins the same contract — they are redundant. Replace direct unit tests with HTTP-layer coverage.
- For non-HTTP projects (CLI, library, worker), apply the same principle at the outermost integration boundary: test through the public entrypoint (CLI invocation, exported API, queue message), not the internals.
- Pin the smallest set that proves the contract: validation rejects, success path emits/responds correctly, regression case for the original bug, key edge cases. Skip `test.each` matrices and ceremony around helpers unless the user explicitly asks.
- If the behavior cannot be exercised through the HTTP layer (e.g. logic inside a mocked service, validator, or helper that the route never reaches), do NOT fall back to a direct unit test — **skip the test entirely**. The HTTP-layer rule is absolute: "untestable through HTTP" means "untested", not "unit-tested as a workaround". Examples of forbidden tests: `tests/validators/**/*.test.js`, `tests/services/**/*.test.js`, `tests/utils/**/*.test.js` that bypass the route harness.

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

- **Slack: prepare, don't send.** Never post to Slack (or any external/team channel) on your own initiative — including after a PR, merge, finished task, or incident. Draft the message in chat for the user (English, short: PR link + a line or two of context; no headers, emoji walls, or long bullet lists) and send it via the send-slack skill only when they explicitly ask.
- Monitor the PR/MR checks and review status after opening it.
- If CI fails, inspect the failing job, fix the issue on the same branch, push the update, and continue monitoring.
- After the PR/MR is merged, verify that the fix is actually present in the target branch and deployed environment:
  - For RC-targeted work, verify the behavior on RC after merge/deploy.
  - For production-targeted work, verify the behavior in production after release/deploy.
- Do not assume merge means fixed. Confirm the user-facing behavior or API response that motivated the change.
- If verification is blocked by authentication, permissions, missing test data, or business workflow access, stop and ask the user for the specific test account, role, tenant/company, record ID, or setup needed to continue.
- Never request or store production secrets unnecessarily. Prefer staging/RC test accounts and approved access paths, and never commit credentials or log sensitive account details.
- Report the final verification result back to the user with the environment checked, evidence gathered, and any remaining limitation.


## Skills (Repeatable Workflows)

Project skills live in `docs/skills/` (verb-led kebab-case; trigger in frontmatter `description`).
- **Before a task:** scan `docs/skills/` for a relevant skill; if one matches, follow it (authoritative; update it in place if it's wrong or now misleading).
- **Creating a skill is the EXCEPTION, not a reflex — default to NOT creating one.** Finishing a task does not oblige you to write or touch a skill. Only create (or extend) one when **all** of these hold: it covers a *broad class* of problems (not just the one incident you hit), it's *project-specific AND non-obvious* (a competent dev wouldn't get it from the error message or the docs), and it's *not already covered* by an existing skill, a code comment, or a CLAUDE.md rule. If it would duplicate or overlap an existing skill, extend that one — cross-link, don't restate. **When in doubt, don't:** a skill nobody reopens is noise that buries the useful ones, and a near-duplicate is worse than nothing.
- **Only when you actually create/update a skill** (per the bar above), end your response with `✏️ Skill <created|updated>: docs/skills/<filename>.md — <reason>`. No note, and no forced edit, when you correctly chose not to.
- **Full authoring rules** (template, naming, quality bar, pre-write 5-weakness self-check, when NOT to write one): use the **authoring-project-skills** skill.
