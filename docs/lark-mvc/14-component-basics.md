---
title: 组件基础
description: 讲解 Lark Mvc 的组件（View）模型：defineView(setup) 定义模式、setup 函数签名与 {template, events, assign} 返回值、ViewCtx 上下文 API 全景，以及"setup 只运行一次"的设计哲学与 React/Vue 组件模型的本质差异。
---

# 组件基础

## 概述

Lark Mvc 的组件叫做 **View（视图）**。它不是 class，不是 JSX 组件，也不是 Vue 的选项对象——而是一个**setup 函数**。`view.ts` 开头的注释概括了这套系统的全部设计约束：

> 视图由 setup 函数定义，setup 接收 `ViewCtx` 并返回 `{ template, events, assign? }`。ctx 通过闭包提供所有框架 API（updater、事件、capture/release、observe 等）——没有 `this` 绑定，没有 `class`，没有 `prototype`，没有 `mixin`。

这是 Lark Mvc 相对 Lark 3.x 最根本的范式迁移：从"View 类 + mixin + `this.updater`"到"setup 函数 + ctx 闭包 + Hooks"。

本文涵盖：

1. `defineView(setup)` 定义模式
2. setup 函数签名与返回值 `{ template, events, assign }`
3. `ViewCtx` API 全景
4. "setup 只运行一次"的设计哲学
5. 与 React / Vue 组件模型的系统性对比

---

## 一、defineView：组件的定义方式

### 1.1 最小示例

```ts
// views/counter.ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "incr<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

```html
<!-- views/counter.html -->
<div class="counter">
  <span>{{=count}}</span>
  <button @click="incr()">+1</button>
