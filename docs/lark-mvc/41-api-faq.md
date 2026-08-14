---
title: API 常见问答
description: Lark Mvc 常见 API 问题汇总，涵盖视图间通信、强制刷新、DOM 访问、异步安全、调试技巧、与第三方库集成、State 与 Store 区别、HMR 状态保持、路由守卫与大列表优化
---

# API 常见问答（FAQ）

本文汇总了 Lark Mvc 开发中最常被问到的 API 问题。每个问题都给出原理说明与可直接运行的代码示例，帮助你快速定位解决方案。

## 目录

- [如何在视图之间传递数据？](#如何在视图之间传递数据)
- [如何强制重新渲染？](#如何强制重新渲染)
- [如何访问 DOM 元素？](#如何访问-dom-元素)
- [如何安全地处理异步操作？](#如何安全地处理异步操作)
- [如何调试视图？](#如何调试视图)
- [如何与现有第三方库一起使用？](#如何与现有第三方库一起使用)
- [State 和 Store 有什么区别？](#state-和-store-有什么区别)
- [HMR 是如何保持状态的？](#hmr-是如何保持状态的)
- [如何处理路由守卫？](#如何处理路由守卫)
- [如何优化大列表渲染？](#如何优化大列表渲染)

---

## 如何在视图之间传递数据？

Lark Mvc 提供了 **四种** 视图间通信方式，按场景选择：

### 1. 父子视图：`v-lark` + `*prop` / `@event`

父视图通过模板中的 `v-lark` 属性挂载子视图，用 `*prop` 传递属性（编译为 `p-lark-*`），用 `@event` 监听子视图事件（编译为 `e-lark-*`）：

```html
<!-- 父视图模板 parent.html -->
<div v-lark="views/counter" *count="{{@count}}" @increment="increment"></div>
```

```ts
// 父视图 parent.ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./parent.html";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      // 子视图 fire("increment") 会触发这里
      "increment<increment>"(e) {
        setCount(getCount() + 1);
      },
    },
  };
});
```

```ts
// 子视图 counter.ts —— 通过 setup 第二个参数接收 props
import { defineView } from "@mm/lark-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  // params.count 来自父视图的 *count="{{@count}}"
  ctx.updater.set({ count: params?.count ?? 0 });

  return {
    template,
    events: {
      "add<click>"() {
        // 向父视图派发事件
        ctx.fire("increment", { value: 1 });
      },
    },
  };
});
```

> **原理**：`mountZone` 会扫描带 `v-lark` 的元素，读取 `p-lark-*` 属性作为子视图的初始化参数，并把 `e-lark-*` 属性绑定为「子 frame 事件 → 父视图处理函数」的桥接。当父视图重新渲染且子视图仍存活时，框架会用新的 props 调用 `childView.updater.set(props).digest()` 更新子视图。

### 2. 跨层级 / 全局共享：`State`

适合轻量共享值（计数器、开关、用户信息）：

```ts
import { State } from "@mm/lark-mvc";

// 视图 A：写入
State.set({ userName: "Alice" });
State.digest();

// 视图 B：观察并自动重渲染
export default defineView((ctx) => {
  ctx.observeState("userName");
  State.clean("userName")(ctx); // 视图销毁时自动清理引用计数
  ctx.updater.set({ userName: State.get("userName") });
  return { template };
});
```

### 3. 复杂状态：`createStore`

适合带行为（actions）、派生数据（computed）的复杂状态，详见 [State 和 Store 有什么区别？](#state-和-store-有什么区别)。

### 4. URL 参数：`Router.to` + `observeLocation`

适合需要持久化到地址栏、可分享、可前进后退的状态：

```ts
// 写入
Router.to("/list", { page: 2 });

// 观察
ctx.observeLocation("page,size");
```

---

## 如何强制重新渲染？

### 场景一：数据没变但模板变了（如 HMR）

使用 `updater.forceDigest()`。它会把当前所有数据键标记为已变更，再触发 digest：

```ts
ctx.updater.forceDigest();
```

其内部实现等价于：

```ts
function forceDigest(): void {
  hasChangedFlag = 1;
  changedKeys = new Set(Object.keys(data));
  digest();
}
```

### 场景二：对象内部被原地修改（引用未变）

Lark 的变更检测对**非原始值**（对象/数组/函数）一律视为「已变更」（见 `setData` 的 `!isPrimitiveOrFunc(now)` 判断），所以即便引用相同，`set` 后 `digest` 也会重渲染：

```ts
const list = ctx.updater.get<Item[]>("list");
list.push(newItem); // 原地修改
ctx.updater.set({ list }).digest(); // 引用相同也会触发渲染
```

### 场景三：手动触发整视图渲染

调用 `ctx.render()`，它会递增 `signature`、触发 `render` 事件、销毁临时资源并执行 `updater.digest()`：

```ts
ctx.render();
```

> **注意**：`ctx.render()` 仅在视图存活（`signature.value > 0`）时生效；视图销毁后调用是安全的空操作。

---

## 如何访问 DOM 元素？

Lark 是「真实 DOM」框架，视图根节点就是一个带 `id` 的 DOM 元素，`ctx.id` 即该元素 id。

### 1. 通过 `ctx.id` 获取视图根节点

```ts
const root = document.getElementById(ctx.id);
```

### 2. 在事件处理器中拿到触发元素

事件对象上挂载了 `eventTarget`（原始命中元素）：

```ts
events: {
  "del<click>"(e) {
    const target = e.eventTarget as HTMLElement;
    const id = target.getAttribute("data-id");
    // ...
  },
}
```

### 3. 使用 `Framework.ensureNodeId` 确保元素有 id

```ts
import { Framework } from "@mm/lark-mvc";

const el = document.querySelector(".chart") as HTMLElement;
const id = Framework.ensureNodeId(el); // 无 id 时自动生成 l_ 前缀 id
```

### 4. 在渲染完成后操作 DOM

用 `useEffect` 注册副作用（setup 期间同步执行），或在 digest 回调中操作：

```ts
import { useEffect } from "@mm/lark-mvc";

useEffect(() => {
  const el = document.getElementById(ctx.id);
  // 初始化第三方组件、测量尺寸等
  return () => {
    // 视图销毁时清理
  };
});
```

也可以在 `digest` 的第三个参数传入回调，在 digest 周期结束后执行：

```ts
ctx.updater.digest({ chartData }, undefined, () => {
  // DOM 已更新，可安全读取布局
});
```

---

## 如何安全地处理异步操作？

异步回调最大的风险是「视图已销毁或已重渲染，回调仍然执行」，导致操作已卸载的 DOM 或过期数据。Lark 提供 `ctx.wrapAsync` 解决这一问题。

### `wrapAsync`：签名守卫

`wrapAsync(fn)` 在包装时捕获当前 `signature`；只有当视图仍存活且 signature 未变化（即没有发生重渲染或销毁）时，回调才会执行，否则静默丢弃：

```ts
export default defineView((ctx) => {
  const load = ctx.wrapAsync(async () => {
    const data = await fetch("/api/list").then((r) => r.json());
    // 只有视图未重渲染/未销毁时才会执行到这里
    ctx.updater.set({ list: data }).digest();
  });

  return {
    template,
    events: {
      "refresh<click>"() {
        load();
      },
    },
  };
});
```

其实现原理：

```ts
function wrapAsync(fn, context?) {
  const currentSignature = signature.value;
  return (...args) => {
    if (currentSignature > 0 && currentSignature === signature.value) {
      return fn.apply(context ?? ctx, args);
    }
    return undefined; // 过期回调被丢弃
  };
}
```

### 定时器：`useInterval` / `useTimeout`

这两个 Hook 会在视图销毁时自动清理，无需手动管理：

```ts
import { useInterval, useTimeout } from "@mm/lark-mvc";

useInterval(() => {
  ctx.updater.set({ time: Date.now() }).digest();
}, 1000);

useTimeout(() => {
  ctx.updater.set({ ready: true }).digest();
}, 3000);
```

### 资源管理：`useResource` / `capture` / `release`

把带 `destroy()` 方法的资源（Service 实例、Observer 等）交给视图生命周期托管：

```ts
import { useResource, createService } from "@mm/lark-mvc";

const service = createService(syncFn);
// 第三个参数 true 表示每次 render 时销毁重建
useResource("myService", service.instance(), true);
```

### 全局异步标记：`Framework.mark` / `unmark`

用于跨视图的异步回调有效性追踪。`mark(host, key)` 返回一个校验函数，只要该 host 未被 `unmark`、且同一 key 未被重新 `mark`，校验函数就返回 `true`：

```ts
import { Framework } from "@mm/lark-mvc";

const host = {}; // 任意对象，作为标记的宿主
const isValid = Framework.mark(host, "load");
setTimeout(() => {
  if (isValid()) {
    // 仍然有效，执行逻辑
  }
}, 1000);

// 使该 host 上的所有标记失效（如视图重渲染/销毁时）
Framework.unmark(host);
```

---

## 如何调试视图？

### 1. 开启 devtool 桥接

在 `boot` 时设置 `devtool: true`（默认关闭），框架会安装 Frame Devtool Bridge，允许 lark-devtool 面板通过 postMessage 检查 frame 树：

```ts
Framework.boot({
  rootId: "app",
  devtool: true,
});
```

### 2. 模板 debug 模式

编译时开启 `debug` 选项，会为每个表达式注入 `__lark_dbg_expr__` 标记。运行时报错时会给出原始模板表达式与行号：

```
render error: xxx is not defined
	src art:{{=user.nmae}}
	expr:<%=user.nmae%>
	at file:views/home.html
```

### 3. 检查 Frame 树

```ts
import { Frame } from "@mm/lark-mvc";

// 列出所有已挂载的 frame
for (const [id, frame] of Frame.getAll()) {
  console.log(id, frame.getViewPath(), frame.view?.signature.value);
}

// 获取根 frame
const root = Frame.getRoot();
```

### 4. 观察视图生命周期事件

```ts
useEvent("render", () => console.log("view render"));
useEvent("destroy", () => console.log("view destroy"));
```

### 5. 读取当前数据快照

```ts
console.log(ctx.updater.get()); // 整个 data 对象
console.log(ctx.updater.get("list")); // 单个键
console.log(ctx.updater.getChangedKeys()); // 本轮变更的键
```

---

## 如何与现有第三方库一起使用？

Lark 使用真实 DOM，因此与任何直接操作 DOM 的库（图表、编辑器、动画库）都能良好协作。关键是**在正确的时机初始化**并**在销毁时清理**。

### 标准集成模式

```ts
import { defineView, useEffect } from "@mm/lark-mvc";
import template from "./chart.html";
import { Chart } from "some-chart-lib";

export default defineView((ctx) => {
  ctx.updater.set({ data: [1, 2, 3] });

  // useEffect 在 setup 期间同步执行，返回清理函数
  useEffect(() => {
    const container = document.querySelector(
      `#${ctx.id} .chart`,
    ) as HTMLElement;
    const chart = new Chart(container, { data: ctx.updater.get("data") });

    return () => {
      chart.destroy(); // 视图销毁时清理
    };
  });

  return {
    template,
    events: {
      async "update<click>"() {
        const data = await fetchData();
        ctx.updater.set({ data }).digest();
        // 若图表需要响应数据变化，可在 digest 回调中更新
      },
    },
  };
});
```

### 在 digest 完成后同步第三方库

```ts
ctx.updater.digest({ data }, undefined, () => {
  // DOM 已更新，通知第三方库重绘
  chartRef.update(ctx.updater.get("data"));
});
```

### 把第三方库实例作为资源托管

```ts
const chart = new Chart(el, opts);
ctx.capture("chart", { destroy: () => chart.destroy() });
// 视图销毁时自动调用 chart.destroy()
```

> **提示**：如果第三方库会修改某块 DOM，而该 DOM 又由 Lark 模板管理，请将该区域用 `{{!rawHtml}}` 或独立的子视图隔离，避免 diff 引擎与库的 DOM 操作互相覆盖。

---

## State 和 Store 有什么区别？

两者都用于跨视图共享数据，但定位不同：

| 维度       | `State`                          | `createStore`                 |
| ---------- | -------------------------------- | ----------------------------- |
| 定位       | 简单共享值                       | 复杂响应式状态                |
| 数据形态   | 扁平 key-value                   | 结构化 state + actions        |
| 行为封装   | 无（外部 set/digest）            | actions 内置于 store          |
| 派生数据   | 需手动计算                       | `computed(deps, fn)` 自动重算 |
| 写入方式   | `State.set()` + `State.digest()` | `store.setState()` 或 action  |
| 变更检测   | `setData`（对象恒为变更）        | `Object.is` 精确比较          |
| 生命周期   | 引用计数自动回收                 | `store.destroy()`             |
| 多实例隔离 | 全局单例                         | 按 name 注册，可隔离          |

### State：轻量共享

```ts
import { State } from "@mm/lark-mvc";

State.set({ theme: "dark", count: 1 });
State.digest(); // 批量触发一次 changed 事件

State.get("theme"); // "dark"
```

### Store：带行为与派生值

```ts
import { createStore, computed } from "@mm/lark-mvc";

const useCounter = createStore("counter", (set, get) => ({
  count: 0,
  // 派生值：count 变化时自动重算
  doubled: computed(["count"], () => get().count * 2),
  // action：函数会被识别为行为，不受 setState 影响
  increment() {
    set((prev) => ({ count: prev.count + 1 }));
  },
}));

useCounter.getState().increment();
useCounter.getState().doubled; // 自动更新
```

### 在视图中绑定 Store

```ts
import { useStore } from "@mm/lark-mvc";

export default defineView((ctx) => {
  // 自动同步 store 状态到 updater.data，视图销毁时自动取消订阅
  const getState = useStore(useCounter, (s) => ({
    count: s.count,
    doubled: s.doubled,
  }));

  return {
    template,
    events: {
      "inc<click>"() {
        useCounter.getState().increment();
      },
    },
  };
});
```

**选择建议**：

- 只是共享几个简单值（标题、登录态、主题）→ 用 `State`
- 需要封装业务逻辑、派生数据、可测试的状态单元 → 用 `createStore`

---

## HMR 是如何保持状态的？

Lark Mvc 的 HMR 在热替换视图代码时**保留视图本地状态**（计数器、表单输入、滚动位置等），无需整页刷新。

### 两个 HMR 层

1. **模板层**（`.html` 变更）：`hotSwapByTemplate(old, new)` 找到所有模板函数引用匹配的已挂载视图，替换模板并强制重渲染。
2. **视图层**（`.ts` 变更）：`hotSwapByView(old, new)` 更新视图注册表，并对每个匹配的 frame 执行 `hotSwapView`。

### 状态保持的核心：复用 ViewCtx

`hotSwapView` 不会销毁重建视图，而是**复用同一个 `ViewCtx` 实例**——`updater.data`、`resources`、`emitter`、`signature`、`id`、`owner` 全部保持不变。它执行的步骤是：

```ts
export function hotSwapView(frame, newSetup) {
  const oldView = frame.view;
  // 1. 运行旧的 useEffect 清理函数
  for (let i = oldView.cleanups.length - 1; i >= 0; i--) oldView.cleanups[i]();
  oldView.cleanups.length = 0;
  // 2. 注销旧事件
  unregisterEvents(oldView);
  // 3. 销毁 destroyOnRender 资源
  destroyAllResources(oldView, false);
  // 4. 用同一个 ctx 重新执行 newSetup
  setCurrentCtx(oldView);
  const descriptor = newSetup(oldView, undefined);
  setCurrentCtx(null);
  // 5. 更新 template / events / assign
  oldView.setTemplate(descriptor.template);
  oldView.setEvents(descriptor.events);
  // 6. 注册新事件
  registerEvents(oldView);
  // 7. 递增 signature，强制重渲染（仅在视图仍存活时）
  if (oldView.signature.value > 0) {
    oldView.signature.value++;
    oldView.fire("render");
    destroyAllResources(oldView, false);
    oldView.updater.forceDigest();
  }
}
```

因为 setup 函数在**同一个 ctx** 上重新执行，之前通过 `ctx.updater.set()` 写入的数据在 swap 后依然存在。`forceDigest()` 保证即便数据未变，新模板也会被应用。

### 为什么用 globalThis 而非 import？

HMR 注入片段通过 `globalThis.__lark_hmr__` 调用 swap 函数，而不是 `import "@mm/lark-mvc"`。这是因为在 Module Federation 共享单例下，HMR 回调中任何对 `@mm/lark-mvc` 的引用都会把调用模块登记为 shared consumer，导致 webpack 误判主 chunk 需要热更新，从而 404 报错 `ChunkLoadError`。全局句柄完全绕开了模块解析。

---

## 如何处理路由守卫？

Lark Router 提供 `Router.beforeEach` 注册**异步友好**的导航守卫，守卫按注册顺序执行，任一守卫返回 `false`、抛错或拒绝都会取消本次导航。

### 基本用法

```ts
import { Router } from "@mm/lark-mvc";

const unregister = Router.beforeEach(async (to, from) => {
  // to / from 是 Location 对象
  if (to.path === "/admin" && !isLoggedIn()) {
    Router.to("/login"); // 重定向
    return false; // 取消原导航
  }
  return true; // 放行
});

// 不再需要时注销
unregister();
```

### 典型场景：登录鉴权

```ts
Router.beforeEach(async (to) => {
  if (!to.path.startsWith("/admin")) return true;

  const ok = await checkAuth();
  if (!ok) {
    Router.to("/login", { redirect: to.srcQuery });
    return false;
  }
  return true;
});
```

### 典型场景：离开确认

```ts
Router.beforeEach((to, from) => {
  if (from.path === "/editor" && hasUnsavedChanges()) {
    return window.confirm("有未保存的更改，确定离开吗？");
  }
  return true;
});
```

> **原理**：Router 采用两阶段变更协议——`change` 阶段在 URL 更新前触发，守卫在此阶段运行；全部守卫通过后才进入 `changed` 阶段真正更新 URL 并通知视图。浏览器前进/后退（popstate）也会先经过守卫，若被取消则恢复原 URL。

---

## 如何优化大列表渲染？

大列表的性能瓶颈在于 diff 成本与 DOM 操作次数。以下是 Lark 下的优化策略：

### 1. 为列表项提供稳定的 key

diff 引擎通过 `compareKey` 复用节点。在字符串模式下，key 来自元素的 `id` 属性或 `v-lark` 路径；在 VDOM 模式下，来自 `#` 或 `id` 属性。**为每一项设置唯一且稳定的 id** 能让 diff 精准复用而非整体重建：

```html
{{forOf list as item}}
<div id="item_{{=item.id}}" class="row">{{=item.name}}</div>
{{/forOf}}
```

### 2. 使用 VDOM 模式 + LIS 重排

VDOM 引擎（`FrameworkConfig.vdom: true`）采用「头尾快速路径 + KeyMap + 最长递增子序列（LIS）」三阶段算法，能把 DOM 移动次数降到最少（N 个节点最多 N - L 次移动，L 为 LIS 长度）。对频繁排序、插入、删除的列表尤其有效：

```ts
Framework.boot({
  rootId: "app",
  vdom: true,
});
```

### 3. 局部更新而非整表重渲染

只 `set` 变化的数据键。由于变更检测会记录 `changedKeys`，配合 key 复用，未变化的行不会触发 DOM 操作：

```ts
// 只更新某一项，而非替换整个 list
const list = ctx.updater.get<Item[]>("list");
const idx = list.findIndex((i) => i.id === targetId);
list[idx] = { ...list[idx], done: true };
ctx.updater.set({ list }).digest();
```

### 4. 虚拟滚动 / 分片渲染

对超大数据集，只渲染可视区。可结合 `Framework.task` 把渲染工作分片到空闲时段执行：

```ts
import { Framework } from "@mm/lark-mvc";

// task 会用 scheduler.postTask / requestIdleCallback / setTimeout 分片执行
for (const chunk of chunks) {
  Framework.task(renderChunk, [chunk]);
}
```

`Framework.task` 的调度优先级为：`scheduler.postTask('background')` > `requestIdleCallback` > `setTimeout(0)`，并在时间预算（48ms）用尽时主动让出主线程。

### 5. 等待区域渲染完成

需要在一批子视图都渲染完毕后执行操作（如埋点、截图）时：

```ts
const result = await Framework.waitZoneViewsRendered(ctx.id, 5000);
if (result === Framework.WAIT_OK) {
  // 所有子视图已渲染
}
```

### 6. 避免在循环中创建闭包重对象

模板循环里尽量用原始值与简单表达式，复杂计算放到 setup 中预处理后写入 `updater.data`，减少每次渲染的表达式求值开销。

---

## 小结

| 需求         | 推荐 API                                               |
| ------------ | ------------------------------------------------------ |
| 父子通信     | `v-lark` + `*prop` / `@event`                          |
| 全局简单共享 | `State`                                                |
| 复杂状态     | `createStore` + `useStore`                             |
| URL 持久化   | `Router.to` + `observeLocation` / `useUrlState`        |
| 强制刷新     | `updater.forceDigest()` / `ctx.render()`               |
| 异步安全     | `ctx.wrapAsync` / `useInterval` / `useResource`        |
| 导航拦截     | `Router.beforeEach`                                    |
| DOM 访问     | `ctx.id` + `document.getElementById` / `e.eventTarget` |
