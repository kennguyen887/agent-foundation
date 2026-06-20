---
name: structure-a-frontend-app
description: Use when scaffolding a frontend app, adding a feature or page, or reviewing FE folder layout — thin routing → feature modules, the feature-module pattern (Component + .actions hooks + .hook + styles + barrel), shared-vs-feature code, naming, path aliases, request/response models. React/Next.js reference, framework-flexible.
author: Ken Nguyễn <ntnpro@gmail.com>
---

# Structure a frontend app

Examples use React + Next.js (Pages Router) with a neutral `listing` domain; `<feature>`/`<Entity>`
are placeholders. Each rule: portable principle → **▸ Example (React/Next)** → **▸ Other stacks**.
Backend equivalent: the `structure-a-backend-service` skill. General style & flow: `code-conventions`,
`git-flow`.

## Core principle
The **router layer stays thin** — a route/page just renders a feature component. All app logic lives
under `src/`, organized **by feature**. Shared cross-feature building blocks sit in typed top-level
folders; everything single-feature lives inside that feature's module.

## 1. Repo layout
▸ **Example (React/Next):**
```
<app>/
├── pages/                  # router (thin): pages → routes; _app, _document, api/ (Next-specific)
├── src/
│   ├── components/         # SHARED UI, type-based (Field/, Layout/, Shell/, ErrorBoundary/, Global*/)
│   ├── modules/            # FEATURE code, feature-based (modules/<feature>/<sub-feature>/)
│   ├── hooks/              # general-purpose hooks (useInterval, useDebounced, SSR-safe helpers)
│   ├── helpers/hooks/      # domain hooks wrapping services/contexts (useMyProfile, useModalState)
│   ├── services/           # one HTTP client (BaseHttp) + one service class per entity
│   ├── queries/            # React Query: queries/<domain>/<domain>.keys.ts + .queries.ts
│   ├── zustand-store/      # client/UI state, one store per feature
│   ├── contexts/           # cross-cutting React Context providers (auth, org, alert, locale)
│   ├── models/             # types: models/request/ + models/response/ (hand-authored DTOs)
│   ├── schemas/            # form validation schemas (*.schema.ts)
│   ├── utils/ constants/ enums/   # domain utils, constants, enums (incl. a Routes enum)
│   └── Config.ts           # typed config (public + private) — see write-frontend-code §7
├── styles/   locales/   public/   middleware.ts
```
▸ *Other stacks:* same `src/` split with a different router folder (App Router `app/`, React-Router
routes). The point: thin routes, feature modules, typed shared folders.

## 2. Routing (thin pages → feature modules)
- A page file is a **thin wrapper** that renders the feature component; no logic in the page.
  ▸ *Example:* `pages/listings/index.tsx` → `<Shell><ListingList/></Shell>`; real code in
  `src/modules/listing/listing-list/`.
- **RESTful route convention, centralized in an enum:** `/<feature>` (list), `/<feature>/new`
  (create), `/<feature>/[id]` (detail), `/<feature>/[id]/edit`. Reference routes from the enum, never
  hard-code path strings.
- **App-level providers nest once at the root** (`_app.tsx`): session → query client → auth guard →
  domain contexts → layout. (Next-specific; ▸ *Other:* a root `<Providers>` tree.)

## 3. Feature module pattern
▸ **Example** — inside `src/modules/<feature>/<sub-feature>/`:
```
listing-list/
├── ListingList.tsx          # presentational: renders UI using hooks from .actions
├── ListingList.actions.ts   # the logic: custom hooks (useListingList, useFetch…, handlers)
├── ListingCard.hook.ts       # computed props/callbacks for a sub-component (optional)
├── ListingList.module.scss   # component-scoped styles (optional)
└── index.ts                  # barrel: default export + re-export the .actions hooks
```
- **Split logic from render.** `.actions.ts` holds the hooks (state, data, side effects, handlers);
  the `.tsx` consumes them and renders. Keeps components readable and logic testable. ▸ *Other
  stacks:* a `useX` hook module + a dumb component — same container/presentational split, any naming.
- **Barrel `index.ts` per module** so imports are one line:
  `import ListingList, { useListingList } from 'src/modules/listing/listing-list'`.

## 4. Shared UI vs feature code
- **`src/components/` = shared, type-based** (form `Field/`, `Layout/`, `Shell/`, `ErrorBoundary/`,
  `Global*`). **`src/modules/<feature>/` = feature-based.** Cross-feature → components/contexts/
  services/utils; single-feature → its module.
- **Design-system primitives come from a shared UI library** (placeholder `@org/web-ui`), not rebuilt
  per app — Button/Modal/Typography/Icon plus shared hooks/utils/theme. ▸ *Other stacks:* your
  component-library package.

## 5. Naming & imports
- **Components/services/models: `PascalCase`** (`ListingCard.tsx`; `ListingService` in
  `listing.service.ts`; `Listing.model.ts`). **Hooks: `use*` camelCase.** **Logic files:**
  `*.actions.ts`, `*.hook.ts`. **Styles:** `*.module.scss`. **Store:** `*.store.ts`. **Queries:**
  `*.keys.ts` + `*.queries.ts`. **Schemas:** `*.schema.ts`. Folders kebab-case.
- **Path aliases, never deep relative** (`src/*`, `@org/*`): `import x from 'src/modules/...'`, not `../../../`.

## 6. Types: request vs response
Hand-authored DTOs split by direction: `src/models/request/` (params/bodies) and
`src/models/response/` (API shapes), plus domain models. No code-gen. ▸ *Other stacks:* generated
types or a shared schema — keep request and response shapes separate and typed.

## Verification
- `find src -maxdepth 1 -type d` shows components, modules, hooks, services, queries, contexts,
  models, schemas, utils; the router folder (`pages/`) is thin (pages just render feature components).
- Each feature lives under `src/modules/<feature>/<sub-feature>/` with `.tsx` + `.actions.ts`
  (+ `.module.scss`) + `index.ts`; logic is in `.actions.ts`, not the `.tsx`.
- Imports use `src/*` / `@org/*` aliases (no `../../../`); route paths come from the Routes enum.
- `pnpm type-check` + lint clean (lint = Biome here; general principles → `code-conventions` skill).

## Related
- `write-frontend-code` — how to write the code inside these files.
- `write-frontend-tests` — Jest/RTL + Cypress/Cucumber.
- `structure-a-backend-service` — backend equivalent · `code-conventions` · `git-flow`.
