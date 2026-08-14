---
title: 架构总览
description: Lark Mvc 框架完整架构概览，涵盖模块关系、数据流、设计决策、公共 API 全景及与主流框架的对比分析
---

# 架构总览

本文档从全局视角介绍 Lark Mvc 的架构设计，包括模块依赖关系、数据流向、核心设计决策及其背后的理由，以及与 Vue/React/Svelte 的对比分析。

## 一、框架定位

Lark Mvc 是一个轻量级前端框架，面向**单页应用**和**微前端**场景：

- 零运行时依赖（Babel 仅用于构建时模板编译）
- 函数式 API——无 class、无 this、无 prototype、无 mixin
- 真实 DOM diff（默认）或 VDOM diff（可选）
- 内建 Module Federation 支持
- 完整的 HMR 热更新（状态保留）

## 二、完整架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         应用层 (Application)                         │
│  Framework.boot({ rootId, routes, defaultView, ... })               │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                      框架核心 (Framework Core)                        │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  Router  │  │  State   │  │  Store   │  │  EventDelegator   │   │
│  │ 路由管理  │  │ 跨视图状态│  │ 响应式存储│  │  DOM 事件委托     │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬──────────┘   │
│       │              │              │                  │              │
│  ┌────▼──────────────▼──────────────▼──────────────────▼──────────┐  │
│  │                    Dispatcher (变更通知)                         │  │
│  │         dispatcherUpdate: 遍历 Frame 树，通知观察的视图          │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                      │
│  ┌────────────────────────────▼───────────────────────────────────┐  │
│  │                    Frame Tree (视图生命周期)                     │  │
│  │                                                                 │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │  ViewCtx (视图上下文)                                    │   │  │
│  │  │  ├── updater: UpdaterApi (数据绑定 + DOM diff)           │   │  │
│  │  │  ├── emitter: EmitterApi (生命周期事件)                  │   │  │
│  │  │  ├── resources: Record<string, ViewResourceEntry>        │   │  │
│  │  │  ├── signature: Ref<number> (异步安全守卫)               │   │  │
│  │  │  ├── cleanups: Array<() => void> (useEffect 清理)        │   │  │
│  │  │  └── events: Record<string, AnyFunc> (事件处理器)        │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    渲染管线 (Rendering Pipeline)                  │  │
│  │                                                                  │  │
│  │  字符串模式 (默认):                                              │  │
│  │  template(data) → HTML string → domGetNode → domSetChildNodes   │  │
│  │  → applyIdUpdates → applyDomOps → endUpdate                     │  │
│  │                                                                  │  │
│  │  VDOM 模式 (vdom: true):                                        │  │
│  │  template(data) → VDomNode → vdomSetChildNodes → patch DOM      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │   Service    │  │    Cache     │  │        HMR               │   │
│  │  API 请求管理 │  │  LFU 缓存   │  │  热模块替换（状态保留）   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                      构建层 (Build Tooling)                           │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  Vite Plugin │  │Webpack Loader│  │    Rspack Loader         │   │
│  │ larkMvc    │  │ larkMvc    │  │    larkMvc             │   │
│  │ Plugin       │  │ Loader       │  │    Loader                │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘   │
│         │                  │                       │                  │
│  ┌──────▼──────────────────▼───────────────────────▼─────────────┐   │
│  │              Template Compiler (模板编译器)                     │   │
│  │  .html → JS function (字符串模式) 或 VDomNode (VDOM 模式)      │   │
│  │  操作符: = (转义) / ! (原始) / @ (引用) / : (绑定)            │   │
│  └────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## 三、模块依赖图