</div>
```

一个可运行的组件就此完成：setup 里声明状态，`events` 里声明交互，`.html` 模板负责呈现。

### 1.2 defineView 的实现

```ts
// src/view.ts
export function defineView(setup: ViewSetup): ViewSetup {
  return setup;
}
```

实现只有一行——**原样返回 setup 函数**。`defineView` 不做任何包装、不生成 class、不注册原型。它的价值在于：

1. **类型推导**——`ViewSetup` 泛型约束了 `ctx` 与 `params` 的类型，IDE 能获得完整补全；
2. **语义标记**——让"这是一个视图定义"在代码中一目了然，也便于 HMR 与 devtool 识别；
3. **注册入口**——视图通过 `registerViewClass(path, setup)` 登记后，Frame 系统即可按路径挂载。

### 1.3 ViewSetup 的类型签名

```ts
// src/types.ts
export type ViewSetup<T = unknown> = (
  ctx: ViewCtx,
  params?: T,
) => {
  template?: ViewTemplate | VDomTemplate;
  events?: Record<string, AnyFunc>;
  assign?: (options?: unknown) => boolean | undefined;
};
```

两个入参：

- **`ctx: ViewCtx`**——视图上下文，所有框架 API 的载体（见第三节）；
- **`params?: T`**——挂载参数，来源有三：URL 查询参数（经 `translateQuery` 还原令牌）、父视图的 `p-lark-*` props、`mountView` 的 `viewInitParams`。

三个返回字段，全部可选：

| 字段       | 类型                                            | 作用                   |
| ---------- | ----------------------------------------------- | ---------------------- |
| `template` | `(data, viewId, refData) => string \| VDomNode` | 编译后的模板函数       |
| `events`   | `Record<string, AnyFunc>`                       | 事件处理器映射         |
| `assign`   | `(options?) => boolean \| undefined`            | 重渲染前的数据准备钩子 |

---

## 二、返回值三件套：template、events、assign

### 2.1 template

`template` 是 `.html` 文件经编译器产出的函数（详见《模板语法》），签名为：

```ts
export type ViewTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => string;
```

Updater 在 digest 时调用它：`template(data, viewId, refData)`。返回字符串走真实 DOM diff 管线；开启 `vdom: true` 配置时返回 `VDomNode` 树走 VDOM 管线。**setup 本身不关心渲染细节**——它只负责把模板函数交给框架。

没有 `template` 的视图是合法的——纯逻辑视图（如数据预取、路由守卫）只返回 `events` 或什么都不返回，`mountCtx` 会走 `endUpdate()` 分支而非 `render()`。

### 2.2 events

`events` 是"处理器名 + 事件声明"的映射，键的语法由 `VIEW_EVENT_METHOD_REGEXP` 解析：

```ts
// src/common.ts
export const VIEW_EVENT_METHOD_REGEXP = /^(\$?)([\w]*)<(.*?)>(?:<([\w ,]*)>)?$/;
```

支持的声明形式（摘自 `event-delegator.ts` 文档注释）：

| 键的写法                  | 含义                         |
| ------------------------- | ---------------------------- |
| `"incr<click>"`           | 视图根元素上的 click 事件    |
| `"save<click,mousedown>"` | 一次绑定多个事件类型         |
| `"$row<click>"`           | 委托给匹配 `.row` 的后代元素 |
| `"$window<resize>"`       | 委托给 window                |
| `"$document<keydown>"`    | 委托给 document              |
| `"del<click><ctrl>"`      | 仅当按住 Ctrl 时触发         |

```ts
return {
  template,
  events: {
    "incr<click>"() {
      /* 根元素点击 */
    },
    "$item<click>"(e) {
      /* 列表项点击，e.target 是命中的 .item 元素 */
    },
    "$window<resize>"() {
      /* 窗口缩放 */
    },
  },
};
```

所有 DOM 事件都被委托到 `document.body` 的捕获阶段统一分发（见 `event-delegator.ts`），视图无需为每个元素 `addEventListener`，也无需在销毁时逐个解绑——`unmountCtx` 会调用 `unregisterEvents` 统一注销。

模板中的 `@click="incr()"` 属性与 `events` 映射是同一套系统的两个入口：`@` 属性把处理器名编码进 DOM（携带 viewId 前缀），事件冒泡时由委托系统解析并路由到对应视图的处理器。

### 2.3 assign

`assign` 是每次**重渲染前**被调用的数据准备函数，典型用法是配合 `snapshot`/`altered` 做变更检测：

```ts
export default defineView((ctx) => {
  ctx.updater.set({ list: [] });

  return {
    template,
    assign(options) {
      ctx.updater.snapshot(); // 记录当前 version
      ctx.updater.set({ list: fetchData() });
      return ctx.updater.altered(); // version 变了才返回 true
    },
  };
});
```

`updater.ts` 中这对 API 的实现：

```ts
// src/updater.ts（节选）
function snapshot(): UpdaterApi {
  snapshotVersion = version;
  return api;
}

function altered(): boolean | undefined {
  if (snapshotVersion === undefined) return undefined;
  return version !== snapshotVersion;
}
```

`set()` 只有在数据真正变化时才 `version++`，因此 `altered()` 返回 `false` 时框架可以跳过本轮渲染。`assign` 把"这次渲染到底要不要进行"的决策权交还给开发者。

---

## 三、ViewCtx：上下文 API 全景

`createCtx(frame)`（`view.ts`）为每个视图创建一个 `ViewCtx`。它是 setup 函数的第一个参数，也是整个视图生命周期的"控制面"。按职责分组：

### 3.1 身份与数据

| 成员            | 说明                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ctx.id`        | 视图 ID（与所属 frame 的 ID 相同，即 DOM 容器节点的 id）                                                                               |
| `ctx.owner`     | 所属 `FrameObj` 引用                                                                                                                   |
| `ctx.updater`   | 数据绑定 API：`get` / `set` / `digest` / `forceDigest` / `snapshot` / `altered` / `refData` / `translate` / `parse` / `getChangedKeys` |
| `ctx.signature` | `Ref<number>`，生命周期签名：`>0` 存活，每次 render 自增，`0` 已销毁                                                                   |
| `ctx.rendered`  | `Ref<boolean>`，是否已完成首次渲染                                                                                                     |

