---
title: 深入组件
description: 深入剖析 Lark Mvc 组件系统的内部机制，包括 ViewCtx 完整 API、Frame 生命周期容器、父子视图树管理、invoke 跨视图方法调用与 assign 外部更新触发。
---

# 深入组件

## 概述

Lark Mvc 的组件系统采用**函数式工厂**设计，彻底摒弃了 `class`、`this`、`prototype` 和 `mixin`。一个组件（View）由一个 `setup` 函数定义，框架在挂载时创建 `ViewCtx` 上下文对象，所有框架 API 通过闭包暴露，无需任何绑定。

本文聚焦三个核心模块的源码实现：

| 模块      | 文件             | 职责                                                |
| --------- | ---------------- | --------------------------------------------------- |
| View 系统 | `src/view.ts`    | 创建 ViewCtx、挂载/卸载生命周期、事件注册、资源管理 |
| Frame 树  | `src/frame.ts`   | 视图生命周期容器、父子关系管理、Zone 挂载           |
| Updater   | `src/updater.ts` | 数据绑定、变更检测、DOM Diff 触发                   |

---

## 一、ViewCtx 完整 API

`ViewCtx` 是每个视图的核心上下文对象，由 `createCtx(frame)` 工厂函数创建。它提供了视图所需的全部框架 API。

### 1.1 创建过程

```typescript
// src/view.ts
export function createCtx(frame: FrameObj): ViewCtx {
  const id = frame.id;
  const updater = createUpdater(id);
  const emitter = createEmitter();
  const signature = { value: 0 };
  const rendered = { value: false };
  const resources: Record<string, ViewResourceEntry> = {};
  // ...
  const ctx: ViewCtx = {
    id,
    owner: frame,
    updater,
    signature,
    rendered,
    // ... 所有 API 方法
  };
  return ctx;
}
```

### 1.2 核心属性

| 属性        | 类型                                | 说明                                                  |
| ----------- | ----------------------------------- | ----------------------------------------------------- |
| `id`        | `string`                            | 视图 ID，与所属 Frame 的 ID 一致                      |
| `owner`     | `FrameObj`                          | 所属 Frame 引用                                       |
| `updater`   | `UpdaterApi`                        | 数据绑定 API                                          |
| `signature` | `Ref<number>`                       | 活跃标识：>0 表示活跃，每次 render 递增，0 表示已销毁 |
| `rendered`  | `Ref<boolean>`                      | 是否已完成首次渲染                                    |
| `resources` | `Record<string, ViewResourceEntry>` | 资源映射表                                            |
| `emitter`   | `EmitterApi`                        | 内部事件发射器（生命周期事件）                        |
| `cleanups`  | `Array<() => void>`                 | useEffect 清理函数列表                                |

### 1.3 updater — 数据绑定

`updater` 是视图的数据容器，提供变更检测与 DOM Diff 触发能力：

```typescript
// 设置数据并触发渲染
ctx.updater.set({ count: 1, list: [1, 2, 3] }).digest();

// 读取数据
const count = ctx.updater.get<number>("count");

// 快照与变更检测（用于 assign）
ctx.updater.snapshot();
// ... 修改数据 ...
const changed = ctx.updater.altered(); // true 如果数据发生了变化
```

Updater 完整 API：

