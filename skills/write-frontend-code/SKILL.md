---
name: write-frontend-code
description: Use when writing FE code inside a feature — data fetching & mutations (React Query), API + DTOs, state (Zustand + Context), custom hooks, forms (RHF + Yup), heavily-used packages, performance, styling (Tailwind + tokens + CSS Modules), config, i18n, SSR/hydration. React/Next.js reference, framework-flexible.
metadata:
  author: Ken Nguyễn <ntnpro@gmail.com>
---

# Write frontend code

Examples: React + Next.js (Pages Router), neutral `listing` domain. principle → **▸ Example** →
**▸ Other stacks**. Where files go: `structure-a-frontend-app`. General style (early return,
pipelines, naming, SOLID, deep copy, casts): `code-conventions`.

> **The data/state stack ships through the shared UI lib.** React Query, Zustand, debounce, the HTTP
> client, theme tokens etc. are re-exported from `@org/web-ui` (placeholder for your in-house
> design-system package) — so they aren't direct deps of the app. Import from `@org/web-ui[/utils|
> /store|/queries]`, not the raw libraries.

## 1. Data fetching & mutations — React Query
Server data goes through a query layer per feature, never ad-hoc `fetch` in components. A feature's
data folder has four files: `.keys.ts` (key factory), `.queries.ts` (reads), `.mutations.ts`
(writes), `.types.ts`.

- **Key factory** — namespaced nested arrays, so invalidation is precise:
  ```ts
  // listing.keys.ts
  const listingKeys = { all: ['listing'] as const };
  export const listingQuery = {
    detail: (id?: string) => (id ? [...listingKeys.all, 'detail', id] : [...listingKeys.all, 'detail']),
    list:   (params?: ListListingsRequest) => [...listingKeys.all, 'list', params] as const,
  };
  ```
- **Query hook** — `enabled` guard + per-query `staleTime` override + `placeholderData` to avoid flicker:
  ```ts
  export const useListingDetail = ({ id, options = {} }) =>
    useQuery(listingQuery.detail(id), () => listingService.getDetail(id!), {
      enabled: !!id, staleTime: 30_000, placeholderData: keepPreviousData, ...options,
    });
  ```
- **Mutation hook** — invalidate the affected keys in `onSuccess`:
  ```ts
  // listing.mutations.ts
  export const usePublishListing = () => {
    const qc = useQueryClient();
    return useMutation(({ id }) => listingService.publish(id), {
      onSuccess: () => qc.invalidateQueries({ queryKey: listingQuery.detail() }),
    });
  };
  ```
- **Global client config** (once): `staleTime 10m`, `gcTime 30m`, `refetchOnWindowFocus false`,
  `retry false`, `refetchInterval false`. Override per-query (`staleTime: 0`) only for live data.
▸ *Other stacks:* SWR / TanStack Query; key-factory + hook-per-query + invalidate-on-mutate carries over.

## 2. API layer — one base client + service classes + DTOs
- **One HTTP base client** (`BaseHttp`, an Axios instance) owns interceptors: attach bearer token;
  **queue requests during a 401 refresh** (concurrent 401s → one refresh, then replay); normalize
  errors (`handleHttpError` re-throws a consistent `Error` with `.response`); serialize query params
  once (`qs.stringify(..., { arrayFormat: 'brackets' })`).
- **One service class per entity** extends the base; components/queries call the service, never axios:
  ```ts
  export class ListingService extends BaseHttp {
    getList(p: ListListingsRequest) { return this.get('listings', { params: p }).then((r) => r.data); }
    publish(id: string) { return this.post(`listings/${id}/publish`).then((r) => r.data); }
  }
  ```
- **DTOs hand-authored, split** `models/request/` vs `models/response/`. Build payloads fluently:
  `const body = Builder(CreateListingBody).title(form.title).price(form.price).build();`
▸ *Other stacks:* a typed client / generated SDK — one wrapper owns auth + error handling.

## 3. State — server vs client vs cross-cutting (don't mix)
| Kind | Tool | Use for |
|---|---|---|
| Server data | **React Query** (§1) | anything fetched; cache/refetch/invalidate |
| Local UI state | **Zustand** store, one per feature | filters, pagination, selection, wizard step, flags |
| Cross-cutting | **React Context**, set once on boot | auth/session, org/profile, alerts, locale |

- **Zustand store shape** — State + Actions as separate interfaces, a `resetState`, immutable merges via `get()`:
  ```ts
  const create: StateCreator<ListingListStore> = (set, get) => ({
    ...initialState,
    setFilter: (f) => set({ filter: { ...get().filter, ...f } }),
    addSelected: (l) => set((s) => s.selected.some((x) => x.id === l.id) ? s : { selected: [...s.selected, l] }),
    resetState: () => set({ ...initialState }),
  });
  export const [useListingListStore] = createStore(create, { storeName: 'listing-list' });
  ```
- **Select narrowly + `shallow`** to avoid full-store re-renders:
  `const { filter, setFilter } = useListingListStore((s) => pick(s, ['filter','setFilter']), shallow);`
- **Never copy server data into Zustand** (goes stale). If a query must seed store state, do it in the
  `queryFn` wrapped in `unstable_batchedUpdates(...)` (one re-render, not N).
▸ *Other stacks:* any store lib + context; the server/client/cross-cutting split is the durable idea.

## 4. Custom hooks — feature `.actions.ts` pattern + reusable hooks
- **Feature logic lives in a hook, not the component.** A feature action hook consolidates form submit
  + mutation + navigation + error + UI flags, with a **synchronous re-entry guard** so double-clicks
  can't double-submit:
  ```ts
  export const useSaveListing = () => {
    const { handleSubmit } = useFormContext<ListingForm>();
    const { setSaving } = useListingListStore();
    const { mutateAsync } = usePublishListing();
    const busy = useRef(false);
    const onSave = () => {
      if (busy.current) return;                                  // sync guard
      handleSubmit(async (form) => {
        busy.current = true; setSaving(true);
        try { await mutateAsync({ id: form.id }); router.push(Routes.Listings); }
        catch (e) { handleError(e); }
        finally { busy.current = false; setSaving(false); }
      })();
    };
    return { onSave };
  };
  ```
- **Reusable hooks** (`src/hooks/` general, `src/helpers/hooks/` domain): `useModalState()` →
  `{ visible, show, hide, toggle }`; `useDebounced(value, ms)` (value debounce w/ cleanup);
  `usePagedSearchCombobox({ fetchRows, mapRows, pageSize })` (debounced search + load-more; refs for a
  fetch-lock + a generation counter to drop stale responses); `useMyProfile()` (reads a context →
  memoized role booleans). Always `use*`-named; memoize derived values.

## 5. Forms & validation — React Hook Form + Yup
- **RHF + Yup via `yupResolver`**; schema in `src/schemas/<feature>.schema.ts`. Dynamic/conditional
  schemas with `yup.when()` / `yup.lazy()`. `mode: 'onChange'` for live feedback. Wrap a form in
  `<FormProvider>`, read it in nested fields via `useFormContext()`.
- **Perf on big forms:** subscribe to single fields with `useWatch({ name })` instead of `watch()`
  (which re-renders on every keystroke). Wrap inputs in shared `Field` components that show `formState.errors`.

## 6. Packages we lean on
Public OSS named directly; in-house bits come via `@org/web-ui`.

| Package | For |
|---|---|
| `react-hook-form` + `@hookform/resolvers` + `yup` | forms + schema validation |
| `@org/web-ui` (+ `/utils` `/store` `/queries`) | design system; React-Query/Zustand wrappers; `CommonUtil` (debounce, pick, uniqBy), `DateUtil` |
| `axios` | HTTP (only inside `BaseHttp`) |
| `classnames` | conditional class strings (§7) |
| `lodash` | utilities — import per-function (`import pick from 'lodash/pick'`) for tree-shaking |
| `decimal.js` | money / precise math (never float) |
| `builder-pattern` | fluent request-DTO construction |
| `qs` / `query-string` | URL query (de)serialization |
| `uuid` · `next-auth` · `socket.io-client` | ids · auth/session · realtime |

▸ *Other stacks:* swap names, keep the roles (form lib + schema, one HTTP wrapper, a decimal lib, a class-name helper).

## 7. Styling — Tailwind + tokens + CSS Modules
- **Tailwind-first.** Colors/spacing/radius/breakpoints come from the **shared theme** (`@org/web-ui`
  tokens extended in `tailwind.config.js`) — **never hard-code hex**; use token classes.
- **Conditional classes via `classnames`** (alias `cn`), incl. arbitrary variants:
  ```tsx
  <div className={cn('listing-row', { 'is-error': hasError }, isActive && '[&_svg]:text-primary')} />
  ```
- **CSS Modules (`*.module.scss`)** for component-scoped styling beyond utilities; share SCSS vars via
  `styles/variables.scss`. `styles/globals.css` holds resets + third-party UI overrides + global overlays.
- **Integrating a component library?** Disable Tailwind **preflight** to avoid reset clashes. Dark mode
  via the `class` strategy. ▸ *Other stacks:* utility CSS + scoped modules + one token source.

## 8. Performance
- **Memoize the expensive, not everything.** `React.memo` on heavy components (editors, charts, media,
  big lists); `useCallback` for handlers passed to memoized children/list rows; `useMemo` for derived
  lists/objects. Don't memo trivial leaves.
- **Zustand `shallow` + narrow selectors** (§3) — usually the biggest re-render win.
- **React Query tuning:** lean on the 10-min `staleTime`; narrow with `select`; `placeholderData`/
  `keepPreviousData` to avoid flicker on param change; `staleTime: 0` only for truly live data.
- **Code-split heavy client-only modules** with `next/dynamic` + `{ ssr: false }` (rich-text editor,
  embedded reports, video, PDF) — keeps them out of the SSR bundle and initial load:
  ```ts
  const Editor = dynamic(() => import('src/components/Editor'), { ssr: false, loading: () => <Spin /> });
  ```
- **Images:** `next/image` (lazy + blur placeholder) via a shared wrapper.
- **Debounce input-driven work** (search ~300ms, expensive calc ~400ms, network ~1000ms) via the shared util.
- **Lists:** pagination by default; add virtualization only when a page truly renders hundreds of rows.

## 9. Config — typed, public vs private
One typed config module (`src/Config.ts`): **public** (client-exposed; `NEXT_PUBLIC_*`) + **private**
(server-only). Read config **through the module**, never scatter `process.env`; safe defaults / fail
fast. ▸ *Other stacks:* a settings module + the framework's public-env prefix.

## 10. i18n
A localization context + locale JSON with **dot-notation namespaces** (`common.title`); a
`useLanguage(namespace)` hook returns `t(key)`. Locale from cookie, switchable. ▸ *Other stacks:* i18next/react-intl.

## 11. SSR / hydration gotchas (FE-critical)
- **Guard browser-only access:** `typeof window !== 'undefined'` before `window`/`document`/
  `localStorage`; use an **isomorphic layout effect**.
- **SSR-safe defaults, then hydrate** (avoids hydration mismatch); **`ssr: false`** for components that
  can't render server-side.
- **Hard navigation** (`window.location`) for unrecoverable/auth/maintenance states; **router push** for in-app nav.

## Verification
- Server data: a `queries/<feature>` hook (key factory + `useQuery`); writes via `.mutations.ts` that
  `invalidateQueries` the right key; no raw `fetch`/axios in components.
- Client state in a per-feature Zustand store, selected with `shallow`; no server data duplicated there.
- Forms use RHF + a `src/schemas/*.schema.ts`; big forms use `useWatch` on specific fields.
- Styling uses theme tokens + `classnames` + `*.module.scss`; no hard-coded hex.
- Heavy client-only modules are `next/dynamic({ ssr: false })`; browser APIs are `typeof window` guarded.
- No scattered `process.env` (all via the Config module).

## Related
- `structure-a-frontend-app` — where these files live.
- `write-frontend-tests` · `code-conventions` · `write-service-code` (backend equivalent).