### 3.2 渲染控制

| 成员                       | 说明                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| `ctx.render()`             | 手动触发渲染：`signature++` → `fire("render")` → 销毁临时资源 → `digest()`   |
| `ctx.beginUpdate(zoneId?)` | 区域更新前卸载子 frame                                                       |
| `ctx.endUpdate(zoneId?)`   | 区域更新后重新挂载子 frame、冲刷 invoke 队列，首次调用标记 `rendered = true` |
| `ctx.wrapAsync(fn)`        | 异步回调签名守卫（见《生命周期》）                                           |

`render()` 的源码展示了渲染的完整动作：

```ts
// src/view.ts（节选）
function render(): void {
  if (signature.value > 0) {
    signature.value++;
    fire("render");
    destroyAllResources(ctx, false); // 仅销毁 destroyOnRender 的临时资源
    if (typeof ctx.renderMethod === "function") {
      funcWithTry(ctx.renderMethod, [], ctx, noop);
    } else {
      updater.digest();
    }
  }
}
```

### 3.3 观察与订阅

| 成员                                            | 说明                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `ctx.observeState(keys)`                        | 声明观察的 State key，命中即自动重渲染（见《侦听器》）      |
| `ctx.observeLocation(params, observePath?)`     | 声明观察的 URL 参数/path                                    |
| `ctx.on(event, handler)`                        | 订阅视图内部事件（`render`/`destroy`/自定义），返回退订函数 |
| `ctx.off(event, handler?)`                      | 退订                                                        |
| `ctx.fire(event, data?, remove?, lastToFirst?)` | 触发事件                                                    |
| `ctx.cleanups`                                  | `useEffect` 注册的清理函数数组，销毁时逆序执行              |

### 3.4 资源管理

| 成员                                            | 说明                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| `ctx.capture(key, resource?, destroyOnRender?)` | 登记随视图生命周期销毁的资源（如 Service 实例） |
| `ctx.release(key, destroy?)`                    | 移除并（可选）销毁资源                          |
| `ctx.resources`                                 | 资源登记表                                      |

```ts
export default defineView((ctx) => {
  const service = createService(syncFn);
  ctx.capture("myService", service.instance(), true); // 每次 render 时销毁重建
  // 或 useResource("myService", service.instance(), true)
  return { template };
});
```

### 3.5 模板与事件的存取

`template` / `events` / `assign` 在 ctx 上以函数对形式暴露（Lark Mvc 刻意不用 getter/setter 语法）：

```ts
ctx.getTemplate();
ctx.setTemplate(v);
ctx.getEvents();
ctx.setEvents(v);
ctx.getAssign();
ctx.setAssign(v);
```

`mountCtx` 正是通过这组函数把 setup 的返回值"接线"到 ctx 上的。

---

## 四、"setup 只运行一次"的设计哲学

这是理解 Lark 组件模型最关键的一条原则，`hooks.ts` 的模块注释开宗明义：

> 与 React hooks 的关键差异：Lark 的 setup **只运行一次**（挂载时），而非每次渲染都运行。`useState` 返回 `[getter, setter]` 元组，getter 永远从 `ctx.updater.data` 读取——避免过期闭包。模板独立于 setup 的闭包，直接从 `updater.data` 读取。

### 4.1 一次运行的具体含义

`mountCtx`（`view.ts`）在视图挂载时执行 setup，且仅执行一次：

```ts
// src/view.ts（节选）
export function mountCtx(
  frame: FrameObj,
  setup: ViewSetup,
  params?: unknown,
): ViewCtx {
  const ctx = createCtx(frame);

  setCurrentCtx(ctx); // 让 useState/useEffect 能找到 ctx
  let descriptor: ReturnType<ViewSetup>;
  try {
    descriptor = setup(ctx, params); // ← 唯一一次执行
  } finally {
    setCurrentCtx(null);
  }

  ctx.setTemplate(descriptor.template);
  ctx.setEvents(descriptor.events);
  if (descriptor.assign) {
    ctx.setAssign(descriptor.assign);
  }

  ctx.signature.value = 1; // 激活
  frame.view = ctx; // 接线到 frame（必须在 render 前）
  registerEvents(ctx); // 注册事件

  if (ctx.getTemplate()) {
    ctx.render(); // 首次渲染
  } else {
    ctx.endUpdate();
  }
  return ctx;
}
```

