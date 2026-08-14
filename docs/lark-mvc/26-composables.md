---
title: 组合式函数（Hooks）
description: Lark Mvc 组合式函数系统详解，包括 useState、useEffect、useStore、useInterval、useTimeout、useResource、useEvent、useUrlState 等全部 Hooks API
---

# 组合式函数（Hooks）

Lark Mvc 提供了一套组合式函数（Hooks）系统，用于在函数式视图的 `setup` 函数中管理状态、副作用和订阅。Hooks 的设计借鉴了 React Hooks 的理念，但在执行模型上有本质区别：**setup 函数只在视图挂载时执行一次**，而非每次渲染都重新执行。

## 核心机制：currentCtx

所有 Hooks 通过模块级变量 `currentCtx` 获取当前视图上下文。框架在 `mountCtx` 中执行 setup 函数前设置 `currentCtx`，执行完毕后立即重置为 `null`：

```ts
// 框架内部实现（view.ts → mountCtx）
export function mountCtx(
  frame: FrameObj,
  setup: ViewSetup,
  params?: unknown,
): ViewCtx {
  const ctx = createCtx(frame);

  // 设置 currentCtx，使 Hooks 可以访问 ctx
  setCurrentCtx(ctx);
  let descriptor: ReturnType<ViewSetup>;
  try {
    descriptor = setup(ctx, params);
  } finally {
    setCurrentCtx(null); // 执行完毕立即清除
  }

  // ...后续注册事件、渲染等
}
```

如果在 setup 函数外部调用任何 Hook，将抛出错误：

```
Error: Hooks can only be called inside a view setup function
```

## 与 React Hooks 的关键区别

| 特性     | React Hooks              | Lark Hooks                         |
| -------- | ------------------------ | ---------------------------------- |
| 执行时机 | 每次渲染都执行           | setup 只执行一次                   |
| 状态读取 | 闭包捕获的值（可能过期） | getter 函数始终读取最新值          |
| 依赖数组 | 控制 effect 重新执行     | `_deps` 参数仅为兼容，不触发重执行 |
| 清理时机 | 依赖变化时 + 卸载时      | 仅在视图销毁时（或 HMR 重挂载时）  |

**为什么 setup 只执行一次？** Lark 的模板是独立编译的函数，从 `updater.data` 读取数据，不依赖 setup 函数的闭包。因此 setup 无需重复执行来"刷新"闭包——getter 函数始终从 `ctx.updater.data` 中读取最新值，彻底避免了过期闭包（stale closure）问题。

---

## useState

声明视图本地状态，数据存储在 `ctx.updater.data` 中。

### 签名

```ts
function useState<T>(key: string, initial: T): [() => T, (v: T) => void];
```

### 参数

| 参数      | 类型     | 说明                         |
| --------- | -------- | ---------------------------- |
| `key`     | `string` | `updater.data` 中的数据键名  |
| `initial` | `T`      | 初始值（仅在首次调用时设置） |

### 返回值

返回 `[getter, setter]` 元组：

- **getter** `() => T`：每次调用都从 `ctx.updater.data[key]` 读取最新值
- **setter** `(v: T) => void`：写入 `ctx.updater.data` 并触发 `digest()`（即重新渲染）

### 示例

```ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./counter.html";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  const [getName, setName] = useState("name", "World");

  return {
    template,
    events: {
      "increment<click>"(e) {
        // getter 始终返回最新值，不存在过期闭包
        setCount(getCount() + 1);
      },
      "reset<click>"(e) {
        setCount(0);
        setName("Lark");
      },
    },
  };
});
```

### 实现原理

```ts
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();

  // 仅在 key 不存在时设置初始值
  const existing = ctx.updater.get<unknown>(key);
  if (existing === undefined) {
    ctx.updater.set({ [key]: initial });
  }

  const getter = (): T => ctx.updater.get<T>(key);
  const setter = (v: T): void => {
    ctx.updater.set({ [key]: v }).digest();
  };

  return [getter, setter];
}
```

getter 是一个闭包，但闭包内访问的是 `ctx.updater`（一个稳定引用），而非某个时刻的快照值。因此无论何时调用 getter，都能获得最新数据。

---

## useEffect

注册一个副作用函数，可选返回清理函数。

### 签名

```ts
function useEffect(fn: () => (() => void) | void, _deps?: unknown[]): void;
```

### 参数

| 参数    | 类型                         | 说明                                  |
| ------- | ---------------------------- | ------------------------------------- |
| `fn`    | `() => (() => void) \| void` | 副作用函数，可返回清理函数            |
| `_deps` | `unknown[]`（可选）          | 依赖数组（仅为 API 兼容，不影响行为） |

