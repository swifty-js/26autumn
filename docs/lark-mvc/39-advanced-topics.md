---
title: 进阶主题
description: Lark Mvc 框架进阶主题详解，涵盖 HMR 热更新系统、Devtool 调试桥接、Service 服务层架构、LFU 缓存实现、Module Federation 集成及微前端架构设计。
---

# 进阶主题

本章深入探讨 Lark Mvc 框架的高级特性，包括热模块替换（HMR）系统、开发者工具桥接协议、Service 服务层架构、LFU 缓存算法实现，以及 Module Federation 微前端集成方案。这些主题面向需要深入理解框架内部机制或进行高级定制的开发者。

## 一、HMR 热更新系统

### 1.1 架构概览

Lark Mvc 的 HMR 系统实现了视图代码的热替换，无需完整页面刷新即可更新 UI，同时保留视图本地状态（计数器值、表单输入、滚动位置等）。

HMR 系统包含两个层次：

```
┌─────────────────────────────────────────────────────┐
│                  HMR 系统架构                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  模板层 (.html 变更)                                 │
│  ┌───────────────────────────────────────────┐      │
│  │ hotSwapByTemplate(oldTemplate, newTemplate)│      │
│  │ → 查找所有匹配旧模板的已挂载视图            │      │
│  │ → 替换模板函数引用                         │      │
│  │ → 强制重新渲染                            │      │
│  └───────────────────────────────────────────┘      │
│                                                     │
│  视图层 (.ts 变更)                                   │
│  ┌───────────────────────────────────────────┐      │
│  │ hotSwapByView(oldSetup, newSetup)          │      │
│  │ → 更新视图注册表                           │      │
│  │ → 对所有匹配的 Frame 执行 hotSwapView      │      │
│  │ → 保留 ViewCtx，仅替换 setup/template/events│     │
│  └───────────────────────────────────────────┘      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 1.2 模板层 HMR：hotSwapByTemplate

当 `.html` 模板文件变更时，编译器注入的 HMR 代码调用 `hotSwapByTemplate`：

```typescript
// hmr.ts
export function hotSwapByTemplate(
  oldTemplate: ViewTemplate,
  newTemplate: ViewTemplate,
): boolean {
  if (!oldTemplate || !newTemplate || oldTemplate === newTemplate) return false;
  let swapped = false;
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    if (!view || view.getTemplate() !== oldTemplate) continue;
    view.setTemplate(newTemplate);
    if (view.signature.value > 0) {
      view.signature.value++;
      view.fire("render");
      destroyAllResources(view, false);
      view.updater.forceDigest();
    }
    swapped = true;
  }
  return swapped;
}
```

关键点：

- 事件处理器**不需要**重新委托，因为它们存在于 setup 函数返回的 `events` 映射中，而非模板中
- 仅替换模板函数引用，然后强制重新渲染
- 返回 `boolean` 表示是否成功执行了替换

### 1.3 视图层 HMR：hotSwapByView

当 `.ts` 视图文件变更时，调用 `hotSwapByView` 更新注册表并热替换所有匹配实例：

```typescript
// hmr.ts
export function hotSwapByView(
  oldSetup: ViewSetup,
  newSetup: ViewSetup,
): boolean {
  if (!oldSetup || !newSetup || oldSetup === newSetup) return false;
  // 1. 更新视图注册表
  const reg = getViewClassRegistry();
  for (const path in reg) {
    if (reg[path] === oldSetup) reg[path] = newSetup;
  }
  // 2. 遍历所有 Frame，热替换匹配的视图
  let swapped = false;
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    const vp = frame.getViewPath();
    if (view && vp) {
      const parsed = parseUri(vp);
      if (reg[parsed.path] === newSetup) {
        hotSwapView(frame, newSetup);
        swapped = true;
      }
    }
  }
  return swapped;
}
```

### 1.4 状态保留策略：hotSwapView

`hotSwapView` 是状态保留 HMR 的核心构建块。它复用现有的 `ViewCtx`，仅替换 setup 函数、模板、事件和 assign：

```typescript
// hmr.ts
export function hotSwapView(frame: FrameObj, newSetup: ViewSetup): void {
  const oldView = frame.view;
  if (!oldView) {
    const vp = frame.getViewPath();
    if (vp) frame.mountView(vp);
    return;
  }
  // 1. 执行旧的 useEffect 清理函数
  for (let i = oldView.cleanups.length - 1; i >= 0; i--) {
    oldView.cleanups[i]();
  }
  oldView.cleanups.length = 0;

  // 2. 注销旧事件
  unregisterEvents(oldView);

  // 3. 销毁 destroyOnRender 资源
  destroyAllResources(oldView, false);

  // 4. 重新执行 newSetup(ctx) — 使用同一个 ctx 实例
  setCurrentCtx(oldView);
  let descriptor: ReturnType<ViewSetup>;
  try {
    descriptor = newSetup(oldView, undefined);
  } finally {
    setCurrentCtx(null);
  }

  // 5. 更新模板/事件/assign
  oldView.setTemplate(descriptor.template);
  oldView.setEvents(descriptor.events);
  if (descriptor.assign) oldView.setAssign(descriptor.assign);

  // 6. 注册新事件
  registerEvents(oldView);

  // 7. 递增签名，触发渲染
  if (oldView.signature.value > 0) {
    oldView.signature.value++;
    oldView.fire("render");
    destroyAllResources(oldView, false);
    oldView.updater.forceDigest();
  }
}
```

**状态保留原理**：由于 setup 函数在保留的 ctx 上重新执行，之前通过 `ctx.updater.set()` 设置的数据在热替换后依然存在。`updater.data`、`resources`、`emitter`、`signature`、`id`、`owner` 全部保持不变。

### 1.5 全局 HMR 句柄

HMR 函数通过 `globalThis.__lark_hmr__` 暴露，避免在 Module Federation 环境下的模块解析问题：

```typescript
// hmr.ts
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis.__lark_hmr__ = {
    hotSwapByTemplate,
    hotSwapByView,
  };
}
```

**为什么使用 globalThis 而非 import**：在 Module Federation（`@mm/lark-mvc` 作为 shared singleton）下，HMR accept 回调中任何对 `@mm/lark-mvc` 的 import/require 都会将调用模块注册为 shared consumer，导致 webpack 将主 chunk 标记为需要 hot-update。但主 chunk 代码实际未变更，不会生成对应的 `.hot-update.js` 文件，最终导致 `ChunkLoadError`。`globalThis` 完全绕过了模块解析和 chunk 图的副作用。

### 1.6 跨打包器 HMR 注入

`hmr-inject.ts` 为三种打包器生成不同的 HMR 代码：

| 打包器  | HMR 上下文               | accept(cb) 语义                     |
| ------- | ------------------------ | ----------------------------------- |
| Vite    | `import.meta.hot`        | cb 是更新成功回调（接收 newModule） |
| Webpack | `import.meta.webpackHot` | cb 是错误处理器（成功时不执行）     |
| Rspack  | `import.meta.webpackHot` | cb 是错误处理器（成功时不执行）     |

Vite 模式：

```javascript
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldTemplate = __lark_template__;
  });
  import.meta.hot.accept((newMod) => {
    const newTemplate = newMod?.default;
    const oldTemplate = import.meta.hot.data?.oldTemplate;
    if (oldTemplate && newTemplate && oldTemplate !== newTemplate) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  });
}
```

Webpack/Rspack 模式（self-accept 模式）：

```javascript
if (import.meta.webpackHot) {
  const oldTemplate = import.meta.webpackHot.data?.oldTemplate;
  if (oldTemplate) {
    const newTemplate = __lark_template__;
    if (oldTemplate !== newTemplate) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  }
  import.meta.webpackHot.dispose((data) => {
    data.oldTemplate = __lark_template__;
  });
  import.meta.webpackHot.accept((err) => {
    if (err) {
      console.error(err);
      globalThis.location?.reload();
    }
  });
}
```

## 二、Devtool 调试桥接

### 2.1 通信协议

Frame Devtool Bridge 运行在目标 Lark 应用内部，通过 `postMessage` 与浏览器扩展的 Devtool 面板通信：

```
Devtool → Bridge:  { type: 'LARK_DEVTOOL_PING' }
Bridge → Devtool:  { type: 'LARK_DEVTOOL_PONG' }
Devtool → Bridge:  { type: 'LARK_DEVTOOL_REQUEST_TREE' }
Bridge → Devtool:  { type: 'LARK_DEVTOOL_TREE', data: SerializedFrameTree }
Bridge → Devtool:  { type: 'LARK_DEVTOOL_TREE_DELTA', data: SerializedFrameTree }
```

消息类型常量：

```typescript
// devtool.ts
export const FrameDevtoolBridge = {
  MSG_PING: "LARK_DEVTOOL_PING",
  MSG_PONG: "LARK_DEVTOOL_PONG",
  MSG_REQUEST_TREE: "LARK_DEVTOOL_REQUEST_TREE",
  MSG_TREE: "LARK_DEVTOOL_TREE",
  MSG_TREE_DELTA: "LARK_DEVTOOL_TREE_DELTA",
};
```

### 2.2 序列化数据结构

Bridge 将 Frame 树序列化为 JSON 安全的快照：

```typescript
// 序列化后的 Frame 树节点
export interface SerializedFrameNode {
  id: string; // Frame ID
  parentId: string | null; // 父 Frame ID（根为 null）
  viewPath: string | null; // 视图路径（v-lark 属性值）
  childrenCount: number; // 子 Frame 数量
  readyCount: number; // 已触发 'created' 的子节点数
  childrenCreated: number; // 子节点是否已创建
  childrenAlter: number; // 子节点是否处于变更状态
  destroyed: number; // 是否已销毁
  view: SerializedViewInfo | null; // 序列化的视图信息
  children: SerializedFrameNode[]; // 子节点数组
}

