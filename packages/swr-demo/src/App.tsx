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
          <span className="text-lg font-semibold text-gray-900 tabular-nums">
            {timing.waitedMs.toFixed(0)}ms
          </span>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
            {timing.fromCache
              ? "cache hit (SWR)"
              : timing.fromPromise
                ? "promise dedup"
                : "fresh request"}
          </span>
        </div>
      )}
    </div>
  );
}

function PerfPanel({ report }: { report: PerfReport }) {
  const rows: [string, string][] = [
    ["Total boot time (boot-start → boot-end)", `${report.bootTime}ms`],
    ["DNS resolution", `${Math.round(report.pageLoad.dnsTime)}ms`],
    [
      "Document request wait (TTFB queuing)",
      `${Math.round(report.pageLoad.requestWaitTime)}ms`,
    ],
    [
      "Document request duration",
      `${Math.round(report.pageLoad.requestTime)}ms`,
    ],
    ["DOM Interactive", `${Math.round(report.pageLoad.domInteractive)}ms`],
    [
      "perf-ping probe request",
      report.pingResource
        ? `${report.pingResource.duration}ms`
        : "not captured",
    ],
    [
      "Slowest resource",
      report.slowestResource
        ? `${report.slowestResource.duration}ms (${report.slowestResource.name.split("/").pop()})`
        : "none",
    ],
    ["Long tasks during boot (>50ms)", `${report.longTaskCount}`],
    ["Total reported entries", `${PERF_QUEUE.length} (PERF_QUEUE)`],
  ];
  return (
    <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-5">
      <h3 className="mb-4 text-[15px] font-semibold text-amber-800">
        Performance Telemetry (hand-rolled, modeled after boot.ts)
      </h3>
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-md border border-amber-100 bg-white px-3 py-1.5"
          >
            <span className="text-xs text-gray-700">{label}</span>
            <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-gray-500">
        Data sourced from performance.mark/measure, Navigation Timing, Resource
        Timing, and PerformanceObserver(longtask). Reported via a PERF_QUEUE
        batched pipeline (logged to console in this demo).
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
        Request Latency Comparison
      </h3>
      <div className="flex flex-col gap-2.5">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-gray-600">
              [{entry.mode === "swr" ? "SWR" : "Control"}] {entry.label}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <div
                className={`h-5 min-w-1 rounded transition-all duration-300 ${
                  entry.mode === "swr" ? "bg-indigo-500" : "bg-rose-500"
                }`}
                style={{ width: `${(entry.waitedMs / maxMs) * 100}%` }}
              />
              <span className="text-xs whitespace-nowrap text-gray-500 tabular-nums">
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
      { label: "Staff Selector", mode: "swr", key: "staff", ...staffR },
      { label: "Algorithm Selector", mode: "swr", key: "algorithm", ...algoR },
      { label: "Vector DB Selector", mode: "swr", key: "vectorDB", ...vdbR },
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
      { label: "Staff Selector", mode: "normal", key: "staff", ...nStaffR },
      {
        label: "Algorithm Selector",
        mode: "normal",
        key: "algorithm",
        ...nAlgoR,
      },
      {
        label: "Vector DB Selector",
        mode: "normal",
        key: "vectorDB",
        ...nVdbR,
      },
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
          Hand-rolled SWR Benchmark
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Simulated scenario: shared selector data is preloaded in
          &lt;header&gt;; page components consume it via promise deduplication
          or cache hits.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          onClick={run}
          disabled={phase === "running"}
          className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "running" ? "Loading..." : "Run Benchmark"}
        </button>
        {phase === "done" && (
          <button
            onClick={runSecondFetch}
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Simulate Re-consumption (SWR instant return)
          </button>
        )}
      </div>

      {phase !== "idle" && (
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <h2 className="mb-3 border-b-2 border-indigo-500 pb-2 text-base font-semibold text-indigo-600">
              SWR Group (preload + dedup)
            </h2>
            <div className="flex flex-col gap-3">
              <SelectorCard
                title="Staff Members"
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
                title="Recommendation Algorithms"
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
                title="Vector Databases"
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
              Control Group (fetch on mount)
            </h2>
            <div className="flex flex-col gap-3">
              <SelectorCard
                title="Staff Members"
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
                title="Recommendation Algorithms"
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
                title="Vector Databases"
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
            Re-consumption Comparison
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 border-b-2 border-indigo-500 pb-2 text-sm font-semibold text-indigo-600">
                SWR Group (cache hit)
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  "Staff Members",
                  "Recommendation Algorithms",
                  "Vector Databases",
                ].map((label, i) => (
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
                Control Group (no cache, full re-fetch)
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  "Staff Members",
                  "Recommendation Algorithms",
                  "Vector Databases",
                ].map((label, i) => (
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
            On re-consumption, the SWR group hits the result cache and the
            fetcher returns immediately (~0ms) while silently revalidating in
            the background. The control group has no caching layer and must
            await a full network round-trip.
          </p>
        </section>
      )}

      <TimelineChart entries={timeline} />

      {perfReport && <PerfPanel report={perfReport} />}
    </div>
  );
}
