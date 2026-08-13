// 手写前端性能监控( 模仿 src/boot.ts 的做法)
// 思路: performance.mark/measure 打点 + PerformanceObserver 长任务监听
//       + Navigation Timing 拆解 + Resource Timing 采集 + 队列化上报
// 不依赖任何第三方监控 SDK, 全部基于浏览器原生 Performance API

// ============ 上报队列( 对应 boot.ts 的 window.AES_QUEUE)  ============

export interface PerfLogEntry {
  action: "log";
  arguments: [
    "event",
    Record<string, string | number> & { p1: string; p4: string },
  ];
}

// 真实项目中由监控 SDK 异步消费该队列, demo 中仅累积并打印
export const PERF_QUEUE: PerfLogEntry[] = [];

function report(entry: PerfLogEntry["arguments"][1]) {
  PERF_QUEUE.push({ action: "log", arguments: ["event", entry] });
  console.log("[perf-monitor] report:", entry.p1, entry);
}

// ============ 长任务监听( 对应 boot.ts 的 longTaskObserver)  ============

let longTaskObserver: PerformanceObserver | undefined;

export function observeLongTasks() {
  if (!("PerformanceObserver" in window)) {
    console.warn("当前浏览器不支持 PerformanceObserver, 无法监听主线程卡顿");
    return;
  }
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // 只上报超过 50ms 的长任务( INP / TBT 口径)
        if (entry.duration > 50) {
          report({
            p1: "main-thread-blocking",
            c1: location.pathname, // 当前页面路径
            c2: entry.name, // 任务名称
            c3: Math.round(entry.startTime),
            c4: Math.round(entry.duration), // 卡顿时长(毫秒)
            p4: "OTHER",
          });
        }
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
    console.log("[perf-monitor] 主线程卡顿监听已启动");
  } catch (error) {
    console.error("[perf-monitor] 启动长任务监听失败:", error);
  }
}

// ============ mark / measure 工具( 对应 boot.ts 的 performanceMeasure)  ============

export function mark(name: string) {
  try {
    performance.mark(name);
  } catch (error) {
    console.error(`[perf-monitor] mark ${name} failed:`, error);
  }
}

function performanceMeasure(
  name: string,
  startMark: string,
  endMark: string,
): PerformanceMeasure | null {
  try {
    performance.measure(name, startMark, endMark);
    const entries = performance.getEntriesByName(
      name,
      "measure",
    ) as PerformanceMeasure[];
    return entries.length > 0 ? entries[entries.length - 1] : null;
  } catch (error) {
    console.error(`[perf-monitor] measure ${name} failed:`, error);
    return null;
  }
}

// ============ 采集与上报 ============

export interface PerfReport {
  bootTime: number; // 启动总耗时( swr-boot-start → swr-boot-end)
  bootStartAt: number; // 启动起点在时间轴上的位置
  pageLoad: {
    dnsTime: number;
    requestWaitTime: number;
    requestTime: number;
    domInteractive: number;
  };
  slowestResource: { name: string; duration: number } | null;
  pingResource: { duration: number } | null;
  longTaskCount: number;
}

let longTaskCount = 0;

export function collectAndReport(): PerfReport | null {
  // 启动完成后停止长任务采样, 避免后续交互噪声混入启动数据
  longTaskObserver?.disconnect();
  // 增大 resource timing 缓冲区, 防止条目被丢弃
  try {
    performance.setResourceTimingBufferSize(200);
  } catch {
    // 老浏览器不支持, 忽略
  }

  try {
    // 1. Navigation Timing: 拆解文档自身的加载耗时
    const navEntry = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const pageLoad = navEntry
      ? {
          dnsTime: navEntry.domainLookupEnd - navEntry.domainLookupStart || 0,
          requestWaitTime:
            navEntry.requestStart - navEntry.domainLookupEnd || 0,
          requestTime: navEntry.responseEnd - navEntry.requestStart || 0,
          domInteractive: navEntry.domInteractive || 0,
        }
      : { dnsTime: 0, requestWaitTime: 0, requestTime: 0, domInteractive: 0 };

    // 2. Resource Timing: 找最慢资源与预加载探测请求
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    let slowestResource: PerfReport["slowestResource"] = null;
    for (const r of resources) {
      if (!slowestResource || r.duration > slowestResource.duration) {
        slowestResource = { name: r.name, duration: Math.round(r.duration) };
      }
    }
    const pingEntry = resources.find((r) => r.name.includes("/perf-ping"));
    const pingResource = pingEntry
      ? { duration: Math.round(pingEntry.duration) }
      : null;

    // 3. mark/measure: 启动总耗时
    const bootMeasure = performanceMeasure(
      "swr-boot-time",
      "swr-boot-start",
      "swr-boot-end",
    );
    const bootTime = bootMeasure ? Math.round(bootMeasure.duration) : 0;
    const bootStartAt = bootMeasure ? Math.round(bootMeasure.startTime) : 0;

    // 4. 启动耗时上报( 对应 boot.ts 的 qn-fcp)
    if (bootMeasure) {
      report({
        p1: "swr-demo-boot",
        c1: location.pathname,
        c2: bootStartAt, // 启动起点
        c3: bootTime, // 启动总耗时
        c4: navEntry ? Math.round(navEntry.responseEnd) : 0, // 文档响应完成时间
        c5: longTaskCount, // 启动期间长任务数量
        p4: "OTHER",
      });
    }

    // 5. 文档加载性能上报( 对应 boot.ts 的 performance-index)
    report({
      p1: "performance-index",
      c1: Math.round(pageLoad.dnsTime),
      c2: Math.round(pageLoad.requestWaitTime),
      c3: Math.round(pageLoad.requestTime),
      c4: Math.round(pageLoad.domInteractive),
      p4: "OTHER",
    });

    return {
      bootTime,
      bootStartAt,
      pageLoad,
      slowestResource,
      pingResource,
      longTaskCount,
    };
  } catch (error) {
    console.error("[perf-monitor] collectAndReport failed:", error);
    return null;
  }
}

// ============ 初始化入口 ============

export function initPerfMonitor() {
  if (!("PerformanceObserver" in window)) return;
  // 先统计长任务数量再上报
  const countObserver = new PerformanceObserver((list) => {
    longTaskCount += list.getEntries().filter((e) => e.duration > 50).length;
  });
  try {
    countObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    // longtask 不支持时忽略
  }
  observeLongTasks();
}

// 每轮对比实验前重置打点, 保证 measure 反映本轮启动
export function resetBootMarks() {
  try {
    performance.clearMarks("swr-boot-start");
    performance.clearMarks("swr-boot-end");
    performance.clearMeasures("swr-boot-time");
  } catch {
    // 忽略
  }
}