| 方法                                  | 签名                                    | 说明                                 |
| ------------------------------------- | --------------------------------------- | ------------------------------------ |
| `get<T>(key?)`                        | `<T = unknown>(key?: string) => T`      | 读取数据，省略 key 返回整个数据对象  |
| `set(data, excludes?)`                | `(data, excludes?) => UpdaterApi`       | 浅合并数据，追踪变更键，支持链式调用 |
| `digest(data?, excludes?, callback?)` | `(data?, excludes?, callback?) => void` | 触发摘要：合并数据后渲染（支持重入） |
| `forceDigest()`                       | `() => void`                            | 强制全量重渲染（HMR 使用）           |
| `snapshot()`                          | `() => UpdaterApi`                      | 记录当前版本号                       |
| `altered()`                           | `() => boolean \| undefined`            | 检查自 snapshot 以来数据是否变化     |
| `refData`                             | `Record<string, unknown>`               | 模板引用数据（存储对象引用）         |
| `translate(dataVal)`                  | `(data: unknown) => unknown`            | 解析 SPLITTER 前缀的引用令牌         |
| `parse(expr)`                         | `(expr: string) => unknown`             | 安全路径解析（支持点号路径）         |
| `getChangedKeys()`                    | `() => ReadonlySet<string>`             | 获取上次渲染以来变更的键集合         |

### 1.4 emitter — 事件发射器

`emitter` 是视图内部的广播事件系统，用于生命周期通知和自定义事件：

```typescript
// 监听生命周期事件
const unsubscribe = ctx.on("destroy", () => {
  console.log("视图即将销毁");
});

// 触发自定义事件
ctx.fire("dataReady", { payload: result });

// 取消监听
ctx.off("destroy", handler);
// 或使用返回的取消函数
unsubscribe();
```

### 1.5 signature — 活跃标识

`signature` 是一个 `Ref<number>` 对象，用于判断视图是否仍然活跃：

- 初始值为 `0`（未激活）
- 挂载时设为 `1`
- 每次 `render()` 调用递增
- 销毁时重置为 `0`

```typescript
// 判断视图是否存活
if (ctx.signature.value > 0) {
  // 视图仍然活跃，可以安全操作
}
```

### 1.6 resources — 资源管理

资源管理通过 `capture` / `release` 方法实现，资源与视图生命周期绑定：

```typescript
// 注册资源（写入模式）
const timer = setInterval(() => {
  /* ... */
}, 1000);
ctx.capture("myTimer", { destroy: () => clearInterval(timer) });

// 注册临时资源（下次 render 时自动销毁）
ctx.capture("tempResource", resource, true);

// 读取资源
const stored = ctx.capture("myTimer");

// 手动释放资源
ctx.release("myTimer"); // 释放并调用 destroy()
ctx.release("myTimer", false); // 仅移除，不调用 destroy()
```

资源的销毁时机：

- `destroyOnRender = true`：在下次 `render()` 时销毁
- `destroyOnRender = false`：在视图销毁（`unmountCtx`）时销毁
- 同 key 重复注册：旧资源的 `destroy()` 会被先调用

### 1.7 render / beginUpdate / endUpdate — 渲染生命周期

#### render()

```typescript
function render(): void {
  if (signature.value > 0) {
    signature.value++; // 递增签名
    fire("render"); // 触发 render 事件
    destroyAllResources(ctx, false); // 销毁 destroyOnRender 资源
    if (typeof ctx.renderMethod === "function") {
      funcWithTry(ctx.renderMethod, [], ctx, noop);
    } else {
      updater.digest(); // 触发数据摘要与 DOM Diff
    }
  }
}
```

#### beginUpdate(zoneId?)

在 Zone 更新前调用，卸载该区域的子 Frame：

```typescript
function beginUpdate(zoneId?: string): void {
  if (signature.value > 0 && mutable.endUpdatePending !== undefined) {
    frame.unmountZone(zoneId);
  }
}
```

#### endUpdate(zoneId?, inner?)

Zone 更新结束后调用，重新挂载子 Frame 并刷新延迟的 invoke 调用：

```typescript
function endUpdate(zoneId?: string, inner?: boolean): void {
  if (signature.value > 0) {
    const updateId = zoneId ?? id;
    // ...
    frame.mountZone(updateId); // 重新挂载子视图
    if (!flag) {
      setTimeout(
        wrapAsync(() => {
          runInvokes(frame); // 执行延迟的 invoke 队列
        }),
        0,
      );
    }
  }
}
```

### 1.8 wrapAsync — 异步安全

