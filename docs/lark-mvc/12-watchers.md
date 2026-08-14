---
title: 侦听器
description: 全面讲解 Lark Mvc 的侦听（Watch）体系：Store.subscribe 订阅、State.on("changed") 全局侦听、observeState/observeLocation 声明式观察、useEvent 生命周期侦听，以及框架 dispatcher 如何按 key 精确匹配并驱动视图重渲染。
---

# 侦听器

## 概述

"侦听"回答的是一个核心问题：**当某处数据发生变化时，谁需要被通知、以何种粒度被通知？**

Lark Mvc 提供了四个层次的侦听机制，从手动到声明式、从全局到视图局部，层层递进：

| 层次            | API                           | 通知粒度                        | 典型场景                 |
| --------------- | ----------------------------- | ------------------------------- | ------------------------ |
| Store 订阅      | `store.subscribe(listener)`   | 每次 `setState`                 | 跨视图复杂状态、派生数据 |
| 全局 State 侦听 | `State.on("changed", fn)`     | 每次 `digest`，携带 `keys` 集合 | 手动响应任意 key 变化    |
| 视图状态观察    | `ctx.observeState(keys)`      | 声明的 key 命中即重渲染         | 视图随 State 自动刷新    |
| 视图路由观察    | `ctx.observeLocation(params)` | 声明的 URL 参数命中即重渲染     | 视图随 URL 自动刷新      |

贯穿后三者的，是 `framework.ts` 中的 **dispatcher 机制**：它在 `State.digest()` 或路由 `changed` 事件触发后，遍历整棵 Frame 树，把"本次变化的 key 集合"与"每个视图声明观察的 key 集合"做交集匹配，命中者调用 `render()`。这是一套**按 key 精确匹配、而非全量广播**的更新调度。

---

## 一、Store 订阅：store.subscribe

### 1.1 基本用法

`store.ts` 中的 `createStore` 返回的 `StoreApi` 暴露了 `subscribe` 方法：

```ts
// src/store.ts（节选）
const subscribe = (listener: Listener<T>): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
```

listener 的签名是 `(state: T, prevState: T) => void`——同时拿到新状态与旧状态，便于做差异判断：

```ts
import { createStore } from "@mm/lark-mvc";

const useCartStore = createStore("cart", (set, get) => ({
  items: [] as string[],
  add(item: string) {
    set({ items: [...get().items, item] });
  },
}));

// 任意位置订阅
const unsubscribe = useCartStore.subscribe((state, prevState) => {
  if (state.items.length !== prevState.items.length) {
    console.log(
      "购物车数量变化：",
      prevState.items.length,
      "→",
      state.items.length,
    );
  }
});

// 不再需要时取消
unsubscribe();
```

### 1.2 触发时机与去抖语义

订阅并非"每次 `setState` 都触发"。`setState` 内部先用 `Object.is` 逐 key 比对，**没有任何值真正变化时直接 return，listener 不会被调用**：

```ts
// src/store.ts（节选）
const setState = (partial) => {
  if (destroyed) return;
  const prevState = state;
  const resolved = typeof partial === "function" ? partial(prevState) : partial;

  const nextState = { ...prevState };
  let changed = false;

  for (const key in resolved) {
    if (
      Object.prototype.hasOwnProperty.call(resolved, key) &&
      !computedKeys.has(key) &&
      !actionKeys.has(key)
    ) {
      const newVal = Reflect.get(resolved, key);
      if (!Object.is(Reflect.get(prevState, key), newVal)) {
        Reflect.set(nextState, key, newVal);
        changed = true;
      }
    }
  }

  if (!changed) return; // ← 无变化，静默退出

  state = nextState as T;
  recomputeIfNeeded(prevState); // ← 先重算 computed

  for (const listener of listeners) {
    listener(state, prevState); // ← 再通知订阅者
  }
};
```

两个值得注意的细节：

1. **computed 先于 listener 重算**——`recomputeIfNeeded` 在通知前执行，订阅者永远看到"状态 + 派生值"的一致快照；
2. **action 与 computed key 不可写**——对它们的写入被静默忽略，不会触发通知。

### 1.3 在视图中订阅：useStore 与 bindStore