// 序列化的视图信息
export interface SerializedViewInfo {
  id: string; // 视图 ID
  rendered: boolean; // 是否已渲染
  signature: number; // 签名（> 0 = 活跃）
  observedStateKeys: string[] | null; // 观察的状态键
  locationObserved: {
    // 路由观察配置
    flag: number;
    keys: string[];
    observePath: boolean;
  };
  hasTemplate: boolean; // 是否有模板函数
  eventMethodKeys: string[]; // 委托的事件类型
  resourceKeys: string[]; // 捕获的资源键
  hasAssign: boolean; // 是否暴露 assign 方法
  updaterData: Record<string, unknown> | null; // updater.refData 快照（对象值序列化为 "[object]"）
}

// 顶层序列化结果
export interface SerializedFrameTree {
  root: SerializedFrameNode | null;
  totalFrames: number;
  timestamp: number;
  rootId: string;
}
```

### 2.3 Bridge 安装与增量推送

```typescript
// devtool.ts
export function installFrameDevtoolBridge(): void {
  if (bridgeInstalled || typeof window === "undefined") return;
  bridgeInstalled = true;

  // 监听来自 Devtool 面板的 postMessage
  window.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === FrameDevtoolBridge.MSG_PING) {
      // 响应 PONG，让 Devtool 知道这是 Lark 应用
      const source = event.source as WindowProxy | null;
      if (source) {
        source.postMessage(
          { type: FrameDevtoolBridge.MSG_PONG },
          { targetOrigin: "*" },
        );
      }
      return;
    }

    if (data.type === FrameDevtoolBridge.MSG_REQUEST_TREE) {
      // 序列化并返回 Frame 树
      const tree = serializeFrameTree();
      const source = event.source as WindowProxy | null;
      if (source) {
        source.postMessage(
          { type: FrameDevtoolBridge.MSG_TREE, data: tree },
          { targetOrigin: "*" },
        );
      }
    }
  });

  // 监听 Frame 增删事件，推送增量更新
  Frame.on("add", () => pushTreeUpdate());
  Frame.on("remove", () => pushTreeUpdate());
}
```

增量推送使用 JSON 比较避免冗余消息：

```typescript
function pushTreeUpdate(): void {
  if (window === window.parent) return; // 非 iframe 环境不推送
  const tree = serializeFrameTree();
  const treeJson = JSON.stringify(tree);
  if (treeJson !== lastTreeJson) {
    lastTreeJson = treeJson;
    window.parent.postMessage(
      { type: FrameDevtoolBridge.MSG_TREE_DELTA, data: tree },
      "*",
    );
  }
}
```

### 2.4 启用 Devtool

在 `Framework.boot()` 配置中启用：

```typescript
Framework.boot({
  rootId: "root",
  defaultView: "app/views/default",
  devtool: true, // 启用 Devtool Bridge
  routes: {/* ... */},
});
```

## 三、Service 服务层

### 3.1 架构设计

Service 层提供 API 请求管理，具备 LFU 缓存、请求去重、串行队列和生命周期事件。采用函数式工厂模式——无 class、无 this、无 prototype。

```
┌─────────────────────────────────────────────────────────┐
│                    Service 架构                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  createService(syncFn, cacheMax, cacheBuffer)           │
│       │                                                 │
│       ├── ServiceApi (类型级)                            │
│       │    ├── add(meta)        注册端点元数据           │
│       │    ├── meta(attrs)      查询端点配置             │
│       │    ├── create(attrs)    创建 Payload             │
│       │    ├── get(attrs)       获取/创建 Payload        │
│       │    ├── cached(attrs)    查询缓存                │
│       │    ├── clear(names)     清除指定端点缓存         │
│       │    ├── on/off/fire      类型级事件              │
│       │    └── instance()       创建实例                │
│       │                                                 │
│       └── ServiceInstance (实例级)                       │
│            ├── all(attrs, done)  批量请求，全部完成回调   │
│            ├── one(attrs, done)  批量请求，逐个完成回调   │
│            ├── save(attrs, done) 跳过缓存，强制请求      │
│            ├── enqueue(cb)       入队串行任务            │
│            ├── dequeue()         出队执行               │
│            ├── destroy()         销毁实例               │
│            └── on/off/fire       实例级事件              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 创建 Service

