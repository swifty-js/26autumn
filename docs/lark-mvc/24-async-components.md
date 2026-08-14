---
title: 异步组件
description: 详解 Lark Mvc 中异步视图加载机制，包括 use() 模块加载器、动态 import() 回退、Module Federation 集成、签名守卫防止过期挂载、wrapAsync 安全回调、以及 mark/unmark 异步有效性追踪模式。
---

# 异步组件

## 概述

Lark Mvc 中所有视图本质上都是异步加载的。当 `frame.mountView()` 被调用时，框架首先检查视图是否已注册（同步路径），若未注册则通过模块加载器异步获取视图的 setup 函数（异步路径）。这一机制天然支持代码分割、按需加载和微前端场景。

本文档覆盖以下核心主题：

1. `use()` 模块加载函数
2. 动态 `import()` 回退机制
3. Module Federation 集成（`config.require`）
4. 签名守卫（Signature Guard）防止过期挂载
5. `wrapAsync` 安全异步回调
6. `mark/unmark` 异步有效性追踪

## use()：异步模块加载

`use()` 函数（`src/module-loader.ts`）是框架的模块加载入口，支持两种调用方式：

```typescript
// src/module-loader.ts
export function use(
  names: string | string[],
  callback?: (...modules: unknown[]) => void,
): Promise<unknown[]> {
  const nameList = typeof names === "string" ? [names] : names;

  const loadPromise = (() => {
    if (config.require) {
      // 使用配置的 require 函数（如 Webpack Module Federation）
      const result = config.require(nameList);
      if (result && typeof result.then === "function") {
        return result as Promise<unknown[]>;
      }
      return Promise.resolve([]);
    }

    // 回退：动态 import() 加载 ESM 模块
    return Promise.all(
      nameList.map((name) => {
        const importPath =
          name.startsWith(".") || name.startsWith("/") ? name : `./${name}`;
        return import(/* @vite-ignore */ /* webpackIgnore: true */ importPath)
          .then((mod: Record<string, unknown>) => {
            // 提取 default 导出（兼容 ESM）
            return mod &&
              (mod["__esModule"] || typeof mod["default"] === "function")
              ? mod["default"]
              : mod;
          })
          .catch((err: unknown) => {
            const errorHandler = config.error;
            if (errorHandler) {
              errorHandler(err instanceof Error ? err : new Error(String(err)));
            }
            return undefined;
          });
      }),
    );
  })();

  // 回调模式
  if (callback) {
    loadPromise.then((modules: unknown[]) => {
      callback(...modules);
    });
  }

  return loadPromise;
}
```

### 调用方式

```typescript
// 方式一：回调模式
use("app/views/detail", (DetailView) => {
  // DetailView 是视图的 setup 函数
});

// 方式二：Promise 模式
const [DetailView] = await use("app/views/detail");

// 方式三：批量加载
use(["app/views/header", "app/views/footer"], (Header, Footer) => {
  // 两个模块并行加载
});
```

### 路径规范化

`use()` 对模块路径进行规范化处理：

- 以 `.` 或 `/` 开头的路径直接使用
- 其他路径自动添加 `./` 前缀

```typescript
const importPath =
  name.startsWith(".") || name.startsWith("/") ? name : `./${name}`;
```

## 动态 import() 回退

当未配置 `config.require` 时，框架使用原生动态 `import()` 加载模块。这适用于：

- Vite 开发/构建环境
- 原生 ESM 部署
- 不支持 Module Federation 的构建工具

### ESM default 导出提取

由于不同打包工具对 ESM 的处理方式不同，框架做了兼容处理：

```typescript
.then((mod: Record<string, unknown>) => {
  // Webpack 设置 __esModule 标记
  // Vite dev 模式不设置 __esModule，但 default 是函数
  return mod &&
    (mod["__esModule"] || typeof mod["default"] === "function")
    ? mod["default"]
    : mod;
})
```

### 错误处理

加载失败时通过全局错误处理器上报：

```typescript
.catch((err: unknown) => {
  const errorHandler = config.error;
  if (errorHandler) {
    errorHandler(err instanceof Error ? err : new Error(String(err)));
  }
  return undefined;
});
```