`wrapAsync` 是处理异步回调的核心工具。它在包装时捕获当前 `signature`，只有签名未变化时才执行回调：

```typescript
function wrapAsync<Fn extends AnyFunc>(fn: Fn, context?: unknown) {
  const currentSignature = signature.value;
  return (...args: Parameters<Fn>) => {
    if (currentSignature > 0 && currentSignature === signature.value) {
      return fn.apply(context ?? ctx, args);
    }
    return undefined; // 过期回调被静默丢弃
  };
}
```

典型使用场景：

```typescript
const MyView = defineView((ctx) => {
  // 异步请求完成后安全更新视图
  fetch("/api/data")
    .then((res) => res.json())
    .then(
      ctx.wrapAsync((data) => {
        // 如果视图已重新渲染或销毁，此回调不会执行
        ctx.updater.set({ data }).digest();
      }),
    );

  return { template };
});
```

---

## 二、Frame — 生命周期容器

Frame 是视图的生命周期容器，管理视图的挂载、卸载、父子关系和 Zone 更新。每个 Frame 是一个纯对象（`FrameObj`），通过 `createFrame()` 工厂函数创建。

### 2.1 Frame 结构

```typescript
export interface FrameObj {
  id: string;
  getViewPath(): string | undefined;
  readonly parentId: string | undefined;
  view: ViewCtx | undefined;
  invokeList: FrameInvokeEntry[];
  signature: number;
  destroyed: number;
  childrenMap: Record<string, string>;
  childrenCount: number;
  readyCount: number;
  readyMap: Set<string>;
  emitter: EmitterApi;

  mountView(viewPath: string, viewInitParams?: Record<string, unknown>): void;
  unmountView(): void;
  mountFrame(
    frameId: string,
    viewPath: string,
    viewInitParams?: Record<string, unknown>,
  ): FrameObj;
  unmountFrame(id?: string): void;
  mountZone(zoneId?: string): void;
  unmountZone(zoneId?: string): void;
  parent(level?: number): FrameObj | undefined;
  invoke(name: string, args?: unknown[]): unknown;
  children(): string[];
  on(event: string, handler: AnyFunc): FrameObj;
  off(event: string, handler?: AnyFunc): FrameObj;
  fire(event: string, data?: Record<string, unknown>): FrameObj;
}
```

### 2.2 Frame 单例 API

`Frame` 单例提供全局注册表操作：

```typescript
// 获取 Frame
const frame = Frame.get("my-frame-id");

// 获取所有 Frame
const allFrames = Frame.getAll(); // Map<string, FrameObj>

// 创建根 Frame（幂等）
const root = Frame.createRoot("app");

// 监听 Frame 生命周期事件
Frame.on("add", ({ frame }) => {
  console.log("新 Frame 创建:", frame.id);
});
Frame.on("remove", ({ frame }) => {
  console.log("Frame 移除:", frame.id);
});
```

### 2.3 mountView — 视图挂载流程

```typescript
mountView(viewPathArg: string, viewInitParams?: Record<string, unknown>): void {
  const node = document.getElementById(frame.id);

  // 1. 保存原始模板（首次）
  if (!frame.hasAltered && node) {
    frame.hasAltered = 1;
    frame.originalTemplate = node.innerHTML;
  }

  // 2. 卸载当前视图
  frame.unmountView();

  // 3. 解析视图路径和参数
  const parsed = parseUri(viewPathArg || "");
  const viewClassName = parsed.path;

  // 4. 合并初始化参数
  const initParams = { ...parsed.params, ...viewInitParams };

  // 5. 同步路径：已注册的 View 直接挂载
  const registered = getViewClass(viewClassName);
  if (registered) {
    doMountView(registered, initParams, node, sign);
    return;
  }

  // 6. 异步路径：远程加载 View
  use(viewClassName, (loadedModule) => {
    if (sign !== frame.signature) return; // 防止过期回调
    registerViewClass(viewClassName, loadedModule);
    doMountView(loadedModule, initParams, node, sign);
  });
}
```

