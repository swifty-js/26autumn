---
title: 依赖注入
description: 详解 Lark Mvc 中跨视图数据共享与依赖传递的替代方案。Lark 没有显式的 provide/inject 机制，而是通过 State 单例、createStore、Frame 树遍历、frame.invoke()、ctx.capture/release 等机制实现灵活的跨视图通信。
---

# 依赖注入

## 概述

Lark Mvc **没有** Vue 的 `provide/inject` 或 React 的 `Context API` 这样的显式依赖注入系统。这一设计选择基于以下考量：

- Lark 的视图是独立的运行时单元，不依赖组件树的隐式上下文传递
- 显式的数据流比隐式注入更易追踪和调试
- Frame 树提供了结构化的视图关系访问

Lark 提供了多种替代方案来实现跨视图的数据共享和方法调用：

| 方案                | 适用场景             | 复杂度 |
| ------------------- | -------------------- | ------ |
| State 单例          | 简单的全局共享数据   | 低     |
| createStore         | 复杂的响应式共享状态 | 中     |
| frame.parent()      | 访问祖先视图         | 低     |
| frame.invoke()      | 跨视图方法调用       | 中     |
| ctx.capture/release | 资源生命周期管理     | 中     |
| Props 传递          | 父→子单向数据流      | 低     |

## State 单例：全局共享数据

`State`（`src/state.ts`）是最简单的跨视图数据共享方案，适用于轻量级全局数据（计数器、开关、页面标题、会话信息等）。

### 核心 API

```typescript
export const State: StateApi = {
  // 读取数据
  get<T = unknown>(key?: string): T,

  // 写入数据（累积变更，不立即通知）
  set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): typeof State,

  // 触发变更通知（批量分发）
  digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void,

  // 获取最近一次 digest 中变更的 key 集合
  diff(): ReadonlySet<string>,

  // 创建清理函数（引用计数，自动回收）
  clean(keys: string): (ctx: { on: (event: string, handler: () => void) => void }) => void,

  // 事件监听
  on(event: string, handler: (e?: ChangeEvent) => void): typeof State,
  off(event: string, handler?: AnyFunc): typeof State,
};
```

### 基本用法

```typescript
// 写入方：用户登录后设置全局用户信息
function onLoginSuccess(user: UserInfo) {
  State.set({
    currentUser: user,
    isLoggedIn: true,
    loginTime: Date.now(),
  });
  State.digest(); // 触发所有观察者更新
}
```

```typescript
// 读取方：导航栏视图观察用户状态
const NavBarView = defineView((ctx) => {
  // 声明观察的 State keys
  ctx.observeState("currentUser,isLoggedIn");

  // 注册清理（视图销毁时自动减少引用计数）
  State.clean("currentUser,isLoggedIn")(ctx);

  return {
    template: navTemplate,
    assign() {
      // 每次渲染时从 State 读取最新数据
      ctx.updater.set({
        user: State.get("currentUser"),
        loggedIn: State.get("isLoggedIn"),
      });
    },
  };
});
```

### 引用计数与自动回收

`State.clean()` 实现了引用计数机制，防止内存泄漏：

```typescript
// src/state.ts 内部实现
function setupKeysRef(keys: string): string[] {
  const keyList = keys.split(",");
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      keyRefCounts[key]++;
    } else {
      keyRefCounts[key] = 1;
    }
  }
  return keyList;
}

function teardownKeysRef(keyList: string[]): void {
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      const count = --keyRefCounts[key];
      if (count <= 0) {
        // 最后一个观察者销毁时，自动清理数据
        Reflect.deleteProperty(keyRefCounts, key);
        Reflect.deleteProperty(appData, key);
      }
    }
  }
}
```

当所有观察某个 key 的视图都被销毁后，该 key 的数据会被自动从内存中移除。

### 批量更新

多次 `set()` 调用会累积变更，一次 `digest()` 统一分发：

```typescript
// 多次 set 只触发一次通知
State.set({ theme: "dark" });
State.set({ fontSize: 14 });
State.set({ sidebarCollapsed: true });
State.digest(); // 一次性通知所有观察者，keys = {"theme", "fontSize", "sidebarCollapsed"}
```

## createStore：复杂响应式状态

对于需要 actions、派生数据、细粒度订阅的复杂场景，使用 `createStore`（`src/store.ts`）：

### 创建 Store

```typescript
import { createStore, computed } from "@mm/lark-mvc";

interface CartState {
  items: CartItem[];
  discount: number;
  total: number; // computed
  itemCount: number; // computed
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

const useCartStore = createStore<CartState>("cart", (set, get) => ({
  // 状态
  items: [],
  discount: 0,

  // 派生状态（自动重算）
  total: computed(["items", "discount"], () => {
    const { items, discount } = get();
    const sum = items.reduce((acc, item) => acc + item.price * item.qty, 0);
    return sum * (1 - discount);
  }),
  itemCount: computed(["items"], () => {
    return get().items.reduce((acc, item) => acc + item.qty, 0);
  }),

  // Actions
  addItem: (item: CartItem) => {
    const { items } = get();
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      set({
        items: items.map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + item.qty } : i,
        ),
      });
    } else {
      set({ items: [...items, item] });
    }
  },
  removeItem: (id: string) => {
    set({ items: get().items.filter((i) => i.id !== id) });
  },
  clear: () => set({ items: [], discount: 0 }),
}));
```