## Module Federation 集成

通过配置 `FrameworkConfig.require`，可以接入 Webpack Module Federation 或其他自定义模块加载策略：

```typescript
// 应用启动配置
import { Framework } from "@mm/lark-mvc";

Framework.boot({
  rootId: "app",
  routeMode: "history",
  // 配置 Module Federation 加载函数
  require: async (names: string[]) => {
    return Promise.all(
      names.map(async (name) => {
        // 解析远程模块路径：remote-app/views/home
        const [remote, ...pathParts] = name.split("/");
        const modulePath = `./${pathParts.join("/")}`;

        // 初始化远程容器（如果尚未初始化）
        await initRemote(remote);

        // 从远程容器获取模块
        const factory = await window[remote].get(modulePath);
        const module = factory();
        return module.default || module;
      }),
    );
  },
  routes: {
    "/home": "app/views/home",
    "/remote": "remote-app/views/dashboard", // 远程视图
  },
});
```

### require 函数签名

```typescript
interface FrameworkConfig {
  require?: (
    names: string[],
    params?: Record<string, unknown>,
  ) => Promise<unknown[]> | undefined;
}
```

- 接收模块名称数组
- 返回 Promise，resolve 为加载的模块数组
- 返回 `undefined` 或非 Promise 值时，框架 resolve 为空数组

## 签名守卫：防止过期挂载

这是 Lark Mvc 异步安全的核心机制。`mountView` 在发起异步加载前捕获当前的 `frame.signature` 到局部变量 `sign`，加载完成后再校验 `sign !== frame.signature`，确保异步结果仍归属于同一个 Frame 实例。需要说明的是，`frame.signature` 本身在源码中初始化为 `1` 且保持不变（详见下文「两层签名机制」），真正使过期异步回调失效的是 `unmark` 机制以及 ViewCtx 级的 `ctx.signature.value`。

### mountView 中的签名守卫

```typescript
// src/frame.ts — mountView 异步路径
mountView(viewPathArg: string, viewInitParams?: Record<string, unknown>): void {
  // ...
  const sign = frame.signature; // 捕获当前签名

  // 同步路径：视图已注册
  const registered = getViewClass(viewClassName);
  if (registered) {
    doMountView(registered, initParams, node, sign);
    return;
  }

  // 异步路径：加载视图 setup
  use(viewClassName, (loadedModule: unknown) => {
    // 关键守卫：Frame 可能在异步加载期间被卸载或重新挂载
    if (sign !== frame.signature) return; // 签名不匹配，丢弃结果

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
}
```

### doMountView 中的二次校验

```typescript
function doMountView(
  setup: ViewSetup,
  params: Record<string, unknown>,
  node: HTMLElement,
  sign: number,
): void {
  const frameId = node.id;
  const frame = frameRegistry.get(frameId);
  if (!frame) return;
  if (sign !== frame.signature) return; // 二次校验

  const ctx = mountCtx(frame, setup, params);
  frame.view = ctx;
  runInvokes(frame);
}
```

### 两层签名机制

Lark Mvc 中存在**两个不同**的签名字段，不要混淆：

1. **`frame.signature`（Frame 级）**：在 `createFrame` 时初始化为 `1`，**整个生命周期内保持不变**（源码中从不递增）。`mountView` / `doMountView` 中的 `sign !== frame.signature` 守卫是一道恒等校验，主要用于配合下面的 `unmark` 机制确保异步结果归属正确的视图实例。

2. **`ctx.signature.value`（ViewCtx 级）**：这才是随渲染/销毁变化的签名。`mountCtx` 时置为 `1`，每次 `render()` 递增，视图销毁（`unmountCtx`）时置为 `0`。`wrapAsync` 捕获的就是这个值。

```typescript
// src/view.ts — render
function render(): void {
  if (signature.value > 0) {
    signature.value++; // 递增 ViewCtx 签名
    fire("render");
    destroyAllResources(ctx, false);
    updater.digest();
  }
}
```

### 卸载时如何使异步回调失效

`unmountView` 并不递增 `frame.signature`，而是通过 `unmark(currentView)` 使该视图上所有 `mark()` 检查器永久失效：

