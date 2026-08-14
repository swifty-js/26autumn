---
title: 响应式基础
description: 理解 Lark Mvc 显式的 digest 响应式模型：updater.set + digest 模式、useState 钩子、变更检测规则、版本追踪与批量渲染。
---

# 响应式基础

Lark Mvc 采用**显式的、基于 digest（摘要）的响应式模型**，这与 Vue 的 `Proxy` 自动追踪或 React 的重渲染模型有本质区别。在 Lark Mvc 中，数据变更不会被「魔法」般地自动侦测——你需要显式地调用 `set()` 写入数据，再调用 `digest()` 触发更新。这种设计让变更来源清晰可控、性能可预测。

> 涉及源码：
>
> - Updater：`packages/lark-mvc/src/updater.ts`（`createUpdater`）
> - 变更检测：`packages/lark-mvc/src/utils.ts`（`setData`）
> - useState 钩子：`packages/lark-mvc/src/hooks.ts`
> - 跨视图状态：`packages/lark-mvc/src/state.ts`

## 核心理念：显式 digest，而非自动代理

很多现代框架通过 `Proxy` 劫持属性的读写来「自动」追踪依赖并在数据变化时重新渲染。Lark Mvc 刻意**不**采用这种方式，而是要求开发者显式表达「我改了数据，请更新视图」：

```ts
ctx.updater.set({ count: 1 }); // 写入数据，记录变更
ctx.updater.digest(); // 触发 digest，按需重新渲染
```

这种「显式 digest」模型的优点：

- **变更来源可追溯**：每一次视图更新都对应一次明确的 `digest()` 调用，没有隐式的副作用。
- **无代理开销**：数据就是普通对象，没有 `Proxy` 包装，读写无额外成本。
- **批量可控**：多次 `set()` 可以累积变更，一次 `digest()` 统一提交，天然支持批量渲染。

## Updater：每视图的数据绑定核心

每个视图都有一个专属的 Updater 实例，由 `createUpdater(viewId)` 工厂函数创建（见 `updater.ts`）。它管理视图本地数据、追踪变更，并在需要时触发 DOM Diff。

Updater 的内部状态全部由闭包变量持有（无 class、无 this）：

```ts
let data: Record<string, unknown> = { vId: viewId }; // 当前数据
const refData: Record<string, unknown> = {}; // 引用数据（模板 {{@}} 用）
let changedKeys = new Set<string>(); // 当前 digest 周期变更的键
let hasChangedFlag = 0; // 自上次 digest 以来是否有变更
let version = 0; // 单调递增的版本号
```

`createUpdater` 返回的 API 对象（`UpdaterApi`）包含：

| 方法                                  | 说明                                                |
| ------------------------------------- | --------------------------------------------------- |
| `get<T>(key?)`                        | 读取指定键的值，省略 key 返回整个数据对象           |
| `set(data, excludes?)`                | 浅合并数据并追踪变更键，返回 API 自身以支持链式调用 |
| `digest(data?, excludes?, callback?)` | 可选地合并数据后，若有变更则触发渲染                |
| `forceDigest()`                       | 无论数据是否变化都强制全量重渲染                    |
| `snapshot()`                          | 记录当前版本号，供 `altered()` 比较                 |
| `altered()`                           | 检查自上次 `snapshot()` 以来版本是否变化            |
| `getChangedKeys()`                    | 获取自上次成功渲染以来变更的键集合                  |
| `translate(value)`                    | 将 SPLITTER 前缀的引用 token 还原为原始 JS 值       |
| `parse(expr)`                         | 安全地解析点路径（`a.b.c`）或数字字面量             |
| `refData`                             | 引用数据对象（属性）                                |

## set + digest 模式

### set：写入并追踪变更

`set(newData, excludes?)` 将 `newData` 浅合并进数据对象，同时追踪哪些键发生了变化：

```ts
function set(
  newData: Record<string, unknown>,
  excludes?: ReadonlySet<string>,
): UpdaterApi {
  const changed = setData(
    newData,
    data,
    changedKeys,
    excludes || EMPTY_STRING_SET,
  );
  if (changed) {
    version++; // 有键变化 → 版本号递增
    hasChangedFlag = 1;
  }
  return api; // 返回自身以支持链式调用
}
```

注意：`set` 只是**记录**变更，并不会立即触发渲染。

### digest：提交变更并渲染

