---
title: 状态管理
description: Lark Mvc 双状态管理系统完整指南，涵盖 State 单例（引用计数、批量摘要）与 createStore（Zustand 风格、computed 派生、bindStore 视图绑定）
---

# 状态管理

Lark Mvc 提供两套互补的状态管理系统：

- **State**：轻量级全局共享数据单例，适合简单的跨视图数据共享
- **createStore**：Zustand 风格的独立状态容器，适合复杂的响应式状态管理

## State 单例

`State` 是一个全局可观察的内存数据对象，用于跨视图的轻量数据共享（计数器、开关、页面标题、会话信息等）。

### 核心 API

#### State.get(key?)

读取状态数据：

```ts
import { State } from "@mm/lark-mvc";

// 读取单个键
const count = State.get<number>("count");

// 读取整个状态对象
const allData = State.get<Record<string, unknown>>();
```

#### State.set(data, excludes?)

写入状态数据（不触发通知）：

```ts
// 设置单个值
State.set({ count: 10 });

// 批量设置
State.set({
  userName: "Alice",
  isLoggedIn: true,
  theme: "dark",
});

// 排除某些键的变更追踪
State.set({ tempData: "x" }, new Set(["tempData"]));
```

`set()` 返回 `State` 本身，支持链式调用。多次 `set()` 会累积变更键，直到 `digest()` 统一触发。

#### State.digest(data?, excludes?)

检测数据变更并触发 `changed` 事件：

```ts
// 先 set 再 digest
State.set({ count: State.get<number>("count") + 1 });
State.digest();

// 或合并为一步
State.digest({ count: 5, name: "Bob" });
```

`digest()` 的批处理机制：

- 多次 `set()` 累积所有变更键
- 单次 `digest()` 触发一个 `changed` 事件，包含所有变更键
- 避免中间状态导致的不必要重渲染

#### State.diff()

获取最近一次 `digest()` 中变更的键集合：

```ts
const changedKeys = State.diff();
// ReadonlySet<string>，例如 new Set(["count", "name"])
```

#### State.clean(keys)

创建状态键的清理函数，实现引用计数管理：

```ts
// 在视图 setup 中使用
const cleanup = State.clean("count,userName");
cleanup(ctx); // 注册到视图的 destroy 事件
```

#### State.on(event, handler) / State.off(event, handler?)

事件监听：

```ts
State.on("changed", (e) => {
  console.log("变更的键:", e.keys);
});
```

### 引用计数机制

State 通过引用计数管理键的生命周期，防止内存泄漏：

```ts
// 视图 A 观察 "count"
// keyRefCounts["count"] = 1

// 视图 B 也观察 "count"
// keyRefCounts["count"] = 2

// 视图 A 销毁
// keyRefCounts["count"] = 1（数据保留）

// 视图 B 销毁
// keyRefCounts["count"] = 0 → 删除 appData["count"]（自动回收）
```

内部实现：

```ts
// setupKeysRef：视图创建时递增引用计数
function setupKeysRef(keys: string): string[] {
  const keyList = keys.split(",");
  for (const key of keyList) {
    keyRefCounts[key] = (keyRefCounts[key] || 0) + 1;
  }
  return keyList;
}

// teardownKeysRef：视图销毁时递减，归零则删除数据
function teardownKeysRef(keyList: string[]): void {
  for (const key of keyList) {
    if (--keyRefCounts[key] <= 0) {
      delete keyRefCounts[key];
      delete appData[key]; // 自动回收
    }
  }
}
```

### 在视图中使用 State

通过 `ctx.observeState()` 声明观察的键：

```ts
import { defineView } from "@mm/lark-mvc";

export default defineView((ctx) => {
  // 声明观察 count 和 theme 两个键
  ctx.observeState("count,theme");

  // 注册清理（引用计数）
  State.clean("count,theme")(ctx);

  return {
    template: (data) => `
      <div>
        <span>计数: ${data.count}</span>
        <span>主题: ${data.theme}</span>
      </div>
    `,
    assign() {
      ctx.updater.set({
        count: State.get("count"),
        theme: State.get("theme"),
      });
      return true;
    },
  };
});
```

当 `State.digest()` 触发且变更键包含被观察的键时，框架自动调用视图的 `render()`。

### 批量操作模式

```ts
// 正确：批量 set + 单次 digest
State.set({ page: 2 });
State.set({ size: 20 });
State.set({ sort: "name" });
State.digest(); // 只触发一次 changed 事件

// 错误：每次 set 后都 digest（触发多次渲染）
State.set({ page: 2 });
State.digest();
State.set({ size: 20 });
State.digest();
```

## createStore（Zustand 风格）

`createStore` 提供独立的、Zustand 对齐的状态容器，适合复杂的响应式状态：派生数据、动作函数、多实例隔离。

### 创建 Store

