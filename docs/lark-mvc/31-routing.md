---
title: 路由系统
description: Lark Mvc 路由系统完整指南，涵盖双模式路由、两阶段变更协议、异步导航守卫、Location 对象与路由解析
---

# 路由系统（Router）

Lark Mvc 的路由系统是一个功能完备的单例路由器，支持 **History（pushState）** 和 **Hash（#!）** 两种模式，采用两阶段变更确认协议保证导航安全，并提供异步导航守卫机制。

## 核心概念

Router 是一个全局单例对象，通过 `Framework.Router` 或主入口直接导入使用：

```ts
import { Framework } from "@mm/lark-mvc";
const { Router } = Framework;

// 或直接从主入口导入
import { Router } from "@mm/lark-mvc";
```

## 两种路由模式

通过 `FrameworkConfig.routeMode` 配置，在 `Framework.boot()` 时设定：

### History 模式（默认）

使用 `history.pushState` / `popstate` 实现干净的 URL：

```ts
Framework.boot({
  rootId: "app",
  routeMode: "history", // 默认值
  routes: {
    "/home": "views/home",
    "/list": "views/list",
  },
});
```

URL 形如：`https://example.com/home?page=1&size=20`

- 路径从 `pathname + search` 中解析
- `pushState` 不会触发浏览器事件，因此 Router 内部手动调用 `Router.notify()` 触发变更检测
- 监听 `popstate` 事件处理前进/后退

### Hash 模式

使用 URL hash 片段配合 `#!` 前缀：

```ts
Framework.boot({
  rootId: "app",
  routeMode: "hash",
  hashbang: "#!", // 默认前缀
  routes: {
    "/home": "views/home",
  },
});
```

URL 形如：`https://example.com/#!/home?page=1`

- 路径从 `location.hash` 中解析（去除 `#!` 前缀）
- 设置 `location.hash` 会自动触发 `hashchange` 事件
- 同时监听 `hashchange` 和 `popstate` 事件

## Location 对象

`Router.parse()` 返回一个 `Location` 对象，包含完整的 URL 解析结果：

```ts
const loc = Router.parse();
```

### 属性说明

| 属性                      | 类型                     | 说明                                                   |
| ------------------------- | ------------------------ | ------------------------------------------------------ |
| `href`                    | `string`                 | 完整的原始 URL                                         |
| `srcQuery`                | `string`                 | query 部分原始字符串（History 模式为 pathname+search） |
| `srcHash`                 | `string`                 | hash 部分原始字符串（去除 `#!` 前缀）                  |
| `query`                   | `{ path, params }`       | query 解析结果                                         |
| `hash`                    | `{ path, params }`       | hash 解析结果                                          |
| `params`                  | `Record<string, string>` | 合并后的所有参数（query + hash）                       |
| `view`                    | `string`                 | 解析后的视图路径（boot 后可用）                        |
| `path`                    | `string`                 | 解析后的路由路径（boot 后可用）                        |
| `get(key, defaultValue?)` | `Function`               | 读取参数的便捷方法                                     |

### 使用示例

```ts
// History 模式下解析
const loc = Router.parse("https://example.com/list?page=2&sort=name");

loc.srcQuery; // "/list?page=2&sort=name"
loc.query.path; // "/list"
loc.query.params; // { page: "2", sort: "name" }
loc.params; // { page: "2", sort: "name" }
loc.path; // "/list"（boot 后）
loc.view; // "views/list"（boot 后，取决于 routes 配置）

// 使用 get() 方法
loc.get("page"); // "2"
loc.get("missing", "default"); // "default"
loc.get("missing"); // ""（无默认值时返回空字符串）
```

### Hash 模式解析

```ts
const loc = Router.parse("https://example.com/?p0=000#!/d/e?p1=111&p2=aaa");

loc.srcQuery; // "/?p0=000"
loc.srcHash; // "/d/e?p1=111&p2=aaa"
loc.query.params; // { p0: "000" }
loc.hash.path; // "/d/e"
loc.hash.params; // { p1: "111", p2: "aaa" }
loc.params; // { p0: "000", p1: "111", p2: "aaa" }（合并）
```

## Router API

### Router.parse(href?)

解析 URL 为 Location 对象。默认解析 `globalThis.location.href`。

```ts
// 解析当前 URL
const loc = Router.parse();

// 解析指定 URL
const loc2 = Router.parse("https://example.com/home?id=1");
```

解析结果会被缓存——框架启动（`boot`）后，相同 href 的重复解析直接返回缓存对象，无需重新解析。

### Router.to(pathOrParams, params?, replace?, silent?)

导航到新 URL：

```ts
// 导航到新路径
Router.to("/list", { page: 2 });

// 仅更新参数（保持当前路径）
Router.to({ page: 3, size: 20 });

// 替换当前历史记录（不产生新历史条目）
Router.to("/detail", { id: "123" }, true);

// 静默更新（不触发 changed 事件）
Router.to("/list", { page: 1 }, false, true);
```