```
index.ts (公共 API 桶导出)
  │
  ├── framework.ts ─────────── 主入口，boot() 启动
  │     ├── router.ts ──────── 路由管理（history/hash）
  │     ├── state.ts ───────── 跨视图可观察状态
  │     ├── frame.ts ───────── 视图生命周期管理
  │     ├── event-delegator.ts  DOM 事件委托
  │     ├── hmr.ts ─────────── 热模块替换
  │     ├── mark.ts ────────── 异步回调有效性标记
  │     ├── cache.ts ───────── LFU 缓存工厂
  │     ├── event-emitter.ts ─ 事件发射器工厂
  │     └── module-loader.ts ─ 模块加载（require/use）
  │
  ├── view.ts ──────────────── 视图系统（defineView, createCtx, mountCtx, unmountCtx）
  │     ├── hooks.ts ───────── Hooks 运行时（useState, useEffect, useStore, ...）
  │     ├── updater.ts ─────── 数据绑定 + 变更检测 + DOM diff 触发
  │     │     ├── dom.ts ───── 真实 DOM diff 引擎（字符串模式）
  │     │     └── vdom.ts ──── VDOM diff 引擎（VDOM 模式）
  │     └── event-delegator.ts
  │
  ├── service.ts ───────────── API 请求管理
  │     └── cache.ts
  │
  ├── store.ts ─────────────── zustand 风格状态管理
  │
  ├── url-state.ts ─────────── URL 状态同步 Hook
  │
  └── types.ts ─────────────── 所有共享类型定义

构建工具:
  ├── vite.ts ──────────────── Vite 插件
  ├── webpack.ts ───────────── Webpack Loader
  ├── rspack.ts ────────────── Rspack Loader
  ├── hmr-inject.ts ────────── HMR 代码生成（跨打包器）
  └── compiler.ts ──────────── 模板编译器
```

## 四、数据流总结

### 单向数据流

```
用户交互 (DOM Event)
    │
    ▼
EventDelegator (capture phase on document.body)
    │
    ▼
findFrameInfo → 解析 @event 属性 → 定位 Frame + Handler
    │
    ▼
事件处理器执行 (events map 中的函数)
    │
    ▼
updater.set(data) → 标记变更键
    │
    ▼
updater.digest() → 触发渲染
    │
    ▼
template(data, viewId, refData) → HTML string / VDomNode
    │
    ▼
DOM Diff (keyed comparison) → 最小化 DOM 操作
    │
    ▼
endUpdate() → 挂载/更新子视图 (v-lark)
    │
    ▼
界面更新完成
```

### 跨视图通信

```
方式 1: State (简单共享数据)
  State.set({ key: value }) → State.digest()
    → dispatcherUpdate 遍历 Frame 树
    → observeState 匹配的视图重新 render

方式 2: Store (复杂响应式状态)
  store.setState({ ... })
    → subscribe 回调触发
    → bindStore 同步到 updater.data → digest

方式 3: Router (URL 驱动)
  Router.to("/path", { params })
    → CHANGED 事件
    → observeLocation 匹配的视图重新 render

方式 4: Frame.invoke (直接方法调用)
  parentFrame.invoke("methodName", args)
    → 子视图的 assign() 被调用
```

## 五、核心设计决策

### 1. 纯函数式 API（无 class）

**决策**：所有模块使用工厂函数 + 闭包，不使用 class/prototype/this。

**理由**：

- 消除 `this` 绑定陷阱（新手最常见的错误来源）
- 更好的 tree-shaking（无 prototype 链，打包器可精确分析）
- HMR 友好——闭包状态可以被新 setup 函数自然继承
- 与 Module Federation 兼容（无 prototype 序列化问题）

```typescript
// 不是这样：
class MyView extends View {
  render() { this.updater.set(...); }
}

// 而是这样：
export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  return { template, events: { "incr<click>": () => setCount(getCount() + 1) } };
});
```

### 2. 显式响应式（非自动追踪）

**决策**：数据变更需要显式调用 `digest()`，不使用 Proxy/getter 自动追踪。

**理由**：

- 零运行时开销——无 Proxy 拦截、无依赖收集
- 精确控制渲染时机——批量更新只需一次 digest
- 可预测性——开发者明确知道何时触发渲染
- 与模板编译器配合——编译时确定数据依赖，无需运行时追踪

```typescript
// 显式控制：三次 set，一次渲染
ctx.updater
  .set({ name: "Alice" })
  .set({ age: 25 })
  .set({ city: "杭州" })
  .digest(); // 只触发一次 DOM diff
```

### 3. 真实 DOM Diff（默认）

