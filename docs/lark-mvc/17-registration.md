---
title: 注册
description: 详解 Lark Mvc 的视图注册机制，包括 registerViewClass/getViewClass/invalidateViewClass、同步与异步视图加载、use() 动态导入、Module Federation 支持及视图路径解析。
---

# 注册

## 概述

Lark Mvc 的视图注册系统是一个简洁的 **路径 → ViewSetup 函数** 映射表。它负责回答一个核心问题：当模板中出现 `v-lark="views/header"` 时，框架如何找到并加载对应的视图 setup 函数？

本文覆盖以下源码模块：

| 模块       | 文件                   | 职责                                                |
| ---------- | ---------------------- | --------------------------------------------------- |
| 视图注册表 | `src/view-registry.ts` | 路径 → ViewSetup 的存储与查询                       |
| 模块加载器 | `src/module-loader.ts` | 异步加载视图模块（动态 import / Module Federation） |
| Frame 挂载 | `src/frame.ts`         | mountView 中的同步/异步加载决策                     |

---

## 一、注册表：路径 → ViewSetup 映射

### 1.1 数据结构

注册表的实现极其简洁——一个普通的 JavaScript 对象作为字典：

```typescript
// src/view-registry.ts

/** Registry of view setup functions keyed by path. */
const viewSetupRegistry: Record<string, ViewSetup> = {};
```

没有 Map、没有 WeakRef、没有 LRU 缓存——就是一个 `Record<string, ViewSetup>`。这种设计选择基于以下考量：

- 视图路径是有限集合（应用中的页面/组件数量）
- 字符串键的普通对象在 V8 中享有高度优化的属性访问
- 无需复杂的缓存淘汰策略

### 1.2 registerViewClass — 注册视图

```typescript
export function registerViewClass(viewPath: string, setup: ViewSetup): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    viewSetupRegistry[path] = setup;
  }
}
```

关键点：

- 接收完整的 `viewPath`（可能包含查询参数），但只存储 `path` 部分
- 通过 `parseUri` 解析，确保 `"views/header?page=1"` 和 `"views/header"` 注册到同一个键
- 后注册的 setup 会覆盖先前的（支持 HMR 热替换）

### 1.3 getViewClass — 查询视图

```typescript
export function getViewClass(path: string): ViewSetup | undefined {
  return viewSetupRegistry[path];
}
```

返回 `undefined` 表示该路径尚未注册，框架将走异步加载路径。

### 1.4 invalidateViewClass — 失效视图

```typescript
export function invalidateViewClass(viewPath: string): void {
  const parsed = parseUri(viewPath);
  const path = parsed.path;
  if (path) {
    Reflect.deleteProperty(viewSetupRegistry, path);
  }
}
```

主要用于 **HMR（热模块替换）** 场景：当开发工具检测到视图文件变更时，先调用 `invalidateViewClass` 移除旧注册，再重新加载新模块。

### 1.5 getViewClassRegistry — 获取完整注册表

```typescript
export function getViewClassRegistry(): Record<string, ViewSetup> {
  return viewSetupRegistry;
}
```

暴露完整注册表，供 HMR 系统和调试工具使用。

---

## 二、同步与异步视图加载

### 2.1 加载决策流程

当 `frame.mountView(viewPath)` 被调用时，框架按以下顺序决定加载策略：

```
mountView(viewPath)
    │
    ├─ getViewClass(path) 返回 setup？
    │   ├─ 是 → 同步挂载（doMountView）
    │   └─ 否 → 异步加载（use()）
    │              │
    │              ├─ 加载成功 → registerViewClass + doMountView
    │              └─ 加载失败 → config.error 处理
    │
    └─ 完成
```

### 2.2 同步路径

```typescript
// src/frame.ts — mountView 内部
const registered = getViewClass(viewClassName);
if (registered) {
  // 同步路径：View setup 已加载
  doMountView(registered, initParams, node, sign);
  return;
}
```

同步路径适用于：

- 应用启动时预注册的视图
- 已经被其他 Frame 加载过的视图（注册表缓存命中）
- HMR 后重新注册的视图

### 2.3 异步路径

```typescript
// 异步路径：从远程模块加载 View setup
use(viewClassName, (loadedModule: unknown) => {
  // 防护：Frame 可能在异步加载期间被卸载或重新挂载
  if (sign !== frame.signature) return;

  if (isViewSetup(loadedModule)) {
    registerViewClass(viewClassName, loadedModule);
    doMountView(loadedModule, initParams, node, sign);
  } else {
    const error = new Error(`Cannot load view: ${viewClassName}`);
    const errorHandler = frameworkConfig.error;
    if (errorHandler) {
      errorHandler(error);
    }
  }
});
```