```typescript
// src/frame.ts — unmountView
unmountView(): void {
  const currentView = frame.view;
  // ...
  // 使所有 mark 失效，阻止过期的异步回调
  unmark(currentView);
}
```

### 竞态场景示例

```
时间线：
T1: mountView("viewA") → 捕获 sign，开始异步加载 viewA
T2: 用户快速导航 → unmountView()（unmark 使 viewA 的 mark 失效）→ mountView("viewB")
T3: viewA 加载完成 → 其异步回调若使用 mark/wrapAsync 检查，会发现已失效 → 丢弃！
T4: viewB 加载完成 → 校验通过 → 正常挂载
```

> 提示：视图内部异步请求的过期保护，推荐使用 `ctx.wrapAsync(fn)`（基于 `ctx.signature.value`）或 `mark(ctx, key)`（基于 `unmark` 失效），二者都能正确拦截视图重渲染/销毁后的过期回调。

## wrapAsync：安全异步回调

`ctx.wrapAsync()` 是视图级别的异步安全包装器，确保回调只在视图仍然存活且未被重新渲染时执行：

```typescript
// src/view.ts
function wrapAsync<Fn extends AnyFunc>(
  fn: Fn,
  context?: unknown,
): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined {
  const currentSignature = signature.value; // 捕获当前签名
  return (...args: Parameters<Fn>) => {
    // 仅当签名未变（视图未重新渲染/销毁）时执行
    if (currentSignature > 0 && currentSignature === signature.value) {
      return fn.apply(context ?? ctx, args) as ReturnType<Fn>;
    }
    return undefined; // 过期回调静默丢弃
  };
}
```

### 使用示例

```typescript
const DataView = defineView((ctx) => {
  const [getData, setData] = useState("data", null);

  useEffect(() => {
    // 发起异步请求
    fetch("/api/data")
      .then((res) => res.json())
      .then(
        ctx.wrapAsync((data) => {
          // 安全：如果视图已重新渲染或销毁，此回调不会执行
          setData(data);
        }),
      );
  });

  return {
    template,
    events: {
      "load<click>": () => {
        // 事件处理器中的异步操作
        fetch("/api/more")
          .then((res) => res.json())
          .then(
            ctx.wrapAsync((moreData) => {
              ctx.updater.set({ extra: moreData }).digest();
            }),
          );
      },
    },
  };
});
```

### wrapAsync vs 手动签名检查

```typescript
// 方式一：wrapAsync（推荐）
fetch(url).then(ctx.wrapAsync(handleResponse));

// 方式二：手动检查（等效但冗长）
const sign = ctx.signature.value;
fetch(url).then((data) => {
  if (sign > 0 && sign === ctx.signature.value) {
    handleResponse(data);
  }
});
```

### 在 endUpdate 中的应用

框架内部也使用 `wrapAsync` 确保延迟操作的安全性：

```typescript
// src/view.ts — endUpdate
function endUpdate(zoneId?: string, inner?: boolean): void {
  if (signature.value > 0) {
    // ...
    frame.mountZone(updateId);

    if (!flag) {
      setTimeout(
        wrapAsync(() => {
          runInvokes(frame); // 延迟执行 invoke 队列
        }),
        0,
      );
    }
  }
}
```

## mark/unmark：异步有效性追踪

`mark/unmark`（`src/mark.ts`）提供了更细粒度的异步有效性追踪，基于 WeakMap 实现，不污染宿主对象：

```typescript
// src/mark.ts
const hostStore = new WeakMap<object, HostRecord>();

interface HostRecord {
  signs: Map<string, number>; // 每个 key 的签名计数
  deleted: boolean; // 是否已全局失效
}

export function mark(host: object, key: string): () => boolean {
  const record = getOrCreate(host);
  if (record.deleted) {
    return () => false; // 已失效的 host 直接返回 false
  }
  const sign = (record.signs.get(key) ?? 0) + 1;
  record.signs.set(key, sign);
  return () => {
    const current = hostStore.get(host);
    return !!current && !current.deleted && current.signs.get(key) === sign;
  };
}

export function unmark(host: object): void {
  const record = hostStore.get(host);
  if (record) {
    record.deleted = true;
    record.signs.clear();
  } else {
    hostStore.set(host, { signs: new Map(), deleted: true });
  }
}
```

