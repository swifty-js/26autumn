# 手写 SWR：预加载 + 去重 + Stale-While-Revalidate

## 背景

在中后台系统中，存在大量公用选择器数据源：Staff 用户选择器、搜索推荐算法选择器、向量库选择器等。这些数据有以下特征：

- 多个页面、多个组件同时消费
- 数据变化频率低（分钟级甚至小时级）
- 首屏渲染强依赖（选择器没数据，页面就没法交互）

传统做法是在组件 `useEffect` 中各自发请求，导致：

1. 请求发起时机晚（等 JS bundle 下载、解析、React mount 之后才开始）
2. 同一数据被多个组件重复请求
3. 页面切换后缓存丢失，再次等待

本方案用约 80 行代码实现一套 SWR 机制，无需引入任何第三方数据请求库。

## 核心原理

整体流程分为两个阶段：预加载阶段（header 脚本）和消费阶段（组件 fetcher）。

### 阶段一：预加载（index.html `<header>` 内联脚本）

```html
<script>
  // 在 HTML 解析阶段就发起请求，与 JS bundle 下载并行
  const staffPromise = fetch("/api/staff").then((r) => r.json());
  const algorithmPromise = fetch("/api/algorithm").then((r) => r.json());
  const vectorDBPromise = fetch("/api/vector-db").then((r) => r.json());

  // promise 挂载到 window（去重锚点）
  window.staffPromise = staffPromise;
  window.algorithmPromise = algorithmPromise;
  window.vectorDBPromise = vectorDBPromise;

  // result 挂载到 window（缓存锚点）
  staffPromise.then((res) => (window.staffResult = res));
  algorithmPromise.then((res) => (window.algorithmResult = res));
  vectorDBPromise.then((res) => (window.vectorDBResult = res));
</script>
```

关键点：这段脚本位于 `<header>` 中，浏览器解析到它时立即发起请求。此时 React 的 JS bundle 可能还在下载中，网络请求与脚本加载并行执行，不浪费任何等待时间。

### 阶段二：消费（组件中的 fetcher 函数）

fetcher 按优先级执行三级降级：

```
┌─────────────────────────────────────────────────────────┐
│  1. window.xxxResult 有值？                              │
│     → 立即返回（stale），后台静默 revalidate             │
│     → 耗时 ≈ 0ms                                       │
├─────────────────────────────────────────────────────────┤
│  2. window.xxxPromise 有值？                             │
│     → 复用该 promise，await 等待 resolved                │
│     → 耗时 = 剩余网络时间（可能已接近 0）                 │
├─────────────────────────────────────────────────────────┤
│  3. 都没有？                                             │
│     → 重建完整 SWR 流程：发请求 → 挂 promise → 等结果    │
│     → 耗时 = 完整网络 RTT                                │
└─────────────────────────────────────────────────────────┘
```

对应代码（src/swr.ts）：

```typescript
export async function swrFetch<T>(key: string): Promise<FetchResult<T>> {
  const entry = cache.get(key);

  // 情况 1: result 已就绪 → 立即返回 + 后台刷新
  if (entry?.result !== undefined) {
    const data = entry.result;
    fetcherMap[key]().then((newResult) => {
      entry.result = newResult;
    });
    return { data, fromCache: true, fromPromise: false, waitedMs: ~0 };
  }

  // 情况 2: promise 已存在 → 复用（去重）
  if (entry?.promise) {
    const data = await entry.promise;
    return { data, fromCache: false, fromPromise: true, waitedMs: 剩余时间 };
  }

  // 情况 3: 冷启动 → 重建
  const promise = fetcherMap[key]();
  cache.set(key, { promise, result: undefined });
  const data = await promise;
  entry.result = data;
  return { data, fromCache: false, fromPromise: false, waitedMs: 完整RTT };
}
```

### 时序图

