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
import "./App.css";

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
    <div className={`card ${loading ? "card-loading" : ""}`}>
      <h3>{title}</h3>
      {loading ? (
        <div className="skeleton">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>{item.name}</li>
          ))}
        </ul>
      )}
      {timing && (
        <div className="timing">
          <span className="timing-value">{timing.waitedMs.toFixed(0)}ms</span>
          <span className="timing-badge">
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
    <div className="perf-panel">
      <h3>性能监控采集结果( 手写, 模仿 boot.ts) </h3>
      <div className="perf-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="perf-row">
            <span className="perf-label">{label}</span>
            <span className="perf-value">{value}</span>
          </div>
        ))}
      </div>
      <p className="note">
        数据来自 performance.mark/measure、Navigation Timing、Resource Timing 与
        PerformanceObserver(longtask), 经 PERF_QUEUE 队列化上报( demo
        中打印到控制台) .
      </p>
    </div>
  );
}

function TimelineChart({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null;
  const maxMs = Math.max(...entries.map((e) => e.waitedMs), 1);

  return (
    <div className="timeline">
      <h3>请求耗时对比</h3>
      {entries.map((entry, i) => (
        <div key={i} className="timeline-row">
          <span className="timeline-label">
            [{entry.mode === "swr" ? "SWR" : "对照"}] {entry.label}
          </span>
          <div className="timeline-bar-container">
            <div
              className={`timeline-bar ${entry.mode === "swr" ? "bar-swr" : "bar-normal"}`}
              style={{ width: `${(entry.waitedMs / maxMs) * 100}%` }}
            />
            <span className="timeline-ms">{entry.waitedMs.toFixed(0)}ms</span>
          </div>
        </div>
      ))}
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

    // 性能监控打点: 启动起点( 对应 boot.ts 的 boot-start)
    mark("swr-boot-start");

    // SWR 组: 模拟 <header> 预加载
    preload();

    // 模拟页面渲染延迟( React mount) , 让预加载有时间完成
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

    // 性能监控打点: SWR 数据就绪即视为启动完成, 采集并上报
    mark("swr-boot-end");
    setPerfReport(collectAndReport());

    entries.push(
      { label: "Staff 选择器", mode: "swr", key: "staff", ...staffR },
      { label: "算法选择器", mode: "swr", key: "algorithm", ...algoR },
      { label: "向量库选择器", mode: "swr", key: "vectorDB", ...vdbR },
    );

    // 对照组: 组件挂载时才发请求
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

    // SWR 组: 命中缓存, 即时返回
    const [s, a, v] = await Promise.all([
      swrFetch<StaffItem[]>("staff"),
      swrFetch<AlgorithmItem[]>("algorithm"),
      swrFetch<VectorDBItem[]>("vectorDB"),
    ]);
    setSecondFetchResults([s, a, v]);

    // 对照组: 无缓存, 重新发请求
    const [ns, na, nv] = await Promise.all([
      normalFetch<StaffItem[]>("staff"),
      normalFetch<AlgorithmItem[]>("algorithm"),
      normalFetch<VectorDBItem[]>("vectorDB"),
    ]);
    setSecondNormalResults([ns, na, nv]);
    setSecondNormalLoading(false);
  }, []);

  return (
    <div className="app">
      <h1>手写 SWR 对比 Demo</h1>
      <p className="subtitle">
        模拟场景: 公共选择器数据在 &lt;header&gt; 中预加载, 页面组件消费时复用
        promise / 命中缓存
      </p>

      <div className="controls">
        <button onClick={run} disabled={phase === "running"}>
          {phase === "running" ? "加载中..." : "开始对比"}
        </button>
        {phase === "done" && (
          <button onClick={runSecondFetch} className="btn-secondary">
            模拟二次消费( SWR 即时返回)
          </button>
        )}
      </div>

      {phase !== "idle" && (
        <div className="comparison">
          <section className="group">
            <h2 className="group-title swr-title">SWR 组( 预加载 + 去重) </h2>
            <div className="cards">
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

          <section className="group">
            <h2 className="group-title normal-title">
              对照组( 组件挂载时请求)
            </h2>
            <div className="cards">
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
        <section className="second-fetch">
          <h2>二次消费对比</h2>
          <div className="comparison">
            <div className="group">
              <h3 className="group-title swr-title">SWR 组( 缓存命中) </h3>
              <div className="cards">
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
            <div className="group">
              <h3 className="group-title normal-title">
                对照组( 无缓存, 重新请求)
              </h3>
              <div className="cards">
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
          <p className="note">
            二次消费时 SWR 组命中 result 缓存, fetcher 立即返回( 耗时接近 0ms) ,
            同时后台静默 revalidate; 对照组无缓存机制, 必须重新等待完整网络请求.
          </p>
        </section>
      )}

      <TimelineChart entries={timeline} />

      {perfReport && <PerfPanel report={perfReport} />}
    </div>
  );
}