```typescript
import { createService } from "@mm/lark-mvc";
import type { PayloadApi } from "@mm/lark-mvc";

// 创建 Service 类型，传入请求执行函数
const MyService = createService(
  (payload: PayloadApi, callback: () => void) => {
    const url = payload.get<string>("url");
    const params = payload.get<Record<string, unknown>>("params");

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
      .then((res) => res.json())
      .then((data) => {
        payload.set("data", data);
        callback(); // 通知完成
      })
      .catch((err) => {
        payload.set("error", err.message);
        callback();
      });
  },
  20, // cacheMax: 最大缓存条目数
  5, // cacheBuffer: 淘汰批次大小
);
```

### 3.3 注册端点元数据

```typescript
MyService.add([
  {
    name: "getUserList",
    url: "/api/users",
    cache: 60000, // 缓存 60 秒
    before(payload) {
      // 请求前处理：添加通用参数
      payload.set("params", {
        ...payload.get("params"),
        timestamp: Date.now(),
      });
    },
    after(payload) {
      // 请求后处理：转换数据格式
      const data = payload.get<any>("data");
      payload.set("list", data.items);
      payload.set("total", data.total);
    },
  },
  {
    name: "createUser",
    url: "/api/users/create",
    cache: 0, // 不缓存
    cleanKeys: "getUserList", // 成功后清除 getUserList 的缓存
  },
]);
```

