---
title: 生命周期
description: 逐帧拆解 Lark Mvc 视图的生命周期：mountCtx 的七步挂载序列、unmountCtx 的逆序销毁序列、signature 签名守卫机制，以及 Frame 树级别的 created/alter/add/remove 事件。
---

# 生命周期

## 概述

一个 Lark Mvc 视图的一生只有三个词：**Setup → Render → Destroy**。

- **Setup**：挂载时执行一次 setup 函数，声明状态、事件与副作用；
- **Render**：可发生多次，每次只是模板重新求值 + DOM diff，setup 永不重跑；
- **Destroy**：清理函数逆序执行、事件注销、资源销毁、签名归零。

这套生命周期的骨架由 `view.ts` 的 `mountCtx` / `unmountCtx` 两个函数撑起，由 `signature` 签名机制全程护航，再由 `frame.ts` 的 Frame 树事件（`created` / `alter` / `add` / `remove`）向外广播。本文按源码顺序逐帧拆解。

---

## 一、全景图

```
frame.mountView(viewPath)
      │  加载 setup（同步注册表 or 异步 require）
      ▼
doMountView(setup, params, node, sign)
      │
      ▼
mountCtx(frame, setup, params)          ← 挂载序列（第二节）
      │  ① createCtx
      │  ② setCurrentCtx(ctx)
      │  ③ setup(ctx, params)           ← 唯一一次执行
      │  ④ 接线 template/events/assign
      │  ⑤ signature.value = 1（激活）
      │  ⑥ registerEvents(ctx)
      │  ⑦ ctx.render() 或 ctx.endUpdate()
      ▼
运行期：digest / render 循环（signature 每次 render +1）
      │
      ▼
frame.unmountView()
      │  unmountZone → notifyAlter → unmountCtx
      ▼
unmountCtx(ctx)                          ← 销毁序列（第三节）
      │  ① cleanups 逆序执行
      │  ② unregisterEvents
      │  ③ destroyAllResources
      │  ④ fire("destroy")
      │  ⑤ signature.value = 0
      ▼
frame.view = undefined，恢复 originalTemplate
```

---

## 二、挂载序列：mountCtx 七步

`mountCtx`（`view.ts`）是视图诞生的唯一入口。完整源码如下：

```ts
// src/view.ts
export function mountCtx(
  frame: FrameObj,
  setup: ViewSetup,
  params?: unknown,
): ViewCtx {
  const ctx = createCtx(frame);

  // ② 设置 hooks 上下文
  setCurrentCtx(ctx);
  let descriptor: ReturnType<ViewSetup>;
  try {
    // ③ 运行 setup —— 返回 { template, events, assign? }
    descriptor = setup(ctx, params);
  } finally {
    setCurrentCtx(null);
  }

  // ④ 接线
  ctx.setTemplate(descriptor.template);
  ctx.setEvents(descriptor.events);
  if (descriptor.assign) {
    ctx.setAssign(descriptor.assign);
  }

  // ⑤ 激活
  ctx.signature.value = 1;

  // 必须在 render 之前把 ctx 挂到 frame 上
  frame.view = ctx;

  // ⑥ 注册事件
  registerEvents(ctx);

  // ⑦ 渲染
  if (ctx.getTemplate()) {
    ctx.render();
  } else {
    ctx.endUpdate();
  }

  return ctx;
}
```

逐步解析：

### ① createCtx(frame)

`createCtx` 初始化视图的全部内部状态：

```ts
// src/view.ts（节选）
export function createCtx(frame: FrameObj): ViewCtx {
  const id = frame.id;
  const updater = createUpdater(id); // 数据绑定引擎
  const emitter = createEmitter(); // 内部事件发射器
  const signature = { value: 0 }; // 签名：0 = 未激活
  const rendered = { value: false }; // 尚未渲染
  const resources: Record<string, ViewResourceEntry> = {};
  const locationObserved: ViewLocationObserved = {
    flag: 0,
    keys: [],
    observePath: false,
  };
  const cleanups: Array<() => void> = [];
  // ...
}
```