**决策**：默认使用 innerHTML + keyed comparison，而非 Virtual DOM。

**理由**：

- 内存效率——无需维护完整的 VDOM 树副本
- 利用浏览器原生 HTML 解析器（高度优化的 C++ 实现）
- 对于大多数业务场景（服务端数据驱动），字符串拼接 + diff 比 VDOM 更快
- 可选 VDOM 模式（`vdom: true`）用于需要细粒度控制的场景

```typescript
// 字符串模式渲染管线：
const htmlString = template(data, viewId, refData); // 编译后的模板函数
const newDom = domGetNode(htmlString, node); // 浏览器原生解析
domSetChildNodes(node, newDom, ref, frame, keys); // keyed diff
applyDomOps(ref.domOps); // 批量 DOM 操作
```

### 4. 事件委托

**决策**：所有 DOM 事件委托到 `document.body`（capture phase），使用引用计数管理。

**理由**：

- 无论多少视图/元素，每种事件类型只有一个监听器
- 视图挂载/卸载无需添加/移除 DOM 监听器
- 自然支持动态元素（无需重新绑定）
- capture phase 确保在目标元素处理前拦截

```typescript
// EventDelegator 内部：
// 第一个视图注册 click → document.body.addEventListener("click", processor, true)
// 第二个视图注册 click → 只增加引用计数，不重复添加
// 视图销毁 → 引用计数减一，归零时才移除监听器
```

### 5. Setup 只执行一次

**决策**：视图 setup 函数在挂载时执行一次（非每次渲染）。

**理由**：

- 避免 React 式的"每次渲染重新创建闭包"问题
- 事件处理器、资源、订阅只创建一次——无 GC 压力
- 通过 getter 函数（而非值）访问最新状态——避免过期闭包
- HMR 时可重新执行 setup 而保留 updater.data

## 六、与主流框架对比

| 维度           | Lark Mvc               | React                 | Vue 3                 | Svelte                |
| -------------- | ---------------------- | --------------------- | --------------------- | --------------------- |
| **响应式模型** | 显式 digest            | 自动（setState 触发） | 自动（Proxy 追踪）    | 编译时（赋值触发）    |
| **渲染策略**   | 真实 DOM diff（默认）  | Virtual DOM           | Virtual DOM           | 编译为命令式 DOM 操作 |
| **组件定义**   | defineView + setup     | function/class        | defineComponent/setup | `<script>` 块         |
| **状态管理**   | useState getter/setter | useState/hook         | ref/reactive          | let 变量              |
| **模板**       | 独立 .html 文件        | JSX                   | SFC template          | SFC template          |
| **事件系统**   | 全局委托（capture）    | 合成事件（root 委托） | 直接绑定              | 直接绑定              |
| **运行时大小** | ~15KB gzip             | ~42KB gzip            | ~33KB gzip            | ~2KB（编译后）        |
| **HMR**        | 状态保留（双层）       | Fast Refresh          | HMR + 状态保留        | HMR                   |
| **微前端**     | 内建 MF 支持           | 需额外方案            | 需额外方案            | 需额外方案            |
| **学习曲线**   | 中等（显式模型）       | 中等                  | 低                    | 低                    |

### 与 React 的关键差异

```typescript
// React: 每次渲染重新执行组件函数
function Counter() {
  const [count, setCount] = useState(0); // 每次渲染重新创建
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

// Lark: setup 只执行一次
export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0); // 只创建一次
  return {
    template, // 独立 .html 文件
    events: {
      "incr<click>": () => setCount(getCount() + 1), // getter 读最新值
    },
  };
});
```

### 与 Vue 的关键差异

```typescript
// Vue: Proxy 自动追踪依赖
const count = ref(0);
const increment = () => {
  count.value++;
}; // 自动触发更新

// Lark: 显式触发
const [getCount, setCount] = useState("count", 0);
// setter 内部: updater.set({count: v}).digest() — 显式 set + digest
```

### 与 Svelte 的关键差异

```svelte
<!-- Svelte: 编译器将赋值转换为 DOM 更新 -->
<script>
  let count = 0;
  const increment = () => { count += 1; }; // 编译器转换此行
</script>
<button on:click={increment}>{count}</button>
```

