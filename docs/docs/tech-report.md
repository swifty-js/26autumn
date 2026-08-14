# @swifty.js/sentry 技术说明文档

> 仓库: <https://github.com/hangtiancheng/swifty-sentry>（目录 `sentry/`，npm 包名 `@swifty.js/sentry`）
>
> 定位: 框架无关的浏览器端监控/埋点 SDK。发布订阅架构，core 模块（事件总线、生命周期、数据上报）与 plugin 子模块（性能采集、屏幕录制、曝光）解耦。支持错误捕获、白屏检测、性能指标采集、故障现场重放、声明式点击埋点、路由/PV 追踪，数据上报具备三级降级与离线缓存，提供 React 16+ / Vue 3+ 集成。
>
> 文中所有 `文件:行号` 均相对 `sentry/` 目录。

## 目录

1. [项目概览与入口](#1-项目概览与入口)
2. [总体架构：发布订阅 + core/plugin 解耦](#2-总体架构发布订阅--coreplugin-解耦)
3. [数据模型与上报协议](#3-数据模型与上报协议)
4. [错误捕获体系](#4-错误捕获体系)
5. [用户行为追踪](#5-用户行为追踪)
6. [白屏检测：关键点采样](#6-白屏检测关键点采样)
7. [性能采集插件](#7-性能采集插件)
8. [屏幕录制插件：rrweb + gzip 故障现场重放](#8-屏幕录制插件rrweb--gzip-故障现场重放)
9. [数据上报管道](#9-数据上报管道)
10. [框架集成：React 16+ / Vue 3+](#10-框架集成react-16--vue-3)
11. [附录：曝光插件、身份指纹、dev sourcemap 插件](#11-附录曝光插件身份指纹dev-sourcemap-插件)

---

## 1. 项目概览与入口

TypeScript 编写（strict + `exactOptionalPropertyTypes`），ESM/CJS 双产物（rollup，`preserveModules`），zod 做运行时校验，vitest + jsdom 测试。

package.json 定义 6 个公共入口（package.json:32-63 ↔ rollup.config.ts:58-65）：

| 入口        | 源文件               | 内容                                                                             |
| ----------- | -------------------- | -------------------------------------------------------------------------------- |
| `.`         | src/index.ts         | `init`/`destroy`/`enablePlugin`、手动上报 API、全部类型                          |
| `./plugins` | src/plugins/index.ts | `PerformancePlugin`、`ScreenRecordPlugin`、`ExposurePlugin`、`unzipScreenRecord` |
| `./react`   | src/react.ts         | `ReactErrorBoundary`                                                             |
| `./vue`     | src/vue.ts           | `vuePlugin`                                                                      |
| `./vite`    | src/vite.ts          | dev server 上报接收 + sourcemap 还原插件                                         |
| `./webpack` | src/webpack.ts       | 同上（webpack-dev-server 版）                                                    |

运行时依赖 7 个，各司其职：`web-vitals`（性能指标）、`@rrweb/record` + `pako`（录屏 + gzip）、`ua-parser-js`（设备信息）、`@fingerprintjs/fingerprintjs`（可选访客指纹）、`zod`（校验）、`source-map`（dev 堆栈还原）。

## 2. 总体架构：发布订阅 + core/plugin 解耦

数据流总览：

```
浏览器原生能力(monkey-patch/addEventListener)
  → 捕获层 decorates (publish)
    → 事件总线 bus (EventType → Set<handler>)
      → 处理层 handle-* (subscribe: 清洗/去重/面包屑)
        → reporter (采样/钩子/批量队列)
          → transports (sendBeacon → Image → fetch keepalive)
            → dsn 服务端
```

### 2.1 事件总线（发布订阅核心）

src/core/bus.ts 是一个极简同步 pub/sub：

- 数据结构 `const event2handlers = new Map<EventType, Set<TEventHandler>>()`（bus.ts:27）；
- `pub(type, data)` 遍历该类型的 handler 集合逐个调用，每个 handler 均被 try/catch 包裹，单个订阅者抛错不影响其他订阅者（bus.ts:29-41）；
- `sub(type, handler)` 返回删除该 handler 的 `Cleanup` 函数（bus.ts:43-55）；`clearSubscriptions()` 整体清空（bus.ts:57-59）。

发布方是捕获层（decorates.ts / decorate-http.ts / decorate-route.ts），订阅方是装配层 setup.ts 注册的 handle-* 处理函数。捕获层只负责"把原生事件翻译成 `EventType` + 原始数据"，处理层只消费总线数据——两侧互不 import，通过 `EventType` 枚举（types/enums.ts:43-61，17 个成员）解耦。

### 2.2 装配层：setup 按开关装配

src/core/setup.ts:42-123 依据 `sentry.options.enableXxx` 过滤 8 个订阅项（Xhr/Fetch/Error/History/HashChange/UnhandledRejection/Click/WhiteScreen，setup.ts:45-94）。对每一项先 `sub(type, handler)` 再执行对应的装饰器发布函数（setup.ts:97-100），并额外注册 `beforeunload` 以冲刷 PV 停留时长（setup.ts:104-110）。所有安装动作都返回 `Cleanup`，收集进数组；`setup()` 返回的总 cleanup 以 `cleanups.toReversed()` 逆序执行，并调用 `resetPageView()` 与 `clearSubscriptions()`（setup.ts:116-122）——保证 `destroy()` 后浏览器环境完全还原。

### 2.3 捕获层：monkey-patch 装饰器

通用原语 `decorateProp(obj, key, decorator)`：保存旧值、替换实现、返回还原函数（utils/decorate-prop.ts:25-38）。各捕获点：

| 目标                            | 方式                                                                                                                            | 位置                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| XHR                             | 装饰 `XMLHttpRequest.prototype.open`（在实例挂 `__sentry__` 元数据）与 `send`（`loadend` 中补 status/Server-Timing/耗时后 pub） | decorate-http.ts:37-85  |
| fetch                           | 装饰 `globalThis.fetch`：`res.clone()` 读响应，catch 分支置 `statusCode = 0` 并 rethrow（不吞业务异常）                         | decorate-http.ts:87-132 |
| history                         | 装饰 `history.pushState`/`replaceState` + 覆写 `globalThis.onpopstate`（链式调用旧 handler），`from !== to` 才发布              | decorate-route.ts:38-88 |
| click                           | `document.addEventListener("click")`，经 `throttle(pub, clickThrottleDelay)` 节流（默认 0，constants/index.ts:68）              | decorates.ts:64-77      |
| error                           | `addEventListener("error", listener, true)` **捕获阶段**（这是能捕到资源加载错误的关键）+ 装饰 `console.error`（带防重入标志）  | decorates.ts:79-110     |
| unhandledrejection / hashchange | 普通 window 监听                                                                                                                | decorates.ts:112-138    |
| 白屏                            | `pubWhiteScreen` 装配时立即发布一次以启动采样                                                                                   | decorates.ts:140-147    |

### 2.4 生命周期与插件注册

- `init(options)`：zod `optionsSchema.parse({...DEFAULT_OPTIONS, ...options})` 严格校验合并，检查 `disabled` 与空 dsn，应用 `breadcrumb.capacity = options.maxBreadcrumbs`，然后 `cleanupSetup = setup()`（sdk-lifecycle.ts:48-70）。
- `destroy()`：destroyPlugins → cleanupSetup → destroyBatchErrorManager → resetReporter，全链路可逆（sdk-lifecycle.ts:40-46）。
- `enablePlugin(...plugins)`：逐个 `plugin.init()` 并注册进 `Set<SentryPlugin>`（sdk-lifecycle.ts:73-78、plugin-registry.ts:25-36）。
- 插件契约是抽象类 `SentryPlugin { type: EventType; abstract init(): void; destroy?(): void }`（types/plugin.ts:30-37）——core 不感知任何插件实现，插件按需引入、可独立 tree-shake，这就是 core 与 plugin 解耦的边界。

### 2.5 全局单例

`Sentry.instance` 懒创建并挂到 `globalThis.__sentry__`（utils/sentry.ts:98-104），承载：`options`、`deviceInfo`（ua-parser-js `new UAParser().getResult()` 解析浏览器/OS/设备型号，sentry.ts:117-129；设备指纹用 canvas 绘制 + 自实现 crc32，失败回退 `randomUUID`，sentry.ts:34-82）、`codeErrors = new BoundedSet(1000)`（错误去重，sentry.ts:106）、`shouldScreenRecord`（录屏触发标志）、`whiteScreenTimer`。

## 3. 数据模型与上报协议

所有事件的公共骨架 `IReportPayload`（types/common.ts:54-64）：`id`（randomUUID）、`deviceId`/`sessionId`（localStorage/sessionStorage 持久化，utils/session.ts）、`type: EventType`、`name`、`time`/`timestamp`、`message`、`status: Status`。由 `getBaseData()` 统一生成（utils/get-base-data.ts）。

上报最终形态 `IReportData`（types/common.ts:173-181）= 公共骨架 + `url`/`userId`/`projectId`/`sdkVersion` + `breadcrumbs?`（仅错误类事件附带，见 §5.4）+ `deviceInfo` + `payload`（原始事件体）。组装收口在 `payloadToReportData`（reporter/report-data.ts）。

## 4. 错误捕获体系

覆盖四类来源：资源加载错误、JS 运行时错误、未捕获 Promise、xhr/fetch 请求错误；辅以指纹去重（LRU）与同类错误批量合并。

### 4.1 JSError 与资源加载错误（同一入口分流）

捕获阶段的 `error` 事件统一进入 `handleError`（handle-error.ts:45-60），按序判型：

1. `isErrorEvent`（is-type.ts:34-36）→ 代码错误管线（§4.4）；
2. `isIExtendedErrorEvent`（is-type.ts:53-59）：`err instanceof Event && type === "error"` 且 target 经 zod union 校验为「有 `localName` 且 `src` 非空 或 `href` 非空」→ **资源加载错误**，上报 `IResourceError = IReportPayload + {src, href}`（types/common.ts:76-79；handle-error.ts:62-89），并推 `Resource` 面包屑；
3. `Error` 实例 → 取 name/message/stack 上报（handle-error.ts:91-101）；
4. 其他未知值 → JSON 序列化后按 Unknown Error 上报（handle-error.ts:103-113）。

`console.error` 也被装饰为错误来源（decorates.ts:79-110）。用户可用 `options.ignoreErrors`（字符串 `includes` / 正则 `test` 匹配，utils/is-ignored-error.ts:25-34）过滤噪声。

### 4.2 未捕获 Promise 错误

`unhandledrejection` 事件进入 `handleUnhandledRejection`（handle-events.ts:37-48）：`reason` 是 `ErrorEvent` 的（携带 filename/lineno/colno）直接走代码错误管线，其余 reason 走 §4.1 的通用管线——保证任何形态的 rejection reason 都有归宿。

### 4.3 xhr / fetch 请求错误

- 判错标准在 `transformHttpData`（utils/transform-http-data.ts:25-48）：statusCode 100–399 为 OK，400–599 及其他值（含 fetch 网络失败时人为置的 0）为 Error。
- `elapsedTime = Date.now() - 发起时间戳`（xhr 在 `loadend`，fetch 在 then/catch）；`Server-Timing` 响应头按逗号切分为字符串数组（utils/server-timing.ts:23-35）。
- 过滤自噬与白名单：POST 到 dsn 的 SDK 自身上报、命中 `excludeApis`（字符串全等/正则）的请求一律忽略（decorate-http.ts:134-138、utils/is-excluded-api.ts:25-38）。
- 成功请求在 `enableHttpPerformance = true` 时转为 Performance 事件（value = elapsedTime，extra 含 statusCode/serverTiming，handle-http.ts:50-68），实现"一次捕获、错误与性能两用"。

### 4.4 错误去重（LRU）与批量合并

- **指纹**：`base64v2("Error-{message}-{filename}-{line}-{column}")`（handle-code-error.ts:103-105）；`base64v2` 为 TextEncoder → btoa → URL-safe 去 padding（utils/base64.ts:28-36）。line/column 取 `ErrorEvent.lineno/colno`。
- **LRU 去重**：`sentry.codeErrors` 是容量 1000 的 `BoundedSet`（utils/sentry.ts:106）。`add` 时若已存在先 `map.delete` 再 `map.set`——利用 `Map` 的插入序实现 touch（访问即移到队尾）；超容删除 `map.keys().next().value` 即最旧项（utils/data-structures.ts:140-149）。`repeatCodeError = true` 可关闭去重放行重复错误。
- **批量合并**：BatchErrorManager 以 2s 防抖窗口聚合（每次 push 重置 setTimeout，handle-code-error.ts:40-44），flush 时按 `type-name-message` 分组：组内 ≥5 条合并为一条 `IBatchErrorData {batchError: true, batchErrorLength, batchErrorLastHappenTime}`，不足 5 条逐条上报（handle-code-error.ts:54-82）——防止渲染循环内的同一错误刷爆上报通道。

## 5. 用户行为追踪

### 5.1 声明式属性点击埋点

无需手写埋点代码，在 DOM 上声明 `swifty-sentry-*` 属性即可（utils/click-data.ts）：

- 属性协议：`swifty-sentry-el`（圈定埋点容器）、`swifty-sentry-ev`（事件 id）、`swifty-sentry-msg`（人读文案）；`view/msg/ev` 为保留键，其余 `swifty-sentry-*` 属性全部收进 `params`（click-data.ts:25-26, 106-123）。
- 事件路径用 `event.composedPath()` 过滤 HTMLElement（Shadow DOM 友好；为空回退 parentElement 链回溯），沿路径找**第一个**带上述任一属性的元素为埋点目标（click-data.ts:52-54, 133-145）。
- 事件 id 取值优先级：`swifty-sentry-ev` → `title` → `swifty-sentry-el` → tagName（click-data.ts:88-102）。
- `elementPath` 由 `dom2str` 生成：对齐官方 Sentry `htmlTreeAsString` 策略——就近 5 层、每层 `tag#id.class`、`>` 连接、128 字符预算内整段丢弃不截断半个选择器（utils/dom2str.ts）。
- 节流由 `clickThrottleDelay` 控制（默认 0 即不节流，decorates.ts:64-77）。

命中埋点的点击会同时进入面包屑与上报（`enableClick` 二次判定，handle-events.ts:56-75）。

### 5.2 路由监听：hashchange 与 history

- history 模式：装饰 `pushState/replaceState` + 接管 `onpopstate`；模块级 `latestHref` 记录 from，to 用 `new URL(url, current).href` 归一化，`from === to` 去重不发（decorate-route.ts:28-88）。
- hash 模式：监听 `hashchange`，from/to 直接取事件的 `oldURL/newURL`（handle-route.ts:50-70）。
- 两者都会写 `Route` 面包屑，并驱动 PV 生命周期：`init` 时自动发 PageLoad PV（setup.ts:102）；路由切换先补发上一页 PageDwell（停留 >100ms 才报）再发新 PV（pv-lifecycle.ts:27, 90-114）；`beforeunload` 冲刷最终停留时长（setup.ts:104-110）。

### 5.3 面包屑：错误现场的行为轨迹

- 存储：`Breadcrumb` 单例继承定容 `MinHeap<IBreadcrumbItem>`（按 timestamp 的小顶堆，满时仅当新项不早于堆顶才替换，天然保留"最新 N 条"，core/breadcrumb.ts、utils/data-structures.ts）。容量由 `maxBreadcrumbs`（默认 30）在 `init` 时应用；`onBeforePushBreadcrumb` 钩子可在入堆前改写。
- 写入：Click / Route(×2) / Http / CodeError(×2) / Resource 共 7 处 handler 写入，`userAction` 由 `event2breadcrumb` 映射为 `BreadcrumbType`。
- 读取：`payloadToReportData` 仅对**错误类事件**（Error/UnhandledRejection/Resource/Vue/React/OtherFrameworks）附加 `breadcrumbs: breadcrumb.dump()`（时间升序快照，reporter/report-data.ts）——面包屑语义是"通往故障的轨迹"，不给批量上报的普通事件增重。

## 6. 白屏检测：关键点采样

src/core/white-screen.ts 的算法（load 后启动）：

1. **调度**：`setInterval(1000ms)`（WHITE_SCREEN_SAMPLE_INTERVAL，constants/index.ts:36），每个 tick 内优先用 `requestIdleCallback` 执行采样，避免阻塞主线程；采样上限 10 次（MAX_WHITE_SCREEN_SAMPLE_COUNT），定时器句柄存 `sentry.whiteScreenTimer`（white-screen.ts:131-154）。
2. **关键点**：十字形 18 个采样点——横排 `(innerWidth*i/10, innerHeight/2)`、竖排 `(innerWidth/2, innerHeight*i/10)`，i = 1..9；逐点 `document.elementFromPoint`（white-screen.ts:70-79）。
3. **空点判定**：采样点无元素，或命中"根容器"——`getCssSelectors(elem)` 返回 `[#id, .class 串, tag]` 三元组，任一命中 `rootCssSelectors`（默认 `["html","body","#app","#root"]`）即视为根（white-screen.ts:40-55、utils/get-css-selectors.ts）。`emptyPoints >= 18`（全部为空）判定白屏（white-screen.ts:81）。
4. **两种模式**（white-screen.ts:84-107）：
   - 无骨架屏（`hasSkeleton: false`）：判白即上报，否则停止采样；
   - 有骨架屏：首次采样记录 `initialSelectors`，后续每次重收 `currentSelectors`，两集合排序拼接后仍相等（页面长时间没有从骨架变成真实内容）→ 上报白屏；出现差异 → 判定渲染正常，停止采样。
5. 上报消息带 `sample count N`，随后 stopSample（white-screen.ts:110-129）。

## 7. 性能采集插件

`PerformancePlugin`（src/plugins/performance/index.ts:45-63 装配，destroy 逆序清理 :58-63）聚合六路采集：

### 7.1 Web Vitals 核心指标

使用 `web-vitals` 库的 `onLCP / onFCP / onCLS / onINP / onTTFB`（perf.ts:56-74；注：未使用已废弃的 FID），回调即上报；`metric2perfData` 抽取 `{id, name, value, rating}` 并合并 `getBaseData()`（utils/metric2perf-data.ts:29-39）。

### 7.2 FSP 首屏渲染时间：MutationObserver + rAF

first-screen-paint.ts 的实现：

- `requestIdleCallback` 空闲后启动 `MutationObserver`，监听 `document` 的 `{childList, subtree, characterData, attributes}`（:100-105, 108-118）；
- 每次 DOM 变更回调中，筛选"视口内新增、且非 link/script/style"的元素，用 `performance.now()` 记一条渲染打点（:72-98）；
- 另起 `requestAnimationFrame` 轮询：`document.readyState === "complete"` 时 `observer.disconnect()`，取全部打点的 `Math.max(startTime)` 作为 FSP（最后一次影响首屏的渲染时刻，:46-65），以 `name: "FSP"` 上报（perf.ts:76-85）。

### 7.3 长任务检测

`PerformanceObserver.observe({entryTypes: ["longtask"]})`——浏览器原生定义 >50ms 即 longtask，SDK 不做二次阈值过滤，整批 entries 以 `name: "LongTask"` 上报（performance/index.ts:79-96）。

### 7.4 资源加载性能

resource-timing.ts：初始 `getEntriesByType("resource")` 一次性上报 `ResourceList` + `PerformanceObserver` 增量逐条上报 `ResourceTiming`（:96-124）；`shouldReportResource` 排除 `initiatorType ∈ {fetch, xmlhttprequest, beacon}`（这些走 HTTP 通道）及 SDK 自身 dsn 上报（:35, 47-53）；缓存命中判定 `fromCache = transferSize === 0 || (transferSize !== 0 && encodedBodySize === 0)`（内存/磁盘缓存 vs 304 协商缓存，:81-83）。不支持 resource entry 的环境回退 MutationObserver 监听 IMG/SCRIPT/LINK 的 load/error（resource-element-fallback.ts:81-126）。

### 7.5 其他

load 后上报 NavigationTiming（navigation-timing.ts:61-104，DNS/TCP/TTFB/DomReady 等分段）与 `measureUserAgentSpecificMemory` 内存采样（performance/index.ts:123-138）。

## 8. 屏幕录制插件：rrweb + gzip 故障现场重放

`ScreenRecordPlugin`（src/plugins/screen-record/）设计为"常态录制、事故触发上报"：

1. **录制**：`Promise.all([import("@rrweb/record"), import("pako")])` 双动态导入（首屏零成本，recorder.ts:64-66）；`record({recordCanvas: true, checkoutEveryNms: screenRecordDurationMs})`（默认 3000ms，:94-95）——rrweb 每 3s 重建全量快照（checkout），保证窗口内事件可独立重放。
2. **滚动窗口**：每个 emit 事件先经 `recordEventSchema = z.looseObject({timestamp: z.number()})` 校验（:32-34, 71-74），`getRollingWindow` 只保留 `timestamp >= now - screenRecordDurationMs` 的事件（:40-46），内存占用恒定。
3. **触发**：reporter 发送预检中，若事件 `type ∈ screenRecordEventTypes`（默认 Error/Xhr/Fetch/Resource/UnhandledRejection，constants/index.ts:59-65）则置 `sentry.shouldScreenRecord = true`（reporter/send-preflight.ts:36-38）；下一个 rrweb emit 时机把窗口打包上报并复位标志（recorder.ts:79-92）——即"故障发生 → 自动带出故障前 3 秒的现场录像"。
4. **压缩**：`zip = pako.gzip(JSON.stringify(events)) → base64`（rrweb 事件 JSON 冗余度高，gzip 收益显著，:104-109）；消费侧用包导出的 `unzipScreenRecord`（`ungzip + JSON.parse`，:111-117）还原后交给 rrweb-player 重放。

## 9. 数据上报管道

### 9.1 队列与批量

`reporter.send(payload)`（reporter/index.ts:162-181）链路：

1. **预检**（send-preflight.ts:26-40）：dsn 为空取消；`Math.random() > tracesSampleRate` 采样丢弃（默认 1 全量）；顺带判定录屏触发（§8）。
2. **单条钩子** `onBeforeReportData`：返回 `false` 丢弃该条（report-data.ts:64-79）；随后组装 `IReportData` 入队。
3. **批量策略**：队列达 `cacheMaxLength`（默认 10）或调用方指定 `immediate` 时立即 flush；否则 `setTimeout(cacheWaitingTime)`（默认 2000ms，unref）延迟合批（flush-scheduler.ts:25-34）。队列溢出统一 `slice(-maxQueueLength)`（默认 200）保留最新（index.ts:80, 105, 119, 171）。
4. **批量钩子** `beforePushEventList` 在出队后、发送前处理整批（batch.ts:27-41）；发送成功回调 `afterSendData`（index.ts:123）。

### 9.2 三级降级传输

sendBatch（index.ts:142-150 决策，transports.ts 实现）：

| 级别                     | 条件                                                        | 实现                                                                                                        | 失败判定                                           |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| ① `navigator.sendBeacon` | 批次 JSON ≤ 60KB（TextEncoder 计字节，transports.ts:26-30） | `sendBeacon(dsn, json)`（:32-37）                                                                           | 返回 false（浏览器排队失败）则降级                 |
| ② Image beacon           | `useImageReport: true`（默认关）且 ≤ 2KB                    | `img.src = dsn?data=encodeURIComponent(json)`，经 CallbackQueue 在 `requestIdleCallback` 空闲执行（:59-66） | 乐观成功（GET 打点无法可靠感知失败）               |
| ③ `fetch keepalive`      | 兜底                                                        | `fetch(dsn, {method: "POST", keepalive: true, headers: {"Content-Type": "application/json"}})`（:39-57）    | `!res.ok` 或异常 → 返回 false 并触发服务端故障处理 |

sendBeacon 与 fetch keepalive 均在页面卸载时仍能完成发送，保证 beforeunload 场景（PV 停留、最后一批错误）不丢数据。

### 9.3 离线缓存与故障自愈

- **离线**：发送时处于离线，或发送失败，批次写入 localStorage（key = `offlineCacheKey`，默认 `swifty_sentry_offline_cache`；读写均截断 `maxQueueLength`，offline-cache.ts:27-51）。回读用 zod `reportDataListSchema.safeParse` 校验，损坏数据直接清 key 防止反复失败（offline-cache.ts:32）。
- **网络恢复**：监听 `window 'online'` 事件，自动 load 缓存并 flush 上报队列（network-listener.ts:31-43）。
- **服务端故障**：响应 5xx 时进入恢复模式——置离线标志，每 `retryIntervalMilliseconds`（默认 60s）向 dsn 发 HEAD 探活，恢复后自动回灌缓存（server-recovery.ts:33-62）。
- `sendLocal()` 公开 API 可手动触发离线缓存冲刷（core/api.ts:109-111）。

## 10. 框架集成：React 16+ / Vue 3+

### 10.1 React：ErrorBoundary

`ReactErrorBoundary` 类组件（src/react.ts:83-155）同时实现两个错误 API：

- `static getDerivedStateFromError`：render 阶段切换到 `fallback`（支持 ReactNode 或 `(error, errorInfo?) => ReactNode` 函数形式）；
- `componentDidCatch(error, errorInfo)`：commit 阶段 setState 并调 `reportFrameworkError` 上报——`EventType.React`，extra 含 error/stack/context（errorInfo 携带 React 的 componentStack，core/framework-error.ts:66-79）。

这两个 API 均为 React 16 引入的类组件能力，故支持 React 16+（peerDependencies 声明 `^16 || ^17 || ^18 || ^19`）。

### 10.2 Vue 3：插件

`vuePlugin`（src/vue.ts:29-47）在 `install(app, options)` 中：保存原 `app.config.errorHandler` → 替换为「先 `reportFrameworkError({type: EventType.Vue, context: {vueInstance, info}})` 上报，再调用原 handler」→ 最后执行 `init(options)` 完成 SDK 初始化。不吞用户自己的错误处理逻辑。

## 11. 附录：曝光插件、身份指纹、dev sourcemap 插件

- **曝光插件**（plugins/exposure/index.ts）：命令式 `observe({target, threshold?, params?})`；`ioMap: Map<threshold, IntersectionObserver>` 按阈值复用观察者（默认 0.5），`targetMap` 记录 observeTime/showTime；进入视口记 showTime，**离开视口才上报曝光时长**（:57-97）。
- **身份体系**（core/identity.ts:26-88）：`enableFingerprint: true`（默认关）时懒加载 `@fingerprintjs/fingerprintjs` 生成 visitorId，落 localStorage 作稳定匿名 id；`setUserId/setVisitorId/getIdentity` 读写 options；`getIPs` 基于 RTCPeerConnection ICE candidate（core/ip.ts:32）。
- **dev sourcemap 插件**（src/vite.ts:55-141、src/webpack.ts:69-138）：在 dev server 挂中间件拦截 dsn 路径的 POST 上报，用构建器内存中的 sourcemap（vite 模块图 / webpack 产物 `.map`）经 `enrichReportData` 还原压缩堆栈到源码位置（含代码片段），追加写 `logs/sentry_<时间戳>.jsonl` 并响应 `{code: 0}`——本地开发即可闭环验证"报错 → 还原 → 落盘"。

---

## 知识点 ↔ 代码索引速查

| 描述中的知识点                 | 核心实现                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| 发布订阅架构                   | src/core/bus.ts:27-59                                           |
| core/plugin 解耦               | types/plugin.ts:30-37 + core/plugin-registry.ts + plugins/*     |
| 资源加载错误                   | decorates.ts:87（捕获阶段）+ handle-error.ts:62-89              |
| JSError                        | handle-error.ts:91-113 + console.error 装饰 decorates.ts:79-110 |
| 未捕获 Promise                 | handle-events.ts:37-48                                          |
| xhr/fetch 请求错误             | decorate-http.ts + transform-http-data.ts:25-48                 |
| 错误去重 + LRU                 | base64v2 指纹 + BoundedSet(1000)（data-structures.ts:140-149）  |
| 错误批量合并                   | handle-code-error.ts:40-82（2s 防抖，≥5 条合并）                |
| 声明式点击埋点                 | utils/click-data.ts + utils/dom2str.ts                          |
| hashchange/history             | decorate-route.ts:38-88 + handle-route.ts                       |
| 白屏关键点采样                 | white-screen.ts:70-81（18 点十字采样，≥18 空判白）              |
| LCP/FCP/CLS/INP                | plugins/performance/perf.ts:56-74（web-vitals）                 |
| FSP（MutationObserver + rAF）  | plugins/performance/first-screen-paint.ts:46-118                |
| longtask                       | plugins/performance/index.ts:79-96                              |
| rrweb + gzip 录屏重放          | plugins/screen-record/recorder.ts                               |
| 三级降级上报                   | reporter/transports.ts + index.ts:142-150                       |
| 离线 localStorage + 自动 flush | offline-cache.ts + network-listener.ts:31-43                    |
| React16+/Vue3+ 集成            | src/react.ts:83-155 / src/vue.ts:29-47                          |
