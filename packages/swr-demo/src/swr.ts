// Hand-rolled SWR core logic
// Simulates the scenario where requests are fired early in the <header> of index.html

import {
  fetchStaff,
  fetchAlgorithm,
  fetchVectorDB,
  fetchPerfPing,
} from "./mock-api";
import type { StaffItem, AlgorithmItem, VectorDBItem } from "./mock-api";

// ============ Types ============

interface SWREntry<T> {
  promise: Promise<T>;
  result: T | undefined;
  timestamp: number; // time the request was initiated
}

// ============ Global cache (simulates window-level mounting) ============

const cache = new Map<string, SWREntry<unknown>>();

// ============ Preload (simulates scripts in <header>) ============

export function preload() {
  const startTime = performance.now();

  const staffPromise = fetchStaff();
  const algorithmPromise = fetchAlgorithm();
  const vectorDBPromise = fetchVectorDB();

  // Real network probe request, fired in parallel with business requests
  // (provides a Resource Timing entry for perf monitoring)
  fetchPerfPing();

  // Mount promises
  cache.set("staff", {
    promise: staffPromise,
    result: undefined,
    timestamp: startTime,
  });
  cache.set("algorithm", {
    promise: algorithmPromise,
    result: undefined,
    timestamp: startTime,
  });
  cache.set("vectorDB", {
    promise: vectorDBPromise,
    result: undefined,
    timestamp: startTime,
  });

  // Mount resolved results
  staffPromise.then((result) => {
    const entry = cache.get("staff")!;
    entry.result = result;
  });
  algorithmPromise.then((result) => {
    const entry = cache.get("algorithm")!;
    entry.result = result;
  });
  vectorDBPromise.then((result) => {
    const entry = cache.get("vectorDB")!;
    entry.result = result;
  });

  return startTime;
}

// ============ SWR fetcher ============

export interface FetchResult<T> {
  data: T;
  fromCache: boolean; // whether an existing result (stale) was served
  fromPromise: boolean; // whether an in-flight promise was deduplicated
  waitedMs: number; // elapsed time from fetcher invocation to data resolution
}

const fetcherMap: Record<string, () => Promise<unknown>> = {
  staff: fetchStaff,
  algorithm: fetchAlgorithm,
  vectorDB: fetchVectorDB,
};

export async function swrFetch<T>(key: string): Promise<FetchResult<T>> {
  const callTime = performance.now();
  const entry = cache.get(key) as SWREntry<T> | undefined;

  // Case 1: cached result available -> return immediately, revalidate in background
  if (entry?.result !== undefined) {
    const data = entry.result;
    const revalidate = fetcherMap[key]();
    revalidate.then((newResult) => {
      entry.result = newResult as T;
      entry.promise = revalidate as Promise<T>;
      entry.timestamp = performance.now();
    });
    return {
      data,
      fromCache: true,
      fromPromise: false,
      waitedMs: performance.now() - callTime,
    };
  }

  // Case 2: in-flight promise exists -> deduplicate by awaiting the same promise
  if (entry?.promise) {
    const data = await entry.promise;
    return {
      data: data as T,
      fromCache: false,
      fromPromise: true,
      waitedMs: performance.now() - callTime,
    };
  }

  // Case 3: no cache, no promise -> initiate a fresh SWR cycle
  const promise = fetcherMap[key]() as Promise<T>;
  const newEntry: SWREntry<T> = {
    promise,
    result: undefined,
    timestamp: performance.now(),
  };
  cache.set(key, newEntry as SWREntry<unknown>);
  const data = await promise;
  newEntry.result = data;
  return {
    data,
    fromCache: false,
    fromPromise: false,
    waitedMs: performance.now() - callTime,
  };
}

// ============ Control group: plain fetch (request fires on component mount) ============

export async function normalFetch<T>(key: string): Promise<FetchResult<T>> {
  const callTime = performance.now();
  const data = (await fetcherMap[key]()) as T;
  return {
    data,
    fromCache: false,
    fromPromise: false,
    waitedMs: performance.now() - callTime,
  };
}

// ============ Utilities ============

export function clearCache() {
  cache.clear();
}

export type { StaffItem, AlgorithmItem, VectorDBItem };
