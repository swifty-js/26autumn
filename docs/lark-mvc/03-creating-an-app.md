---
title: 创建一个应用
description: 深入理解 Framework.boot 的完整启动流程、FrameworkConfig 的全部配置字段，以及根 Frame 创建与初始视图挂载的细节。
---

# 创建一个应用

本章深入讲解 Lark Mvc 应用的启动入口 `Framework.boot(config)`：它接收哪些配置、内部按什么顺序执行、根 Frame 如何创建、初始视图如何挂载。理解这些细节，有助于你正确配置路由、错误处理与微前端加载等高级能力。

> 涉及源码：
>
> - 启动逻辑：`packages/lark-mvc/src/framework.ts`
> - 配置类型：`packages/lark-mvc/src/types.ts`（`FrameworkConfig`）
> - 路由器：`packages/lark-mvc/src/router.ts`
> - Frame 树：`packages/lark-mvc/src/frame.ts`

## Framework.boot 概览

`Framework.boot(cfg?)` 是应用的初始化入口。调用之后，框架会：

1. 合并配置；
2. 将配置注入 Router；
3. 设置事件委托的 Frame 获取器；
4. 绑定路由与状态的变更事件；
5. 标记框架已启动；
6. 按需安装开发者工具桥接；
7. 创建根 Frame；
8. 绑定底层路由监听（`hashchange` / `popstate`）；
9. 挂载默认视图（若路由尚未触发挂载）。

其类型签名（见 `types.ts` 的 `FrameworkApi`）为：

```ts
boot(cfg: FrameworkConfig): void;
```

## FrameworkConfig 配置详解

`FrameworkConfig` 定义于 `src/types.ts`，所有字段均可在运行时通过 `Framework.getConfig("key")` 读取。完整字段如下：

| 字段               | 类型                                        | 默认值      | 说明                                     |
| ------------------ | ------------------------------------------- | ----------- | ---------------------------------------- |
| `rootId`           | `string`                                    | `"root"`    | 根视图所在的 DOM 节点 id（必填）         |
| `routeMode`        | `"history" \| "hash"`                       | `"history"` | 路由模式                                 |
| `defaultView`      | `string`                                    | -           | URL 未匹配任何路由时加载的默认根视图路径 |
| `defaultPath`      | `string`                                    | `"/"`       | URL hash/query 为空时使用的默认路径      |
| `routes`           | `Record<string, string \| RouteViewConfig>` | -           | 路径到视图的映射                         |
| `hashbang`         | `string`                                    | `"#!"`      | hash 模式下的前缀                        |
| `error`            | `(error: Error) => void`                    | -           | 全局错误处理函数                         |
| `extensions`       | `string[]`                                  | -           | 预留字段，当前版本 `boot()` 不会自动加载 |
| `initModule`       | `string`                                    | -           | 预留字段，当前运行时未消费               |
| `rewrite`          | `(path, params, routes) => string`          | -           | 路由路径重写函数                         |
| `unmatchedView`    | `string`                                    | -           | 无匹配视图时使用的视图路径（如 404 页）  |
| `require`          | `(names, params?) => Promise<unknown[]>`    | -           | 异步模块加载器（用于 Module Federation） |
| `skipViewRendered` | `boolean`                                   | -           | 跳过视图已渲染检查                       |
| `projectName`      | `string`                                    | -           | 当前应用项目名（微前端桥接判定归属）     |
| `vdom`             | `boolean`                                   | `false`     | 是否启用 VDOM 渲染模式                   |
| `devtool`          | `boolean`                                   | -           | 是否启用 Frame Devtool Bridge            |

下面逐一说明关键字段。

### rootId（必填）

根视图渲染所在的 DOM 节点 id。框架会在该节点内挂载根视图。

```ts
Framework.boot({
  rootId: "app", // 对应页面中的 <div id="app"></div>
});
```

> 注意：`Framework.boot` 在创建根 Frame 时使用该 id。若不指定，`Frame.createRoot()` 会回退到默认值，可能导致视图渲染到非预期容器。

### routeMode

- `"history"`（默认）：使用 `history.pushState` / `popstate`，URL 形如 `/home`，干净美观。
- `"hash"`：使用 URL hash 片段，默认带 `#!` 前缀，形如 `#!/home`。

```ts
Framework.boot({
  routeMode: "history", // 或 "hash"
});
```

### defaultView 与 defaultPath

- `defaultView`：当 URL 未匹配任何路由时加载的默认根视图。
- `defaultPath`：当 URL 的 hash/query 为空时使用的路径，默认 `"/"`。

```ts
Framework.boot({
  defaultView: "app/views/home",
  defaultPath: "/home",
});
```

### routes

路径到视图的映射，支持两种写法：

```ts
Framework.boot({
  routes: {
    // 简单映射：路径 -> 视图路径
    "/home": "app/views/home",
    // 配置映射：可附带额外属性（如标题），合并进 location
    "/detail": { view: "app/views/detail", title: "Detail Page" },
    "/admin": "app/views/admin",
  },
});
```