### 3.4 请求去重机制

当多个视图同时请求相同数据时，Service 自动去重——仅发送一次网络请求，所有等待者共享结果：

```typescript
// service.ts 内部实现
function serviceSend(service, attrs, done, flag, save, internals) {
  // ...
  for (const attr of attrList) {
    const payloadInfo = getPayload(internals, attrObj, save);
    const cacheKey = payloadEntity.cacheInfo?.key ?? "";

    if (cacheKey && pendingCacheKeys[cacheKey]) {
      // 已有相同请求在进行中 → 链式等待（去重）
      pendingCacheKeys[cacheKey].push(complete);
    } else if (payloadInfo.needsUpdate) {
      if (cacheKey) {
        // 首个请求：创建待处理列表
        const cacheList = [complete];
        cacheList.entity = payloadEntity;
        pendingCacheKeys[cacheKey] = cacheList;
        syncFn(payloadEntity, cacheComplete);
      } else {
        syncFn(payloadEntity, complete);
      }
    } else {
      // 缓存命中，直接完成
      complete();
    }
  }
}
```

### 3.5 串行队列

Service 实例提供任务队列，确保异步操作按序执行：

```typescript
const service = MyService.instance();

// 在视图中使用
const view = defineView((ctx) => {
  const svc = MyService.instance();

  // all: 所有请求完成后统一回调
  svc.all(
    ["getUserList", { name: "getDeptList", url: "/api/depts" }],
    (errors, userList, deptList) => {
      if (errors.length) return;
      ctx.updater.digest({
        users: userList.get("list"),
        depts: deptList.get("list"),
      });
    },
  );

  // one: 每个请求完成时逐个回调
  svc.one(["getUserList", "getDeptList"], (error, payload, isLast, index) => {
    if (!error) {
      ctx.updater.digest({ [`data${index}`]: payload.get("data") });
    }
  });

  // save: 跳过缓存，强制请求
  svc.save({ name: "createUser", params: formData }, (errors, payload) => {
    if (!errors.length) {
      console.log("创建成功");
    }
  });

  // enqueue: 串行任务队列
  svc.enqueue(() => {
    // 此任务会在前一个任务完成后执行
  });

  // 视图销毁时清理
  ctx.on("destroy", () => svc.destroy());

  return { template };
});
```

