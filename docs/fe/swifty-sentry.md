---
protected: true
---

# @swifty.js/sentry 前端监控 SDK 面试 QA

## 目录

- [Q1: 项目整体架构设计是怎样的？核心模块有哪些？](#q1-项目整体架构设计是怎样的-核心模块有哪些)
- [Q2: SDK 的初始化流程是怎样的？有哪些防护机制？](#q2-sdk-的初始化流程是怎样的-有哪些防护机制)
- [Q3: 事件总线（Pub/Sub）是如何设计的？为什么选择这种模式？](#q3-事件总线-pub-sub-是如何设计的-为什么选择这种模式)
- [Q4: HTTP 请求监控是如何实现的？XHR 和 Fetch 的拦截有什么区别？](#q4-http-请求监控是如何实现的-xhr-和-fetch-的拦截有什么区别)
- [Q5: 错误捕获体系包含哪些类型？如何做到去重和批量聚合？](#q5-错误捕获体系包含哪些类型-如何做到去重和批量聚合)
- [Q6: 数据上报管道的完整流程是怎样的？](#q6-数据上报管道的完整流程是怎样的)
- [Q7: 上报传输层如何选择通道？为什么需要多通道策略？](#q7-上报传输层如何选择通道-为什么需要多通道策略)
- [Q8: 离线缓存和断网恢复机制是如何实现的？](#q8-离线缓存和断网恢复机制是如何实现的)
- [Q9: 白屏检测算法的原理是什么？如何处理骨架屏场景？](#q9-白屏检测算法的原理是什么-如何处理骨架屏场景)
- [Q10: 首屏渲染时间（FSP）是如何计算的？与 LCP 有什么区别？](#q10-首屏渲染时间-fsp-是如何计算的-与-lcp-有什么区别)
- [Q11: 性能监控插件采集了哪些指标？Web Vitals 是如何集成的？](#q11-性能监控插件采集了哪些指标-web-vitals-是如何集成的)
- [Q12: 面包屑（Breadcrumb）为什么使用最小堆？相比数组有什么优势？](#q12-面包屑-breadcrumb-为什么使用最小堆-相比数组有什么优势)
- [Q13: 屏幕录制插件的滚动窗口机制是如何实现的？](#q13-屏幕录制插件的滚动窗口机制是如何实现的)
- [Q14: 插件体系是如何设计的？如何做到可插拔？](#q14-插件体系是如何设计的-如何做到可插拔)
- [Q15: 框架集成（React/Vue/Preact）是如何实现的？](#q15-框架集成-react-vue-preact-是如何实现的)
- [Q16: 采样率和数据过滤机制是如何工作的？](#q16-采样率和数据过滤机制是如何工作的)
- [Q17: Reporter 单例为什么使用 Proxy 实现懒加载？](#q17-reporter-单例为什么使用-proxy-实现懒加载)
- [Q18: 声明式点击埋点的实现原理是什么？](#q18-声明式点击埋点的实现原理是什么)
- [Q19: 设备指纹和用户身份体系是如何设计的？](#q19-设备指纹和用户身份体系是如何设计的)
- [Q20: 项目的构建方案和工程化实践有哪些？](#q20-项目的构建方案和工程化实践有哪些)
- [Q21: BoundedSet 的实现原理是什么？为什么用 Map 而不是 Set？](#q21-boundedset-的实现原理是什么-为什么用-map-而不是-set)
- [Q22: CallbackQueue 的设计意图是什么？为什么使用 requestIdleCallback？](#q22-callbackqueue-的设计意图是什么-为什么使用-requestidlecallback)
- [Q23: 路由监听是如何同时支持 History 和 Hash 模式的？](#q23-路由监听是如何同时支持-history-和-hash-模式的)
- [Q24: PV 和页面停留时长是如何追踪的？](#q24-pv-和页面停留时长是如何追踪的)
- [Q25: 如果让你优化这个 SDK，你会从哪些方面入手？](#q25-如果让你优化这个-sdk-你会从哪些方面入手)

---

## Q1: 项目整体架构设计是怎样的？核心模块有哪些？

答：

@swifty.js/sentry 是一个框架无关的浏览器端监控与分析 SDK，采用分层架构设计，核心模块如下：

```
┌─────────────────────────────────────────────────────┐
│                   Public API Layer                  │
│  init() / destroy() / traceError() / enablePlugin() │
├─────────────────────────────────────────────────────┤
│                   Core Layer                        │
│  sdk-lifecycle / setup / bus / decorates / handlers │
├─────────────────────────────────────────────────────┤
│                  Reporter Layer                     │
│  DataReporter / transports / offline-cache / batch  │
├─────────────────────────────────────────────────────┤
│                  Plugin Layer                       │
│  PerformancePlugin / ScreenRecordPlugin / Exposure  │
├─────────────────────────────────────────────────────┤
│                  Framework Layer                    │
│  react.ts / vue.ts / preact.ts / vite.ts / webpack  │
├─────────────────────────────────────────────────────┤
│                  Utils Layer                        │
│  data-structures / session / base64 / throttle      │
└─────────────────────────────────────────────────────┘
```

核心模块职责：

| 模块         | 路径                      | 职责                                         |
| ------------ | ------------------------- | -------------------------------------------- |
| SDK 生命周期 | `core/sdk-lifecycle.ts`   | init/destroy/enablePlugin 入口               |
| 事件总线     | `core/bus.ts`             | 基于 Map<EventType, Set<Handler>> 的发布订阅 |
| 猴子补丁调度 | `core/decorates.ts`       | 统一安装/卸载浏览器 API 拦截                 |
| HTTP 拦截    | `core/decorate-http.ts`   | XHR/Fetch 请求监控                           |
| 路由拦截     | `core/decorate-route.ts`  | History/Hash 路由变化监听                    |
| 数据上报器   | `reporter/index.ts`       | 批量队列、传输选择、离线缓存                 |
| 插件注册     | `core/plugin-registry.ts` | 插件 Set 管理与生命周期                      |
| 配置校验     | `core/options-schema.ts`  | Zod schema 运行时校验                        |

设计原则：

1. 发布订阅解耦：数据采集（Producer）与数据处理（Consumer）通过事件总线完全解耦
2. 可插拔插件：性能、录屏、曝光等重功能以插件形式按需加载
3. 框架无关核心：核心不依赖任何框架，通过独立入口文件提供框架集成
4. 多出口构建：package.json exports 提供 `.`、`./react`、`./vue`、`./plugins` 等多个入口

---

## Q2: SDK 的初始化流程是怎样的？有哪些防护机制？

答：

初始化入口为 `init(options)` 函数（`core/sdk-lifecycle.ts`），完整流程：

```typescript
export function init(options: InitOptions): void {
  // 1. 合并默认配置 + Zod 校验
  const parsedOptions = optionsSchema.parse({ ...DEFAULT_OPTIONS, ...options });
  sentry.setOptions(parsedOptions);

  // 2. 防护检查
  if (sentry.options.disabled) return; // 用户主动禁用
  if (dsn === "") return; // DSN 为空拒绝初始化
  if (isInitialized()) return; // 防止重复初始化

  // 3. 启动事件订阅和猴子补丁
  cleanupSetup = setup();

  // 4. 异步初始化身份识别
  void initIdentity();
}
```

防护机制：

1. Zod 运行时校验：所有配置项通过 `optionsSchema.parse()` 校验，非法配置会抛出明确错误
2. disabled 开关：支持通过配置完全禁用 SDK（适用于 A/B 测试或环境区分）
3. DSN 非空检查：上报地址为空时拒绝初始化，避免无效运行
4. 单例守卫：`isInitialized()` 通过 `cleanupSetup !== null` 判断，防止重复初始化
5. destroy 完整清理：销毁时依次执行 `destroyPlugins()` -> `cleanupSetup()` -> `destroyBatchErrorManager()` -> `resetReporter()`，确保无内存泄漏

setup() 的清理函数设计：

`setup()` 返回一个 cleanup 函数，内部收集了所有事件订阅的取消函数和猴子补丁的还原函数。调用 `destroy()` 时一次性还原所有修改，保证 SDK 可以安全地从页面中移除。

---

## Q3: 事件总线（Pub/Sub）是如何设计的？为什么选择这种模式？

答：

事件总线实现在 `core/bus.ts`，核心数据结构为 `Map<EventType, Set<TEventHandler>>`：

```typescript
// 核心结构
const subscriptions = new Map<EventType, Set<TEventHandler>>();

// 发布
function pub(type: EventType, data: unknown): void {
  const handlers = subscriptions.get(type);
  if (handlers) handlers.forEach((handler) => handler(data));
}

// 订阅（返回清理函数）
function sub(type: EventType, handler: TEventHandler): Cleanup {
  if (!subscriptions.has(type)) subscriptions.set(type, new Set());
  subscriptions.get(type)!.add(handler);
  return () => subscriptions.get(type)?.delete(handler);
}
```

选择 Pub/Sub 模式的原因：

1. 解耦采集与处理：猴子补丁（Producer）只负责发布原始事件，不关心后续如何处理（上报、面包屑、录屏触发等）
2. 一对多分发：一个 HTTP 事件可以同时触发上报、面包屑记录、屏幕录制标记等多个消费者
3. 可测试性：可以独立测试采集层和处理层，mock 总线即可
4. 动态订阅：插件可以在运行时订阅/取消订阅，无需修改核心代码
5. 清理友好：每个 `sub()` 返回 cleanup 函数，`destroy()` 时调用 `clearSubscriptions()` 一次性清空

与 EventEmitter 的区别：

- 使用 `Set` 而非数组存储 handler，天然去重且删除为 O(1)
- 类型约束为 `EventType` 枚举，编译期即可发现事件名拼写错误
- 不继承 Node.js EventEmitter，零依赖且体积更小

---

## Q4: HTTP 请求监控是如何实现的？XHR 和 Fetch 的拦截有什么区别？

答：

HTTP 监控通过猴子补丁（Monkey Patching）实现，位于 `core/decorate-http.ts`。

XHR 拦截（原型链装饰）：

```typescript
// 装饰 open：记录请求元信息
const cleanupOpen = decorateProp(xhrProto, "open", (oldPropVal) => {
  return function (this, method, url, async, ...rest) {
    this.__sentry__ = {
      ...getBaseData(),
      name: "XMLHttpRequest",
      type: EventType.Xhr,
      method: method.toUpperCase(),
      api: url,
    };
    return oldPropVal.call(this, method, url, async, ...rest);
  };
});

// 装饰 send：在 loadend 事件中收集响应数据
const cleanupSend = decorateProp(xhrProto, "send", (oldPropVal) => {
  return function (this, body) {
    this.addEventListener("loadend", () => {
      this.__sentry__.statusCode = this.status;
      this.__sentry__.serverTiming = parseServerTiming(
        this.getResponseHeader("server-timing"),
      );
      this.__sentry__.elapsedTime = Date.now() - this.__sentry__.timestamp;
      pub(EventType.Xhr, this.__sentry__);
    });
    return oldPropVal.call(this, body);
  };
});
```

Fetch 拦截（全局函数包装）：

```typescript
const cleanup = decorateProp(globalThis, "fetch", (oldFetch) => {
  return async function(url, options) {
    const httpData = { ...getBaseData(), type: EventType.Fetch, ... };
    return oldFetch.call(globalThis, url, options)
      .then((res) => {
        const resClone = res.clone();  // 关键：clone 避免消费 body
        httpData.statusCode = resClone.status;
        httpData.serverTiming = getServerTimingFromHeaders(resClone.headers);
        resClone.text().then((text) => {
          httpData.responseData = text;
          pub(EventType.Fetch, httpData);
        });
        return res;  // 返回原始 response 给业务代码
      })
      .catch((err) => {
        httpData.statusCode = 0;
        httpData.message = err.message;
        pub(EventType.Fetch, httpData);
        throw err;  // 继续抛出，不吞异常
      });
  };
});
```

两者的核心区别：

| 维度      | XHR                                  | Fetch                          |
| --------- | ------------------------------------ | ------------------------------ |
| 拦截位置  | `XMLHttpRequest.prototype.open/send` | `globalThis.fetch`             |
| 响应获取  | `loadend` 事件回调                   | Promise `.then()`              |
| Body 处理 | 直接读取 `this.response`             | 必须 `res.clone()` 后读取      |
| 错误捕获  | loadend 中 status=0                  | `.catch()` 中设置 statusCode=0 |
| 存储方式  | 挂在实例 `this.__sentry__`           | 闭包变量 `httpData`            |

共同设计要点：

1. 自身请求过滤：`shouldIgnoreRequest()` 过滤发往 DSN 的上报请求，避免死循环
2. excludeApis 配置：支持用户配置排除特定 API 路径
3. Server-Timing 解析：从响应头提取服务端性能数据
4. 可逆装饰：`decorateProp` 返回 cleanup 函数，destroy 时还原原始方法

---

## Q5: 错误捕获体系包含哪些类型？如何做到去重和批量聚合？

答：

错误类型覆盖：

| 类型               | 来源                     | 实现方式                             |
| ------------------ | ------------------------ | ------------------------------------ |
| 运行时 JS 错误     | `window.onerror`         | capture 阶段监听 `error` 事件        |
| 资源加载错误       | img/script/link 加载失败 | capture 阶段判断 `target.src/href`   |
| Promise 未捕获异常 | `unhandledrejection`     | 全局事件监听                         |
| console.error      | 开发者主动输出           | 装饰 `console.error` 提取 Error 对象 |
| React 组件错误     | ErrorBoundary            | `componentDidCatch` 生命周期         |
| Vue 组件错误       | errorHandler             | `app.config.errorHandler`            |
| Preact 组件错误    | ErrorBoundary            | 同 React 模式                        |

去重机制（BoundedSet + base64v2 哈希）：

```typescript
// 生成错误唯一标识
const errorId = base64v2(
  `${EventType.Error}-${message}-${filename}-${line}-${column}`,
);

// BoundedSet 判重（容量 1000，LRU 淘汰）
if (!sentry.codeErrors.has(errorId)) {
  sentry.codeErrors.add(errorId);
  batchErrorManager.push(codeError);
}
```

- 使用 `base64v2` 对 `type-name-message-filename-line-column` 编码作为唯一键
- `BoundedSet` 容量上限 1000，超出时淘汰最早插入的条目（基于 Map 的插入顺序）
- 可通过 `repeatCodeError: true` 配置关闭去重

批量聚合（BatchErrorManager）：

```typescript
class BatchErrorManager {
  push(error) {
    this.cacheError.push(error);
    clearTimeout(this.timeoutID);
    this.timeoutID = setTimeout(() => this.flush(), 2000); // 2s 窗口
  }

  flush() {
    // 按 type-name-message 分组
    const groups = groupBy(
      this.cacheError,
      (err) => `${err.type}-${err.name}-${err.message}`,
    );
    for (const items of Object.values(groups)) {
      if (items.length >= 5) {
        // 5 次以上聚合为单条 BatchError
        reporter.send({
          ...items[0],
          batchError: true,
          batchErrorLength: items.length,
        });
      } else {
        items.forEach((item) => reporter.send(item));
      }
    }
  }
}
```

设计意图：

- 防止循环错误（如 `setInterval` 中抛错）导致上报风暴
- 2 秒时间窗口 + 5 次阈值的组合，既保证单次错误及时上报，又避免高频重复错误打满带宽
- `batchErrorLastHappenTime` 记录最后一次发生时间，便于后端判断错误持续性

---

## Q6: 数据上报管道的完整流程是怎样的？

答：

DataReporter 的上报管道分为 send（入队）和 flush（发送）两个阶段：

Send 阶段（入队）：

```
payload 进入
    │
    ▼
shouldQueuePayload() ─── 采样率检查 + DSN 非空 + 设置录屏标记
    │ (通过)
    ▼
runBeforeReportHook() ─── 转换为 IReportData（附加 url/userId/projectId/sdkVersion/deviceInfo）
    │                      执行 onBeforeReportData 钩子（可修改/拒绝）
    ▼
events.push(data) ─── 入队
    │
    ├── 离线？──► 裁剪到 maxQueueLength + 写入 localStorage
    │
    ├── immediate 或 队列 >= cacheMaxLength？──► 立即 flush()
    │
    └── 否则 ──► 延迟 cacheWaitingTime(2s) 后 flush()
```

Flush 阶段（发送）：

```
flush() 调用
    │
    ├── events 为空 或 isFlushing？──► 返回（防并发）
    │
    ▼
isFlushing = true
    │
    ├── 离线？──► 裁剪 + 持久化 + 返回
    │
    ▼
takeBatch() ─── 取前 cacheMaxLength 条 + 执行 beforePushEventList 钩子
    │
    ▼
sendBatch() ─── 选择传输通道（见 Q7）
    │
    ├── 失败 ──► 数据回插 events 头部 + 持久化 + 触发 serverRecovery
    │
    ├── 成功 ──► 执行 afterSendData 钩子
    │
    ▼
isFlushing = false
    │
    ▼
scheduleNextFlush() ─── 队列仍有数据则 100ms 后继续 flush
```

关键设计点：

1. 防并发锁：`isFlushing` 标志位防止多个 flush 同时执行
2. 批量分片：每次最多取 `cacheMaxLength`（默认 10）条，避免单次请求过大
3. 失败回插：发送失败的数据回插到队列头部，不丢失
4. 连续 flush：一批发完后如果还有数据，100ms 后继续，形成流水线
5. 钩子系统：`onBeforeReportData`（单条修改/拒绝）、`beforePushEventList`（批量修改）、`afterSendData`（发送后回调）

---

## Q7: 上报传输层如何选择通道？为什么需要多通道策略？

答：

传输选择逻辑在 `sendBatch()` 方法中：

```typescript
private sendBatch(finalSendData: readonly IReportData[]): Promise<boolean> | boolean {
  const isOverBeaconSize = isObjectOverSizeLimit(finalSendData, 60);  // 60KB

  // 优先级 1: sendBeacon（< 60KB）
  if (!isOverBeaconSize && sendBeacon(finalSendData)) return true;

  // 优先级 2: Image 上报（< 2KB，需配置开启）
  if (sentry.options.useImageReport && !isObjectOverSizeLimit(finalSendData, 2)) {
    reportByImage(finalSendData, this.cbQueue);
    return true;
  }

  // 优先级 3: fetch POST（兜底）
  return reportByFetch(finalSendData, () => this.handleServerError());
}
```

三种通道对比：

| 通道                   | 大小限制 | 优势                                                  | 劣势                                     | 适用场景              |
| ---------------------- | -------- | ----------------------------------------------------- | ---------------------------------------- | --------------------- |
| `navigator.sendBeacon` | ~64KB    | 页面卸载时仍可靠发送、不阻塞页面、浏览器调度          | 仅 POST、无法自定义 header、无法获取响应 | 常规批量上报          |
| Image (1x1 gif)        | ~2KB     | 跨域无限制、兼容极老浏览器、不受 CSP connect-src 限制 | 仅 GET、URL 长度限制、无法发送复杂数据   | 兜底/跨域受限环境     |
| `fetch POST`           | 无硬限制 | 可自定义 header、可获取响应状态、支持 keepalive       | 页面卸载时可能中断                       | 大数据量/需要确认送达 |

为什么需要多通道：

1. 页面关闭场景：`beforeunload` 时 fetch 可能被取消，sendBeacon 由浏览器保证发出
2. CSP 限制：某些站点 CSP 不允许 connect-src 但允许 img-src
3. 数据量适配：小数据用 Image 最轻量，中等数据用 Beacon 最可靠，大数据用 Fetch 最灵活
4. 降级容错：sendBeacon 返回 false（队列满）时自动降级到 fetch

fetch 通道的特殊处理：

- 使用 `keepalive: true` 选项，在页面卸载时仍尝试完成请求
- 失败时触发 `handleServerError()`，启动定时 HEAD 探测恢复机制

---

## Q8: 离线缓存和断网恢复机制是如何实现的？

答：

离线容错由三个模块协作完成：

1. 网络状态监听（network-listener.ts）：

```typescript
window.addEventListener("offline", () => setOnline(false));
window.addEventListener("online", () => {
  setOnline(true);
  loadOfflineCache(); // 加载离线期间缓存的数据
  flush(); // 立即尝试发送
});
```

2. 离线缓存持久化（offline-cache.ts）：

- 存储介质：`localStorage`，key 为 `swifty_sentry_offline_cache`（可配置）
- 写入时机：离线时每次 send 后、flush 失败时、页面关闭前
- 读取校验：从 localStorage 加载时使用 Zod schema 校验数据完整性，损坏数据丢弃
- 容量控制：`events.slice(-maxQueueLength)` 限制最大 200 条，防止撑爆 localStorage

3. 服务端故障恢复（server-recovery.ts）：

```typescript
export function scheduleServerRecovery(
  retryTimer: ReturnType<typeof setTimeout> | undefined,
  callbacks: ServerRecoveryCallbacks,
): ReturnType<typeof setTimeout> {
  callbacks.setOnline(false);
  if (retryTimer) clearTimeout(retryTimer);
  // setTimeout 单次调度，失败后递归重新安排下一轮
  const nextRetryTimer = setTimeout(() => {
    testServerAvailable(callbacks);
  }, sentry.options.retryIntervalMilliseconds); // 默认 60s
  callbacks.setRetryTimer(nextRetryTimer);
  return nextRetryTimer;
}

function testServerAvailable(callbacks: ServerRecoveryCallbacks): void {
  fetch(sentry.options.dsn, { method: "HEAD" })
    .then((res) => {
      if (!res.ok) {
        scheduleServerRecovery(undefined, callbacks); // 不可用：递归安排重试
        return;
      }
      callbacks.setOnline(true);
      callbacks.loadOfflineCache();
      void callbacks.flush();
    })
    .catch(() => {
      scheduleServerRecovery(undefined, callbacks); // 异常：递归安排重试
    });
}
```

完整离线场景流程：

```
网络断开
  │
  ▼
offline 事件 ──► isOnline = false
  │
  ▼
后续 send() ──► 数据入队 + 裁剪到 maxQueueLength + 写入 localStorage
  │
  ▼
网络恢复
  │
  ├── online 事件 ──► isOnline = true ──► 加载缓存 ──► flush()
  │
  └── 或 fetch 失败 ──► scheduleServerRecovery() ──► 60s HEAD 探测
                                                       │
                                                       ▼ (200 OK)
                                                   加载缓存 + flush()
```

设计亮点：

- 区分「客户端离线」和「服务端不可达」两种故障，分别用 online 事件和 HEAD 探测处理
- 数据回插机制：flush 失败时 `events = [...finalSendData, ...events]`，保证数据不丢
- localStorage 有 5MB 限制，通过 `maxQueueLength=200` 和单条数据大小控制总量

---

## Q9: 白屏检测算法的原理是什么？如何处理骨架屏场景？

答：

白屏检测实现在 `core/white-screen.ts`，核心思想是视口采样点检测。

算法原理：

```typescript
const sample = () => {
  const { innerWidth, innerHeight } = globalThis;
  let emptyPoints = 0;

  // 水平方向 9 个点 + 垂直方向 9 个点 = 18 个采样点
  for (let i = 1; i <= 9; i++) {
    const rowElem = document.elementFromPoint(
      (innerWidth * i) / 10,
      innerHeight / 2,
    );
    const colElem = document.elementFromPoint(
      innerWidth / 2,
      (innerHeight * i) / 10,
    );
    if (!rowElem || isRoot(rowElem)) emptyPoints++;
    if (!colElem || isRoot(colElem)) emptyPoints++;
  }

  // 18/18 个点都是根元素 → 判定白屏
  if (emptyPoints >= 18) report();
};
```

采样策略：

- 在视口中心水平线均匀取 9 点（10%~90% 宽度位置）
- 在视口中心垂直线均匀取 9 点（10%~90% 高度位置）
- 每隔 1 秒采样一次（`WHITE_SCREEN_SAMPLE_INTERVAL = 1000`）
- 最多采样 10 次（`MAX_WHITE_SCREEN_SAMPLE_COUNT = 10`）

根元素判定：

```typescript
const isRoot = (elem: Element) => {
  const [idSelector, classSelector, elementSelector] = getCssSelectors(elem);
  return (
    rootCssSelectors.includes(idSelector) || // 如 "#app", "#root"
    rootCssSelectors.includes(classSelector) ||
    rootCssSelectors.includes(elementSelector) // 如 "html", "body"
  );
};
```

默认 `rootCssSelectors: ["html", "body", "#app", "#root"]`，可配置。

骨架屏场景处理：

```typescript
if (hasSkeleton) {
  if (sampleCount === 1) {
    // 第一次采样：记录骨架屏的 CSS 选择器集合
    selectors.forEach((s) => initialSelectors.add(s));
    return; // 继续采样
  }
  // 后续采样：比较选择器是否变化
  if (sortedJoin(currentSelectors) === sortedJoin(initialSelectors)) {
    report(); // 选择器未变化 → 骨架屏卡住 → 白屏
    return;
  }
  stopSample(); // 选择器变化了 → 正常渲染 → 非白屏
}
```

性能优化：

- 使用 `requestIdleCallback` 在浏览器空闲时执行采样，避免阻塞主线程
- 页面 `readyState === "complete"` 后才开始采样
- 一旦检测到白屏或确认非白屏，立即停止定时器

---

## Q10: 首屏渲染时间（FSP）是如何计算的？与 LCP 有什么区别？

答：

FSP（First Screen Paint）实现在 `plugins/performance/first-screen-paint.ts`，是一个自定义指标。

实现原理：

```typescript
function observeFirstScreenPaint(callback: Callback): void {
  const excludedElementNames = new Set(["link", "script", "style"]);
  observer = new MutationObserver((mutationList) => {
    checkDomChange(callback); // 检测是否渲染完成

    const children: HTMLElement[] = [];
    for (const mutation of mutationList) {
      // 过滤条件：
      // 1. 必须是 HTMLElement
      // 2. 必须有新增节点（addedNodes.length > 0）
      // 3. 父节点在视口内
      // 4. 新增节点在视口内
      // 5. 排除 link/script/style 非可视元素
      if (
        isHTMLElement(node) &&
        !excluded.has(node.tagName) &&
        isInViewport(node)
      ) {
        children.push(node);
      }
    }
    if (children.length) {
      entries.push({ children, startTime: performance.now() });
    }
  });

  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
}
```

完成判定：

```typescript
function checkDomChange(callback: Callback): void {
  cancelAnimationFrame(requestId);
  requestId = requestAnimationFrame(() => {
    if (document.readyState === "complete") {
      observer?.disconnect();
      const fsp = Math.max(...entries.map((e) => e.startTime)); // 取最晚的可视元素渲染时间
      callback(fsp);
      return;
    }
    checkDomChange(callback); // 未完成则继续监听
  });
}
```

FSP vs LCP 对比：

| 维度     | FSP（自定义）                            | LCP（Web Vitals 标准）                            |
| -------- | ---------------------------------------- | ------------------------------------------------- |
| 定义     | 首屏所有可视 DOM 元素完成渲染的时间      | 视口内最大内容元素完成渲染的时间                  |
| 关注点   | 首屏整体完成度                           | 单个最大元素                                      |
| 实现方式 | MutationObserver 追踪所有视口内 DOM 变化 | PerformanceObserver 监听 largest-contentful-paint |
| 排除元素 | link/script/style                        | 由浏览器自动判定                                  |
| 终止条件 | `document.readyState === "complete"`     | 用户交互或页面完全加载                            |
| 适用场景 | SPA 首屏、SSR 页面                       | 通用页面                                          |

设计意图：

LCP 只关注单个最大元素，对于 SPA 首屏由多个小组件组成的场景不够准确。FSP 追踪所有视口内 DOM 变化，取最后一个可视元素的渲染时间，更能反映用户感知的「首屏完成」。

---

## Q11: 性能监控插件采集了哪些指标？Web Vitals 是如何集成的？

答：

PerformancePlugin 是 SDK 最重的插件，采集以下指标类别：

1. Core Web Vitals（via web-vitals 库）：

| 指标 | 含义             | 采集方式   |
| ---- | ---------------- | ---------- |
| LCP  | 最大内容绘制     | `onLCP()`  |
| FCP  | 首次内容绘制     | `onFCP()`  |
| CLS  | 累积布局偏移     | `onCLS()`  |
| INP  | 交互到下一次绘制 | `onINP()`  |
| TTFB | 首字节时间       | `onTTFB()` |

2. Navigation Timing（Performance API）：

从 `performance.getEntriesByType("navigation")` 提取：

- DNS 查询耗时（domainLookupEnd - domainLookupStart）
- TCP 连接耗时（connectEnd - connectStart）
- TLS 握手耗时
- 首字节时间（responseStart - requestStart）
- 内容传输耗时（responseEnd - responseStart）
- DOM 解析耗时（domInteractive - responseEnd）
- 资源加载耗时（loadEventStart - domContentLoadedEventEnd）
- 重定向耗时、Unload 耗时

3. Resource Timing（PerformanceObserver）：

- 监听 `resource` 类型的 PerformanceEntry
- 排除 fetch/xmlhttprequest/beacon 类型（这些由 HTTP 监控覆盖）
- 记录每个静态资源的加载耗时、大小、 initiatorType

4. Resource Element Fallback（MutationObserver）：

- 针对不支持 PerformanceObserver resource 类型的浏览器
- 通过 MutationObserver 监听新增的 img/script/link 元素
- 在元素 load/error 事件中记录耗时

5. Long Tasks：

- PerformanceObserver 监听 `longtask` 类型
- 记录超过 50ms 的长任务，用于定位主线程阻塞

6. Memory：

- 调用 `performance.measureUserAgentSpecificMemory()`（需 crossOriginIsolated）
- 记录 JS 堆内存使用情况

7. FSP（自定义首屏时间）：

- 如 Q10 所述的 MutationObserver 方案

---

## Q12: 面包屑（Breadcrumb）为什么使用最小堆？相比数组有什么优势？

答：

面包屑使用容量受限的最小堆（MinHeap）实现，位于 `utils/data-structures.ts`。

核心实现：

```typescript
class MinHeap<T extends { timestamp: number }> {
  capacity = 30; // MAX_BREADCRUMBS
  private heap: T[] = [];

  push(item: T): boolean {
    if (this.size < this.capacity) {
      this.heap.push(item);
      this.heapifyUp(this.size - 1);
      return true;
    }
    // 堆满时：新数据比堆顶（最旧）大则替换
    if (item.timestamp >= this.heap[0].timestamp) {
      this.heap[0] = item;
      this.heapifyDown(0);
      return true;
    }
    return false; // 比最旧的还旧，丢弃
  }

  dump(): T[] {
    return [...this.heap].sort((a, b) => a.timestamp - b.timestamp);
  }
}
```

与数组方案的对比：

| 操作                     | 数组方案                              | 最小堆方案                      |
| ------------------------ | ------------------------------------- | ------------------------------- |
| 插入（未满）             | O(1) push                             | O(log n) heapifyUp              |
| 插入（已满，需淘汰最旧） | O(n) shift + O(1) push 或 O(n) splice | O(log n) 替换堆顶 + heapifyDown |
| 查找最旧元素             | O(1) [0]（有序数组）或 O(n)           | O(1) heap[0]                    |
| 导出有序结果             | O(1)（已排序）或 O(n log n)           | O(n log n) sort                 |
| 空间                     | O(n)                                  | O(n)                            |

选择最小堆的原因：

1. 高频写入场景：面包屑在每次 HTTP、点击、错误、路由变化时都会写入，是高频操作。堆满后每次插入只需 O(log 30) ≈ 5 次比较，而数组 shift 是 O(30)
2. 无需维护全局有序：面包屑只在上报时需要有序（dump），平时只需快速淘汰最旧条目
3. 容量极小（30）：实际差异微乎其微，但堆的语义更清晰——「始终保留最新的 N 条」
4. 乱序容忍：如果事件因异步导致时间戳乱序到达，堆能正确处理，而简单数组 push+shift 会错误淘汰

dump() 的调用时机：

`dump()` 返回按时间戳排序的有序面包屑列表。需要注意的是，当前代码中它尚未被接线：src 内没有任何 `.dump()` 调用点，面包屑目前只进不出，没有被附加到上报数据中。这是一个预留能力，设计上可以在上报时导出有序面包屑帮助还原用户操作路径。

---

## Q13: 屏幕录制插件的滚动窗口机制是如何实现的？

答：

屏幕录制基于 `@rrweb/record`，实现在 `plugins/screen-record/`。

滚动窗口机制：

```typescript
// recorder.ts 核心逻辑
class RollingRecorder {
  private events: RRWebEvent[] = [];
  private durationMs: number; // 默认 3000ms

  onEvent(event: RRWebEvent) {
    this.events.push(event);
    // 过滤：只保留最近 durationMs 内的事件
    const cutoff = event.timestamp - this.durationMs;
    this.events = this.events.filter((e) => e.timestamp >= cutoff);
  }

  getSnapshot(): string {
    // JSON -> pako gzip -> base64
    const json = JSON.stringify(this.events);
    const compressed = pako.gzip(json);
    return base64Encode(compressed);
  }
}
```

触发机制：

- 不是持续录制，而是事件驱动触发
- 当上报的事件类型匹配 `screenRecordEventTypes`（默认：Error、XHR、Fetch、Resource、UnhandledRejection）时，`send-preflight.ts` 设置 `sentry.shouldScreenRecord = true`
- ScreenRecordPlugin 检测到标记后，取当前滚动窗口内的 rrweb 事件快照，附加到上报数据中

压缩流程：

```
rrweb events (JSON) → pako.gzip() → Uint8Array → base64 编码 → 字符串
```

解码使用导出的 `unzipScreenRecord()` 函数：

```
base64 字符串 → Uint8Array → pako.ungzip() → JSON.parse() → rrweb events
```

设计考量：

1. 隐私保护：只保留最近 3 秒，不记录用户完整操作历史
2. 体积控制：gzip 压缩后通常只有原始 JSON 的 10-20%
3. 性能影响：rrweb 本身使用 MutationObserver，开销可控；`recordCanvas: true` 会额外记录 canvas 内容
4. 按需触发：不是所有事件都附带录屏，只在错误/异常时触发，减少带宽

---

## Q14: 插件体系是如何设计的？如何做到可插拔？

答：

抽象基类定义（types/plugin.ts）：

```typescript
abstract class SentryPlugin {
  abstract type: EventType;
  abstract init(): void;
  destroy?(): void;
}
```

注册与管理（core/plugin-registry.ts）：

```typescript
const plugins = new Set<SentryPlugin>();

function registerPlugin(plugin: SentryPlugin): void {
  plugins.add(plugin);
}

function destroyPlugins(): void {
  plugins.forEach((p) => p.destroy?.());
  plugins.clear();
}
```

启用入口（core/sdk-lifecycle.ts）：

```typescript
export function enablePlugin(plugin: SentryPlugin): SentryPlugin {
  plugin.init();
  registerPlugin(plugin);
  return plugin;
}
```

使用方式：

```typescript
import { init, enablePlugin } from "@swifty.js/sentry";
import {
  PerformancePlugin,
  ScreenRecordPlugin,
} from "@swifty.js/sentry/plugins";

init({ dsn: "https://..." });
enablePlugin(new PerformancePlugin());
enablePlugin(new ScreenRecordPlugin());
```

可插拔设计要点：

1. 独立入口：插件从 `@swifty.js/sentry/plugins` 单独导入，不引入则不打包（tree-shaking 友好）
2. 生命周期约束：`init()` 必须实现，`destroy()` 可选但推荐
3. 无侵入核心：插件通过事件总线订阅事件，不修改核心代码
4. 独立销毁：`destroy()` 时遍历所有插件调用其 destroy，清理 Observer/Timer
5. Set 存储：天然去重，同一插件实例不会注册两次

三个内置插件的职责：

| 插件               | 功能                                                      | 核心技术                              |
| ------------------ | --------------------------------------------------------- | ------------------------------------- |
| PerformancePlugin  | Web Vitals + Navigation/Resource Timing + Long Task + FSP | PerformanceObserver, MutationObserver |
| ScreenRecordPlugin | 错误前 3 秒操作回放                                       | rrweb, pako gzip                      |
| ExposurePlugin     | 元素曝光时长追踪                                          | IntersectionObserver                  |

---

## Q15: 框架集成（React/Vue/Preact）是如何实现的？

答：

框架集成通过独立入口文件实现，不侵入核心代码。

React 集成（react.ts）：

```typescript
class ReactErrorBoundary extends React.Component {
  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ error, errorInfo });
    // 使用独立的 EventType.React，原样携带 error 对象与 React 上下文
    reportFrameworkError({
      type: EventType.React,
      error,
      context: errorInfo, // ErrorInfo，包含 componentStack
    });
  }

  override render() {
    if (this.state.error) return this.props.fallback ?? null;
    return this.props.children ?? null;
  }
}
```

Vue 集成（vue.ts）：

```typescript
export const vuePlugin: Plugin = (app, options: InitOptions) => {
  const handler = app.config.errorHandler; // 保存用户原有的 errorHandler
  app.config.errorHandler = (err, vueInstance, info) => {
    reportFrameworkError({
      type: EventType.Vue,
      error: err,
      context: { vueInstance, info }, // info 如 "mounted hook"
    });
    handler?.call(null, err, vueInstance, info); // 链式调用原 errorHandler
  };
  init(options); // 插件安装时顺带初始化 SDK
};

// 使用：app.use(vuePlugin, { dsn: "..." })
```

Preact 集成（preact.ts）：

与 React 类似的 ErrorBoundary 模式，使用 Preact 的 Component 基类。

Vite/Webpack 开发服务器插件（vite.ts / webpack.ts）：

- 在开发环境提供 mock 的 DSN 接收端点
- 避免开发时上报请求 404 报错
- Vite 版本提供 `sentryPlugin()`（基于当前 vite，peerDependencies 为 `"^7.0.0 || ^8.0.0"`）和 `sentryPlugin7()`（基于别名依赖 vite7 即 vite@7.3.3，用于旧版 vite 环境）
- Webpack 版本提供 devServer middleware

设计原则：

1. peerDependencies：react/vue/preact 声明为可选 peer dep，不安装则不报错
2. 独立 chunk：构建时每个框架入口独立输出，不相互依赖
3. 共享上报逻辑：`core/framework-error.ts` 提供统一的框架错误格式化与上报
4. 零配置：React 只需包裹 ErrorBoundary，Vue 只需 app.use()

---

## Q16: 采样率和数据过滤机制是如何工作的？

答：

采样和过滤分布在多个层级：

1. 全局采样率（send-preflight.ts）：

```typescript
function shouldQueuePayload(payload: TReportPayload): boolean {
  const { dsn, tracesSampleRate } = sentry.options;
  if (!dsn) return false;

  // 随机采样：tracesSampleRate=0.5 表示 50% 的事件被丢弃
  if (Math.random() > tracesSampleRate) return false;

  // 设置录屏标记
  if (sentry.options.screenRecordEventTypes.includes(payload.type)) {
    sentry.shouldScreenRecord = true;
  }
  return true;
}
```

2. API 排除（is-excluded-api.ts）：

```typescript
// 配置：excludeApis: ["/api/health", /^https:\/\/analytics/]
function isExcludedApi(api: string): boolean {
  for (const excludedApi of sentry.options.excludeApis) {
    if (typeof excludedApi === "string") {
      if (api === excludedApi) return true; // 字符串：严格相等匹配
    } else {
      if (excludedApi.test(api)) return true; // 正则：test 匹配
    }
  }
  return false;
}
```

3. 错误忽略（is-ignored-error.ts）：

```typescript
// 配置：ignoreErrors: ["ResizeObserver loop", /Script error/]
function isIgnoredError(message: string): boolean {
  return sentry.options.ignoreErrors.some((pattern) =>
    typeof pattern === "string"
      ? message.includes(pattern)
      : pattern.test(message),
  );
}
```

4. beforeReport 钩子（用户自定义过滤）：

```typescript
init({
  onBeforeReportData: (data) => {
    if (data.url.includes("/admin")) return null; // 返回 null 拒绝上报
    return data; // 可修改后返回
  },
});
```

5. 错误去重（BoundedSet）：

相同错误在 BoundedSet 容量内只上报一次（除非 `repeatCodeError: true`）。

过滤层级总结：

```
事件产生 → excludeApis/ignoreErrors（采集层过滤）
         → tracesSampleRate（采样层过滤）
         → BoundedSet 去重（去重层过滤）
         → onBeforeReportData（用户钩子过滤）
         → 最终上报
```

---

## Q17: Reporter 单例为什么使用 Proxy 实现懒加载？

答：

Reporter 的导出使用了一个巧妙的 Proxy 模式：

```typescript
let _reporter: DataReporter | null = null;

function getReporter(): DataReporter {
  if (!_reporter) _reporter = DataReporter.instance;
  return _reporter;
}

export default new Proxy({} as DataReporter, {
  get(_target, prop) {
    const instance = getReporter();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
```

为什么需要这种设计：

1. 避免模块加载时副作用：如果直接 `export default DataReporter.instance`，则 import 该模块时就会创建实例、注册网络监听器。Proxy 延迟到第一次方法调用时才实例化。

2. 支持 reset：`resetReporter()` 可以将 `_reporter` 置为 null 并调用 `DataReporter.reset()`。下次访问时 Proxy 会自动创建新实例。直接导出实例无法实现这种重置。

3. 解决循环依赖：多个模块（handlers、api、plugins）都需要 reporter，Proxy 作为中间层避免了模块间的循环引用问题。

4. this 绑定保证：`value.bind(instance)` 确保方法调用时 this 指向正确，使用方可以安全地解构：`const { send } = reporter`。

DataReporter 内部的单例模式：

```typescript
static #instance: DataReporter | null = null;

static get instance(): DataReporter {
  if (!this.#instance) this.#instance = new DataReporter();
  return this.#instance;
}

static reset(): void {
  this.#instance?.dispose();
  this.#instance = null;
}
```

使用 `#` 私有静态字段（ES2022），外部无法绕过 reset 直接访问旧实例。

---

## Q18: 声明式点击埋点的实现原理是什么？

答：

点击埋点采用声明式方案，通过 DOM 属性标记需要追踪的元素。

属性约定：

| 属性                 | 含义        | 示例                              |
| -------------------- | ----------- | --------------------------------- |
| `swifty-sentry-ev`   | 事件 ID     | `swifty-sentry-ev="btn_submit"`   |
| `swifty-sentry-msg`  | 事件描述    | `swifty-sentry-msg="提交订单"`    |
| `swifty-sentry-el`   | 元素追踪标记 | `swifty-sentry-el="checkout_btn"` |
| `swifty-sentry-*`    | 自定义参数  | `swifty-sentry-price="99.9"`      |

实现逻辑（utils/click-data.ts）：

```typescript
export function getDeclarativeClickData(event: MouseEvent): DeclarativeClickData | null {
  // 1. event.composedPath() 穿透 Shadow DOM，过滤出 HTMLElement 路径
  const path = getComposedElementPath(event);
  const fallbackPath = path.length > 0 ? path : getElementPath(event.target);

  // 2. 寻找路径中第一个带 swifty-sentry-el/ev/msg 属性的元素
  const trackingTarget = fallbackPath.find(hasTrackingAttribute);
  if (!trackingTarget) return null;

  // 3. 组装点击数据
  return {
    ev: getEventId(fallbackPath), // 优先级：swifty-sentry-ev > title > swifty-sentry-el > 标签名
    msg: getMessage(trackingTarget), // swifty-sentry-msg > title > textContent > aria-label > 标签名
    triggerPageUrl: location.href,
    x, y, // 元素绝对坐标（getBoundingClientRect + 滚动偏移）
    params: getParams(fallbackPath), // 收集 swifty-sentry-* 自定义参数（view/msg/ev 保留键除外）
    elementPath: getNodeXPath(trackingTarget).slice(-128), // 自研 XPath，尾部截取 128 字符
    triggerTime: Date.now(),
  };
}
```

其中 `getNodeXPath()` 自研实现：从元素向上遍历到 body，将各级标签名小写后用 `>` 连接（如 `div>span>button`），未使用 dom2str。

事件监听安装（decorates.ts）：

```typescript
function pubClick(): Cleanup {
  // 节流作用在 pub 本身（clickThrottleDelay 默认 0）
  const throttledPub = throttle(pub, sentry.options.clickThrottleDelay);
  const listener = function (ctx: MouseEvent) {
    throttledPub(EventType.Click, { ...getBaseData(), type: EventType.Click, extra: ctx });
  };
  // 冒泡阶段监听（未传 capture）
  document.addEventListener("click", listener);
  return () => document.removeEventListener("click", listener);
}
```

声明式 vs 命令式的优势：

1. 零 JS 代码：业务开发只需在 HTML 上加属性，无需调用 SDK API
2. 不侵入逻辑：不与业务事件处理耦合
3. Shadow DOM 支持：`composedPath()` 穿透 Shadow DOM 边界
4. 自动化：配合框架的模板系统，可以批量为组件添加追踪属性
5. 元素路径：自研 `getNodeXPath()` 生成 `>` 连接的标签名路径，`slice(-128)` 保留尾部（离元素最近的部分）

---

## Q19: 设备指纹和用户身份体系是如何设计的？

答：

身份体系分为三层，实现在 `core/identity.ts` 和 `utils/sentry.ts`。

三层身份标识：

| 标识          | 来源                         | 持久化       | 用途               |
| ------------- | ---------------------------- | ------------ | ------------------ |
| `anonymousId` | FingerprintJS visitorId      | localStorage | 匿名用户跨会话追踪 |
| `visitorId`   | 后端设置（`setVisitorId()`） | 内存         | 业务侧访客标识     |
| `userId`      | 业务设置（`setUserId()`）    | 内存         | 登录用户标识       |

设备指纹生成（CRC32 Canvas）：

```typescript
function getClientFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20); // 橙色矩形
      ctx.fillStyle = "#069";
      ctx.fillText("@swifty.js/sentry", 2, 15); // 同一段文本绘制两次
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("@swifty.js/sentry", 4, 17);
      // dataUrl 去掉 base64 前缀，atob 解码后计算 crc32
      const b64 = canvas.toDataURL().replace("data:image/png;base64,", "");
      const bin = atob(b64);
      return crc32(bin).toString(16);
    }
  } catch {
    return getFallbackFingerprint();
  }
  return getFallbackFingerprint();
}
// 降级：crypto.randomUUID()，再降级 Date.now() + 随机数
```

FingerprintJS 集成：

```typescript
async function initIdentity(): Promise<void> {
  if (!sentry.options.enableFingerprint) return;

  // 优先从 localStorage 读取缓存
  const cached = localStorage.getItem("swifty_sentry_anonymous_id");
  if (cached) {
    sentry.anonymousId = cached;
    return;
  }

  // 动态加载 FingerprintJS（避免未启用时加载 ~50KB）
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  sentry.anonymousId = result.visitorId;
  localStorage.setItem("swifty_sentry_anonymous_id", result.visitorId);
}
```

设备信息采集（utils/sentry.ts，扁平结构）：

```typescript
import { UAParser } from "ua-parser-js";

constructor() {
  const res = new UAParser().getResult();
  this.deviceInfo = {
    browserName: res.browser.name ?? UNKNOWN,
    browserVersion: res.browser.version ?? UNKNOWN,
    osName: res.os.name ?? UNKNOWN,
    osVersion: res.os.version ?? UNKNOWN,
    userAgent: res.ua,
    deviceModel: res.device.model ?? UNKNOWN,
    deviceType: res.device.type ?? UNKNOWN,
    fingerprint: getClientFingerprint(), // Canvas 指纹，见上
    language: getLanguage(), // navigator.language
    screenResolution: getScreenResolution(), // 如 "1920x1080"
  };
}
```

设计考量：

1. 隐私合规：FingerprintJS 默认禁用（`enableFingerprint: false`），需用户主动开启
2. 缓存优先：anonymousId 缓存到 localStorage，避免每次加载都计算
3. 异步非阻塞：`void initIdentity()` 不阻塞 SDK 初始化
4. 降级策略：Canvas 不可用时降级到 `crypto.randomUUID()`

---

## Q20: 项目的构建方案和工程化实践有哪些？

答：

构建工具：

- 主构建：Rollup（`rollup.config.ts`）
  - `preserveModules: true`：保留模块结构，利于 tree-shaking
  - 双格式输出：ESM（`.js`）+ CJS（`.cjs`）
  - `rollup-plugin-dts` 生成类型声明
  - terser 压缩
- 备选构建：tsup（`tsup.config.ts`）

package.json exports 多入口：

```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./react": { "import": "./dist/react.js" },
    "./vue": { "import": "./dist/vue.js" },
    "./preact": { "import": "./dist/preact.js" },
    "./plugins": { "import": "./dist/plugins/index.js" },
    "./vite": { "import": "./dist/vite.js" },
    "./webpack": { "import": "./dist/webpack.js" }
  }
}
```

TypeScript 配置：

- `strict: true`：全量严格模式
- `target: "ESNext"`：不降级语法
- `moduleResolution: "Bundler"`：适配现代打包工具
- 所有运行时依赖 externalize，不打入 bundle

测试工程：

- Vitest + jsdom 环境
- 14 个测试文件覆盖核心模块
- v8 coverage，阈值 70%（lines/functions/branches/statements）
- 自定义 fake：`fake-intersection-observer.ts`、`report-payloads.ts`

依赖管理：

| 依赖                         | 用途            | 体积考量            |
| ---------------------------- | --------------- | ------------------- |
| web-vitals                   | Core Web Vitals | ~2KB                |
| @rrweb/record                | 屏幕录制        | 较大，插件按需加载  |
| pako                         | gzip 压缩       | ~45KB，仅录屏插件用 |
| ua-parser-js                 | UA 解析         | ~20KB               |
| @fingerprintjs/fingerprintjs | 设备指纹        | ~50KB，默认禁用     |
| zod                          | 运行时校验      | ~13KB               |

Monorepo 结构：

项目位于 `swifty-sentry` monorepo 的 `sentry` 包下，与后端服务共享仓库但独立构建发布。

---

## Q21: BoundedSet 的实现原理是什么？为什么用 Map 而不是 Set？

答：

```typescript
class BoundedSet<T> {
  private map = new Map<T, true>();
  private readonly capacity: number;

  has(value: T): boolean {
    return this.map.has(value);
  }

  add(value: T): void {
    if (this.map.has(value)) {
      this.map.delete(value); // 先删再插，更新插入顺序
    }
    this.map.set(value, true);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value; // Map 迭代序 = 插入序
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
}
```

为什么用 Map 而不是 Set：

1. 利用 Map 的插入顺序迭代保证：ES2015 规范保证 Map 按插入顺序迭代。`map.keys().next().value` 始终是最早插入的键，即 LRU 淘汰目标。

2. Set 也有插入顺序，理论上可以用 Set 实现。但 Map 的 `delete` + `set` 组合更明确地表达了「刷新顺序」的语义。实际上这里用 Set 也可以（`set.delete(v); set.add(v)`），选择 Map 更多是代码风格统一。

3. O(1) 操作：has/add/delete 均为 O(1)，淘汰最旧元素也是 O(1)（取迭代器首元素）。

LRU 语义：

- 重复 add 同一个值时，先 delete 再 set，将其移到「最新」位置
- 超出容量时淘汰 `keys().next().value`（最旧的）
- 这保证了最近出现的错误 ID 不会被误淘汰

应用场景：

错误去重：`sentry.codeErrors = new BoundedSet<string>(1000)`，容量 1000 意味着最多记住最近 1000 种不同错误的签名。超出后最旧的错误签名被遗忘，如果再次出现会重新上报（这是可接受的，因为 1000 种不同错误已经是极端场景）。

---

## Q22: CallbackQueue 的设计意图是什么？为什么使用 requestIdleCallback？

答：

```typescript
class CallbackQueue {
  private cbList: VoidFunction[] = [];
  private isFlushing = false;

  push(cb: VoidFunction, ctx?: unknown, ...args: unknown[]) {
    this.cbList.push(cb.bind(ctx, ...args));
    if (this.isFlushing) return;
    this.isFlushing = true;

    if (typeof requestIdleCallback !== "function") {
      Promise.resolve().then(() => this.flushFuncList()); // 降级：微任务
      return;
    }
    requestIdleCallback(() => this.flushFuncList());
  }

  private flushFuncList() {
    const oldFuncList = this.cbList;
    this.cbList = [];
    this.isFlushing = false;
    oldFuncList.forEach((func) => func());
  }
}
```

设计意图：

1. 批量合并：同一帧内多次 push 的回调合并为一次执行，减少调度开销
2. 非阻塞执行：使用 `requestIdleCallback` 在浏览器空闲时执行，不抢占用户交互的主线程时间
3. 监控 SDK 的核心原则：绝不能因为监控逻辑导致业务页面卡顿

使用场景：

主要用于 Image 上报（`reportByImage`）。Image 上报需要创建多个 `new Image()` 并设置 src，这些 DOM 操作不需要立即执行，可以延迟到空闲时批量处理。

为什么不用 setTimeout(fn, 0)：

- `setTimeout` 最低延迟 4ms（嵌套超过 5 层），且在主线程忙时仍会执行
- `requestIdleCallback` 真正等到浏览器有空闲时间（`deadline.timeRemaining() > 0`），对用户体验影响最小
- 降级方案使用 `Promise.resolve().then()`（微任务），比 setTimeout 更快且不引入宏任务延迟

isFlushing 的作用：

防止在一个 idle callback 执行期间，新 push 的回调又触发一次 `requestIdleCallback`。通过标志位确保一批回调在一个 idle 周期内统一执行。

---

## Q23: 路由监听是如何同时支持 History 和 Hash 模式的？

答：

路由监听分为两处：History 模式在 `core/decorate-route.ts`，Hash 模式在 `core/decorates.ts`。

History 模式拦截（decorate-route.ts）：

```typescript
export function pubHistory(): Cleanup {
  // 1. popstate（前进/后退）：劫持 globalThis.onpopstate，而非 addEventListener
  const oldOnpopstate = globalThis.onpopstate;
  latestHref = getCurrentRouteUrl();
  globalThis.onpopstate = function (this: Window, ev: PopStateEvent) {
    const from = latestHref;
    const to = getCurrentRouteUrl();
    if (from !== to) {
      latestHref = to;
      pub(EventType.History, { ...getBaseData(), type: EventType.History, from, to });
    }
    return oldOnpopstate?.call(this, ev); // 链式调用原有 handler
  };

  // 2. 装饰 pushState 和 replaceState，二者共用同一个装饰器
  const historyDecorator = (oldPropsVal: History["pushState"]) => {
    return function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      if (url) {
        const from = latestHref;
        const to = normalizeRouteUrl(url);
        if (from !== to) {
          latestHref = to;
          pub(EventType.History, { ...getBaseData(), type: EventType.History, from, to });
        }
      }
      return oldPropsVal.call(this, data, unused, url);
    };
  };
  const cleanupPushState = decorateProp(globalThis.history, "pushState", historyDecorator);
  const cleanupReplaceState = decorateProp(globalThis.history, "replaceState", historyDecorator);

  return () => {
    globalThis.onpopstate = oldOnpopstate;
    cleanupReplaceState();
    cleanupPushState();
  };
}
```

注意：EventType 枚举中没有专门的路由变化事件类型，History 模式发布 `EventType.History`，Hash 模式发布 `EventType.HashChange`，下游分别订阅处理。

Hash 模式拦截（decorates.ts）：

```typescript
function pubHashChange(): Cleanup {
  const listener = function (ctx: HashChangeEvent) {
    pub(EventType.HashChange, {
      ...getBaseData(),
      type: EventType.HashChange,
      extra: ctx,
    });
  };
  globalThis.addEventListener("hashchange", listener);
  return () => globalThis.removeEventListener("hashchange", listener);
}
```

为什么需要装饰 pushState/replaceState：

- `pushState` 和 `replaceState` 不会触发任何原生事件（这是 History API 的设计缺陷）
- 只有 `popstate`（前进/后退）和 `hashchange` 有原生事件
- 因此必须通过猴子补丁拦截 pushState/replaceState 才能感知 SPA 路由变化

配置控制：

```typescript
// 可通过配置独立开关
enableHistory: true,    // 是否监听 History API
enableHashChange: true, // 是否监听 hashchange
```

路由变化的下游处理（handle-route.ts）：

handleHistory / handleHashChange 分别订阅 EventType.History / EventType.HashChange，事件触发后：

1. 记录面包屑（`breadcrumb.push`，userAction 由 event2breadcrumb 生成）
2. 调用 pv-lifecycle.ts 的路由 PV 处理：先发送上一页停留时长，再发送新页面 PV（详见 Q24）

---

## Q24: PV 和页面停留时长是如何追踪的？

答：

实现在 `core/pv-lifecycle.ts`。PV 和停留时长不是独立的事件类型，二者都是 `type: EventType.PV`，通过 `name` 字段区分。

PV（Page View）追踪：

```typescript
// SDK 初始化时（setup.ts 调用 pv-lifecycle 的初始化函数）立即发送首次 PV，immediate = true
reporter.send(
  {
    ...getBaseData(),
    type: EventType.PV,
    name: "PageLoad",
    message: location.href,
    status: Status.OK,
    extra: { url: location.href, referrer: document.referrer, entryTime: Date.now() },
  },
  true,
);
```

路由变化时由 handle-route.ts 调用 pv-lifecycle.ts 的路由处理函数：

```typescript
// 1. 目标 URL 经 new URL 归一化，与当前页相同则不重复上报
// 2. 先发送上一页停留时长（见下）
// 3. 重置当前页状态（url/referrer/name/startedAt），发送新页面 PV
reporter.send(
  {
    ...getBaseData(),
    type: EventType.PV,
    name, // HistoryChange 或 HashChange
    message: url,
    status: Status.OK,
    extra: { url, referrer, entryTime },
  },
  false,
);
```

停留时长上报：

```typescript
// 过滤极短停留（<= 100ms），避免路由重定向产生无意义数据
if (duration <= 100) return;

reporter.send(
  {
    ...getBaseData(),
    type: EventType.PV, // 与 PV 共用 EventType.PV，靠 name 区分
    name: "Page" + "Dwell", // name 字面量为 Page 与 Dwell 拼接
    message: page.url,
    status: Status.OK,
    extra: { url: page.url, referrer: page.referrer, duration }, // 时长字段为 extra.duration
  },
  immediate,
);
```

页面关闭时的停留时长（setup.ts）：

```typescript
globalThis.addEventListener("beforeunload", () => {
  // flush 当前页停留时长，immediate = true，走 sendBeacon 保证发出
});
```

数据模型（均为 type: EventType.PV）：

| name（区分字段）         | 触发时机           | extra 关键字段              |
| ------------------------ | ------------------ | --------------------------- |
| PageLoad                 | SDK 初始化         | url, referrer, entryTime    |
| HistoryChange/HashChange | 路由切换           | url, referrer, entryTime    |
| Page + Dwell             | 路由切换、页面关闭 | url, referrer, duration(ms) |

设计要点：

1. 100ms 阈值：过滤路由重定向（如 `/` -> `/home`）产生的极短停留
2. beforeunload 兜底：确保用户直接关闭标签页时也能记录停留时长
3. sendBeacon 保证：页面关闭时 fetch 可能被取消，sendBeacon 由浏览器保证发出
4. SPA 友好：不依赖页面刷新，通过路由变化事件追踪单页内的页面切换

---

## Q25: 如果让你优化这个 SDK，你会从哪些方面入手？

答：

基于对源码的深入理解，可以从以下维度优化：

1. 性能优化：

- Web Worker 上报：将 JSON 序列化、gzip 压缩移到 Worker 线程，避免阻塞主线程（当前 pako 压缩在主线程执行）
- 批量 DOM 查询优化：白屏检测的 18 次 `elementFromPoint` 会触发 layout，可以合并到一次 reflow 中
- FSP MutationObserver 节流：当前每次 DOM 变化都检查 `isInViewport`（触发 getBoundingClientRect），可以用 IntersectionObserver 替代视口判断
- rrweb 按需加载：ScreenRecordPlugin 的 rrweb 依赖较重（~100KB），可以用 `import()` 动态加载

2. 可靠性优化：

- Service Worker 离线队列：localStorage 有 5MB 限制且同步阻塞，Service Worker + Cache API 可以存储更大的离线队列
- 指数退避重试：当前 server-recovery 使用固定 60s 间隔，可以改为指数退避（1s -> 2s -> 4s -> ... -> 60s）
- 数据完整性校验：离线缓存写入时添加 checksum，防止 localStorage 数据损坏

3. 功能增强：

- Session Replay 全量录制：当前只有错误前 3 秒，可以提供全量录制选项（配合采样率控制体积）
- Source Map 反解：上报时附带 sourcemap 标识，后端自动反解压缩后的堆栈
- 用户行为路径分析：基于面包屑数据提供漏斗分析能力
- Performance Budget 告警：支持配置性能预算，超标时主动告警

4. 架构优化：

- 事件总线类型安全：当前 `pub(type, data: unknown)` 丢失了类型信息，可以用 discriminated union 让 handler 获得精确类型
- 插件通信：当前插件只能订阅事件总线，无法插件间通信。可以添加插件间消息通道（如录屏插件通知性能插件降低采样）
- 配置热更新：支持运行时动态修改采样率、过滤规则，无需重新 init

5. 体积优化：

- Zod 替换：zod ~13KB，对于固定 schema 可以用手写校验函数替代（~1KB）
- ua-parser-js 按需：只解析 browser/os/device 三个字段，可以用更轻量的方案
- Tree-shaking 优化：确保 `enableXhr: false` 时 XHR 拦截代码被完全移除

6. 可观测性：

- SDK 自身健康度：上报 SDK 自身的错误率、丢弃率、队列积压等指标
- Debug 面板：提供可视化调试工具，实时查看事件流、队列状态、上报结果