异步路径的安全保障：

- **签名守卫**：`sign !== frame.signature` 检测 Frame 是否在加载期间被卸载/重挂载
- **类型验证**：`isViewSetup(loadedModule)` 确认加载的模块是函数
- **错误处理**：加载失败时调用全局 `config.error` 处理器

---

## 三、use() — 动态模块加载

### 3.1 函数签名

```typescript
export function use(
  names: string | string[],
  callback?: (...modules: unknown[]) => void,
): Promise<unknown[]>;
```

支持两种调用方式：

1. **回调风格**：`use('views/header', (module) => { ... })`
2. **Promise 风格**：`const [module] = await use('views/header')`

### 3.2 加载策略

`use()` 内部根据 `config.require` 是否配置来选择加载策略：

```typescript
export function use(names, callback?) {
  const nameList = typeof names === "string" ? [names] : names;

  const loadPromise = (() => {
    if (config.require) {
      // 策略一：使用配置的 require 函数（如 Module Federation）
      const result = config.require(nameList);
      if (result && typeof result.then === "function") {
        return result as Promise<unknown[]>;
      }
      return Promise.resolve([]);
    }

    // 策略二：动态 import()（ESM 加载）
    return Promise.all(
      nameList.map((name) => {
        const importPath =
          name.startsWith(".") || name.startsWith("/") ? name : `./${name}`;
        return import(/* @vite-ignore */ importPath)
          .then((mod) => {
            // 提取 default 导出
            return mod &&
              (mod["__esModule"] || typeof mod["default"] === "function")
              ? mod["default"]
              : mod;
          })
          .catch((err) => {
            config.error?.(err instanceof Error ? err : new Error(String(err)));
            return undefined;
          });
      }),
    );
  })();

  if (callback) {
    loadPromise.then((modules) => callback(...modules));
  }

  return loadPromise;
}
```

### 3.3 ESM 动态导入细节

动态 `import()` 路径的处理逻辑：

| 输入路径         | 实际导入路径     | 说明             |
| ---------------- | ---------------- | ---------------- |
| `views/header`   | `./views/header` | 相对路径自动补全 |
| `./views/header` | `./views/header` | 已是相对路径     |
| `/views/header`  | `/views/header`  | 绝对路径不变     |

模块导出的提取规则：

- Webpack 打包：检查 `mod.__esModule`，提取 `mod.default`
- Vite 开发模式：检查 `typeof mod.default === "function"`，提取 `mod.default`
- 其他情况：直接使用整个 `mod` 对象

---

## 四、Module Federation 支持

### 4.1 配置 require

通过 `FrameworkConfig.require` 可以接入任意模块加载系统：

```typescript
import { Framework } from "@mm/lark-mvc";

Framework.setConfig({
  // Webpack Module Federation 集成
  require: (names: string[]) => {
    return Promise.all(names.map((name) => import(`remoteApp/${name}`)));
  },
});
```

### 4.2 典型 Module Federation 配置

```typescript
// webpack.config.js
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "hostApp",
      remotes: {
        remoteApp: "remoteApp@http://localhost:3001/remoteEntry.js",
      },
    }),
  ],
};

// 应用入口
import { Framework } from "@mm/lark-mvc";

Framework.setConfig({
  rootId: "app",
  require: async (names: string[]) => {
    const modules = await Promise.all(
      names.map(async (name) => {
        // 先尝试本地模块
        try {
          return await import(`./views/${name}`);
        } catch {
          // 回退到远程模块
          return await import(`remoteApp/views/${name}`);
        }
      }),
    );
    return modules.map((m) => m.default || m);
  },
});
```

### 4.3 自定义加载器示例

```typescript
// 基于 SystemJS 的加载器
Framework.setConfig({
  require: (names: string[]) => {
    return Promise.all(names.map((name) => System.import(name)));
  },
});

// 基于 CDN 的加载器
Framework.setConfig({
  require: async (names: string[]) => {
    return Promise.all(
      names.map((name) =>
        import(
          /* @vite-ignore */ `https://cdn.example.com/views/${name}.js`
        ).then((m) => m.default),
      ),
    );
  },
});
```

---

## 五、视图路径解析

### 5.1 parseUri

视图路径支持携带查询参数，格式为 `path?key=value&key2=value2`：

```typescript
// 解析示例
parseUri("views/header?page=1&size=10");
// → { path: "views/header", params: { page: "1", size: "10" } }

parseUri("views/detail?id=123");
// → { path: "views/detail", params: { id: "123" } }