注意 `signature.value` 初始为 `0`——此刻视图尚未激活，任何以 `signature > 0` 为前提的操作（`render`、`wrapAsync` 回调、`endUpdate`）都会被拒绝。

### ② setCurrentCtx(ctx)

Hooks（`useState` / `useEffect` / `useStore` 等）通过模块级变量 `currentCtx` 找到所属视图：

```ts
// src/hooks.ts（节选）
let currentCtx: ViewCtx | null = null;

export function setCurrentCtx(ctx: ViewCtx | null): void {
  currentCtx = ctx;
}
```

`mountCtx` 用 `try/finally` 包裹 setup 执行——**无论 setup 是否抛错，`currentCtx` 都会被重置为 `null`**，避免异常后 hooks 上下文串台。在 setup 之外调用 hooks 会直接抛错：

```ts
function getCtx(): ViewCtx {
  if (!currentCtx) {
    throw new Error("Hooks can only be called inside a view setup function");
  }
  return currentCtx;
}
```

### ③ setup(ctx, params)

setup 一生只此一次执行（详见《组件基础》）。它返回 `{ template, events, assign? }` 描述符，期间通过 hooks 向 ctx 登记状态与清理函数。

### ④ 接线 template / events / assign

描述符通过 `setTemplate` / `setEvents` / `setAssign` 写入 ctx 的 mutable 区。接线完成后，ctx 才"知道自己长什么样、如何响应事件"。

### ⑤ 激活：signature.value = 1

签名从 0 置 1，视图正式进入存活状态。源码中有一条关键注释解释了 `frame.view = ctx` 为什么必须在 render 之前：

> 在 render 之前把 ctx 挂到 frame 上，这样 `updater.digest()` → `runDigest()` 才能找到 `frame.view` 并读取模板。缺少这一步，runDigest 的 `const view = frame?.view` 是 undefined，渲染变成空操作——这正是 lark-demo 白屏 bug 的根因。

### ⑥ registerEvents(ctx)

遍历 `events` 映射，按 `VIEW_EVENT_METHOD_REGEXP` 解析每个键，向 `EventDelegator` 注册事件类型（引用计数式 bind），window/document 全局事件则直接 `addEventListener` 并把解绑挂到 `destroy` 事件上：

```ts
// src/view.ts（节选）
function registerGlobalEvent(
  ctx,
  element,
  eventName,
  handler,
  modifiers,
): void {
  const listener: EventListenerObject = {
    handleEvent(domEvent) {
      /* ... */
    },
  };
  element.addEventListener(eventName, listener);

  // 销毁时清理
  ctx.on("destroy", () => {
    element.removeEventListener(eventName, listener);
  });
}
```

### ⑦ 首次渲染

有模板 → `ctx.render()`；无模板（纯逻辑视图）→ `ctx.endUpdate()`（挂载子 frame、冲刷 invoke 队列）。

`render()` 的内部动作：

```ts
// src/view.ts（节选）
function render(): void {
  if (signature.value > 0) {
    signature.value++; // 1 → 2
    fire("render"); // 触发生命周期事件
    destroyAllResources(ctx, false); // 销毁 destroyOnRender 的临时资源
    if (typeof ctx.renderMethod === "function") {
      funcWithTry(ctx.renderMethod, [], ctx, noop);
    } else {
      updater.digest(); // 模板求值 + DOM diff
    }
  }
}
```

首次 render 后 `signature.value === 2`。dispatcher 遍历 Frame 树时跳过 `signature.value <= 1` 的视图（见《侦听器》），正是利用了这个计数：尚未完成首次渲染的视图不参与观察调度。

首次 digest 成功后，`endUpdate` 把 `rendered.value` 置为 `true`，并通过 `frame.mountZone` 挂载模板中声明的所有 `v-lark` 子视图——子视图的挂载序列与本文完全相同，生命由此层层展开。

---

## 三、销毁序列：unmountCtx 五步