`RouteViewConfig` 的结构：

```ts
interface RouteViewConfig {
  /** 视图路径 */
  view: string;
  /** 合并进 location 的额外属性 */
  [k: string]: unknown;
}
```

### hashbang

仅在 hash 模式下生效，指定 hash 前缀，默认 `"#!"`（见 `router.ts`：`const hashbang = frameworkConfig?.hashbang || "#!"`）。

### error

全局错误处理函数。框架内部对核心逻辑使用 try-catch 包裹，抛出的错误可通过此配置捕获。

```ts
Framework.boot({
  error(err) {
    // 上报错误监控
    reportError(err);
    // 注意：不要在此方法内再次抛出错误
  },
});
```

> 重要：不要在 `error` 回调中重新抛出错误。

### extensions 与 initModule

这两个字段目前是**预留配置**：它们存在于 `FrameworkConfig` 类型声明中，但当前版本的 `Framework.boot()` **不会**读取或自动加载它们。如需在启动时加载扩展模块，请在入口文件中显式 `import`，或在 `boot()` 前后自行调用 `Framework.use([...])`。

### rewrite

路由路径重写函数，接收 `(path, params, routes)`，返回重写后的路径：

```ts
Framework.boot({
  rewrite(path, params, routes) {
    // 当根路径 "/" 没有对应路由时，重写到 "/home"
    if (path === "/" && !routes[path]) return "/home";
    return path;
  },
});
```

### unmatchedView

当 `routes` 中找不到匹配视图时使用的视图路径，常用于 404 页面：

```ts
Framework.boot({
  unmatchedView: "app/views/not-found",
});
```

### require（微前端 / 异步加载）

当视图 setup 函数未在注册表中找到时，`Framework.use()` 会调用此函数异步加载模块。可与 Webpack Module Federation 或其他动态加载策略集成：

```ts
Framework.boot({
  rootId: "root",
  projectName: "host-app",
  require(names, params) {
    return Promise.all(
      names.map((name) => {
        if (name.startsWith("remote-app/")) {
          return import("remote_app/" + name.slice("remote-app/".length));
        }
        return import("./src/" + name);
      }),
    );
  },
  routes: {
    "/": "host-app/views/home",
    "/remote": "remote-app/views/detail",
  },
});
```

`require` 的签名为：

```ts
require?: (names: string[], params?: Record<string, unknown>) => Promise<unknown[]> | undefined;
```

### vdom

是否启用 VDOM 渲染模式，默认 `false`（字符串模式 / 真实 DOM Diff）。开启后模板编译为 `vdomCreate` 调用，Diff 引擎采用三阶段 LIS 重排。

```ts
Framework.boot({
  vdom: true,
});
```

### devtool

是否启用 Frame Devtool Bridge。启用后会安装一个 `postMessage` 监听器，使 Lark DevTool 浏览器扩展能够检查 Frame 树。在扩展不可用或引发问题的环境中可设为 `false` 抑制桥接。

```ts
Framework.boot({
  devtool: false,
});
```

## 启动序列逐步解析

下面结合 `src/framework.ts` 中 `boot` 的实现，逐步说明启动过程。

### 步骤 1：注册 HMR 交换函数

```ts
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis["__lark_hmr__"] = { hotSwapByTemplate, hotSwapByView };
}
```

框架将 HMR 交换函数挂载到 `globalThis.__lark_hmr__`，使编译期自动注入的 HMR 代码片段无需 `import @mm/lark-mvc` 即可调用它们——避免在 Module Federation 共享消费者场景下产生副作用与 `ChunkLoadError`。

### 步骤 2：合并配置

```ts
if (cfg && typeof cfg === "object") {
  assign(config, cfg);
}
```

将传入的配置浅合并进框架内部的全局 `config` 对象。

### 步骤 3：将配置注入 Router

```ts
Router._setConfig(config);
```

让路由器读取 `routeMode`、`defaultPath`、`hashbang`、`routes` 等配置。

### 步骤 4：设置事件委托的 Frame 获取器

```ts
EventDelegator.setFrameGetter((id: string) => Frame.get(id));
```

事件委托系统通过该获取器，根据 DOM 元素 id 反查所属 Frame，从而定位事件处理器。

### 步骤 5：绑定路由与状态变更事件

```ts
Router.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
  if (data) dispatcherNotifyChange(data);
});

State.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
  if (data) dispatcherNotifyChange(data);
});
```

路由的 `changed` 事件与 `State` 的 `changed` 事件都会进入统一的变更分发器 `dispatcherNotifyChange`。

### 步骤 6：标记已启动并安装 Devtool

```ts
booted = true;
markRouterBooted();

if (config.devtool) {
  installFrameDevtoolBridge();
}
```

### 步骤 7：创建根 Frame（关键顺序）