`digest()` 可选地先合并数据，然后检查是否有变更，有则触发渲染：

```ts
function digest(
  newData?: Record<string, unknown>,
  excludes?: ReadonlySet<string>,
  callback?: () => void,
): void {
  if (newData) {
    set(newData, excludes);
  }
  if (callback) {
    digestingQueue.push(callback);
  }
  // 若已在 digest 中，则排队稍后处理（支持重入）
  if (digestingQueue.length > 0 && digestingQueue[0] === null) {
    return;
  }
  runDigest(digestingQueue);
}
```

常见用法：

```ts
// 写法一：先 set 再 digest
ctx.updater.set({ name: "Alice", age: 30 });
ctx.updater.digest();

// 写法二：set + digest 一步完成
ctx.updater.digest({ count: 1 });

// 写法三：链式调用
ctx.updater.set({ name: "Alice" }).digest();

// 写法四：digest 完成后执行回调
ctx.updater.digest({ list: newList }, undefined, () => {
  console.log("rendered");
});
```

### digest 的可重入性

`digest()` 支持在 digest 过程中再次被调用。内部用一个队列 `digestingQueue` 与 `null` 哨兵标记当前 digest 周期的边界：

```ts
const digestingQueue: (DigestCallback | null)[] = [];
```

当 `runDigest` 执行时，会先压入 `null` 哨兵。若此时再次调用 `digest()`，检测到 `digestingQueue[0] === null`，便将回调入队并直接返回，避免递归渲染。当前周期结束后，再统一处理队列中的后续 digest 与回调。

### 渲染条件

`runDigest` 内部并非只要 `hasChangedFlag` 为真就渲染，还需满足一系列条件（见 `updater.ts`）：

```ts
if (changed && view && node && view.signature.value > 0 && frame) {
  // 条件满足 → 重置脏标记，执行渲染
  hasChangedFlag = 0;
  changedKeys = new Set();
  const template = view.getTemplate();
  if (typeof template === "function") {
    const result = template(data, viewId, refData);
    // 字符串模式或 VDOM 模式的 Diff ...
  }
}
```

即需要同时满足：

- 有数据变更（`changed`）；
- 视图实例已就绪（`view`）；
- 对应 DOM 节点存在（`node`）；
- 视图处于激活状态（`signature.value > 0`）；
- 所属 Frame 存在（`frame`）。

> 关键细节：若条件不满足（例如挂载初期 `frame.view` 尚未接线），框架**不会**重置 `hasChangedFlag`，从而保留脏标记，确保下一次 `digest()` 能真正渲染。这避免了变更被静默吞掉。

## useState 钩子

`useState` 是在 setup 函数中声明视图本地状态的推荐方式。它本质上是对 `ctx.updater.data` 的封装，返回一个 `[getter, setter]` 对（见 `hooks.ts`）：

```ts
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();

  // 首次调用时设置初始值
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

### getter：始终读取最新值

getter 是一个函数，每次调用都从 `ctx.updater.data[key]` 读取**当前**值。这与 React 的 `useState` 返回值有本质区别——React 返回的是渲染时捕获的快照值，容易在事件处理器中产生「过期闭包」；而 Lark Mvc 的 getter 永远是最新的：

```ts
const [getCount, setCount] = useState("count", 0);