此后无论视图重渲染多少次，setup 都不会再执行——重渲染只是"模板函数重新求值 + DOM diff"。视图销毁后再次挂载（如路由切走再切回），才会创建新的 ctx、运行新的 setup。

### 4.2 为什么 getter 必须是函数

setup 只运行一次，意味着事件处理器里的闭包会存活整个视图生命周期。如果 `useState` 像 React 那样返回**值**：

```ts
// 假设的错误设计
const [count, setCount] = useState("count", 0);
// count 永远是首次 setup 时的快照 0 —— 典型的 stale closure
```

Lark 的解法是返回 getter 函数，每次调用现读 `updater.data`：

```ts
// src/hooks.ts（节选）
const getter = (): T => ctx.updater.get<T>(key);
const setter = (v: T): void => {
  ctx.updater.set({ [key]: v }).digest();
};
```

```ts
"incr<click>"() {
  setCount(getCount() + 1);   // getCount() 永远读到最新值
}
```

### 4.3 模板与闭包解耦

模板编译产物是独立函数，从 `updater.data` 读数，与 setup 闭包毫无瓜葛。这解释了 Lark 的一条硬性约定：**模板能读到的，必须是 `updater.data` 里的 key**。setup 里的局部变量对模板不可见——不是编译器的限制，而是架构使然：

```ts
export default defineView((ctx) => {
  const secret = "local"; // 模板读不到
  ctx.updater.set({ title: "visible" }); // 模板读 {{=title}}
  return { template };
});
```

### 4.4 一次运行带来的红利

- **无重复初始化**——数据预取、订阅建立、定时器设置天然只发生一次，无需 `useEffect(fn, [])` 式的空依赖约定；
- **闭包即状态**——setup 里的局部变量就是私有状态，安全存活于整个生命周期；
- **渲染极轻**——重渲染不执行任何用户 JS（模板求值除外），digest 路径上没有 setup 重跑的开销；
- **心智模型简单**——"setup 是构造函数 + 事件接线，digest 是唯一的刷新入口"。

---

## 五、与 React / Vue 组件模型对比

| 维度                 | Lark Mvc View                                       | React 函数组件             | Vue 3 setup                          |
| -------------------- | --------------------------------------------------- | -------------------------- | ------------------------------------ |
| 定义方式             | `defineView(setup)` 返回 setup 本身                 | 函数即组件                 | `defineComponent({ setup })`         |
| setup/组件体执行频率 | **挂载时一次**                                      | 每次渲染                   | 挂载时一次                           |
| 状态读取             | `getX()` getter 现读                                | 闭包快照（每次渲染新值）   | ref 解包 / reactive 代理             |
| 状态写入             | `setX(v)` → 自动 digest                             | `setState(v)` → 调度重渲染 | 直接改 ref/代理 → 响应式触发         |
| 模板                 | 独立 `.html` 文件，编译为函数                       | JSX，与组件同文件          | SFC `<template>`，编译为 render 函数 |
| 事件绑定             | `events` 映射 + 全局委托                            | JSX 内联 props             | 模板 `@click`                        |
| DOM 更新             | 字符串模板 + keyed 真实 DOM diff                    | Virtual DOM                | Virtual DOM                          |
| 副作用清理           | `useEffect` 返回 cleanup，销毁时执行                | 依赖变化/卸载时执行        | `onUnmounted` 等钩子                 |
| 组件通信             | `p-lark-*` props（`{{@}}` 传对象）+ `e-lark-*` 事件 | props + 回调               | props + emit                         |

三个最本质的差异：