---

## 三、父子视图树管理

### 3.1 树结构

Frame 通过 `parentId` 和 `childrenMap` 维护父子关系：

```
Root Frame (id: "app")
├── Child Frame A (id: "header")
│   └── Grandchild (id: "nav")
└── Child Frame B (id: "content")
    ├── Sub View 1 (id: "frame_1")
    └── Sub View 2 (id: "frame_2")
```

### 3.2 遍历父级

```typescript
// 获取直接父 Frame
const parent = frame.parent();

// 获取祖父 Frame
const grandparent = frame.parent(2);
```

### 3.3 created / alter 事件冒泡

当所有子 Frame 挂载完成时，`created` 事件沿树向上冒泡：

```typescript
// 监听子视图全部就绪
frame.on("created", () => {
  console.log("所有子视图已挂载完成");
});

// 监听子视图变更
frame.on("alter", (data) => {
  console.log("子视图发生变更:", data.id);
});
```

内部实现逻辑：

```typescript
function notifyCreated(frameInstance: FrameObj): void {
  if (
    !frameInstance.childrenCreated &&
    !frameInstance.holdFireCreated &&
    frameInstance.childrenCount === frameInstance.readyCount
  ) {
    frameInstance.childrenCreated = 1;
    frameInstance.emitter.fire("created");

    // 向父级冒泡
    const parent = frameRegistry.get(frameInstance.parentId);
    if (parent && !parent.readyMap.has(frameInstance.id)) {
      parent.readyMap.add(frameInstance.id);
      parent.readyCount++;
      notifyCreated(parent); // 递归向上
    }
  }
}
```

---

## 四、invoke() — 跨视图方法调用

`invoke()` 允许父视图调用子视图上的方法。如果子视图尚未渲染完成，调用会被加入延迟队列，待渲染完成后自动执行。

### 4.1 基本用法

```typescript
// 父视图中调用子视图的方法
const childFrame = Frame.get("child-frame-id");
childFrame.invoke("refresh", [param1, param2]);
```

### 4.2 内部实现

```typescript
invoke(name: string, args?: unknown[]): unknown {
  const currentView = frame.view;

  if (currentView && currentView.rendered.value) {
    // 视图已渲染：直接调用
    const fn = Reflect.get(currentView, name);
    if (typeof fn === "function") {
      return funcWithTry(fn, args ?? [], currentView, noop);
    }
  } else {
    // 视图未渲染：加入延迟队列
    const newEntry: FrameInvokeEntry = {
      name,
      args: args ?? [],
      key: SPLITTER + name,
    };
    frame.invokeList.push(newEntry);
  }
}
```

### 4.3 延迟队列处理

延迟的 invoke 调用在 `endUpdate` 后通过 `runInvokes` 统一执行：

```typescript
export function runInvokes(frame: FrameObj): void {
  const list = frame.invokeList;
  if (!list) return;

  while (list.length) {
    const entry = list.shift();
    if (entry && !entry.removed) {
      frame.invoke(entry.name, entry.args);
    }
  }
}
```

---

## 五、assign() — 外部更新触发

`assign` 是 setup 函数可选返回的方法，用于响应外部数据更新（如父视图重新渲染时传递新 props）。

### 5.1 定义 assign

```typescript
const MyView = defineView((ctx, params) => {
  ctx.updater.set({ title: params.title, count: 0 });

  return {
    template,
    events: {/* ... */},
    assign(options) {
      // 外部更新时调用
      ctx.updater.snapshot();
      ctx.updater.set({ title: options.title });
      return ctx.updater.altered(); // 返回 true 触发重渲染
    },
  };
});
```

### 5.2 触发时机

当父视图重新渲染时，框架通过 `mountZone` 检测到已绑定的子视图元素，调用 `updater.set(props).digest()` 将新 props 传递给子视图：