```typescript
// Lark: 模板在独立 .html 文件中，通过 updater 驱动
// counter.html: <button @click="incr()">{{= count}}</button>
// counter.ts:
events: { "incr<click>": () => setCount(getCount() + 1) }
```

## 七、完整公共 API 表面

以下是 `@mm/lark-mvc` 的完整导出（来自 `index.ts`）：

### 框架核心

| 导出             | 来源               | 说明                                 |
| ---------------- | ------------------ | ------------------------------------ |
| `Framework`      | framework.ts       | 主入口对象（boot, config, 工具方法） |
| `defineView`     | view.ts            | 定义视图的工厂函数                   |
| `EventDelegator` | event-delegator.ts | DOM 事件委托单例                     |

### 状态管理

| 导出          | 来源         | 说明                        |
| ------------- | ------------ | --------------------------- |
| `State`       | state.ts     | 跨视图可观察状态单例        |
| `createStore` | store.ts     | 创建 zustand 风格 store     |
| `computed`    | store.ts     | 派生计算状态                |
| `bindStore`   | store.ts     | 将 store 绑定到视图 updater |
| `useUrlState` | url-state.ts | URL 参数状态同步 Hook       |

### 路由

| 导出     | 来源      | 说明                            |
| -------- | --------- | ------------------------------- |
| `Router` | router.ts | 路由管理（history/hash 双模式） |

### 视图生命周期

| 导出                  | 来源     | 说明                     |
| --------------------- | -------- | ------------------------ |
| `Frame`               | frame.ts | Frame 单例（视图树管理） |
| `createFrame`         | frame.ts | 创建 Frame 实例          |
| `registerViewClass`   | frame.ts | 注册视图到全局注册表     |
| `invalidateViewClass` | frame.ts | 使注册表条目失效         |

### Hooks

| 导出          | 来源     | 说明                          |
| ------------- | -------- | ----------------------------- |
| `useState`    | hooks.ts | 视图本地状态 [getter, setter] |
| `useEffect`   | hooks.ts | 副作用 + 清理函数             |
| `useStore`    | hooks.ts | 绑定 store 到视图             |
| `useInterval` | hooks.ts | 自动清理的 setInterval        |
| `useTimeout`  | hooks.ts | 自动清理的 setTimeout         |
| `useResource` | hooks.ts | 注册可销毁资源                |
| `useEvent`    | hooks.ts | 注册视图事件监听              |

### 服务层

| 导出                     | 来源       | 说明              |
| ------------------------ | ---------- | ----------------- |
| `createService`          | service.ts | 创建 API 服务类型 |
| `ServiceApi` (type)      | service.ts | 服务类型接口      |
| `ServiceInstance` (type) | service.ts | 服务实例接口      |

### VDOM

| 导出         | 来源    | 说明                              |
| ------------ | ------- | --------------------------------- |
| `vdomCreate` | vdom.ts | VDOM 节点创建函数（编译模板使用） |

### 类型

| 导出                      | 来源     | 说明             |
| ------------------------- | -------- | ---------------- |
| `export * from "./types"` | types.ts | 所有公共类型定义 |

## 八、Framework 对象 API

`Framework` 是框架的主入口对象，提供启动和全局工具：

```typescript
interface FrameworkApi {
  // 生命周期
  boot(cfg: FrameworkConfig): void;
  isBooted(): boolean;
  getConfig(): FrameworkConfig;
  getConfig<T>(key: string): T | undefined;
  setConfig<T>(patch: Partial<FrameworkConfig> & T): FrameworkConfig & T;

  // 路由 & 状态
  Router: RouterApi;
  State: StateApi;
  Frame: typeof Frame;

  // 工具方法
  toUri(path, params?, keepEmpty?): string;
  parseUri(url): ParsedUri;
  assign<T>(target, ...sources): T;
  keys<T>(src): string[];
  nodeInside(node, container): boolean;
  ensureNodeId(node): string;
  generateId(prefix?): string;
  mark(host, key): () => boolean;
  unmark(host): void;
  dispatchEvent(target, eventType, eventInit?): void;
  task(fn, args?, context?): void;
  delay(time): Promise<void>;
  use(names, callback?): void;
  waitZoneViewsRendered(viewId, timeout?): Promise<number>;

  // 工厂
  createEmitter: typeof createEmitter;
  createCache: typeof createCache;
  defineView: typeof defineView;
}
```