**1. 渲染模型：字符串 diff vs 虚拟 DOM。** React/Vue 在内存中维护组件树再映射到 DOM；Lark 的模板直接产出 HTML 字符串，与活 DOM 做 keyed diff。`{{@}}` 令牌系统（见《模板引用》）弥补了字符串无法承载对象的缺口。

**2. 状态时效：getter 现读 vs 闭包快照。** React 每次渲染生成新闭包，状态值是"那一帧的快照"；Lark 的 setup 闭包终身有效，状态必须经 getter 现读。写 Lark 事件处理器时不存在"依赖数组"的概念——`getCount()` 永远是最新的。

**3. 事件系统：集中委托 vs 逐元素绑定。** Lark 把所有 DOM 事件委托到 `document.body` 捕获阶段，按 Frame 树路由；视图声明的只是"名字 → 处理器"的映射。这让事件注册/注销成为 O(声明数) 而非 O(元素数) 的操作。

---

## 六、一个完整的组件示例

综合以上所有概念：

```ts
// views/todo.ts
import { defineView, useState, useEffect, useEvent } from "@mm/lark-mvc";
import { State } from "@mm/lark-mvc";
import template from "./todo.html";

export default defineView((ctx, params) => {
  // ── 状态：setup 只运行一次，getter 永远读最新值 ──
  const [getItems, setItems] = useState<{ text: string; done: boolean }[]>(
    "items",
    [],
  );
  const [getDraft, setDraft] = useState("draft", "");

  // ── 观察：State 中 filter 变化时自动重渲染 ──
  ctx.observeState("filter");
  State.clean("filter")(ctx);

  // ── 副作用：挂载时启动，销毁时自动清理 ──
  useEffect(() => {
    const timer = setInterval(() => console.log("tick"), 5000);
    return () => clearInterval(timer);
  });

  useEvent("destroy", () => console.log("todo view destroyed"));

  // ── 初始数据 ──
  ctx.updater.set({ filter: State.get("filter") ?? "all" });

  return {
    template,
    events: {
      "input<change>"(e: Event) {
        setDraft((e.target as HTMLInputElement).value);
      },
      "add<click>"() {
        const draft = getDraft().trim();
        if (!draft) return;
        setItems([...getItems(), { text: draft, done: false }]);
        setDraft("");
      },
      "$item<click>"(e: Event) {
        const idx = Number((e.target as HTMLElement).getAttribute("data-idx"));
        setItems(
          getItems().map((it, i) =>
            i === idx ? { ...it, done: !it.done } : it,
          ),
        );
      },
    },
  };
});
```

```html
<!-- views/todo.html -->
<div class="todo">
  <input value="{{:draft}}" @change="input()" />
  <button @click="add()">添加</button>
  <ul>
    {{forOf items as item idx}}
    <li class="item {{if item.done}}done{{/if}}" data-idx="{{=idx}}">
      {{=item.text}}
    </li>
    {{/forOf}}
  </ul>
</div>
```

这个组件展示了 Lark 组件模型的完整闭环：setup 一次性完成状态声明、观察登记、副作用注册；交互全部收敛在 `events` 映射；视图呈现交给编译后的模板；销毁时 cleanup、事件注销、资源回收由框架自动完成。

---

## 小结

- `defineView(setup)` 原样返回 setup 函数——没有 class、没有包装，视图就是一个 `(ctx, params) => ({ template, events, assign? })`；
- `template` 是编译后的模板函数，`events` 是"名字<事件>"映射（支持选择器、window/document、修饰符），`assign` 是重渲染前的变更检测钩子；
- `ViewCtx` 以闭包承载全部框架 API：updater 数据绑定、render/endUpdate 渲染控制、observeState/observeLocation 观察、capture/release 资源管理、on/off/fire 事件；
- setup 只在挂载时运行一次，状态经 getter 现读以避免 stale closure，模板独立从 `updater.data` 读数；
- 相对 React/Vue，Lark 的差异在于：字符串 keyed diff 的渲染管线、getter 现读的时效模型、document.body 集中委托的事件系统。