手动 `subscribe` 需要手动 `unsubscribe`，否则视图销毁后 listener 泄漏。`hooks.ts` 的 `useStore` 解决了这个问题——它内部调用 `store.ts` 的 `bindStore`：

```ts
// src/store.ts（节选）
export function bindStore<T>(
  view: unknown,
  store: StoreApi<T>,
  selector?: (state: T) => Record<string, unknown>,
): () => void {
  if (!isLarkView(view)) return () => {};

  const extract = (s: T): Record<string, unknown> => {
    if (selector) return selector(s);
    const result: Record<string, unknown> = {};
    for (const key in s) {
      if (
        Object.prototype.hasOwnProperty.call(s, key) &&
        typeof s[key] !== "function"
      ) {
        result[key] = s[key];
      }
    }
    return result;
  };

  // 初始同步
  view.updater.set(extract(store.getState()));
  view.updater.digest();

  const off = store.subscribe((state) => {
    view.updater.set(extract(state));
    view.updater.digest();
  });

  view.on("destroy", off); // ← 视图销毁时自动退订

  return off;
}
```

`bindStore` 做了三件事：

1. **初始同步**——立即把 store 状态（经 selector 筛选或剔除函数 key）灌入视图的 `updater.data` 并 digest 一次；
2. **持续订阅**——store 每次变化，同步 + digest，视图自动重渲染；
3. **生命周期绑定**——`view.on("destroy", off)` 把退订函数挂到视图的 `destroy` 事件上，视图销毁即自动清理。

在 setup 中的用法：

```ts
import { defineView, useStore } from "@mm/lark-mvc";
import { useCartStore } from "./stores/cart";
import template from "./cart-bar.html";

export default defineView((ctx) => {
  // 只同步 count 相关的 key，避免无关状态触发本视图重渲染
  const getCart = useStore(useCartStore, (s) => ({ count: s.items.length }));

  return {
    template,
    events: {
      "add<click>"() {
        useCartStore.getState().add("apple");
      },
    },
  };
});
```

> **selector 的意义**：不传 selector 时，store 的**所有非函数 key** 都会同步进 updater——任何 key 变化都会触发本视图 digest。传入 selector 后，只有被选中的 key 进入视图数据，相当于手动收窄了侦听范围。

---

## 二、全局 State 侦听：State.on("changed")

### 2.1 State 的写入-通知模型

`State`（`state.ts`）是一个全局单例的可观察数据对象，采用"先 `set` 累积、后 `digest` 广播"的两步模型：

```ts
// src/state.ts（节选）
digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void {
  if (data) {
    State.set(data, excludes);
  }
  if (dataIsChanged) {
    dataIsChanged = false;
    const keys = changedKeys;
    stashedChangedKeys = keys;   // ← 暂存，供 diff() 读取
    changedKeys = new Set();
    emitter.fire(RouterEvents.CHANGED, { keys });   // ← 触发 "changed" 事件
  }
},
```

多次 `set()` 的变更 key 会在 `changedKeys` 集合中累积，一次 `digest()` 把它们合并成**一个** `changed` 事件广播出去——天然批处理，避免中间态抖动。

### 2.2 手动侦听

```ts
import { State } from "@mm/lark-mvc";

State.on("changed", (e) => {
  // e.keys 是本次 digest 变化的 key 集合（ReadonlySet<string>）
  if (e?.keys?.has("userInfo")) {
    console.log("用户信息已更新：", State.get("userInfo"));
  }
});
```

事件对象上的 `keys` 来自 `ChangeEvent` 类型定义（`types.ts`）：

```ts
export interface ChangeEvent {
  readonly type: string;
  readonly keys?: ReadonlySet<string>;
}
```

配合 `State.diff()` 还能读到"最近一次 digest 变化了哪些 key"：

```ts
const changed = State.diff(); // ReadonlySet<string>
```

### 2.3 引用计数清理：State.clean

State 中的 key 由谁负责回收？`State.clean` 给出了引用计数方案：

```ts
// src/state.ts（节选）
clean(keys: string): (ctx: { on: (event: string, handler: () => void) => void }) => void {
  return (ctx) => {
    const keyList = setupKeysRef(keys);
    ctx.on("destroy", () => {
      teardownKeysRef(keyList);
    });
  };
},
```