parseUri("views/home");
// → { path: "views/home", params: {} }
```

### 5.2 注册时的路径规范化

`registerViewClass` 只存储 `path` 部分，忽略查询参数：

```typescript
// 以下两个注册等价
registerViewClass("views/header?page=1", setupFn);
registerViewClass("views/header", setupFn);
// 都注册到 "views/header" 键
```

### 5.3 参数传递机制

视图路径中的查询参数会作为 `viewInitParams` 传递给 setup 函数：

```typescript
// 模板中
// <div v-lark="views/detail?id=123&tab=info"></div>

// setup 函数接收
export default defineView((ctx, params) => {
  console.log(params.id); // "123"
  console.log(params.tab); // "info"
  return { template };
});
```

---

## 六、预注册与启动优化

### 6.1 批量预注册

对于首屏必需的视图，可以在应用启动时批量预注册，避免异步加载延迟：

```typescript
import { registerViewClass } from "@mm/lark-mvc";
import HeaderView from "./views/header";
import SidebarView from "./views/sidebar";
import HomeView from "./views/home";

// 启动时预注册
registerViewClass("views/header", HeaderView);
registerViewClass("views/sidebar", SidebarView);
registerViewClass("views/home", HomeView);

// 然后启动应用
Framework.boot({
  rootId: "app",
  defaultView: "views/home",
});
```

### 6.2 路由级预加载

```typescript
import { use, registerViewClass } from "@mm/lark-mvc";

// 路由切换前预加载目标视图
Router.on("change", (e) => {
  const targetView = e.to.view;
  if (!getViewClass(targetView)) {
    // 预加载但不立即挂载
    use(targetView).then(([setup]) => {
      if (setup) registerViewClass(targetView, setup);
    });
  }
});
```

---

## 七、HMR 热替换集成

### 7.1 失效与重载

```typescript
// HMR 处理逻辑（由构建工具注入）
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      // 1. 失效旧注册
      invalidateViewClass("views/header");
      // 2. 注册新模块
      registerViewClass("views/header", newModule.default);
      // 3. 触发现有视图重渲染
      hotSwapByView("views/header", newModule.default);
    }
  });
}
```

### 7.2 注册表调试

```typescript
// 开发环境：查看所有已注册视图
const registry = getViewClassRegistry();
console.table(
  Object.entries(registry).map(([path, setup]) => ({
    path,
    name: setup.name || "(anonymous)",
  })),
);
```

---

## 八、错误处理

### 8.1 全局错误处理器

```typescript
Framework.setConfig({
  error: (error: Error) => {
    // 自定义错误处理
    console.error("[Lark] 视图加载失败:", error.message);
    // 可以上报到监控系统
    reportError(error);
  },
});
```

### 8.2 加载失败场景

| 场景                   | 行为                              |
| ---------------------- | --------------------------------- |
| 模块不存在             | `config.error` 被调用，视图不挂载 |
| 模块导出非函数         | `Cannot load view: ${path}` 错误  |
| Frame 在加载期间被卸载 | 签名守卫静默跳过                  |
| 网络超时               | Promise reject → `config.error`   |

---

## 九、完整加载流程图

```
用户导航到 /detail?id=123
        │
        ▼
Router 触发视图切换
        │
        ▼
frame.mountView("views/detail?id=123")
        │
        ├─ parseUri → path: "views/detail", params: {id: "123"}
        │
        ├─ getViewClass("views/detail")
        │   ├─ 命中 → doMountView(setup, {id: "123"}, node, sign)
        │   │              │
        │   │              ├─ mountCtx(frame, setup, params)
        │   │              ├─ setup(ctx, {id: "123"})
        │   │              ├─ registerEvents(ctx)
        │   │              └─ ctx.render()
        │   │
        │   └─ 未命中 → use("views/detail", callback)
        │                  │
        │                  ├─ config.require? → config.require(["views/detail"])
        │                  └─ 否 → import("./views/detail")
        │                           │
        │                           ├─ 成功 → registerViewClass + doMountView
        │                           └─ 失败 → config.error(error)
        │
        └─ 完成
```

---

## 总结

| 概念                | 要点                                         |
| ------------------- | -------------------------------------------- |
| 注册表              | 简单的 `Record<string, ViewSetup>` 映射      |
| registerViewClass   | 存储 path → setup，自动剥离查询参数          |
| getViewClass        | 同步查询，返回 undefined 触发异步加载        |
| invalidateViewClass | HMR 专用，移除旧注册                         |
| use()               | 双策略加载：config.require 或 dynamic import |
| Module Federation   | 通过 config.require 接入任意模块系统         |
| 签名守卫            | 防止异步加载完成时 Frame 已失效              |
| 预注册              | 首屏视图可提前注册避免加载延迟               |
