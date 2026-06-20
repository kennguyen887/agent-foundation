---
name: code-conventions
description: Use when writing or reviewing code and you want the team's general engineering conventions — style guide & linter, naming case rules, file/function length, choosing the right array function, SOLID/KISS/SRP, magic numbers, casts & non-null assertions, conditionals, side effects, deep copy, and TypeScript-specific gotchas. Language-agnostic principles with TypeScript examples; pairs with structure-a-backend-service and write-service-code.
last-updated: 2026-06-20
---

## When to use

Reach for this when writing or reviewing **any** code and you want the cross-cutting quality
baseline. For *where files go* use [structure-a-backend-service](./structure-a-backend-service.md);
for *service-internal patterns* (queries, events, logging, tests) use
[write-service-code](./write-service-code.md). Anything already covered by the global engineering
rules (`rules/coding-guidelines.md`) or the two companion skills is **cross-referenced, not
repeated** here.

Each rule is a portable principle with a **▸ TS** example and **▸ Other stacks** note. The
TypeScript-only gotchas are isolated in the last section — skip them for non-TS repos.

## Steps

### 1. Style guide & linter

- **Follow the largest community style guide for the language** rather than inventing one. For
  JS/TS that's Airbnb (<https://github.com/airbnb/javascript>). Required read:
  clean-code-javascript (<https://github.com/ryanmcdermott/clean-code-javascript>); optional:
  clean-code-typescript (<https://github.com/labs42io/clean-code-typescript>).
- **Lint + format are enforced, not optional.** ▸ *TS:* ESLint `extends: ['airbnb-base',
  'prettier']`. Think **twice** before disabling a rule on an ad-hoc block; think **thrice** before
  disabling it project-wide — and leave a comment saying why. ▸ *Other stacks:* adopt the de-facto
  linter+formatter (ruff/black, gofmt + golangci-lint, ktlint, RuboCop) and treat disables the same.

### 2. Naming — case by role

| Role | Case | Example |
|---|---|---|
| File, folder, route | `kebab-case` | `your-file.service.ts`, `/listing-photos` |
| Class, module, enum, decorator | `PascalCase` | `ListingService`, `ListingStatus` |
| Variable, method, function | `camelCase` | `firstName`, `getListingDetail` |
| Constant | `SCREAMING_SNAKE_CASE` | `const DAYS_IN_WEEK = 7;` |

(File & class casing for the *layout* is also in structure-a-backend-service §3.) ▸ *Other stacks:*
keep the same role→case mapping; switch only where the language's community standard differs (Python
files & functions `snake_case`; Go exports `PascalCase`, locals `camelCase`).

### 3. Size limits

- **File ≤ ~500–600 lines; method/function ≤ ~20–30 lines.** Past that, split by responsibility.
  This puts concrete numbers on the global *Code Style — Function Size & Density* rule ("reads
  top-to-bottom in one screenful; split a method covering 3+ concerns"). ▸ *Other stacks:* same
  ceilings — a long file/function is a missing module/function.

### 4. Pick the array function that states intent

Reaching for a manual loop to transform a collection is the smell (pipeline-over-loops is the global
*Iteration & Collections* rule + [write-service-code](./write-service-code.md) §1). Choose by intent:

| Intent | Function |
|---|---|
| keep a subset | `filter` |
| transform each element | `map` |
| collapse to a single value | `reduce` |
| first element matching | `find` |
| does **any** match? | `some` |
| do **all** match? | `every` |
| map then flatten one level | `flatMap` |
| pure side effect, nothing else fits | `forEach` (last resort) |

▸ *Other stacks:* the equivalents (comprehensions, LINQ, Go slices helpers, Kotlin/Java streams).

### 5. Principles — SOLID, KISS, SRP

- **SOLID — single, clear responsibility.** Before adding code ask: *what is this responsible for,
  where does it belong, what does it do?* One reason to change per function/class/module.
- **KISS — simplest thing that works.** Prefer simple, reusable, readable, maintainable code; review
  your own diff before asking others to. Add a comment only where the code is genuinely non-obvious.
- **One responsibility per PR/MR too.** If a change does several unrelated things, split it into
  separate PRs — it reviews faster and reverts cleanly.
- *(Early-return and function size: [write-service-code](./write-service-code.md) §1 and the global
  density rule — not repeated here.)*

### 6. Traps to avoid

- **Magic numbers → name them.** `x = price * TAX_RATE`, not `x = price * 1.07`.
- **Negative conditionals → positive predicates.** Define `isOnline(...)`, not `isNotOnline(...)`;
  read it as `if (!isOnline(...))`. Double negatives are hard to reason about.
- **Side effects → pure functions.** A function should take its inputs and return its output, not
  mutate shared/global state. ▸ *Bad:* `toBase64()` reassigns a module-level `name`. ▸ *Good:*
  `toBase64(text): string` returns the encoded value and touches nothing else. (Same reason pipeline
  callbacks must stay pure.)
- **Deep-copy by value, not by alias.** When you must not mutate the source, take a real deep copy.
  ▸ *TS/JS:* `structuredClone(obj)` (not a shallow `{...obj}`/`Object.assign`, which still shares
  nested refs). ▸ *Other stacks:* the language's deep-copy (`copy.deepcopy`, value semantics, etc.).

### 7. TypeScript-specific gotchas (skip for non-TS repos)

- **No redundant casts or non-null assertions.** If the type is already narrowed (e.g. inside
  `typeof x === 'string'`), `x as string` / `x!` is noise that can hide real bugs. Let inference work.
  ```ts
  // Bad                                  // Good
  console.log('name: ' + name!);          console.log('name: ' + name);
  return (name as UserName).fullName;      return name.fullName;   // already narrowed
  ```
- **Don't append `!` to a value you already guarded**, and only use optional `?.`/`?` where the
  value can *truly* be absent — not everywhere "just in case". If you checked the array isn't empty,
  drop the `?` after it.
- **Stop using `{}` as a type.** `{}` means "any non-null value" — strings, numbers, arrays, dates
  all satisfy it, so it catches nothing. Use `Record<string, unknown>` (or `{ [k: string]: unknown }`)
  for an object bag.
  ```ts
  type Params = Record<string, unknown>;   // not: function f(p: {})
  ```

## Verification

- **Lint/format clean** under the community config (airbnb-base + prettier for TS); any inline
  disable carries a comment justifying it; no project-wide disables added casually.
- **Names match the case table**; no file > ~600 lines or method > ~30 lines without a reason.
- **No raw magic numbers**, no negative-named predicates, no helper mutating shared/global state.
- **(TS)** no `as`/`!` a guard already made redundant; no `{}` type; `?` only where a value can be
  absent.

## Related

- [structure-a-backend-service](./structure-a-backend-service.md) — folder/module/naming layout.
- [write-service-code](./write-service-code.md) — control flow, async, queries, events, logging, tests.
- [git-flow](./git-flow.md) — branching & release workflow.
- `rules/coding-guidelines.md` — the global engineering rules (workflow, release safety, iteration,
  function density, testing, config, DB/migration). This doc adds to them; it does not repeat them.