参数说明：

- `pathOrParams`：路径字符串或参数对象。传入对象时保持当前路径，合并参数
- `params`：附加参数（当第一参数为路径字符串时使用）
- `replace`：为 `true` 时替换当前历史条目而非新增
- `silentFlag`：为 `true` 时静默更新 URL，不触发 `changed` 事件

### Router.diff()

计算当前 Location 与上一次 Location 之间的差异，返回 `LocationDiff`：

```ts
const diff = Router.diff();
if (diff) {
  diff.changed; // boolean: 是否有变化
  diff.params; // Record<string, { from, to }>: 变化的参数
  diff.path; // { from, to } | undefined: 路径变化
  diff.view; // { from, to } | undefined: 视图变化
  diff.force; // boolean: 是否首次（无旧 URL）
}
```

`diff()` 内部会触发 `changed` 事件（非静默模式下），框架通过此事件驱动视图更新。

### Router.join(...paths)

将多个路径片段合并为一个规范化路径：

```ts
Router.join("a", "b", "c"); // "a/b/c"
Router.join("/a/b/./c/./d"); // "/a/b/c/d"
Router.join("a/b/c/../../d"); // "a/d"
Router.join("a//b/c"); // "a/b/c"
Router.join("/a/b/../c/./d//e"); // "/a/c/d/e"
```

处理规则：

- `./` 被移除
- `../` 回退上一级目录
- 连续的 `//` 合并为 `/`

### Router.on(event, handler) / Router.off(event, handler?)

注册/移除路由事件监听器，支持链式调用：

```ts
Router.on("changed", (e) => {
  console.log("路由已变更", e);
});

Router.off("changed", handler);
```

### Router.fire(event, data?, remove?)

触发路由事件：

```ts
Router.fire("customEvent", { key: "value" });
```

### Router.beforeEach(guard)

注册异步导航守卫，返回取消注册函数：

```ts
const off = Router.beforeEach(async (to, from) => {
  // to: 目标 Location
  // from: 当前 Location
  if (to.path === "/admin" && !isAuthenticated()) {
    return false; // 中止导航，URL 回滚
  }
  return true; // 允许导航
});

// 取消守卫
off();
```

## 两阶段变更协议

导航遵循两阶段提交协议，确保视图可以安全地响应路由变化：

### 第一阶段：change

URL 更新**之前**触发。监听器可以：

- `e.resolve()`：提交变更，更新 URL 并进入第二阶段
- `e.reject()`：回滚 URL 到之前的状态
- `e.prevent()`：挂起变更（暂不处理）

如果没有监听器调用任何方法，默认行为是 `resolve()`。

```ts
Router.on("change", (e) => {
  if (hasUnsavedChanges()) {
    e.prevent(); // 挂起，等待用户确认
    showConfirmDialog(() => {
      e.resolve(); // 用户确认后提交
    });
  }
  // 不调用任何方法 → 默认 resolve
});
```

### 第二阶段：changed

URL 更新**之后**触发。框架在此阶段重新挂载/更新视图：

```ts
Router.on("changed", (e) => {
  // e.params: 变化的参数
  // e.path: 路径变化
  // e.view: 视图变化
  console.log("导航完成", e);
});
```

### 完整流程

```
用户触发导航（Router.to / 前进后退）
    ↓
watchChange() 检测到 URL 变化
    ↓
清除 hrefCache
    ↓
触发 change 事件（第一阶段）
    ├── reject() → 回滚 URL，流程结束
    ├── prevent() → 挂起，等待后续 resolve/reject
    └── resolve() / 默认 → 继续
    ↓
执行 beforeEach 守卫链
    ├── 任一守卫返回 false / 抛异常 → reject()
    └── 全部通过 → resolve()
    ↓
更新浏览器 URL
    ↓
调用 Router.diff()
    ↓
触发 changed 事件（第二阶段）
    ↓
框架 dispatcher 通知视图更新
```

## 异步导航守卫

`Router.beforeEach` 注册的守卫按注册顺序依次执行：

```ts
// 守卫 1：权限检查
Router.beforeEach(async (to, from) => {
  const hasAuth = await checkAuth(to.path);
  return hasAuth;
});

// 守卫 2：数据预加载
Router.beforeEach(async (to, from) => {
  if (to.path === "/dashboard") {
    await preloadDashboardData();
  }
  return true;
});
```

规则：

- 守卫按注册顺序串行执行
- 任一守卫返回 `false`、抛出异常或 Promise reject → 导航中止，URL 回滚
- 前一个守卫返回 `false` 后，后续守卫不再执行
- 守卫接收 `(to: Location, from: Location)` 参数

## 路由解析

### routes 配置

在 `Framework.boot()` 中配置路由映射：

```ts
Framework.boot({
  routes: {
    "/home": "views/home",
    "/list": "views/list",
    "/detail": {
      view: "views/detail",
      // 可扩展属性会合并到 Location 对象
    },
  },
  unmatchedView: "views/404", // 未匹配路径的视图
  defaultView: "views/home", // 默认视图
  defaultPath: "/home", // 默认路径（访问 "/" 时重定向）
});
```