// 即使在异步回调或事件处理器中，getCount() 也总是最新值
"increment<click>"() {
  setCount(getCount() + 1);
}
```

### setter：写入并触发 digest

setter 写入数据并立即触发 `digest()`，从而重新渲染视图：

```ts
const setter = (v: T): void => {
  ctx.updater.set({ [key]: v }).digest();
};
```

### 与 React Hooks 的关键区别

> Lark Mvc 的 setup 函数仅在挂载时执行**一次**（而非每次渲染都执行）。`useState` 返回 `[getter, setter]`，getter 始终从 `ctx.updater.data` 读取，避免过期闭包。模板（由 `.html` 编译而来）独立地从 `updater.data` 读取数据，与 setup 函数的闭包无关。

## 变更检测规则

变更检测的核心是 `utils.ts` 中的 `setData` 函数。它遍历新数据的每个键，与旧值比较，决定该键是否「变化」：

```ts
export function setData(
  newData: Record<string, unknown>,
  oldData: Record<string, unknown>,
  changedKeys: Set<string>,
  excludes: ReadonlySet<string>,
): boolean {
  let changed = false;
  for (const p in newData) {
    if (hasOwnProperty(newData, p)) {
      const now = newData[p];
      const old = oldData[p];
      if ((!isPrimitiveOrFunc(now) || old !== now) && !excludes.has(p)) {
        changedKeys.add(p);
        changed = true;
      }
      oldData[p] = now;
    }
  }
  return changed;
}
```

判定规则可以拆解为：

### 1. 原始值：按 `!==` 比较

对于原始值（数字、字符串、布尔、`null` 等）和函数，只有当 `old !== now`（引用/值不相等）时才视为变化：

```ts
ctx.updater.set({ count: 1 });
ctx.updater.set({ count: 1 }); // 值相同 → 不视为变化，不触发渲染
ctx.updater.set({ count: 2 }); // 值不同 → 视为变化
```

### 2. 对象/数组：始终视为变化

关键判定 `!isPrimitiveOrFunc(now)`：只要新值**不是**原始值或函数（即是对象/数组），就**始终**视为变化，无论其引用是否相同。其中：

```ts
function isPrimitiveOrFunc(value: unknown): boolean {
  return !value || (typeof value !== "object" && typeof value !== "function");
}
```

这意味着：

```ts
const list = [1, 2, 3];
ctx.updater.set({ list }); // 对象 → 视为变化
ctx.updater.set({ list }); // 同一引用 → 仍视为变化
ctx.updater.set({ list: list }); // 原地修改后重设 → 视为变化
```

> 设计取舍：对象采用「始终变化」策略，避免了深度比较的高昂成本，也避免了「原地修改对象但引用不变导致视图不更新」的常见陷阱。代价是即使对象引用未变也会触发该键的更新——但由于 DOM Diff 引擎会做 key 化比对，最终落到真实 DOM 上的操作仍是最小集。

### 3. excludes：排除变更追踪

`set` 与 `digest` 都接受可选的 `excludes: ReadonlySet<string>` 参数，用于跳过某些键的变更追踪。被排除的键仍会写入数据，但不会加入 `changedKeys`、不会触发渲染：

```ts
ctx.updater.set({ internal: 123 }, new Set(["internal"]));
```

## changedKeys 累积与批量渲染

`changedKeys` 是一个 `Set<string>`，在 digest 周期内累积所有变更的键。由于 `set()` 不会重置它，多次 `set()` 会持续累积，直到 `digest()` 成功渲染后才清空：

```ts
ctx.updater.set({ a: 1 }); // changedKeys: {a}
ctx.updater.set({ b: 2 }); // changedKeys: {a, b}
ctx.updater.set({ c: 3 }); // changedKeys: {a, b, c}
ctx.updater.digest(); // 一次性渲染，changedKeys 重置为空
```

这就是**批量渲染**：多个数据变更合并为一次 DOM 更新，避免中间状态的多次重渲染。

变更键集合会传递给 Diff 引擎，用于精准判断哪些子视图/区域需要更新。可通过 `getChangedKeys()` 读取：

```ts
const keys: ReadonlySet<string> = ctx.updater.getChangedKeys();
```

## 版本追踪：snapshot 与 altered

Updater 维护一个单调递增的 `version` 计数器，每当数据**实际**变化（`set` 检测到变更）时递增。配合 `snapshot()` 与 `altered()`，可以判断某段逻辑执行前后数据是否发生过变化：

```ts
function snapshot(): UpdaterApi {
  snapshotVersion = version;
  return api;
}

function altered(): boolean | undefined {
  if (snapshotVersion === undefined) return undefined;
  return version !== snapshotVersion;
}
```

典型用法是在 `assign()` 函数中：开头调用 `snapshot()` 记录版本，结尾返回 `ctx.updater.altered()`，框架据此决定是否需要重新渲染：

```ts
export default defineView((ctx) => {
  return {
    template,
    assign(options) {
      ctx.updater.snapshot();
      // ... 根据 options 计算并 set 数据 ...
      ctx.updater.set({ derived: compute(options) });
      return ctx.updater.altered(); // 数据变了才重渲染
    },
  };
});
```

`altered()` 的返回值含义：

- `true`：自 `snapshot()` 以来版本变化（数据有变更）；
- `false`：版本未变；
- `undefined`：从未调用过 `snapshot()`。

## forceDigest：强制全量重渲染

`forceDigest()` 将当前所有数据键标记为变更，然后触发 digest，无论数据是否真的变化：

```ts
function forceDigest(): void {
  hasChangedFlag = 1;
  changedKeys = new Set(Object.keys(data));
  digest();
}
```

它主要被 HMR 使用：当模板被热替换但数据保持不变时，单纯的 `digest()` 不会重渲染（因为数据没变），此时需要 `forceDigest()` 用新模板重新渲染保留的数据。

## 跨视图响应式：State

`State` 是用于**简单跨视图共享数据**的单例（见 `state.ts`），同样采用显式 digest 模型：

```ts
import { State } from "@mm/lark-mvc";