### 行为

- `fn` 在 setup 执行期间**同步调用**（非延迟到下一帧）
- 如果 `fn` 返回一个函数，该函数被推入 `ctx.cleanups` 数组
- 清理函数在视图销毁时按**逆序**执行
- `_deps` 参数不会触发 effect 重新执行（因为 setup 只运行一次）

### 示例

```ts
import { defineView, useEffect, useState } from "@mm/lark-mvc";
import template from "./timer.html";

export default defineView((ctx) => {
  const [getTime, setTime] = useState("time", Date.now());

  useEffect(() => {
    // 副作用：启动定时器
    const timer = setInterval(() => {
      setTime(Date.now());
    }, 1000);

    // 清理函数：视图销毁时自动调用
    return () => clearInterval(timer);
  });

  // 监听 WebSocket 连接
  useEffect(() => {
    const ws = new WebSocket("wss://example.com/feed");
    ws.onmessage = (event) => {
      // 处理消息...
    };

    return () => ws.close();
  });

  return { template };
});
```

### 清理执行顺序

多个 `useEffect` 的清理函数按注册的**逆序**执行（后注册先清理），确保资源依赖关系正确释放：

```ts
// view.ts → unmountCtx
for (let i = ctx.cleanups.length - 1; i >= 0; i--) {
  const cleanup = ctx.cleanups[i];
  funcWithTry(cleanup, [], null, noop);
}
```

---

## useStore

将一个 zustand 风格的 Store 绑定到视图的 updater，实现自动同步。

### 签名

```ts
function useStore<T extends object>(
  store: StoreApi<T>,
  selector?: (s: T) => Partial<T>,
): () => Partial<T>;
```

### 参数

| 参数       | 类型                           | 说明                                   |
| ---------- | ------------------------------ | -------------------------------------- |
| `store`    | `StoreApi<T>`                  | 通过 `createStore()` 创建的 Store 实例 |
| `selector` | `(s: T) => Partial<T>`（可选） | 选择器，挑选需要同步的状态子集         |

### 返回值

返回一个 getter 函数，调用时返回当前选中的状态。

### 行为

- 调用 `bindStore(ctx, store, selector)` 将 Store 状态同步到 `ctx.updater.data`
- Store 状态变化时自动调用 `updater.set().digest()` 触发视图更新
- 视图销毁时自动取消订阅（通过 `ctx.on("destroy", off)`）

### 示例

```ts
import { defineView, useStore, createStore } from "@mm/lark-mvc";
import template from "./profile.html";

// 定义 Store
const useUserStore = createStore("user", (set, get) => ({
  name: "Guest",
  age: 0,
  vip: false,
  setName: (name: string) => set({ name }),
  setAge: (age: number) => set({ age }),
}));

export default defineView((ctx) => {
  // 使用 selector 只同步 name 和 vip 字段
  const getUser = useStore(useUserStore, (s) => ({
    name: s.name,
    vip: s.vip,
  }));

  return {
    template,
    events: {
      "rename<click>"(e) {
        // 通过 Store action 修改状态
        useUserStore.getState().setName("Admin");
      },
    },
  };
});
```

### 无 selector 模式

不传 selector 时，所有非函数类型的状态键都会同步到 updater：

```ts
const getState = useStore(useUserStore);
// getState() 返回 { name: 'Guest', age: 0, vip: false }
// 不包含 setName、setAge 等函数
```

---

## useInterval

设置一个定时器（`setInterval`），视图销毁时自动清除。

### 签名

```ts
function useInterval(fn: () => void, delay: number): void;
```

### 参数

| 参数    | 类型         | 说明               |
| ------- | ------------ | ------------------ |
| `fn`    | `() => void` | 每次间隔执行的回调 |
| `delay` | `number`     | 间隔时间（毫秒）   |

### 示例

```ts
import { defineView, useInterval, useState } from "@mm/lark-mvc";
import template from "./clock.html";

export default defineView((ctx) => {
  const [getNow, setNow] = useState("now", new Date().toLocaleTimeString());

  useInterval(() => {
    setNow(new Date().toLocaleTimeString());
  }, 1000);

  return { template };
});
```

### 实现

```ts
export function useInterval(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setInterval(fn, delay);
  ctx.cleanups.push(() => clearInterval(timer));
}
```

---

## useTimeout

设置一个延时器（`setTimeout`），视图销毁时自动清除。

### 签名

```ts
function useTimeout(fn: () => void, delay: number): void;
```