```ts
// src/view.ts
export function unmountCtx(ctx: ViewCtx): void {
  // ① 逆序执行 useEffect 清理函数
  for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
    const cleanup = ctx.cleanups[i];
    funcWithTry(cleanup, [], null, noop);
  }
  ctx.cleanups.length = 0;

  // ② 注销事件
  unregisterEvents(ctx);

  // ③ 销毁全部资源
  destroyAllResources(ctx, true);

  // ④ 触发 destroy 事件
  if (ctx.signature.value > 0) {
    ctx.fire("destroy", undefined, true, true);
  }

  // ⑤ 签名归零
  ctx.signature.value = 0;
}
```

### ① cleanups 逆序执行

`cleanups` 数组收集了所有副作用的清理函数，来源包括：

```ts
// src/hooks.ts（节选）
export function useEffect(
  fn: () => (() => void) | void,
  _deps?: unknown[],
): void {
  const ctx = getCtx();
  const cleanup = fn();
  if (typeof cleanup === "function") {
    ctx.cleanups.push(cleanup);
  }
}

export function useInterval(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setInterval(fn, delay);
  ctx.cleanups.push(() => clearInterval(timer));
}

export function useEvent(event: string, handler: AnyFunc): void {
  const ctx = getCtx();
  const off = ctx.on(event, handler);
  ctx.cleanups.push(off);
}
```

**逆序（LIFO）执行**是刻意设计：后注册的副作用往往依赖先注册的（例如后建的定时器读先建的状态），逆序清理保证依赖方先离场。每个 cleanup 都被 `funcWithTry` 包裹——单个清理函数抛错不会中断整条清理链。

与 React 的差异值得注意：Lark 的 `useEffect` 在 setup 时**同步执行一次**，cleanup 只在销毁时运行，没有依赖数组、不会中途重跑——因为 setup 只运行一次。

### ② unregisterEvents

与 `registerEvents` 对称，逐键解析并向 `EventDelegator.unbind` 递减引用计数。全局事件无需在此处理——它们的 `removeEventListener` 已挂在 `destroy` 事件上，由第 ④ 步触发。

### ③ destroyAllResources(ctx, true)

```ts
// src/view.ts（节选）
export function destroyAllResources(ctx: ViewCtx, lastly: boolean): void {
  const cache = ctx.resources;
  for (const p in cache) {
    if (hasOwnProperty(cache, p)) {
      const entry = cache[p];
      if (lastly || entry.destroyOnRender) {
        destroyResource(cache, p, true);
      }
    }
  }
}
```

`lastly = true` 表示销毁一切资源；对比 render 时的 `destroyAllResources(ctx, false)`——那只清理 `destroyOnRender` 标记的临时资源（如每次渲染重建的 Service 实例）。资源的销毁动作是调用其 `destroy()` 方法（若存在）。

### ④ fire("destroy", ..., true, true)

两个 `true` 分别是 `remove`（触发后清空该事件的监听器）与 `lastToFirst`（逆序通知监听者）。所有通过 `ctx.on("destroy", fn)` / `useEvent("destroy", fn)` / `bindStore` 登记的销毁回调在这里集中兑现——包括 store 退订、全局事件解绑、`State.clean` 的引用计数递减。

`signature > 0` 的判断防止对已销毁视图重复触发 destroy。

### ⑤ signature.value = 0

签名归零，视图被宣告死亡。此后：

- `render()` 的 `if (signature.value > 0)` 不成立，渲染请求静默丢弃；
- `endUpdate` / `beginUpdate` 同理失效；
- 所有 `wrapAsync` 包装的回调因 `currentSignature > 0` 不成立而空转。

`unmountCtx` 之后，`frame.unmountView` 还负责收尾：

```ts
// src/frame.ts（unmountView 节选）
unmountCtx(currentView);
frame.view = undefined;

// 恢复挂载前的原始 innerHTML
const node = document.getElementById(frame.id);
if (node && frame.originalTemplate) {
  node.innerHTML = frame.originalTemplate;
}

globalAlter = undefined;
unmark(currentView); // 使 Framework.mark 的异步标记失效
```

`originalTemplate` 是视图首次挂载前容器节点的原始内容（`mountView` 时保存），销毁后恢复——frame 容器回到"未挂载"的干净状态。

---

## 四、signature：签名守卫机制

`signature` 是 `Ref<number>` 类型的可变引用（`types.ts` 中的 `Ref<T> = { value: T }`），它是整个生命周期安全的核心。