### 在视图中绑定 Store

通过 `useStore` hook 将 Store 绑定到视图：

```typescript
import { useStore } from "@mm/lark-mvc";

const CartBadge = defineView((ctx) => {
  // 绑定 store，自动同步到 updater.data，视图销毁时自动取消订阅
  const getCart = useStore(useCartStore, (s) => ({
    itemCount: s.itemCount,
    total: s.total,
  }));

  return {
    template: cartBadgeTemplate,
    events: {
      "clear<click>": () => {
        useCartStore.getState().clear();
      },
    },
  };
});
```

### Store 的内部机制

```typescript
// src/store.ts — setState 核心逻辑
const setState = (partial: Partial<T> | ((prev: T) => Partial<T>)): void => {
  if (destroyed) return;
  const prevState = state;
  const resolved = typeof partial === "function" ? partial(prevState) : partial;

  const nextState = { ...prevState };
  let changed = false;

  for (const key in resolved) {
    if (
      Object.prototype.hasOwnProperty.call(resolved, key) &&
      !computedKeys.has(key) && // 跳过 computed 属性
      !actionKeys.has(key) // 跳过 action 方法
    ) {
      const newVal = Reflect.get(resolved, key);
      if (!Object.is(Reflect.get(prevState, key), newVal)) {
        Reflect.set(nextState, key, newVal);
        changed = true;
      }
    }
  }

  if (!changed) return; // 无变化则不通知

  state = nextState as T;
  recomputeIfNeeded(prevState); // 重算依赖变更的 computed

  for (const listener of listeners) {
    listener(state, prevState);
  }
};
```

## Frame 树遍历：frame.parent()

`frame.parent(level)` 允许子视图沿 Frame 树向上查找祖先：

```typescript
// src/frame.ts
parent(level = 1): FrameObj | undefined {
  let result: FrameObj | undefined = undefined;
  let currentPid: string | undefined = frame.parentId;
  let n = level >>> 0 || 1;
  while (currentPid && n--) {
    result = frameRegistry.get(currentPid);
    currentPid = result?.parentId;
  }
  return result;
}
```

### 使用示例

```typescript
const DeepChildView = defineView((ctx) => {
  // 获取直接父 frame
  const parentFrame = ctx.owner.parent(1);

  // 获取祖父 frame（向上两级）
  const grandparentFrame = ctx.owner.parent(2);

  // 访问父视图的数据
  const parentData = parentFrame?.view?.updater.get("sharedConfig");

  return {
    template,
  };
});
```

### 适用场景

- 深层嵌套视图需要访问顶层布局视图的配置
- 跳过中间层直接与应用级视图通信
- 运行时动态发现视图层级关系

## frame.invoke()：跨视图方法调用

`frame.invoke()` 提供了跨视图的方法调用能力，支持延迟执行：

```typescript
// src/frame.ts
invoke(name: string, args?: unknown[]): unknown {
  let result: unknown;
  const currentView = frame.view;

  if (currentView && currentView.rendered.value) {
    // 视图已渲染，直接调用
    const fn = Reflect.get(currentView, name);
    if (typeof fn === "function") {
      result = funcWithTry(fn, args ?? [], currentView, noop);
    }
  } else {
    // 视图未渲染，加入延迟队列
    const newEntry: FrameInvokeEntry = {
      name,
      args: args ?? [],
      key: SPLITTER + name,
    };
    frame.invokeList.push(newEntry);
  }

  return result;
}
```

### 使用示例

```typescript
// 父视图调用子视图的方法
const ParentView = defineView((ctx) => {
  return {
    template,
    events: {
      "refreshChild<click>": () => {
        const childFrame = Frame.get("child_zone_id");
        if (childFrame) {
          // 如果子视图已渲染，立即执行
          // 如果未渲染，加入队列等待渲染后执行
          childFrame.invoke("refreshData", [{ force: true }]);
        }
      },
    },
  };
});
```

```typescript
// 子视图暴露方法
const ChildView = defineView((ctx) => {
  // 在 ctx 上挂载可被 invoke 的方法
  Reflect.set(ctx, "refreshData", (options: { force: boolean }) => {
    // 执行刷新逻辑
    ctx.updater.set({ data: fetchData(options.force) }).digest();
  });

  return { template };
});
```

### 延迟执行机制