### 3.6 缓存键生成

缓存键由请求属性和端点元数据组合生成，确保不同参数或不同端点产生不同的键：

```typescript
// service.ts
function defaultCacheKey(
  meta: ServiceMetaEntry,
  attrs: Record<string, unknown>,
): string {
  return JSON.stringify(attrs) + SPLITTER + getMetaJson(meta);
}
```

使用 `WeakMap` 缓存 meta 的 JSON 序列化结果，避免重复计算：

```typescript
const metaJsonCache = new WeakMap<ServiceMetaEntry, string>();

function getMetaJson(meta: ServiceMetaEntry): string {
  let cached = metaJsonCache.get(meta);
  if (cached === undefined) {
    cached = JSON.stringify(meta);
    metaJsonCache.set(meta, cached);
  }
  return cached;
}
```

## 四、LFU 缓存实现

### 4.1 算法设计

框架使用 LFU（Least Frequently Used）风格的有界缓存，基于频率的淘汰策略：

- 使用扁平数组（`entries`）+ `Map`（`lookup`）实现 O(1) 的 get/set
- `get` 时提升条目的频率和最后访问时间戳
- 容量超过 `maxSize + bufferSize` 时，单次遍历淘汰最差的 `bufferSize` 个条目
- 淘汰使用单遍部分选择（O(n\*k)）而非完整排序（O(n log n)）

### 4.2 核心实现