每个 key 被一个视图观察时引用计数 +1，视图销毁时 -1；当计数归零，该 key 的数据从 `appData` 中删除，防止内存泄漏。在 setup 中的标准用法：

```ts
export default defineView((ctx) => {
  State.clean("userInfo,theme")(ctx); // 声明本视图持有这些 key
  ctx.updater.set({ userInfo: State.get("userInfo") }).digest();
  return { template };
});
```

---

## 三、声明式观察：observeState

### 3.1 用法

手动 `State.on` 需要自己写"判断 key → 更新视图"的逻辑。`ctx.observeState` 把这一切变成一行声明：

```ts
export default defineView((ctx) => {
  // 声明：userInfo 或 theme 变化时，本视图自动重渲染
  ctx.observeState("userInfo,theme");
  // 也接受数组形式：ctx.observeState(["userInfo", "theme"]);

  ctx.updater.set({
    userInfo: State.get("userInfo"),
    theme: State.get("theme"),
  });

  return { template };
});
```

其实现只是把 key 列表存进 ctx：

```ts
// src/view.ts（节选）
function observeState(keys: string | string[]): void {
  if (typeof keys === "string") {
    mutable.observedStateKeys = keys.split(",");
  } else {
    mutable.observedStateKeys = keys;
  }
}
```

真正的"观察"动作发生在框架的 dispatcher 里（见第五节）。

### 3.2 重渲染时如何拿到新值

dispatcher 触发的是 `ctx.render()`，render 会重新执行模板。因此**在模板或 render 流程中现读 `State.get()`** 即可拿到最新值。常见写法是在 `assign` 或模板里读取：

```ts
export default defineView((ctx) => {
  ctx.observeState("userInfo");

  return {
    template,
    assign() {
      ctx.updater.snapshot();
      ctx.updater.set({ userInfo: State.get("userInfo") });
      return ctx.updater.altered();
    },
  };
});
```

---

## 四、声明式观察：observeLocation

### 4.1 用法

URL 参数是 Lark 的一等状态载体。`ctx.observeLocation` 声明本视图关心哪些 URL 参数：

```ts
export default defineView((ctx) => {
  // 字符串形式
  ctx.observeLocation("page,size");

  // 数组形式
  ctx.observeLocation(["page", "size"]);

  // 对象形式：同时观察 path 变化
  ctx.observeLocation({ params: ["page", "size"], path: true });

  // 第二个参数：是否观察 path
  ctx.observeLocation("page", true);

  return { template };
});
```

实现上，它填充 ctx 的 `locationObserved` 结构：

```ts
// src/view.ts（节选）
function observeLocation(
  params: string | string[] | Record<string, unknown>,
  observePath = false,
): void {
  locationObserved.flag = 1;

  if (typeof params === "object" && !Array.isArray(params)) {
    const opts = params;
    if (opts["path"]) {
      observePath = true;
    }
    const paramKeys = opts["params"];
    if (typeof paramKeys === "string" || Array.isArray(paramKeys)) {
      params = paramKeys;
    }
  }

  locationObserved.observePath = observePath;

  if (params) {
    if (typeof params === "string") {
      locationObserved.keys = params.split(",");
    } else if (Array.isArray(params)) {
      locationObserved.keys = params;
    }
  }
}
```

对应的类型（`types.ts`）：

```ts
export interface ViewLocationObserved {
  flag: number; // 是否启用观察
  keys: string[]; // 观察的参数 key
  observePath: boolean; // 是否观察 path 变化
}
```

当 `Router.to({ page: 2 })` 或浏览器前进/后退导致 URL 变化时，dispatcher 会检查 `Router.diff()` 的结果：只要 `path` 变了（且视图声明了 `observePath`），或任一观察的参数 key 出现在 diff 的 `params` 中，视图就会重渲染。

### 4.2 useUrlState：观察 + 读写的组合拳

`url-state.ts` 的 `useUrlState` 在内部自动调用了 `observeLocation`：