### 工作原理

1. `mark(host, key)` 为指定 key 递增计数器，返回一个检查函数
2. 检查函数在调用时验证：host 未被删除 + key 的计数器未变化
3. `unmark(host)` 将 host 标记为已删除，所有已发出的检查函数永久返回 `false`
4. 再次对同一 key 调用 `mark()` 会使之前的检查函数失效（计数器已变）

### 在视图卸载中的应用

```typescript
// src/frame.ts — unmountView
unmountView(): void {
  const currentView = frame.view;
  // ...
  // 使所有 mark 失效，阻止过期的异步回调
  unmark(currentView);
}
```

### 使用示例

```typescript
const AsyncView = defineView((ctx) => {
  // 创建有效性检查器
  const isValid = mark(ctx, "dataLoad");

  // 模拟多个并发异步操作
  fetch("/api/slow-endpoint")
    .then((res) => res.json())
    .then((data) => {
      if (!isValid()) return; // 视图已重新渲染，丢弃结果
      ctx.updater.set({ slowData: data }).digest();
    });

  // 如果在请求完成前视图重新渲染，
  // 新的 mark() 调用会使旧的 isValid 失效

  return { template };
});
```

### mark vs wrapAsync 对比

| 特性     | wrapAsync            | mark/unmark                |
| -------- | -------------------- | -------------------------- |
| 粒度     | 视图级（signature）  | 自定义 key 级              |
| 使用方式 | 包装回调函数         | 返回检查函数               |
| 失效时机 | 视图 render/destroy  | 手动 unmark 或重新 mark    |
| 适用场景 | 简单异步回调         | 多个并发异步操作需独立追踪 |
| 存储位置 | 闭包中捕获 signature | WeakMap（不污染对象）      |

### 多 key 独立追踪

```typescript
const MultiAsyncView = defineView((ctx) => {
  // 为不同操作创建独立的 mark
  const checkUser = mark(ctx, "userLoad");
  const checkOrders = mark(ctx, "ordersLoad");

  // 用户数据加载
  fetchUser().then((user) => {
    if (!checkUser()) return;
    ctx.updater.set({ user }).digest();
  });

  // 订单数据加载（可能比用户数据慢）
  fetchOrders().then((orders) => {
    if (!checkOrders()) return;
    ctx.updater.set({ orders }).digest();
  });

  // 如果只需要取消订单加载：
  // mark(ctx, "ordersLoad") — 使 checkOrders 失效，checkUser 不受影响

  return { template };
});
```

## 完整的异步加载流程

```
frame.mountView(viewPath)
    │
    ├── 视图已注册？ ──是──→ doMountView() [同步]
    │
    └── 否 ──→ use(viewPath, callback)
                    │
                    ├── config.require 存在？
                    │   ├── 是 ──→ config.require([viewPath])
                    │   └── 否 ──→ import(viewPath)
                    │
                    └── 模块加载完成
                         │
                         ├── sign !== frame.signature？ ──→ 丢弃（过期）
                         │
                         └── 签名匹配
                              ├── isViewSetup(module)？
                              │   ├── 是 ──→ registerViewClass() + doMountView()
                              │   └── 否 ──→ config.error(Error)
                              │
                              └── doMountView()
                                   ├── 二次签名校验
                                   ├── mountCtx() → 执行 setup
                                   ├── frame.view = ctx
                                   └── runInvokes() → 执行延迟调用队列
```

## 最佳实践

1. **始终使用 wrapAsync 包装异步回调**：避免视图销毁后操作已不存在的 DOM
2. **利用签名守卫**：框架自动处理，无需手动管理视图加载竞态
3. **Module Federation 场景配置 require**：实现跨应用视图加载
4. **错误处理**：配置 `config.error` 捕获模块加载失败
5. **避免在 setup 外部使用 mark**：mark 的设计意图是追踪视图生命周期内的异步操作
6. **视图缓存**：首次加载后视图 setup 会注册到 `viewClassRegistry`，后续挂载走同步路径