```
浏览器解析 HTML
│
├─ <header> 脚本执行 ─── fetch 发起 ──────────────────── response 到达
│                                                         │
├─ <script src="bundle.js"> 下载中...                      │
│                                                         │
├─ bundle 解析、React mount                               │
│   │                                                     │
│   └─ 组件调用 swrFetch()                                │
│       ├─ 若 response 已到 → 命中 result → 0ms 返回      │
│       └─ 若 response 未到 → 复用 promise → 等剩余时间    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

对照组（无预加载）的时序：

```
浏览器解析 HTML
│
├─ <script src="bundle.js"> 下载中...
│
├─ bundle 解析、React mount
│   │
│   └─ useEffect 触发 ─── fetch 发起 ─── 等待完整 RTT ─── 渲染
│
└────────────────────────────────────────────────────────────────
```

差异在于：SWR 组的网络请求与 bundle 下载并行，对照组是串行。

## 优势分析

### 1. 包体积极小

| 方案                                | 体积（gzip）                  |
| ----------------------------------- | ----------------------------- |
| 本方案（手写 SWR）                  | 约 0.5 KB（核心逻辑约 80 行） |
| SWR (vercel/swr)                    | 约 4.5 KB                     |
| React Query (@tanstack/react-query) | 约 12 KB                      |
| ahooks useRequest                   | 约 8 KB（含依赖）             |

对于只需要"预加载 + 去重 + 缓存"这三个能力的场景，引入完整的数据请求库是过度设计。本方案零依赖，不引入任何 runtime 开销。

### 2. 存量旧业务接入成本低

这是本方案最核心的优势。很多中后台项目有以下现状：

- 非 React 18，无法使用 Suspense data fetching
- 构建产物是多个独立 HTML 入口（MPA），不是 SPA
- 已有大量 jQuery / 原生 JS 页面与 React 页面共存
- 不方便全量迁移到 React Query / SWR 的 provider 模式

本方案的接入方式：

1. 在对应 HTML 的 `<header>` 中加一段内联脚本（不依赖任何框架）
2. 页面消费侧只需调用一个 `swrFetch(key)` 函数
3. 不需要 Provider、不需要 hook、不需要改构建配置
4. jQuery 页面、原生 JS 页面、React 页面都能用同一套缓存

```javascript
// jQuery 页面也能消费
swrFetch("staff").then(({ data }) => {
  $("#staff-select").renderOptions(data);
});
```

### 3. 首屏加载优势

以 800ms 网络延迟为例：

| 阶段                      | SWR 组                       | 对照组                    |
| ------------------------- | ---------------------------- | ------------------------- |
| HTML 解析 + header 脚本   | 发起请求                     | -                         |
| bundle 下载（假设 200ms） | 请求进行中（并行）           | -                         |
| React mount               | 消费 result/promise          | 发起请求                  |
| 数据就绪                  | 约 600ms（800-200 并行节省） | 约 1000ms（200+800 串行） |
| 二次消费                  | 约 0ms（缓存命中）           | 约 800ms（重新请求）      |

网络延迟越大、bundle 越大，优势越明显。在弱网环境（2G/3G）下差距可达数秒。

### 4. 天然去重

多个组件同时消费同一数据源时，共享同一个 promise，不会产生重复请求。无需额外的请求合并逻辑或 deduplication 配置。

### 5. 渐进式 revalidate

命中缓存时立即返回旧数据（用户无感知），后台静默刷新。下次消费时拿到新数据。这比"loading → 数据"的体验好得多，用户永远不需要看到 skeleton。

## 适用场景

- 中后台系统的公用下拉选择器数据源
- MPA 架构下多页面共享数据
- 不想引入重量级数据请求库的项目
- 需要兼容非 React 技术栈的混合项目
- 对包体积敏感的场景（微前端子应用、SDK 等）

## 不适用场景

- 需要复杂缓存策略（LRU 淘汰、乐观更新、mutation 后失效）
- 需要请求重试、指数退避、请求取消等高级能力
- 纯 SPA 且已深度使用 React Query / SWR 的项目

## 运行 Demo

```bash
cd swr-demo
pnpm install
pnpm dev
```

打开浏览器访问 http://localhost:5173，点击"开始对比"查看首屏加载差异，点击"模拟二次消费"查看缓存命中效果。

## 项目结构

```
src/
├── mock-api.ts    # 模拟后端接口（800ms+ 延迟）
├── swr.ts         # 手写 SWR 核心（preload / swrFetch / normalFetch）
├── App.tsx        # 对比 UI（SWR 组 vs 对照组 + 时间线图表）
├── App.css        # 样式
├── index.css      # 全局样式
└── main.tsx       # 入口
```