### 参数

| 参数    | 类型         | 说明                 |
| ------- | ------------ | -------------------- |
| `fn`    | `() => void` | 延时结束后执行的回调 |
| `delay` | `number`     | 延时时间（毫秒）     |

### 示例

```ts
import { defineView, useTimeout, useState } from "@mm/lark-mvc";
import template from "./toast.html";

export default defineView((ctx) => {
  const [getVisible, setVisible] = useState("visible", true);

  // 3 秒后自动隐藏 Toast
  useTimeout(() => {
    setVisible(false);
  }, 3000);

  return { template };
});
```

### 注意事项

如果视图在延时到期前被销毁，回调不会执行（定时器已被清除）。这对于防止在已销毁视图上操作 DOM 非常重要。

---

## useResource

注册一个可销毁的资源对象，与视图生命周期绑定。

### 签名

```ts
function useResource(
  key: string,
  resource: unknown,
  destroyOnRender?: boolean,
): void;
```

### 参数

| 参数              | 类型                      | 说明                                |
| ----------------- | ------------------------- | ----------------------------------- |
| `key`             | `string`                  | 资源的唯一标识                      |
| `resource`        | `unknown`                 | 资源对象（需具有 `destroy()` 方法） |
| `destroyOnRender` | `boolean`（默认 `false`） | 是否在下次 `render()` 时销毁        |

### 行为

- 资源注册到 `ctx.resources[key]`
- 如果同一 key 已存在旧资源，旧资源的 `destroy()` 会先被调用
- `destroyOnRender = true`：资源在下次 `ctx.render()` 调用时被销毁
- `destroyOnRender = false`（默认）：资源仅在视图销毁时被销毁

### 示例

```ts
import { defineView, useResource } from "@mm/lark-mvc";
import template from "./chart.html";

export default defineView((ctx) => {
  // 创建图表实例，视图销毁时自动 destroy
  const chart = new ECharts(document.getElementById("chart"));
  useResource("myChart", chart);

  // 创建临时 Service 实例，每次 render 时销毁重建
  const service = createDataService();
  useResource("dataService", service.instance(), true);

  return {
    template,
    events: {
      "refresh<click>"(e) {
        ctx.render(); // 触发 render → dataService 被销毁
      },
    },
  };
});
```

### 资源销毁时机

| 场景                     | destroyOnRender=false | destroyOnRender=true |
| ------------------------ | --------------------- | -------------------- |
| `ctx.render()` 调用      | 保留                  | 销毁                 |
| 视图销毁（`unmountCtx`） | 销毁                  | 销毁                 |
| 同 key 新资源注册        | 旧资源销毁            | 旧资源销毁           |

---

## useEvent

在视图的内部事件发射器上注册事件处理器。

### 签名

```ts
function useEvent(event: string, handler: AnyFunc): void;
```

### 参数

| 参数      | 类型      | 说明                                   |
| --------- | --------- | -------------------------------------- |
| `event`   | `string`  | 事件名称（如 `"destroy"`、`"render"`） |
| `handler` | `AnyFunc` | 事件处理函数                           |

### 行为

- 通过 `ctx.on(event, handler)` 注册
- 返回的取消函数被推入 `ctx.cleanups`，视图销毁时自动取消注册

### 示例

```ts
import { defineView, useEvent } from "@mm/lark-mvc";
import template from "./panel.html";

export default defineView((ctx) => {
  // 监听视图销毁事件
  useEvent("destroy", () => {
    console.log("Panel view destroyed, cleaning up external refs...");
  });

  // 监听视图渲染事件
  useEvent("render", () => {
    console.log("Panel re-rendered");
  });

  return { template };
});
```

### 内置事件

| 事件名    | 触发时机                     |
| --------- | ---------------------------- |
| `render`  | 每次 `ctx.render()` 调用时   |
| `destroy` | 视图被卸载时（`unmountCtx`） |

---

## useUrlState

将视图状态与 URL 查询参数双向同步。

### 签名

```ts
function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void];
```

### 参数

| 参数           | 类型        | 说明                                     |
| -------------- | ----------- | ---------------------------------------- |
| `view`         | `ViewCtx`   | 当前视图上下文（用于注册 location 观察） |
| `initialState` | `S`（可选） | 各 URL 参数键的默认值                    |

### 返回值

返回 `[state, setState]` 元组：

- **state**：当前 URL 参数值与默认值的合并结果（只读）
- **setState**：更新 URL 参数。接受部分对象或更新函数，仅修改指定键，其他 URL 参数保持不变