### rewrite 函数

可选的路径重写函数，在路由匹配前执行：

```ts
Framework.boot({
  rewrite(path, params, routes) {
    // 将旧路径重定向到新路径
    if (path === "/old-page") {
      return "/new-page";
    }
    // 基于参数进行重写
    if (path === "/item" && params.type === "special") {
      return "/special-item";
    }
    return path;
  },
});
```

### 解析优先级

1. 从 URL 中提取原始路径（History 模式取 `query.path`，Hash 模式取 `hash.path`）
2. 无路径时使用 `defaultPath`（默认 `"/"`）
3. 根路径 `"/"` 无匹配时回退到 `defaultPath`
4. 执行 `rewrite` 函数（如配置）
5. 查找 `routes[path]` → 找到则使用
6. 未找到则使用 `unmatchedView`
7. 最终回退到 `defaultView`

## 缓存机制

Router 内部维护两层缓存：

### href 缓存

`parse()` 的结果按 href 缓存，相同 URL 的重复解析直接返回缓存对象：

```ts
const loc1 = Router.parse("https://example.com/home");
const loc2 = Router.parse("https://example.com/home");
// loc1 === loc2（缓存命中）
```

缓存在每次 `watchChange()` 时清除（URL 变化时），确保不会使用过期数据。

### changed 缓存

`diff()` 的比较结果按 `(oldHref + newHref)` 缓存，避免重复计算：

```ts
// 内部实现
const tKey = oldLoc.href + SPLITTER + newLoc.href;
const cached = changedCache.get(tKey);
```

## \_bind() 内部机制

`Router._bind()` 由 `Framework.boot()` 调用，完成以下初始化：

1. **记录默认标题**：保存 `document.title` 用于路径变更时重置
2. **创建 watchChange 函数**：核心变更检测逻辑
3. **绑定浏览器事件**：
   - History 模式：监听 `popstate`
   - Hash 模式：监听 `hashchange` + `popstate`
4. **绑定 beforeunload**：触发 `page_unload` 事件
5. **执行首次 diff()**：触发初始路由解析

### watchChange 流程

```ts
// 简化逻辑
function watchChange() {
  if (suspend) return;        // 被 prevent() 挂起时跳过
  hrefCache.clear();          // 清除解析缓存
  const loc = Router.parse(); // 重新解析
  const newKey = /* 当前模式的 URL 标识 */;
  if (newKey !== lastKey) {
    // 构造 changeEvent（含 reject/resolve/prevent）
    Router.fire("change", changeEvent);
    // 执行守卫链...
  }
}
```

## page_unload 事件

当用户关闭或刷新页面时，`beforeunload` 事件触发 `page_unload`：

```ts
Router.on("page_unload", (data) => {
  if (hasUnsavedData()) {
    data.msg = "您有未保存的更改，确定要离开吗？";
  }
});
```

设置 `data.msg` 后，浏览器会显示确认对话框阻止用户离开。

## 在视图中使用路由

### observeLocation

视图通过 `ctx.observeLocation()` 声明关注的 URL 参数：

```ts
import { defineView, useState } from "@mm/lark-mvc";

export default defineView((ctx) => {
  // 监听 page 和 size 参数变化
  ctx.observeLocation("page,size");

  // 或监听路径变化
  ctx.observeLocation({ params: ["page"], path: true });

  const [getList, setList] = useState("list", []);

  return {
    template: (data) => `<div>...</div>`,
    assign() {
      // 每次路由变化触发 render 时调用
      const loc = Router.parse();
      const page = loc.get("page", "1");
      // 加载数据...
      return true;
    },
  };
});
```

当被监听的参数发生变化时，框架自动调用 `ctx.render()` 重新渲染视图。

### 编程式导航

```ts
// 在事件处理器中导航
const events = {
  "goDetail<click>": (e) => {
    Router.to("/detail", { id: e.target.dataset.id });
  },
  "goBack<click>": () => {
    history.back();
  },
  "refresh<click>": () => {
    // 替换当前 URL 参数
    Router.to({ page: 1 });
  },
};
```

## 完整示例

```ts
import { Framework, defineView } from "@mm/lark-mvc";

// 应用启动
Framework.boot({
  rootId: "app",
  routeMode: "history",
  defaultPath: "/home",
  defaultView: "views/home",
  unmatchedView: "views/404",
  routes: {
    "/home": "views/home",
    "/list": "views/list",
    "/detail": "views/detail",
  },
  rewrite(path, params) {
    // 兼容旧 URL
    if (path === "/legacy") return "/home";
    return path;
  },
});

// 全局导航守卫
const off = Framework.Router.beforeEach(async (to, from) => {
  if (to.path.startsWith("/admin")) {
    const user = await fetchCurrentUser();
    if (!user.isAdmin) {
      Framework.Router.to("/home");
      return false;
    }
  }
  return true;
});
```