```ts
// src/url-state.ts（节选）
export function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void] {
  const keys = initialState ? Object.keys(initialState) : [];

  if (keys.length > 0) {
    view.observeLocation(keys); // ← 自动声明观察
  }
  // ...
}
```

```ts
export default defineView((ctx) => {
  const [state, setState] = useUrlState(ctx, { page: "1", size: "20" });
  ctx.updater.set({ page: state.page, size: state.size }).digest();

  return {
    template,
    events: {
      "nextPage<click>"() {
        setState((prev) => ({ page: String(Number(prev.page) + 1) }));
        // URL 变化 → dispatcher → 本视图自动重渲染
      },
    },
  };
});
```

---

## 五、dispatcher：按 key 匹配的更新调度

`observeState` / `observeLocation` 本身只是"登记"，真正的调度发生在 `framework.ts`。

### 5.1 事件入口

`Framework.boot()` 时，dispatcher 被挂到两个事件源上：

```ts
// src/framework.ts（节选）
// 路由变化
Router.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
  if (data) dispatcherNotifyChange(data);
});

// State 变化
State.on(RouterEvents.CHANGED, (data?: ChangeEvent) => {
  if (data) dispatcherNotifyChange(data);
});
```

### 5.2 分流：换视图 vs 刷视图

```ts
// src/framework.ts（节选）
function dispatcherNotifyChange(e: ChangeEvent): void {
  const rootFrame = Frame.getRoot();
  if (!rootFrame) return;

  if ("view" in e && e.view !== undefined) {
    // 路由的 view 变了 → 整体换视图
    const viewPath = /* 解析 e.view */;
    rootFrame.mountView(viewPath);
  } else {
    // 参数/状态变化 → 遍历 Frame 树，精确通知
    dispatcherUpdateTag++;
    dispatcherUpdate(rootFrame, e.keys);
  }
}
```

路由切换导致 `view` 变化时，直接重新挂载根视图；否则进入 `dispatcherUpdate` 的逐视图匹配流程。

### 5.3 key 匹配：stateIsObserveChanged 与 viewIsObserveChanged

匹配逻辑是两个简洁的交集判断：

```ts
// src/framework.ts（节选）
function stateIsObserveChanged(
  view: ViewCtx,
  stateKeys: ReadonlySet<string>,
): boolean {
  const observedKeys = view.getObservedStateKeys();
  if (!observedKeys) return false;
  for (const key of observedKeys) {
    if (stateKeys.has(key)) return true; // 观察的 key ∩ 变化的 key ≠ ∅
  }
  return false;
}

function viewIsObserveChanged(view: ViewCtx): boolean {
  const loc = view.locationObserved;
  let result = false;

  if (loc.flag) {
    if (loc.observePath) {
      const lastChanged = Router.diff();
      result = !!lastChanged?.path;
    }
    if (!result && loc.keys.length) {
      const lastChanged = Router.diff();
      const changedParams = lastChanged?.params;
      if (changedParams) {
        for (const key of loc.keys) {
          result = hasOwnProperty(changedParams, key);
          if (result) break;
        }
      }
    }
  }
  return result;
}
```

State 场景用事件携带的 `e.keys` 做匹配；路由场景则读取 `Router.diff()` 暂存的变化明细。

### 5.4 遍历 Frame 树：迭代式深度优先

```ts
// src/framework.ts（节选）
function dispatcherUpdate(
  frame: FrameObj,
  stateKeys?: ReadonlySet<string>,
): void {
  const stack: FrameObj[] = [frame];

  const drain = (s: FrameObj[]): void => {
    while (s.length > 0) {
      const current = s.pop();
      if (!current) continue;
      const view = current.view;

      if (
        !view ||
        current.dispatcherUpdateTag === dispatcherUpdateTag || // 本轮已访问
        view.signature.value <= 1 // 未激活/已销毁
      ) {
        continue;
      }
      current.dispatcherUpdateTag = dispatcherUpdateTag;

      const isChanged = stateKeys
        ? stateIsObserveChanged(view, stateKeys)
        : viewIsObserveChanged(view);

      if (isChanged) {
        funcWithTry(view.renderMethod ?? view.render, [], view, noop);
      }

      // 子 frame 继续入栈
      const children = current.children();
      for (let i = children.length - 1; i >= 0; i--) {
        const child = Frame.get(children[i]);
        if (child) s.push(child);
      }
    }
  };

  drain(stack);
}
```