```typescript
// src/frame.ts mountZone 内部
if (htmlElIsBound(el)) {
  const childFrame = Frame.get(elId);
  const childView = childFrame?.view;
  if (childView && childView.signature.value > 0) {
    const props = readProps(el);
    if (Object.keys(props).length > 0) {
      childView.updater.set(props).digest();
    }
  }
}
```

### 5.3 snapshot / altered 模式

`snapshot()` 和 `altered()` 配合使用，精确判断数据是否真正变化：

```typescript
assign(options) {
  ctx.updater.snapshot();          // 记录当前版本
  ctx.updater.set(options);        // 合并新数据（内部 version++ 仅在实际变化时）
  return ctx.updater.altered();    // 版本变了 → true → 触发重渲染
}
```

---

## 六、挂载与卸载完整流程

### 6.1 mountCtx — 挂载

```typescript
export function mountCtx(
  frame: FrameObj,
  setup: ViewSetup,
  params?: unknown,
): ViewCtx {
  // 1. 创建 ViewCtx
  const ctx = createCtx(frame);

  // 2. 设置 hooks 上下文（useState/useEffect 可访问）
  setCurrentCtx(ctx);
  let descriptor;
  try {
    descriptor = setup(ctx, params); // 3. 执行 setup
  } finally {
    setCurrentCtx(null);
  }

  // 4. 绑定 template/events/assign
  ctx.setTemplate(descriptor.template);
  ctx.setEvents(descriptor.events);
  if (descriptor.assign) ctx.setAssign(descriptor.assign);

  // 5. 激活
  ctx.signature.value = 1;
  frame.view = ctx;

  // 6. 注册事件
  registerEvents(ctx);

  // 7. 首次渲染
  if (ctx.getTemplate()) {
    ctx.render();
  } else {
    ctx.endUpdate();
  }

  return ctx;
}
```

### 6.2 unmountCtx — 卸载

```typescript
export function unmountCtx(ctx: ViewCtx): void {
  // 1. 执行 useEffect 清理（逆序）
  for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
    funcWithTry(ctx.cleanups[i], [], null, noop);
  }
  ctx.cleanups.length = 0;

  // 2. 注销事件
  unregisterEvents(ctx);

  // 3. 销毁所有资源
  destroyAllResources(ctx, true);

  // 4. 触发 destroy 事件
  if (ctx.signature.value > 0) {
    ctx.fire("destroy", undefined, true, true);
  }

  // 5. 标记为已销毁
  ctx.signature.value = 0;
}
```

---

## 七、完整示例

```typescript
import { defineView, useState, useEffect } from "@mm/lark-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", params?.initial ?? 0);

  // 注册定时器资源
  useEffect(() => {
    const timer = setInterval(
      ctx.wrapAsync(() => {
        setCount(getCount() + 1);
      }),
      1000,
    );
    return () => clearInterval(timer);
  });

  return {
    template,
    events: {
      "increment<click>"(e) {
        setCount(getCount() + 1);
      },
      "reset<click>"(e) {
        setCount(0);
      },
    },
    assign(options) {
      ctx.updater.snapshot();
      if (options.initial !== undefined) {
        setCount(options.initial);
      }
      return ctx.updater.altered();
    },
  };
});
```

---

## 总结

| 概念            | 要点                                          |
| --------------- | --------------------------------------------- |
| ViewCtx         | 函数式上下文，通过闭包暴露所有 API，无 `this` |
| signature       | 活跃标识，防止过期异步回调执行                |
| wrapAsync       | 异步安全的核心工具                            |
| capture/release | 资源生命周期管理，自动随视图销毁              |
| Frame           | 视图容器，管理挂载/卸载/父子关系              |
| invoke          | 跨视图方法调用，支持延迟队列                  |
| assign          | 响应外部 props 更新，配合 snapshot/altered    |
| created/alter   | 子视图就绪/变更事件，沿树冒泡                 |