### 行为

1. 调用 `view.observeLocation(keys)` 注册 URL 参数观察
2. 当 URL 中对应参数变化时（通过 `Router.to()` 或浏览器前进/后退），框架自动调用 `ctx.render()` 重新渲染视图
3. `setState` 内部调用 `Router.to(resolved)` 更新 URL

### 示例

```ts
import { defineView, useUrlState } from "@mm/lark-mvc";
import template from "./list.html";

export default defineView((ctx) => {
  // 声明 URL 参数及默认值
  const [state, setState] = useUrlState(ctx, {
    page: "1",
    size: "20",
    keyword: "",
  });

  // 将 URL 状态同步到模板数据
  ctx.updater
    .set({
      page: state.page,
      size: state.size,
      keyword: state.keyword,
    })
    .digest();

  return {
    template,
    events: {
      "nextPage<click>"(e) {
        // 函数式更新
        setState((prev) => ({
          page: String(Number(prev.page) + 1),
        }));
      },
      "search<click>"(e) {
        // 对象式更新
        setState({ keyword: "lark", page: "1" });
      },
    },
  };
});
```

### 实现原理

```ts
export function useUrlState<S extends Record<string, string>>(
  view: ViewCtx,
  initialState?: S,
): [Readonly<S>, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void] {
  const keys = initialState ? Object.keys(initialState) : [];

  // 注册 URL 参数观察 → 参数变化时触发 ctx.render()
  if (keys.length > 0) {
    view.observeLocation(keys);
  }

  const getState = (): S => {
    const loc = Router.parse();
    const result: Record<string, string> = { ...(initialState || {}) };
    for (const key of keys) {
      const val = loc.get(key);
      if (val) result[key] = val;
    }
    return result as S;
  };

  const setState = (patch: Partial<S> | ((prev: S) => Partial<S>)): void => {
    const current = getState();
    const resolved = typeof patch === "function" ? patch(current) : patch;
    Router.to(resolved);
  };

  return [getState(), setState];
}
```

### 路由模式兼容

`useUrlState` 同时支持 `history` 模式和 `hash` 模式：

- **history 模式**：参数在 `?page=1&size=20` 中
- **hash 模式**：参数在 `#!/list?page=1&size=20` 中

---

## 完整示例：组合使用多个 Hooks

```ts
import {
  defineView,
  useState,
  useEffect,
  useStore,
  useInterval,
  useUrlState,
  createStore,
} from "@mm/lark-mvc";
import template from "./dashboard.html";

const useMetricsStore = createStore("metrics", (set, get) => ({
  cpu: 0,
  memory: 0,
  requests: 0,
  update: (data: Partial<{ cpu: number; memory: number; requests: number }>) =>
    set(data),
}));

export default defineView((ctx) => {
  // URL 状态：控制刷新间隔
  const [urlState, setUrlState] = useUrlState(ctx, { interval: "5" });

  // 本地状态
  const [getLogs, setLogs] = useState<string[]>("logs", []);

  // Store 绑定
  const getMetrics = useStore(useMetricsStore, (s) => ({
    cpu: s.cpu,
    memory: s.memory,
  }));

  // 定时轮询
  const intervalMs = Number(urlState.interval) * 1000;
  useInterval(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(
        ctx.wrapAsync((data) => {
          useMetricsStore.getState().update(data);
          setLogs([...getLogs(), `[${new Date().toISOString()}] fetched`]);
        }),
      );
  }, intervalMs);

  // 副作用：页面可见性监听
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        console.log("Dashboard paused");
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  });

  return {
    template,
    events: {
      "changeInterval<click>"(e) {
        setUrlState({ interval: "10" });
      },
    },
  };
});
```

## 注意事项

1. **setup 只执行一次，无条件调用限制**：由于 setup 仅在挂载时运行一次（而非每次渲染），Hooks 可以安全地写在条件语句、循环中，不存在 React 那样的 Hooks 调用顺序约束；但仍建议集中在 setup 顶层以便阅读，且不要在异步回调中调用 Hooks（那时 `currentCtx` 已被重置为 `null`，会抛错）
2. **getter 而非值**：`useState` 返回的是 getter 函数，在事件处理器中应调用 `getCount()` 而非缓存 `const count = getCount()`
3. **`ctx.wrapAsync`**：异步回调应使用 `ctx.wrapAsync(fn)` 包装，确保视图销毁或重渲染后过期回调被静默丢弃
4. **`_deps` 参数无效**：`useEffect` 的第二个参数仅为 API 兼容性保留，不会触发 effect 重新执行