## 九、FrameworkConfig 配置项

```typescript
interface FrameworkConfig {
  rootId: string; // 根容器 DOM ID（必填）
  routeMode?: "history" | "hash"; // 路由模式
  defaultView?: string; // 默认视图路径
  defaultPath?: string; // 默认路径
  routes?: Record<string, string | RouteViewConfig>; // 路由映射
  hashbang?: string; // hash 前缀（默认 "#!"）
  error?: (error: Error) => void; // 全局错误处理
  extensions?: string[]; // 扩展视图路径
  initModule?: string; // 初始化模块
  rewrite?: (path, params, routes) => string; // 路由重写
  unmatchedView?: string; // 404 视图
  require?: (names, params?) => Promise<unknown[]>; // 模块加载器
  vdom?: boolean; // 启用 VDOM 模式（默认 false）
  projectName?: string; // 微前端项目名
  devtool?: boolean; // 启用 DevTool Bridge
}
```

## 十、启动流程

```typescript
import { Framework, registerViewClass } from "@mm/lark-mvc";
import HomeView from "./views/home";

// 1. 注册视图（同步模式）
registerViewClass("app/views/home", HomeView);

// 2. 启动框架
Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
  routes: {
    "/home": "app/views/home",
    "/detail": "app/views/detail",
  },
  routeMode: "history",
});
```

启动序列：

1. 注册 HMR 全局函数 → `globalThis.__lark_hmr__`
2. 合并配置 → `assign(config, cfg)`
3. 设置 Router 配置 → `Router._setConfig(config)`
4. 注入 Frame 查找器 → `EventDelegator.setFrameGetter(...)`
5. 绑定路由变更事件 → `Router.on(CHANGED, dispatcherNotifyChange)`
6. 绑定状态变更事件 → `State.on(CHANGED, dispatcherNotifyChange)`
7. 标记已启动并按需安装 Devtool Bridge → `installFrameDevtoolBridge()`（`devtool: true` 时）
8. 创建根 Frame → `Frame.createRoot(config.rootId)`
9. 绑定 hashchange/popstate → `Router._bind()`
10. 挂载默认视图 → `rootFrame.mountView(defaultView)`

## 十一、未来方向

基于当前架构，Lark Mvc 的潜在演进方向：

| 方向                      | 说明                                                           |
| ------------------------- | -------------------------------------------------------------- |
| **Signals 集成**          | 在保持显式模型的前提下，提供细粒度信号原语                     |
| **SSR 支持**              | 模板编译为同构函数，支持服务端渲染 + 客户端 hydration          |
| **并发渲染**              | 利用 `scheduler.postTask` 实现优先级调度（已有 task 基础设施） |
| **编译器优化**            | 静态分析模板，生成精确的 DOM 更新指令（类 Svelte 编译策略）    |
| **DevTools 增强**         | 基于已有 `devtool.ts` 的 postMessage bridge，构建完整调试面板  |
| **Suspense 模式**         | 配合 Service 层的请求管理，实现声明式异步边界                  |
| **Web Components 互操作** | 将 defineView 包装为 Custom Element，实现跨框架复用            |

## 十二、设计哲学总结

Lark Mvc 的核心哲学可以用三个词概括：

1. **显式（Explicit）**：不隐藏控制流。数据变更、渲染触发、资源清理都由开发者显式控制。没有魔法般的自动追踪，代码的行为就是它看起来的样子。

2. **轻量（Lightweight）**：零依赖、小体积、快启动。不引入 Proxy、不维护 VDOM 树（默认）、不做依赖收集。用编译时智能换取运行时简洁。

3. **实用（Pragmatic）**：面向真实业务场景设计。内建微前端支持、LFU 缓存、请求去重、串行队列——这些不是插件，而是框架的一等公民。