// 写入 + digest
State.set({ count: 1, title: "Hello" });
State.digest(); // 触发 changed 事件，通知观察的视图

// 读取
const count = State.get("count");
const all = State.get(); // 整个状态对象

// 上次 digest 变更的键
const keys = State.diff(); // ReadonlySet<string>
```

`State.digest()` 会批量提交：多次 `set()` 累积变更键，一次 `digest()` 触发一个携带全部变更键的 `changed` 事件。

在视图中观察 State 键，当其变化时视图自动重渲染：

```ts
export default defineView((ctx) => {
  // 声明观察的键
  ctx.observeState("count,title");

  // 视图销毁时自动清理（引用计数）
  State.clean("count,title")(ctx);

  return { template };
});
```

当 `count` 或 `title` 通过 `State.digest()` 变化时，框架的变更分发器（`dispatcherUpdate`）会遍历 Frame 树，调用观察了这些键的视图的 `render()`。

> State 适合轻量共享值（计数器、开关、页面标题、会话信息等）。对于带处理器、派生数据或细粒度订阅的**复杂**响应式状态，请改用 `createStore`。

## 完整示例：一个计数器视图

综合以上概念，一个完整的计数器视图如下：

```ts
// counter.ts
import { defineView, useState, useEffect } from "@mm/lark-mvc";
import template from "./counter.html";

export default defineView((ctx, params) => {
  // 视图本地状态
  const [getCount, setCount] = useState("count", 0);
  const [getStep, setStep] = useState("step", 1);

  // 副作用：每秒记录一次，销毁时自动清理
  useEffect(() => {
    const timer = setInterval(() => {
      console.log("current count:", getCount());
    }, 1000);
    return () => clearInterval(timer);
  });

  return {
    template,
    events: {
      "increment<click>"() {
        // getter 总是最新值，无过期闭包
        setCount(getCount() + getStep());
      },
      "reset<click>"() {
        // 直接使用 updater 的 set + digest
        ctx.updater.set({ count: 0 }).digest();
      },
      "setStep<click>"() {
        setStep(5);
      },
    },
  };
});
```

```html
<!-- counter.html -->
<div class="counter">
  <p>Count: {{=count}} (step: {{=step}})</p>
  <button @click="increment()">+{{=step}}</button>
  <button @click="setStep()">Set step to 5</button>
  <button @click="reset()">Reset</button>
</div>
```

数据流向：

1. 点击按钮触发事件处理器；
2. 处理器调用 `setCount` / `ctx.updater.set().digest()`；
3. Updater 检测到 `count` 变化，加入 `changedKeys`，递增 `version`；
4. `digest()` 调用模板函数 `(data, viewId, refData) => string` 产出新 HTML；
5. DOM Diff 引擎比对并最小化更新真实 DOM。

## 小结

- Lark Mvc 采用**显式 digest** 响应式模型，不依赖 `Proxy` 自动追踪，变更来源清晰可控。
- 每个视图有专属 Updater，通过 `set()` 记录变更、`digest()` 提交渲染。
- `useState` 返回 `[getter, setter]`，getter 始终读取最新值，避免过期闭包；setup 仅执行一次。
- 变更检测：原始值按 `!==` 比较，对象/数组始终视为变化，可通过 `excludes` 排除。
- `changedKeys` 在 digest 周期内累积，支持批量渲染；`version` + `snapshot`/`altered` 提供版本追踪。
- `State` 将同样的显式 digest 模型扩展到跨视图共享数据。

至此，你已掌握 Lark Mvc 的响应式核心机制。结合 [模板语法](./04-template-syntax.md)，即可理解从数据变更到 DOM 更新的完整链路。