```ts
import { createStore, computed } from "@mm/lark-mvc";

interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>;
  filter: "all" | "active" | "done";
  // 派生状态
  filteredTodos: Array<{ id: number; text: string; done: boolean }>;
  activeCount: number;
  // 动作
  addTodo: (text: string) => void;
  toggleTodo: (id: number) => void;
  setFilter: (f: "all" | "active" | "done") => void;
}

const useTodoStore = createStore<TodoState>("todo", (set, get) => ({
  // 初始状态
  todos: [],
  filter: "all",

  // 派生状态（computed）
  filteredTodos: computed(["todos", "filter"], () => {
    const { todos, filter } = get();
    if (filter === "all") return todos;
    return todos.filter((t) => (filter === "done" ? t.done : !t.done));
  }),

  activeCount: computed(["todos"], () => {
    return get().todos.filter((t) => !t.done).length;
  }),

  // 动作（函数）
  addTodo(text: string) {
    set({ todos: [...get().todos, { id: Date.now(), text, done: false }] });
  },

  toggleTodo(id: number) {
    set({
      todos: get().todos.map((t) =>
        t.id === id ? { ...t, done: !t.done } : t,
      ),
    });
  },

  setFilter(f: "all" | "active" | "done") {
    set({ filter: f });
  },
}));
```

### Store 初始化规则

`creator` 函数返回的对象中：

| 值类型               | 处理方式                                   |
| -------------------- | ------------------------------------------ |
| `computed(deps, fn)` | 注册为派生属性，自动重算                   |
| `function`           | 注册为动作（action），不受 `setState` 影响 |
| 其他值               | 作为初始状态                               |

### StoreApi 接口

```ts
interface StoreApi<T> {
  getState(): T;
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prevState: T) => void): () => void;
  destroy(): void;
}
```

#### getState()

读取当前状态快照：

```ts
const state = useTodoStore.getState();
console.log(state.todos);
console.log(state.activeCount); // computed 值
```

#### setState(partial | updater)

浅合并状态并通知监听器：

```ts
// 对象形式
useTodoStore.setState({ filter: "active" });

// 函数形式（基于前一个状态）
useTodoStore.setState((prev) => ({
  todos: [...prev.todos, newTodo],
}));
```

重要规则：

- 使用 `Object.is` 比较，值未变化时不通知监听器
- 写入 computed 键会被静默忽略
- 写入 action 键会被静默忽略
- Store 销毁后 `setState` 为空操作

#### subscribe(listener)

订阅状态变化，返回取消订阅函数：

```ts
const unsubscribe = useTodoStore.subscribe((state, prevState) => {
  console.log("状态变化:", state, prevState);
});

// 取消订阅
unsubscribe();
```

#### destroy()

销毁 Store：清除所有监听器，从全局注册表移除，后续 `setState` 为空操作：

```ts
useTodoStore.destroy();
```

### computed 派生状态

`computed(deps, fn)` 声明派生属性：

```ts
import { computed } from "@mm/lark-mvc";

const store = createStore("counter", (set, get) => ({
  count: 0,
  step: 1,

  // 依赖 count 和 step
  nextValue: computed(["count", "step"], () => {
    return get().count + get().step;
  }),

  // 依赖 count
  doubled: computed(["count"], () => get().count * 2),
}));
```

工作机制：

1. 初始化时执行一次 `fn()` 计算初始值
2. 每次 `setState` 后检查 `deps` 中的键是否变化
3. 如有变化，重新执行 `fn()` 更新派生值
4. 重算在通知监听器**之前**完成——监听器始终看到一致的状态

```ts
store.setState({ count: 5 });
// 内部流程：
// 1. 合并 count: 5
// 2. 检测 deps ["count"] 变化
// 3. 重算 nextValue = 5 + 1 = 6, doubled = 10
// 4. 通知监听器（此时 state 已包含最新 computed 值）
```

### Actions 作为函数

Store 中的函数自动识别为 actions：

```ts
const store = createStore("cart", (set, get) => ({
  items: [],
  total: computed(["items"], () =>
    get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
  ),

  // 动作函数
  addItem(item) {
    set({ items: [...get().items, item] });
  },
  removeItem(id) {
    set({ items: get().items.filter((i) => i.id !== id) });
  },
  clear() {
    set({ items: [] });
  },
}));

// 调用动作
store.getState().addItem({ id: 1, name: "Book", price: 29.9, qty: 1 });
```

Actions 特性：

- 附加到 state 对象上，可通过 `getState()` 访问
- `setState` 无法覆盖 action 键
- 内部通过 `set` / `get` 闭包操作状态

### storeRegistry

所有 Store 通过名称注册到全局注册表：

```ts
// createStore 时自动注册
const store = createStore("myStore", (set, get) => ({ ... }));
// storeRegistry.set("myStore", store)

// destroy 时自动移除
store.destroy();
// storeRegistry.delete("myStore")
```

## bindStore 视图绑定

`bindStore` 将 Store 状态同步到 Lark View 的 updater：

