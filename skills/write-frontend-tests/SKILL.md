---
name: write-frontend-tests
description: Use when writing frontend tests — Jest + React Testing Library for units (utils, hooks, components) and Cypress + Cucumber for e2e user flows. Where tests live, what to test, mocking the router, and the lint/type/test gates. React/Next.js reference.
---

# Write frontend tests

Two layers; pick by what you're verifying. principle → **▸ Example (Jest/RTL/Cypress)** → **▸ Other stacks**.

| Layer | Tool | For |
|---|---|---|
| Unit / component | Jest + React Testing Library | utils, hooks, component behavior in isolation |
| E2E | Cypress + Cucumber (BDD) | real user flows through the running app |

## 1. Unit / component (Jest + RTL)
- **Colocate** `*.test.ts(x)` next to source (or under `src/test/`). Test **behavior through the
  public surface**: render the component, query by role/text, fire user events, assert what the user
  sees — not internal state. Pure utils/hooks are tested directly.
- **Mock the framework + externals only:**
  `jest.mock('next/router', () => ({ useRouter: () => ({ query: {} }) }))`, mock service classes;
  never mock the unit under test.
- **AAA + specific assertions** (`toEqual`/`toMatchObject` with real expected values, not `toBeTruthy()`).
  ```ts
  describe('convertObjectToArray', () => {
    it('flattens primitive values', () => {
      expect(convertObjectToArray({ a: 1, b: 'x' })).toEqual(['a', '1', 'b', 'x']);
    });
  });
  ```
  ▸ *Other stacks:* Vitest + RTL — identical patterns.

## 2. E2E (Cypress + Cucumber)
- **Gherkin feature files** under `cypress/e2e/<feature>/*.feature` describe flows in
  Given/When/Then; **step definitions** implement them; `Scenario Outline` + `Examples` cover input
  variations. Keep **API helpers** in `cypress/services/`, **test data** in `cypress/constants/`,
  and custom commands in `cypress/support/`.
  ```gherkin
  Scenario: Create a listing
    Given User logged in
    When User submits the new-listing form
    Then The listing appears in the list
  ```
  ▸ *Other stacks:* Playwright (+ optional BDD) — same user-flow-level coverage.

## 3. Gates
Lint/format = **Biome** (warning-first rollout, promoted to errors over time). A git-hook runner
(e.g. lefthook) runs `biome check`/`format` on staged files pre-commit, and `type-check` + `jest`
pre-push. Run `pnpm test` (unit) and the e2e suite before opening a PR.

## Verification
- New behavior has a unit test (util/hook/component via RTL) and, for a user-facing flow, a Cypress
  feature; tests assert observable behavior with specific values, not truthiness.
- `pnpm type-check`, `pnpm test`, and Biome all pass.

## Related
- `structure-a-frontend-app` · `write-frontend-code` · `write-unit-tests` (backend equivalent).
