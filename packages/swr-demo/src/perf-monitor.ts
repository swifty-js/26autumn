// Hand-rolled frontend performance monitoring (modeled after src/boot.ts)
// Approach: performance.mark/measure instrumentation + PerformanceObserver long-task
//           detection + Navigation Timing breakdown + Resource Timing collection
//           + queued reporting. No third-party monitoring SDK; uses only the
//           browser-native Performance API.

// ============ Report queue (mirrors window.PERF_QUEUE in boot.ts) ============

export interface PerfLogEntry {
  action: "log";
  arguments: [
    "event",
    Record<string, string | number> & { p1: string; p4: string },
  ];
}

// In production this queue is consumed asynchronously by a monitoring SDK;
// in this demo it simply accumulates and logs to console.
export const PERF_QUEUE: PerfLogEntry[] = [];

function report(entry: PerfLogEntry["arguments"][1]) {
  PERF_QUEUE.push({ action: "log", arguments: ["event", entry] });
  console.log("[perf-monitor] report:", entry.p1, entry);
}

// ============ Long-task observer (mirrors longTaskObserver in boot.ts) ============

let longTaskObserver: PerformanceObserver | undefined;

export function observeLongTasks() {
  if (!("PerformanceObserver" in window)) {
    console.warn(
      "PerformanceObserver not supported; cannot observe main-thread blocking",
    );
    return;
  }
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only report tasks exceeding 50ms (INP / TBT threshold)
        if (entry.duration > 50) {
          report({
            p1: "main-thread-blocking",
            c1: location.pathname,
            c2: entry.name,
            c3: Math.round(entry.startTime),
            c4: Math.round(entry.duration), // blocking duration in ms
            p4: "OTHER",
          });
        }
      }
    });
    longTaskObserver.observe({ entryTypes: ["longtask"] });
    console.log("[perf-monitor] long-task observer started");
  } catch (error) {
    console.error("[perf-monitor] failed to start long-task observer:", error);
  }
}

// ============ mark / measure utilities (mirrors performanceMeasure in boot.ts) ============

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

// ============ Collection & reporting ============

export interface PerfReport {
  bootTime: number; // total boot duration (swr-boot-start -> swr-boot-end)
  bootStartAt: number; // boot start position on the timeline
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
  // Stop long-task sampling after boot completes to avoid interaction noise
  longTaskObserver?.disconnect();
  // Increase resource timing buffer to prevent entry eviction
  try {
    performance.setResourceTimingBufferSize(200);
  } catch {
    // Unsupported in older browsers; ignore
  }

  try {
    // 1. Navigation Timing: decompose document load latency
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

    // 2. Resource Timing: identify slowest resource and the preload probe
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

    // 3. mark/measure: total boot duration
    const bootMeasure = performanceMeasure(
      "swr-boot-time",
      "swr-boot-start",
      "swr-boot-end",
    );
    const bootTime = bootMeasure ? Math.round(bootMeasure.duration) : 0;
    const bootStartAt = bootMeasure ? Math.round(bootMeasure.startTime) : 0;

    // 4. Boot time report (mirrors qn-fcp in boot.ts)
    if (bootMeasure) {
      report({
        p1: "swr-demo-boot",
        c1: location.pathname,
        c2: bootStartAt,
        c3: bootTime,
        c4: navEntry ? Math.round(navEntry.responseEnd) : 0,
        c5: longTaskCount,
        p4: "OTHER",
      });
    }

    // 5. Document load performance report (mirrors performance-index in boot.ts)
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

// ============ Initialization ============

export function initPerfMonitor() {
  if (!("PerformanceObserver" in window)) return;
  // Count long tasks before reporting
  const countObserver = new PerformanceObserver((list) => {
    longTaskCount += list.getEntries().filter((e) => e.duration > 50).length;
  });
  try {
    countObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    // longtask entry type unsupported; ignore
  }
  observeLongTasks();
}

// Reset marks before each benchmark run so measures reflect the current cycle
export function resetBootMarks() {
  try {
    performance.clearMarks("swr-boot-start");
    performance.clearMarks("swr-boot-end");
    performance.clearMeasures("swr-boot-time");
  } catch {
    // ignore
  }
}