```ts
import { bindStore } from "@mm/lark-mvc";

// 在视图 setup 中
export default defineView((ctx) => {
  // 绑定整个 store（仅同步非函数键）
  bindStore(ctx, useTodoStore);

  // 或使用 selector 选择部分状态
  bindStore(ctx, useTodoStore, (s) => ({
    todos: s.filteredTodos,
    count: s.activeCount,
  }));

  return {
    template: (data) => `...`,
  };
});
```

`bindStore` 工作流程：

1. 初始同步：立即将 store 状态写入 `view.updater` 并 digest
2. 订阅变更：store 每次变化时自动同步到 updater
3. 自动清理：视图销毁时自动取消订阅

### useStore Hook

在 setup 函数中更便捷的绑定方式：

```ts
import { defineView, useStore } from "@mm/lark-mvc";

export default defineView((ctx) => {
  // 绑定并获取 getter
  const getTodoState = useStore(useTodoStore, (s) => ({
    todos: s.filteredTodos,
    activeCount: s.activeCount,
  }));

  return {
    template: (data) => `
      <div>
        <span>待办: ${data.activeCount}</span>
        <ul>${data.todos.map((t) => `<li>${t.text}</li>`).join("")}</ul>
      </div>
    `,
    events: {
      "add<click>": () => {
        useTodoStore.getState().addTodo("新任务");
      },
    },
  };
});
```

## 何时使用哪个系统

### 使用 State 的场景

- 简单的全局共享值（主题、语言、登录状态）
- 少量键的跨视图通信
- 无需派生数据或复杂逻辑
- 需要自动引用计数和内存回收

```ts
// 典型 State 用法
State.set({ theme: "dark", lang: "zh-CN" });
State.digest();
```

### 使用 createStore 的场景

- 需要派生/计算状态
- 包含业务逻辑的动作函数
- 多实例隔离（不同页面独立状态）
- 复杂的状态转换逻辑
- 需要精确的订阅控制

```ts
// 典型 Store 用法
const useUserStore = createStore("user", (set, get) => ({
  user: null,
  permissions: [],
  canEdit: computed(["permissions"], () => get().permissions.includes("edit")),
  async login(credentials) {
    const user = await api.login(credentials);
    set({ user, permissions: user.permissions });
  },
  logout() {
    set({ user: null, permissions: [] });
  },
}));
```

### 使用视图本地状态（useState）的场景

- 仅当前视图使用的 UI 状态
- 表单输入、展开/折叠、加载状态
- 无需跨视图共享

```ts
const [getOpen, setOpen] = useState("isOpen", false);
```

## 复杂状态管理模式

### 模式一：Store + computed 实现购物车

```ts
const useCartStore = createStore("cart", (set, get) => ({
  items: [] as CartItem[],
  discount: 0,

  subtotal: computed(["items"], () =>
    get().items.reduce((s, i) => s + i.price * i.qty, 0),
  ),
  total: computed(["items", "discount"], () => {
    const subtotal = get().items.reduce((s, i) => s + i.price * i.qty, 0);
    return subtotal * (1 - get().discount);
  }),
  itemCount: computed(["items"], () =>
    get().items.reduce((s, i) => s + i.qty, 0),
  ),

  addItem(item: CartItem) {
    const existing = get().items.find((i) => i.id === item.id);
    if (existing) {
      set({
        items: get().items.map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i,
        ),
      });
    } else {
      set({ items: [...get().items, { ...item, qty: 1 }] });
    }
  },
}));
```

### 模式二：State + Store 协作

```ts
// 全局会话信息用 State（简单、自动回收）
State.set({ sessionId: "abc123", userId: "u001" });
State.digest();

// 复杂业务数据用 Store
const useOrderStore = createStore("order", (set, get) => ({
  orders: [],
  loading: false,

  async fetchOrders() {
    set({ loading: true });
    const userId = State.get<string>("userId");
    const orders = await api.getOrders(userId);
    set({ orders, loading: false });
  },
}));
```

### 模式三：多视图共享 Store

```ts
// store.ts（模块级单例）
export const useCountStore = createStore("count", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),
  increment() {
    set({ count: get().count + 1 });
  },
}));

// view-a.ts
export default defineView((ctx) => {
  useStore(useCountStore, (s) => ({ count: s.count }));
  return {
    template: (d) => `<span>${d.count}</span>`,
    events: { "inc<click>": () => useCountStore.getState().increment() },
  };
});

// view-b.ts（自动同步）
export default defineView((ctx) => {
  useStore(useCountStore, (s) => ({ doubled: s.doubled }));
  return {
    template: (d) => `<span>双倍: ${d.doubled}</span>`,
  };
});
```

## 性能注意事项

1. **State 批量操作**：多次 `set()` + 单次 `digest()`，避免多次渲染
2. **Store selector**：使用 `bindStore` 的 selector 参数只同步需要的键
3. **computed 依赖精确**：`deps` 只列出真正依赖的键，避免无关变更触发重算
4. **避免循环依赖**：computed 的 `fn` 中不要调用 `setState`
5. **及时销毁**：不再使用的 Store 调用 `destroy()` 释放资源