### 4.1 签名的三种状态

| 值   | 含义                                        |
| ---- | ------------------------------------------- |
| `0`  | 未激活（刚 createCtx）或已销毁              |
| `1`  | 已激活、尚未完成首次渲染（dispatcher 跳过） |
| `≥2` | 存活，每 render 一次 +1                     |

### 4.2 wrapAsync：异步回调的生死检查

异步是生命周期事故的重灾区：请求发出后视图销毁了，回调回来操作一具"尸体"。`wrapAsync` 在包装时捕获当前签名：

```ts
// src/view.ts（节选）
function wrapAsync<Fn extends AnyFunc>(
  fn: Fn,
  context?: unknown,
): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined {
  const currentSignature = signature.value;
  return (...args: Parameters<Fn>) => {
    if (currentSignature > 0 && currentSignature === signature.value) {
      return fn.apply(context ?? ctx, args) as ReturnType<Fn>;
    }
    return undefined; // 过期回调，静默丢弃
  };
}
```

双重条件缺一不可：

- `currentSignature > 0`——包装时视图必须活着；
- `currentSignature === signature.value`——执行时签名未变（既没有重渲染，也没有销毁）。

用法：

```ts
export default defineView((ctx) => {
  ctx.updater.set({ loading: true });

  return {
    template,
    events: {
      async "load<click>"() {
        const data = await fetchList();
        // 若等待期间视图重渲染或销毁，下面这行不会执行
        ctx.wrapAsync(() => {
          ctx.updater.set({ list: data, loading: false }).digest();
        })();
      },
    },
  };
});
```

注意"签名未变"意味着**重渲染也会使旧回调失效**——因为每次 render 都 `signature++`。这是 Lark 对"过期异步"的严格定义：不止销毁，任何一次刷新都让此前的异步上下文作废。

### 4.3 签名守卫的其他落点

- `runDigest`（`updater.ts`）：`view.signature.value > 0` 才执行渲染；
- `dispatcherUpdate`（`framework.ts`）：`signature.value <= 1` 的视图跳过调度；
- `mountZone`（`frame.ts`）：只在 `childView.signature.value > 0` 时向子视图推送 props；
- `doMountView`（`frame.ts`）：异步加载 setup 期间 frame 被卸载重建时，`sign !== frame.signature` 直接放弃挂载。

---

## 五、Frame 级生命周期事件

视图之外，Frame 树自身也有一套事件系统（`frame.ts`），分**实例级**与**静态级**两层。

### 5.1 实例级：created 与 alter

`created` 在"一个 frame 的所有子 frame 完成挂载"时触发，并沿树向上冒泡：

```ts
// src/frame.ts（节选）
function notifyCreated(frameInstance: FrameObj): void {
  if (
    !frameInstance.childrenCreated &&
    !frameInstance.holdFireCreated &&
    frameInstance.childrenCount === frameInstance.readyCount
  ) {
    frameInstance.childrenCreated = 1;
    frameInstance.childrenAlter = 0;
    frameInstance.emitter.fire("created");

    const pId = frameInstance.parentId;
    if (pId) {
      const parent = frameRegistry.get(pId);
      if (parent && !parent.readyMap.has(frameInstance.id)) {
        parent.readyMap.add(frameInstance.id);
        parent.readyCount++;
        notifyCreated(parent); // 向上冒泡
      }
    }
  }
}
```

触发条件是 `childrenCount === readyCount`——所有已声明的子 frame 都进入就绪态。`holdFireCreated` 在 `mountZone` 期间置 1，防止挂载进行中的半成品状态误触发。

`alter` 是 `created` 的逆事件——子 frame 内容变化（如卸载）时，父级从"已创建"退回"已变更"状态，同样向上冒泡：

```ts
// src/frame.ts（节选）
function notifyAlter(frameInstance: FrameObj, data: { id: string }): void {
  if (!frameInstance.childrenAlter && frameInstance.childrenCreated) {
    frameInstance.childrenCreated = 0;
    frameInstance.childrenAlter = 1;
    frameInstance.emitter.fire("alter", data);

    const pId = frameInstance.parentId;
    if (pId) {
      const parent = frameRegistry.get(pId);
      if (parent && parent.readyMap.has(frameInstance.id)) {
        parent.readyCount--;
        parent.readyMap.delete(frameInstance.id);
        notifyAlter(parent, data);
      }
    }
  }
}
```

