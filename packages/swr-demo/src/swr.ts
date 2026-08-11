// 手写 SWR 核心逻辑
// 模拟在 index.html <header> 中提前发起请求的场景

import {
  fetchStaff,
  fetchAlgorithm,
  fetchVectorDB,
  fetchPerfPing,
} from "./mock-api";
import type { StaffItem, AlgorithmItem, VectorDBItem } from "./mock-api";

// ============ 类型定义 ============

interface SWREntry<T> {
  promise: Promise<T>;
  result: T | undefined;
  timestamp: number; // 请求发起时间
}

// ============ 全局缓存（模拟 window 挂载） ============

const cache = new Map<string, SWREntry<unknown>>();

// ============ 预加载（模拟 <header> 中的脚本） ============

export function preload() {
  const startTime = performance.now();

  const staffPromise = fetchStaff();
  const algorithmPromise = fetchAlgorithm();
  const vectorDBPromise = fetchVectorDB();

  // 真实网络探测请求，与业务请求并行（供性能监控采集 Resource Timing）
  fetchPerfPing();

  // 挂载 promise
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

  // result 挂载
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
  fromCache: boolean; // 是否命中了已有 result（stale）
  fromPromise: boolean; // 是否复用了已有 promise（去重）
  waitedMs: number; // 从调用 fetcher 到拿到数据的耗时
}

const fetcherMap: Record<string, () => Promise<unknown>> = {
  staff: fetchStaff,
  algorithm: fetchAlgorithm,
  vectorDB: fetchVectorDB,
};

export async function swrFetch<T>(key: string): Promise<FetchResult<T>> {
  const callTime = performance.now();
  const entry = cache.get(key) as SWREntry<T> | undefined;

  // 情况 1: window.xxxResult 有值 → 立即返回，后台 SWR 刷新
  if (entry?.result !== undefined) {
    const data = entry.result;
    // 后台 revalidate（不阻塞返回）
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

  // 情况 2: window.xxxPromise 有值 → 复用 promise 等待 resolved
  if (entry?.promise) {
    const data = await entry.promise;
    return {
      data: data as T,
      fromCache: false,
      fromPromise: true,
      waitedMs: performance.now() - callTime,
    };
  }

  // 情况 3: 都没有 → 重建 SWR 流程
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

// ============ 对照组：普通 fetch（组件挂载时才发请求） ============

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

// ============ 工具 ============

export function clearCache() {
  cache.clear();
}

export type { StaffItem, AlgorithmItem, VectorDBItem };