```typescript
// cache.ts
export function createCache<T = unknown>(
  options: CacheOptions<T> = {},
): CacheApi<T> {
  let entries: CacheEntry<T>[] = [];
  const lookup = new Map<string, CacheEntry<T>>();

  const maxSize = options.maxSize ?? 20;
  const bufferSize = options.bufferSize ?? 5;
  const capacity = maxSize + bufferSize;

  // 键前缀隔离（使用 SPLITTER 控制字符）
  function prefixKey(key: string): string {
    return SPLITTER + key;
  }

  // 读取：命中时提升频率和时间戳
  function get(key: string): T | undefined {
    const entry = lookup.get(prefixKey(key));
    if (!entry) return undefined;
    entry.frequency++;
    entry.lastTimestamp = nextCounter();
    return entry.value;
  }

  // 写入：已存在则更新，否则检查容量后插入
  function set(key: string, value: T): void {
    const prefixedKey = prefixKey(key);
    const existing = lookup.get(prefixedKey);
    if (existing) {
      existing.value = value;
      existing.frequency++;
      existing.lastTimestamp = nextCounter();
      return;
    }
    if (entries.length >= capacity) {
      evictEntries();
    }
    const entry: CacheEntry<T> = {
      originalKey: key,
      value,
      frequency: 1,
      lastTimestamp: nextCounter(),
    };
    entries.push(entry);
    lookup.set(prefixedKey, entry);
  }

  // ...
}
```

### 4.3 淘汰算法

淘汰使用单遍部分选择，维护一个大小为 `bufferSize` 的有序"最差"列表：

```typescript
function evictEntries(): void {
  if (bufferSize <= 0 || entries.length === 0) return;

  if (entries.length <= bufferSize) {
    // 快速路径：全部淘汰
    for (const e of entries) {
      lookup.delete(prefixKey(e.originalKey));
      if (onRemove) onRemove(e.originalKey);
    }
    entries = [];
    return;
  }

  // 维护 worst 有序列表：worst[0] 最差，worst[bufferSize-1] 最好
  const worst: CacheEntry<T>[] = [];

  for (const entry of entries) {
    if (worst.length < bufferSize) {
      // 插入排序
      let i = worst.length;
      while (i > 0 && comparator(entry, worst[i - 1]) > 0) i--;
      worst.splice(i, 0, entry);
    } else if (comparator(entry, worst[bufferSize - 1]) > 0) {
      // 比当前最差列表中最好的还差 → 替换
      worst.pop();
      let i = worst.length;
      while (i > 0 && comparator(entry, worst[i - 1]) > 0) i--;
      worst.splice(i, 0, entry);
    }
  }

  // 执行淘汰
  const evictSet = new Set(worst);
  for (const e of worst) {
    lookup.delete(prefixKey(e.originalKey));
    if (onRemove) onRemove(e.originalKey);
  }
  entries = entries.filter((e) => !evictSet.has(e));
}
```

默认排序比较器：频率高的优先保留，频率相同则最近访问的优先保留：

```typescript
function sortCacheEntries<T>(a: CacheEntry<T>, b: CacheEntry<T>): number {
  return b.frequency - a.frequency || b.lastTimestamp - a.lastTimestamp;
}
```

### 4.4 使用示例

```typescript
import { Framework } from "@mm/lark-mvc";

// 通过 Framework 创建缓存实例
const cache = Framework.createCache({
  maxSize: 50,
  bufferSize: 10,
  onRemove(key) {
    console.log(`缓存淘汰: ${key}`);
  },
});

cache.set("user:1", { name: "Alice", role: "admin" });
cache.set("user:2", { name: "Bob", role: "user" });

const user = cache.get("user:1"); // { name: "Alice", role: "admin" }
cache.has("user:3"); // false
cache.getSize(); // 2

cache.del("user:2");
cache.clear();
```

## 五、Module Federation 集成

### 5.1 微前端架构设计

Lark Mvc 原生支持 Module Federation，通过 `FrameworkConfig.require` 配置实现远程模块加载：