`unmountView` 中，`notifyAlter` 在 `unmountCtx` **之前**调用——先向全树宣告"此处即将变更"，再执行实际销毁。

典型应用：等待整个子树渲染完成再执行操作：

```ts
export default defineView((ctx) => {
  useEffect(() => {
    const off = ctx.owner.on("created", () => {
      console.log("本视图的所有子视图已挂载完毕");
    });
    return off;
  });
  return { template };
});
```

框架也提供了 Promise 化的等待工具 `Framework.waitZoneViewsRendered(viewId, timeout)`，轮询 `childrenCount === readyCount` 直至满足或超时。

### 5.2 静态级：add 与 remove

`Frame` 单例持有全局静态 emitter，在任何 frame 创建/移除时广播：

```ts
// src/frame.ts（节选）
// createFrame 末尾
staticEmitter.fire("add", { frame });

// removeFrame
staticEmitter.fire("remove", { frame: frameInstance, fcc: wasCreated });
```

```ts
import { Frame } from "@mm/lark-mvc";

Frame.on("add", (e) => {
  console.log("新 frame 加入树：", e.frame.id);
});

Frame.on("remove", (e) => {
  console.log("frame 移除：", e.frame.id, "曾完成挂载：", e.fcc);
});
```

`add`/`remove` 是全局侦听点——devtool、性能埋点、微前端桥接都从这里切入，业务代码一般不直接使用。

### 5.3 视图事件与 Frame 事件的时序

一次完整的"父视图重渲染导致子视图换装"涉及的事件时序：

```
父视图 digest
  └─ endUpdate → frame.mountZone
       ├─ holdFireCreated = 1
       ├─ 发现新 v-lark 元素 → mountFrame
       │    ├─ notifyAlter(parent)          → 父触发 "alter"
       │    ├─ createFrame(child)           → 静态 "add"
       │    └─ child.mountView → mountCtx → 子视图 Setup + Render
       ├─ holdFireCreated = 0
       └─ notifyCreated(parent)             → 子就绪后父触发 "created"
```

---

## 六、生命周期钩子速查

| 时机             | 接入方式                                             | 说明                           |
| ---------------- | ---------------------------------------------------- | ------------------------------ |
| 初始化（仅一次） | setup 函数体                                         | 声明状态、预取数据、登记观察   |
| 每次渲染前       | `useEvent("render", fn)` 或 `assign()`               | render 事件在 digest 前触发    |
| 首次渲染完成     | `ctx.rendered.value` / `endUpdate` 后                | 子视图挂载发生在首次 endUpdate |
| 子树全部就绪     | `ctx.owner.on("created", fn)`                        | 沿 Frame 树冒泡                |
| 子树发生变更     | `ctx.owner.on("alter", fn)`                          | 卸载/换装前广播                |
| 销毁清理         | `useEffect` 返回 cleanup / `useEvent("destroy", fn)` | cleanups 逆序执行              |
| 异步回调保护     | `ctx.wrapAsync(fn)`                                  | 签名变化即失效                 |

---

## 小结

- 挂载由 `mountCtx` 七步完成：createCtx → 设置 hooks 上下文 → 运行 setup（唯一一次）→ 接线描述符 → `signature = 1` 激活并挂到 frame → 注册事件 → 首次 render；
- 销毁由 `unmountCtx` 五步完成：cleanups 逆序执行 → 注销事件 → 销毁全部资源 → 触发 `destroy`（remove + lastToFirst）→ `signature = 0`；
- `signature` 是生命周期安全的基石：`0` 死、`1` 未渲染、`≥2` 存活且每 render 递增；`wrapAsync` 以签名快照拦截一切过期的异步回调；
- Frame 树事件补充了组件级生命周期：`created`/`alter` 描述子树就绪与变更并向上冒泡，静态 `add`/`remove` 广播全树的 frame 增删。