```ts
const rootFrame = Frame.createRoot(config.rootId);
```

> **顺序至关重要**：根 Frame 必须在 `Router._bind()` 之前创建。这样当 `Router.diff()` 触发 `CHANGED` → `dispatcherNotifyChange` → `Frame.getRoot()` 时，根 Frame 已携带正确的 `rootId`（如 `"app"`）存在。否则 `Frame.createRoot()` 会回退到默认 `"root"`，视图可能渲染到 `document.body` 而非预期容器。

### 步骤 8：绑定底层路由监听

```ts
Router._bind();
```

绑定 `hashchange`（hash 模式）或 `popstate`（history 模式）。绑定过程中会立即执行一次 `diff()`，若当前 URL 命中某个路由，便会触发 `CHANGED` 事件并异步挂载对应视图。

### 步骤 9：挂载默认视图

```ts
const defaultView = config.defaultView || "";
if (defaultView && !rootFrame.getViewPath()) {
  rootFrame.mountView(defaultView);
}
```

仅当路由器尚未发起挂载时才挂载 `defaultView`。

> 这里检查的是 `getViewPath()`（在 `mountView` 顶部**同步**设置），而非 `view` 实例（在异步 setup 加载完成后才赋值）。当视图通过 `config.require` 异步加载时，`Router._bind()` 可能已经发起了对路由视图的异步挂载——此时 `viewPath` 已设置但实例尚未就绪。若错误地检查实例，会再发起一次对 `defaultView` 的并行挂载，导致 URL 指向路由视图、实际却渲染了 `defaultView` 的竞态问题。

## 变更分发：从事件到视图更新

启动完成后，框架通过 `dispatcherNotifyChange` 与 `dispatcherUpdate` 将路由/状态变化转化为视图更新（见 `framework.ts`）：

```ts
function dispatcherNotifyChange(e: ChangeEvent): void {
  const rootFrame = Frame.getRoot();
  if (!rootFrame) return;

  if ("view" in e && e.view !== undefined) {
    const view = e.view;
    // 视图变化：挂载新视图
    const viewPath =
      typeof view === "object" && view !== null
        ? String(Reflect.get(view, "to") || "")
        : String(view);
    rootFrame.mountView(viewPath);
  } else {
    // 参数/状态变化：通知观察了对应键的视图
    dispatcherUpdateTag++;
    dispatcherUpdate(rootFrame, e.keys);
  }
}
```

`dispatcherUpdate` 使用**显式 LIFO 栈**迭代遍历 Frame 树（而非递归），避免深层嵌套时撑爆 JS 调用栈。对每个视图：

- 若携带 `stateKeys`，检查视图观察的 State 键是否命中（`stateIsObserveChanged`）；
- 否则检查观察的 URL 参数/路径是否变化（`viewIsObserveChanged`）；
- 命中则调用 `view.render()`；若 `render()` 返回 thenable，则推迟该子树直至 Promise 落定，兄弟子树继续同步处理。

## 读取与修改运行时配置

启动后仍可通过 `Framework` 读写配置：

```ts
import { Framework } from "@mm/lark-mvc";

// 读取完整配置
const cfg = Framework.getConfig();

// 读取单个字段（支持泛型约束返回类型）
const rootId = Framework.getConfig<string>("rootId");

// 合并补丁
Framework.setConfig({ devtool: false });
```

`getConfig` 提供两个重载：无参返回完整配置对象；传入 key 返回对应字段（无类型，可用泛型约束）。

## 一个完整的启动配置示例

```ts
import { Framework } from "@mm/lark-mvc";

Framework.boot({
  rootId: "app",
  routeMode: "history",
  defaultView: "app/views/home",
  defaultPath: "/home",
  routes: {
    "/home": "app/views/home",
    "/detail": { view: "app/views/detail", title: "Detail" },
    "/admin": "app/views/admin",
  },
  unmatchedView: "app/views/not-found",
  rewrite(path, params, routes) {
    if (path === "/" && !routes[path]) return "/home";
    return path;
  },
  error(err) {
    console.error("[app error]", err);
  },
  vdom: false,
  devtool: true,
});
```

## 小结

- `Framework.boot` 是应用的唯一启动入口，负责合并配置、绑定事件、创建根 Frame 并挂载初始视图。
- `FrameworkConfig` 覆盖了根节点、路由、错误处理、扩展、微前端加载与渲染模式等全部启动选项。
- 启动序列中「先创建根 Frame，再绑定路由」的顺序是保证视图渲染到正确容器的关键。
- 路由与状态变化统一进入 `dispatcherNotifyChange`，由 `dispatcherUpdate` 迭代遍历 Frame 树，精准更新观察了对应键的视图。

下一步推荐阅读 [模板语法](./04-template-syntax.md) 与 [响应式基础](./05-reactivity-fundamentals.md)，理解视图如何被渲染、数据如何驱动更新。
