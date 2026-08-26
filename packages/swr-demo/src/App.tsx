import { useState, useCallback } from "react";
import { swrFetch, normalFetch, preload, clearCache } from "./swr";
import type { FetchResult } from "./swr";
import type { StaffItem, AlgorithmItem, VectorDBItem } from "./mock-api";
import {
  mark,
  collectAndReport,
  resetBootMarks,
  PERF_QUEUE,
} from "./perf-monitor";
import type { PerfReport } from "./perf-monitor";

interface TimelineEntry {
  label: string;
  mode: "swr" | "normal";
  key: string;
  waitedMs: number;
  fromCache: boolean;
  fromPromise: boolean;
}

function SelectorCard({
  title,
  items,
  loading,
  timing,
}: {
  title: string;
  items: { id: number; name: string }[];
  loading: boolean;
  timing?: { waitedMs: number; fromCache: boolean; fromPromise: boolean };
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-opacity ${
        loading ? "opacity-60" : ""
      }`}
    >
      <h3 className="mb-2.5 text-sm font-medium text-gray-700">{title}</h3>
      {loading ? (
        <div className="flex flex-col gap-2">
          <div className="h-3.5 animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 animate-pulse rounded bg-gray-200" />
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-b border-gray-100 py-1 text-[13px] text-gray-600 last:border-b-0"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
      {timing && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-lg font-semibold tabular-nums text-gray-900">
            {timing.waitedMs.toFixed(0)}ms
          </span>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
            {timing.fromCache
              ? "cache hit (SWR)"
              : timing.fromPromise
                ? "promise 复用"
                : "全新请求"}
          </span>
        </div>
      )}
    </div>
  );
}

function PerfPanel({ report }: { report: PerfReport }) {
  const rows: [string, string][] = [
    ["启动总耗时 (boot-start → boot-end)", `${report.bootTime}ms`],
    ["DNS 解析", `${Math.round(report.pageLoad.dnsTime)}ms`],
    [
      "文档请求等待 (TTFB 排队)",
      `${Math.round(report.pageLoad.requestWaitTime)}ms`,
    ],
    ["文档请求耗时", `${Math.round(report.pageLoad.requestTime)}ms`],
    ["DOM Interactive", `${Math.round(report.pageLoad.domInteractive)}ms`],
    [
      "perf-ping 探测请求",
      report.pingResource ? `${report.pingResource.duration}ms` : "未采集到",
    ],
    [
      "最慢资源",
      report.slowestResource
        ? `${report.slowestResource.duration}ms (${report.slowestResource.name.split("/").pop()})`
        : "无",
    ],
    ["启动期间长任务 (>50ms)", `${report.longTaskCount} 个`],
    ["累计上报条数", `${PERF_QUEUE.length} 条 (PERF_QUEUE)`],
  ];
  return (
    <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5">
      <h3 className="mb-4 text-[15px] font-semibold text-amber-800">
        性能监控采集结果 (手写, 模仿 boot.ts)
      </h3>
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-md border border-amber-100 bg-white px-3 py-1.5"
          >
            <span className="text-xs text-gray-700">{label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-gray-900">
              {value}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-gray-500">
        数据来自 performance.mark/measure、Navigation Timing、Resource Timing 与
        PerformanceObserver(longtask), 经 PERF_QUEUE 队列化上报 (demo
        中打印到控制台).
      </p>
    </div>
  );
}

function TimelineChart({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null;
  const maxMs = Math.max(...entries.map((e) => e.waitedMs), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <h3 className="mb-4 text-[15px] font-semibold text-gray-800">
        请求耗时对比
      </h3>
      <div className="flex flex-col gap-2.5">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-gray-600">
              [{entry.mode === "swr" ? "SWR" : "对照"}] {entry.label}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <div
                className={`h-5 min-w-1 rounded transition-all duration-300 ${
                  entry.mode === "swr" ? "bg-indigo-500" : "bg-rose-500"
                }`}
                style={{ width: `${(entry.waitedMs / maxMs) * 100}%` }}
              />
              <span className="text-xs tabular-nums whitespace-nowrap text-gray-500">
                {entry.waitedMs.toFixed(0)}ms
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  const [swrStaff, setSwrStaff] = useState<{ id: number; name: string }[]>([]);
  const [swrAlgo, setSwrAlgo] = useState<{ id: number; name: string }[]>([]);
  const [swrVdb, setSwrVdb] = useState<{ id: number; name: string }[]>([]);
  const [swrLoading, setSwrLoading] = useState(true);

  const [normalStaff, setNormalStaff] = useState<
    { id: number; name: string }[]
  >([]);
  const [normalAlgo, setNormalAlgo] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [normalVdb, setNormalVdb] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [normalLoading, setNormalLoading] = useState(true);

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [perfReport, setPerfReport] = useState<PerfReport | null>(null);
  const [secondFetchResults, setSecondFetchResults] = useState<
    FetchResult<unknown>[] | null
  >(null);
  const [secondNormalResults, setSecondNormalResults] = useState<
    FetchResult<unknown>[] | null
  >(null);
  const [secondNormalLoading, setSecondNormalLoading] = useState(false);

  const run = useCallback(async () => {
    clearCache();
    resetBootMarks();
    setPerfReport(null);
    setTimeline([]);
    setSecondFetchResults(null);
    setSwrLoading(true);
    setNormalLoading(true);
    setSwrStaff([]);
    setSwrAlgo([]);
    setSwrVdb([]);
    setNormalStaff([]);
    setNormalAlgo([]);
    setNormalVdb([]);
    setPhase("running");

    const entries: TimelineEntry[] = [];

    mark("swr-boot-start");

    preload();

    await new Promise((r) => setTimeout(r, 100));

    const [staffR, algoR, vdbR] = await Promise.all([
      swrFetch<StaffItem[]>("staff"),
      swrFetch<AlgorithmItem[]>("algorithm"),
      swrFetch<VectorDBItem[]>("vectorDB"),
    ]);

    setSwrStaff(staffR.data);
    setSwrAlgo(algoR.data);
    setSwrVdb(vdbR.data);
    setSwrLoading(false);

    mark("swr-boot-end");
    setPerfReport(collectAndReport());

    entries.push(
      { label: "Staff 选择器", mode: "swr", key: "staff", ...staffR },
      { label: "算法选择器", mode: "swr", key: "algorithm", ...algoR },
      { label: "向量库选择器", mode: "swr", key: "vectorDB", ...vdbR },
    );

    const [nStaffR, nAlgoR, nVdbR] = await Promise.all([
      normalFetch<StaffItem[]>("staff"),
      normalFetch<AlgorithmItem[]>("algorithm"),
      normalFetch<VectorDBItem[]>("vectorDB"),
    ]);

    setNormalStaff(nStaffR.data);
    setNormalAlgo(nAlgoR.data);
    setNormalVdb(nVdbR.data);
    setNormalLoading(false);

    entries.push(
      { label: "Staff 选择器", mode: "normal", key: "staff", ...nStaffR },
      { label: "算法选择器", mode: "normal", key: "algorithm", ...nAlgoR },
      { label: "向量库选择器", mode: "normal", key: "vectorDB", ...nVdbR },
    );

    setTimeline(entries);
    setPhase("done");
  }, []);

  const runSecondFetch = useCallback(async () => {
    setSecondNormalLoading(true);
    setSecondNormalResults(null);

    const [s, a, v] = await Promise.all([
      swrFetch<StaffItem[]>("staff"),
      swrFetch<AlgorithmItem[]>("algorithm"),
      swrFetch<VectorDBItem[]>("vectorDB"),
    ]);
    setSecondFetchResults([s, a, v]);

    const [ns, na, nv] = await Promise.all([
      normalFetch<StaffItem[]>("staff"),
      normalFetch<AlgorithmItem[]>("algorithm"),
      normalFetch<VectorDBItem[]>("vectorDB"),
    ]);
    setSecondNormalResults([ns, na, nv]);
    setSecondNormalLoading(false);
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-gray-50 px-6 py-10 font-sans text-gray-900 antialiased">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          手写 SWR 对比 Demo
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          模拟场景: 公共选择器数据在 &lt;header&gt; 中预加载, 页面组件消费时复用
          promise / 命中缓存
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          onClick={run}
          disabled={phase === "running"}
          className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "running" ? "加载中..." : "开始对比"}
        </button>
        {phase === "done" && (
          <button
            onClick={runSecondFetch}
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            模拟二次消费 (SWR 即时返回)
          </button>
        )}
      </div>

      {phase !== "idle" && (
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 border-b-2 border-indigo-500 pb-2 text-base font-semibold text-indigo-600">
              SWR 组 (预加载 + 去重)
            </h2>
            <div className="flex flex-col gap-3">
              <SelectorCard
                title="Staff 用户"
                items={swrStaff}
                loading={swrLoading}
                timing={
                  phase === "done"
                    ? timeline.find(
                        (e) => e.mode === "swr" && e.key === "staff",
                      )
                    : undefined
                }
              />
              <SelectorCard
                title="推荐算法"
                items={swrAlgo}
                loading={swrLoading}
                timing={
                  phase === "done"
                    ? timeline.find(
                        (e) => e.mode === "swr" && e.key === "algorithm",
                      )
                    : undefined
                }
              />
              <SelectorCard
                title="向量库"
                items={swrVdb}
                loading={swrLoading}
                timing={
                  phase === "done"
                    ? timeline.find(
                        (e) => e.mode === "swr" && e.key === "vectorDB",
                      )
                    : undefined
                }
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 border-b-2 border-rose-500 pb-2 text-base font-semibold text-rose-600">
              对照组 (组件挂载时请求)
            </h2>
            <div className="flex flex-col gap-3">
              <SelectorCard
                title="Staff 用户"
                items={normalStaff}
                loading={normalLoading}
                timing={
                  phase === "done"
                    ? timeline.find(
                        (e) => e.mode === "normal" && e.key === "staff",
                      )
                    : undefined
                }
              />
              <SelectorCard
                title="推荐算法"
                items={normalAlgo}
                loading={normalLoading}
                timing={
                  phase === "done"
                    ? timeline.find(
                        (e) => e.mode === "normal" && e.key === "algorithm",
                      )
                    : undefined
                }
              />
              <SelectorCard
                title="向量库"
                items={normalVdb}
                loading={normalLoading}
                timing={
                  phase === "done"
                    ? timeline.find(
                        (e) => e.mode === "normal" && e.key === "vectorDB",
                      )
                    : undefined
                }
              />
            </div>
          </section>
        </div>
      )}

      {secondFetchResults && (
        <section className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="mb-3 text-base font-semibold text-emerald-800">
            二次消费对比
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 border-b-2 border-indigo-500 pb-2 text-sm font-semibold text-indigo-600">
                SWR 组 (缓存命中)
              </h3>
              <div className="flex flex-col gap-3">
                {["Staff 用户", "推荐算法", "向量库"].map((label, i) => (
                  <SelectorCard
                    key={label}
                    title={label}
                    items={
                      secondFetchResults[i].data as {
                        id: number;
                        name: string;
                      }[]
                    }
                    loading={false}
                    timing={{
                      waitedMs: secondFetchResults[i].waitedMs,
                      fromCache: secondFetchResults[i].fromCache,
                      fromPromise: secondFetchResults[i].fromPromise,
                    }}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 border-b-2 border-rose-500 pb-2 text-sm font-semibold text-rose-600">
                对照组 (无缓存, 重新请求)
              </h3>
              <div className="flex flex-col gap-3">
                {["Staff 用户", "推荐算法", "向量库"].map((label, i) => (
                  <SelectorCard
                    key={label}
                    title={label}
                    items={
                      secondNormalResults
                        ? (secondNormalResults[i].data as {
                            id: number;
                            name: string;
                          }[])
                        : []
                    }
                    loading={secondNormalLoading}
                    timing={
                      secondNormalResults
                        ? {
                            waitedMs: secondNormalResults[i].waitedMs,
                            fromCache: secondNormalResults[i].fromCache,
                            fromPromise: secondNormalResults[i].fromPromise,
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-gray-500">
            二次消费时 SWR 组命中 result 缓存, fetcher 立即返回 (耗时接近 0ms),
            同时后台静默 revalidate; 对照组无缓存机制, 必须重新等待完整网络请求.
          </p>
        </section>
      )}

      <TimelineChart entries={timeline} />

      {perfReport && <PerfPanel report={perfReport} />}
    </div>
  );
}
