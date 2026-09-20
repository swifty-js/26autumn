# swr-demo

**A hand-rolled SWR implementation — preload + deduplication +
Stale-While-Revalidate — in ~80 lines of zero-dependency code.**

A runnable React 19 + Vite demo that shows how a tiny homegrown SWR mechanism can
eliminate redundant requests and shave hundreds of milliseconds off first paint,
without pulling in a full data-fetching library.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

---

## Why this exists

Admin dashboards are full of shared "selector" data sources — staff pickers,
search-algorithm lists, vector-database catalogs, and the like. These share three
traits: many pages/components consume them, they change rarely (minutes to hours),
and the first screen cannot render meaningfully without them.

The conventional `useEffect`-per-component approach has three problems:

1. Requests start late — only after the JS bundle downloads, parses, and React mounts.
2. The same data is fetched repeatedly by separate components.
3. Caches are lost on navigation, forcing a fresh wait each time.

This demo implements the fix in ~80 lines of TypeScript, no third-party data layer.

## Core idea

The flow has two phases: **preload** (an inline `<header>` script) and **consume**
(a component fetcher).

### Phase 1 — Preload

Requests are fired the moment the HTML parser reaches the header script, in
parallel with the JS bundle download:

```html
<script>
  const staffPromise = fetch("/api/staff").then((r) => r.json());
  const algorithmPromise = fetch("/api/algorithm").then((r) => r.json());
  const vectorDBPromise = fetch("/api/vector-db").then((r) => r.json());

  window.staffPromise = staffPromise; /* dedup anchor */
  staffPromise.then((res) => (window.staffResult = res)); /* cache anchor */
</script>
```

### Phase 2 — Consume

The fetcher degrades through three tiers, fastest first:

| Priority | Condition                 | Behavior                                        | Latency                |
| -------- | ------------------------- | ----------------------------------------------- | ---------------------- |
| 1        | `result` already resolved | return stale data, revalidate in the background | ~0 ms                  |
| 2        | `promise` in flight       | await the shared promise (dedupe)               | remaining network time |
| 3        | neither present           | start a fresh request and cache the promise     | full RTT               |

```ts
export async function swrFetch<T>(key: string): Promise<FetchResult<T>> {
  const entry = cache.get(key);

  // Tier 1: cached result -> return immediately, revalidate in background
  if (entry?.result !== undefined) {
    const data = entry.result;
    fetcherMap[key]().then((next) => (entry.result = next));
    return { data, fromCache: true, fromPromise: false, waitedMs: ~0 };
  }

  // Tier 2: in-flight promise -> deduplicate
  if (entry?.promise) {
    const data = await entry.promise;
    return { data, fromCache: false, fromPromise: true, waitedMs: remaining };
  }

  // Tier 3: cold start -> initiate a fresh SWR cycle
  const promise = fetcherMap[key]();
  cache.set(key, { promise, result: undefined });
  const data = await promise;
  entry.result = data;
  return { data, fromCache: false, fromPromise: false, waitedMs: fullRTT };
}
```

## Advantages

### Tiny footprint

| Approach                            | Size (gzip)       |
| ----------------------------------- | ----------------- |
| This hand-rolled SWR                | ~0.5 KB (~80 LOC) |
| SWR (vercel/swr)                    | ~4.5 KB           |
| React Query (@tanstack/react-query) | ~12 KB            |
| ahooks `useRequest`                 | ~8 KB (+deps)     |

### Minimal onboarding for legacy code

No Provider, no hook, no React-version requirements — an inline `<header>` script
plus a single `swrFetch(key)` call works across React, jQuery, and vanilla-JS pages
in a mixed MPA:

```js
// jQuery page consuming the same cache
swrFetch("staff").then(({ data }) => $("#staff-select").renderOptions(data));
```

### Faster first paint

With 800 ms network latency and a 200 ms bundle download, the preloaded path
serves data in ~600 ms (requests run in parallel with the download) versus ~1000 ms
serial for the control group — and ~0 ms on repeat visits.

### Free deduplication

Components sharing a data source share the same in-flight promise, so concurrent
consumers never trigger duplicate requests.

### Progressive revalidation

Cache hits return stale data instantly and refresh silently in the background, so
users never see a "loading → data" skeleton.

## When to use it

- Shared dropdown/selector data sources in admin dashboards
- Multi-page (MPA) apps that share data across entry points
- Projects that want to avoid a heavyweight data-fetching library
- Mixed-stack codebases (jQuery + React, non-React pages)
- Bundle-size-sensitive targets (micro-frontends, SDKs)

### Not a fit when you need

- LRU eviction, optimistic updates, or mutation invalidation
- Retries, exponential backoff, or request cancellation
- An SPA already built deeply around React Query / SWR

## Running the demo

```sh
cd swr-demo
pnpm install
pnpm dev
```

Open <http://localhost:5173>, click **Start comparison** to see the first-paint
difference, then **Simulate repeat visit** to see cache-hit behavior.

## Structure

```
src/
├── mock-api.ts    # mock backend with 800ms+ simulated latency
├── swr.ts         # hand-rolled SWR core (preload / swrFetch / normalFetch)
├── perf-monitor.ts# Resource Timing observers
├── App.tsx        # SWR-group vs control-group comparison UI + timeline chart
├── index.css      # global styles
└── main.tsx       # entry point
```