三个设计要点：

1. **显式 LIFO 栈替代递归**——深层嵌套的 Frame 树不会撑爆 JS 调用栈；
2. **dispatcherUpdateTag 去重**——每轮调度 `tag++`，访问过的 frame 打上标记，避免重复渲染；
3. **signature 守卫**——`signature.value <= 1` 的视图（尚未完成首次渲染或已销毁）被跳过。

### 5.5 完整链路图

```
State.set({userInfo}).digest()
        │
        ▼
emitter.fire("changed", { keys: {userInfo} })
        │
        ▼  （boot 时注册的监听）
dispatcherNotifyChange(e)
        │
        ▼
dispatcherUpdate(rootFrame, e.keys)
        │  遍历 Frame 树
        ▼
stateIsObserveChanged(view, keys)
   视图声明 observeState("userInfo") ?
        │ 命中
        ▼
view.render() → signature++ → fire("render") → updater.digest() → DOM diff
```

---

## 六、useEvent：生命周期与自定义事件侦听

`hooks.ts` 的 `useEvent` 把事件侦听挂到视图的内部 emitter 上，并自动随视图销毁而解绑：

```ts
// src/hooks.ts（节选）
export function useEvent(event: string, handler: AnyFunc): void {
  const ctx = getCtx();
  const off = ctx.on(event, handler);
  ctx.cleanups.push(off); // ← 销毁时自动 off
}
```

框架内建的生命周期事件有两个：`render`（每次渲染前）与 `destroy`（销毁时）。

```ts
export default defineView((ctx) => {
  useEvent("render", () => {
    console.log("视图即将渲染，当前 signature：", ctx.signature.value);
  });

  useEvent("destroy", () => {
    console.log("视图已销毁");
  });

  return { template };
});
```

`ctx.on` 的返回值本身就是退订函数（`view.ts`）：

```ts
function on(event: string, handler: AnyFunc): () => void {
  emitter.on(event, handler);
  return () => emitter.off(event, handler);
}
```

`useEvent` 只是把它收进了 `cleanups` 数组——这个数组在 `unmountCtx` 中被**逆序执行**，保证侦听器按注册的相反顺序清理。

`useEvent` 同样适用于 Frame 级自定义事件（`frame.on("created", ...)` 等），只要传入对应的 emitter 宿主即可。

---

## 七、选型建议

| 需求                             | 推荐方案                                       |
| -------------------------------- | ---------------------------------------------- |
| 视图随几个 State key 自动刷新    | `ctx.observeState("a,b")`                      |
| 视图随 URL 参数自动刷新          | `ctx.observeLocation("page")` 或 `useUrlState` |
| 跨视图共享带 action 的复杂状态   | `createStore` + `useStore(store, selector)`    |
| 需要在变化时执行副作用（非渲染） | `store.subscribe` 或 `State.on("changed")`     |
| 侦听视图自身生命周期             | `useEvent("destroy", fn)`                      |
| 父视图侦听子视图自定义事件       | `e-lark-*` 属性绑定（见《组件基础》）          |

一条经验法则：**能用声明式观察（observeState/observeLocation）就不要手写订阅**——前者由 dispatcher 统一调度、自动去重、随视图销毁自动失效；手动订阅则必须自己管理退订时机，否则就是内存泄漏。

---

## 小结

- `store.subscribe(listener)` 提供 `(state, prevState)` 双参通知，`Object.is` 无变化时不触发，computed 先于 listener 重算；
- `State.on("changed")` 接收批处理后的 key 集合，`State.clean` 以引用计数管理 key 的回收；
- `observeState` / `observeLocation` 是声明式登记，真正的调度由 `framework.ts` 的 dispatcher 完成；
- dispatcher 用迭代式深度优先遍历 Frame 树，以"观察 key ∩ 变化 key"的交集判断决定是否 `render()`，并以 `dispatcherUpdateTag` 防止重复渲染；
- `useEvent` 把侦听器的清理托管给视图的 `cleanups`，销毁时逆序执行。