当目标视图尚未完成渲染时，`invoke` 会将调用加入 `invokeList` 队列。视图渲染完成后，`runInvokes` 会按顺序执行队列中的调用：

```typescript
// src/view.ts
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

## ctx.capture/release：资源生命周期管理

`capture/release` 提供了与视图生命周期绑定的资源管理，可用于跨视图资源共享：

```typescript
// src/view.ts — capture 实现
function capture(
  key: string,
  resource?: unknown,
  destroyOnRender = false,
): unknown {
  if (resource !== undefined) {
    destroyResource(resources, key, true, resource);
    resources[key] = { entity: resource, destroyOnRender };
  } else {
    const entry = resources[key];
    return entry ? entry.entity : undefined;
  }
  return resource;
}

function release(key: string, destroy = true): unknown {
  return destroyResource(resources, key, destroy);
}
```

### 使用示例：共享 Service 实例

```typescript
// 父视图创建并捕获资源
const ParentView = defineView((ctx) => {
  // 创建一个 WebSocket 连接，绑定到视图生命周期
  const ws = new WebSocket("wss://api.example.com/realtime");
  ctx.capture("realtime_ws", {
    connection: ws,
    destroy() {
      ws.close();
    },
  });

  return { template };
});
```

```typescript
// 子视图通过父 frame 访问共享资源
const ChildView = defineView((ctx) => {
  const parentFrame = ctx.owner.parent(1);
  const parentView = parentFrame?.view;

  // 读取父视图捕获的资源
  const wsResource = parentView?.capture("realtime_ws") as {
    connection: WebSocket;
  };

  useEffect(() => {
    if (wsResource?.connection) {
      const handler = (event: MessageEvent) => {
        ctx.updater.set({ message: event.data }).digest();
      };
      wsResource.connection.addEventListener("message", handler);
      return () =>
        wsResource.connection.removeEventListener("message", handler);
    }
  });

  return { template };
});
```

### destroyOnRender 选项

设置 `destroyOnRender = true` 的资源会在视图每次 `render()` 时被销毁：

```typescript
// 临时资源：每次渲染后销毁
ctx.capture("tempAnimation", animationInstance, true);

// 持久资源：仅在视图销毁时销毁（默认）
ctx.capture("dbConnection", connection, false);
```

## 避免 Props 逐层传递的模式

### 模式一：State 替代多层 Props

```typescript
// 不推荐：Props 逐层传递
// grandparent → parent → child → grandchild

// 推荐：使用 State 全局共享
// 顶层写入
State.set({ appTheme: "dark", locale: "zh-CN" });
State.digest();

// 任意深层视图直接读取
const DeepView = defineView((ctx) => {
  ctx.observeState("appTheme,locale");
  State.clean("appTheme,locale")(ctx);

  return {
    template,
    assign() {
      ctx.updater.set({
        theme: State.get("appTheme"),
        locale: State.get("locale"),
      });
    },
  };
});
```

### 模式二：Store 替代复杂 Context

```typescript
// 创建全局 Store（应用级）
const useAppStore = createStore("app", (set, get) => ({
  user: null as User | null,
  permissions: [] as string[],
  hasPermission: (perm: string) => get().permissions.includes(perm),
  setUser: (user: User) => set({ user }),
  setPermissions: (perms: string[]) => set({ permissions: perms }),
}));

// 任意视图直接使用，无需层层传递
const AdminPanel = defineView((ctx) => {
  const getApp = useStore(useAppStore, (s) => ({
    user: s.user,
    permissions: s.permissions,
  }));

  return { template };
});
```

### 模式三：Frame 树直接访问

```typescript
// 子视图直接访问应用根视图的数据
const AnyDeepView = defineView((ctx) => {
  // 获取根 frame
  const rootFrame = Frame.getRoot();
  const rootView = rootFrame?.view;

  // 读取根视图的共享配置
  const appConfig = rootView?.updater.get("appConfig");

  return { template };
});
```

## 方案选择指南

```
需要跨视图共享数据？
├── 简单的键值数据（标题、开关、计数）→ State
├── 复杂状态（actions、派生数据、多实例）→ createStore
├── 父→子单向传递 → p-lark-* Props
├── 子→父通信 → e-lark-* 事件 / frame.fire()
├── 跨层级方法调用 → frame.invoke()
├── 访问特定祖先 → frame.parent(level)
└── 共享资源实例（连接、观察者）→ ctx.capture/release
```

## 注意事项

1. **State 是全局单例**：所有视图共享同一份数据，注意 key 命名避免冲突
2. **Store 需要手动销毁**：不再使用的 Store 应调用 `destroy()` 释放监听器
3. **frame.parent() 依赖视图层级**：视图结构变化可能导致层级关系改变
4. **invoke 的延迟队列**：目标视图销毁时队列会被清空，不会执行过期调用
5. **capture 的资源必须有 destroy 方法**：框架在视图销毁时自动调用 `destroy()`
