---
name: write-frontend-code
description: Use when writing FE code inside a feature — data fetching (React Query), API service layer + DTOs, client/server state (Zustand + Context), forms (RHF + schema), styling (Tailwind + CSS Modules + tokens), custom hooks, typed config, i18n, SSR/hydration guards. React/Next.js reference, framework-flexible.
author: Ken Nguyễn <ntnpro@gmail.com>
---

# Write frontend code

Examples: React + Next.js (Pages Router), neutral `listing` domain. principle → **▸ Example** →
**▸ Other stacks**. Where files go: `structure-a-frontend-app`. General style (early return,
pipelines, naming, SOLID, deep copy, casts): `code-conventions`.

## 1. Data fetching — React Query for server state
Server data goes through a query layer, not ad-hoc `fetch` in components. ▸ *Example:* per domain,
`queries/<domain>/<domain>.keys.ts` (a **key factory** for cache coherence) + `<domain>.queries.ts`
(`useX` hooks wrapping the service). Set stale/gc time centrally; don't refetch-on-focus by default.
```ts
// listing.keys.ts
export const listingKeys = { all: ['listing'] as const, list: (q) => [...listingKeys.all, 'list', q] };
// listing.queries.ts
export const useListingList = (q) =>
  useQuery({ queryKey: listingKeys.list(q), queryFn: () => listingService.getList(q) });
```
▸ *Other stacks:* SWR / TanStack Query in any React app; the key-factory + hook-per-query pattern carries over.

## 2. API layer — one base client + service classes + typed DTOs
- **One HTTP base client** (`BaseHttp`, an Axios instance) owns interceptors: attach auth token,
  refresh-and-retry on 401, map infra errors (e.g. 503/maintenance → redirect). **One service class
  per entity** extends it. Components/queries call the service, **never axios directly**.
  ```ts
  export class ListingService extends BaseHttp {
    getList(params: ListListingsRequest): Promise<ListingListResponse> {
      return this.get(PATH, { params }).then((r) => r.data);
    }
  }
  ```
- **DTOs hand-authored and split:** `models/request/` and `models/response/`. ▸ *Other stacks:* a
  typed client / generated SDK — keep one wrapper, don't scatter raw fetch calls.

## 3. State — server vs client, don't mix
- **Server state → React Query** (§1). **Client/UI state → Zustand**, one store per feature (filters,
  selection, wizard step); persist filters to storage where useful; select with a **shallow**
  comparator to avoid re-renders. **Cross-cutting state (auth/org/alerts/locale) → React Context.**
  ```ts
  const { setFilter, data } = useListingStore((s) => pick(s, ['setFilter', 'data']), shallow);
  ```
- **Never copy server data into Zustand** — it goes stale; let React Query own it. A feature's logic
  lives in its module's `.actions.ts` hooks. ▸ *Other stacks:* any signal/store lib + context.

## 4. Forms & validation
A form library + a schema: **React Hook Form** controls + a schema lib (**Yup/Zod**) in
`src/schemas/<feature>.schema.ts` (conditional `.when()`, custom `.test()`). Wrap inputs in shared
`Field` components; surface errors from `formState.errors`. ▸ *Other stacks:* RHF/Formik + Zod/Yup;
the schema lives beside the feature.

## 5. Styling
**Tailwind-first + CSS Modules** (`*.module.scss`) for component-scoped styles; **design tokens
(colors/spacing/radius) come from the shared UI lib's theme** (`@org/web-ui`), not hard-coded hex;
dark mode via a class toggle. ▸ *Other stacks:* utility CSS + scoped modules + a single token source.

## 6. Custom hooks
- **General hooks** (data-agnostic: `useInterval`, `useDebounced`, SSR-safe helpers) → `src/hooks/`.
  **Domain hooks** (wrap a service/context: `useMyProfile`, `useModalState`) → `src/helpers/hooks/`
  or the feature's `.actions.ts`. Always `use*`-named. Encapsulate data, UI state, forms, and SSR
  concerns behind hooks rather than inline in components.

## 7. Config — typed, public vs private
**One typed config module** (`src/Config.ts`), two tiers: **public** (client-exposed; framework prefix
e.g. `NEXT_PUBLIC_*`) and **private** (server-only secrets). Read config **through the module**,
never scatter `process.env` across components; provide safe defaults / fail fast on missing critical
values. ▸ *Other stacks:* a settings module + the framework's public-env prefix.

## 8. i18n
A **localization context** + locale JSON with **dot-notation namespaces** (`common.title`); a
`useLanguage(namespace)` hook returns `t(key)`. Locale from cookie, switchable at runtime.
▸ *Other stacks:* i18next/react-intl — namespaced keys + a `t()` hook.

## 9. SSR / hydration gotchas (FE-critical)
- **Guard browser-only access:** `if (typeof window !== 'undefined')` before touching
  `window`/`document`/`localStorage`; use an **isomorphic layout effect** (layout effect on client,
  plain effect on server).
- **Render with SSR-safe defaults, then hydrate** with client values — avoids hydration mismatch
  (e.g. window size defaults to a fixed value on the server, updates after mount).
- **Hard navigation** (`window.location`) for unrecoverable/auth/maintenance states; **router push**
  for in-app navigation. ▸ *Other stacks:* any SSR/SSG framework — same guards.

## 10. Perf
`useMemo`/`useCallback` for computed lists and event handlers passed to children; memoize list rows;
Zustand `shallow` select. Keep it targeted — measure before micro-optimizing.

## Verification
- Server data comes from a `queries/<domain>` hook (key factory + `useX`), not raw fetch in a
  component; components/queries call a **service class**, never axios directly.
- Client state in a per-feature Zustand store (shallow select), no server data duplicated there;
  cross-cutting state in Context.
- Forms use RHF + a `src/schemas/*.schema.ts`; styling is Tailwind + `*.module.scss` + theme tokens.
- No scattered `process.env` (all via the Config module); every browser API access is `typeof window` guarded.

## Related
- `structure-a-frontend-app` — where these files live.
- `write-frontend-tests` · `code-conventions` · `write-service-code` (backend equivalent).