```typescript
// 主应用配置
Framework.boot({
  rootId: "root",
  projectName: "main-app", // 当前项目名
  defaultView: "main-app/views/home",
  routes: {
    "/home": "main-app/views/home",
    "/remote-dashboard": "remote-app/views/dashboard", // 远程视图
    "/remote-settings": "remote-app/views/settings",
  },
  // Module Federation 模块加载器
  require: async (names: string[], params?: Record<string, unknown>) => {
    // 使用 webpack Module Federation 的 __webpack_share_scopes__
    await __webpack_init_sharing__("default");
    const container = window["remote-app"];
    await container.init(__webpack_share_scopes__.default);

    return names.map((name) => {
      const factory = await container.get(`./${name}`);
      return factory();
    });
  },
});
```

### 5.2 视图路径解析

框架通过 `projectName` 判断视图路径属于当前项目还是远程项目：

```typescript
// 路由配置中的视图路径格式
// "projectName/views/path"
// 如果 projectName 匹配当前应用 → 本地加载
// 否则 → 通过 require 函数远程加载
```

### 5.3 Webpack Module Federation 配置

```javascript
// webpack.config.mjs（主应用）
import { ModuleFederationPlugin } from "webpack";
import { LarkMvcPlugin } from "@mm/lark-mvc/webpack";

export default {
  plugins: [
    new LarkMvcPlugin({ debug: true }),
    new ModuleFederationPlugin({
      name: "main-app",
      remotes: {
        "remote-app": "remote-app@http://localhost:3001/remoteEntry.js",
      },
      shared: {
        "@mm/lark-mvc": {
          singleton: true, // 确保全局单例
          requiredVersion: "^0.0.19",
        },
      },
    }),
  ],
};
```

```javascript
// webpack.config.mjs（远程应用）
import { ModuleFederationPlugin } from "webpack";
import { LarkMvcPlugin } from "@mm/lark-mvc/webpack";

export default {
  plugins: [
    new LarkMvcPlugin({ debug: true }),
    new ModuleFederationPlugin({
      name: "remote-app",
      filename: "remoteEntry.js",
      exposes: {
        "./views/dashboard": "./src/views/dashboard.ts",
        "./views/settings": "./src/views/settings.ts",
      },
      shared: {
        "@mm/lark-mvc": {
          singleton: true,
          requiredVersion: "^0.0.19",
        },
      },
    }),
  ],
};
```

### 5.4 HMR 与 Module Federation 的兼容

如前所述，HMR 系统通过 `globalThis.__lark_hmr__` 而非模块导入来访问热替换函数，这是专门为 Module Federation 环境设计的。在 MF 环境下：

1. `@mm/lark-mvc` 作为 shared singleton，全局仅一份实例
2. HMR accept 回调中不能 import/require `@mm/lark-mvc`（会触发 chunk 图副作用）
3. `globalThis.__lark_hmr__` 在框架启动时注册，HMR 回调时直接读取

## 六、微前端最佳实践

### 6.1 共享依赖管理

```javascript
// 确保 @mm/lark-mvc 在所有微应用间共享单例
shared: {
  "@mm/lark-mvc": {
    singleton: true,
    eager: false, // 主应用可以 eager，远程应用不要
  },
}
```

### 6.2 跨应用通信

使用 State 或 Store 进行跨微应用通信（因为共享单例）：

```typescript
// 主应用设置全局状态
import { State } from "@mm/lark-mvc";
State.digest({ currentUser: userInfo, theme: "dark" });

// 远程应用读取（同一个 State 实例）
import { State } from "@mm/lark-mvc";
const user = State.get("currentUser");
```

### 6.3 视图隔离

每个微应用的视图拥有独立的 Frame 树和 Updater，天然隔离：

```typescript
// 远程应用的视图与主应用视图完全独立
// 各自的 ViewCtx、updater、resources 互不影响
// 仅通过 State/Store 和 Router 进行受控通信
```
