---
title: 逻辑复用
description: 详解 Lark Mvc 的函数式逻辑复用模式。没有 mixin、没有继承、没有 class——通过提取共享 setup 逻辑为函数、自定义 hooks、Store 共享逻辑、组合多个关注点等模式实现优雅的代码复用。
---

# 逻辑复用

## 设计理念

Lark Mvc 采用**纯函数式**架构，没有 class、没有 prototype、没有 mixin。视图通过 `defineView()` 定义为一个 setup 函数：

```typescript
// src/view.ts
export function defineView(setup: ViewSetup): ViewSetup {
  return setup;
}
```

这意味着逻辑复用的方式与 React Hooks / Vue Composables 类似，但有一个关键区别：**Lark 的 setup 函数只执行一次**（挂载时），而非每次渲染都执行。这从根本上改变了复用的模式。

### 与其他框架的对比

| 特性     | React Hooks      | Vue Composables      | Lark Setup + Hooks                |
| -------- | ---------------- | -------------------- | --------------------------------- |
| 执行时机 | 每次渲染         | setup 一次           | setup 一次                        |
| 状态访问 | 闭包（可能过期） | ref/reactive         | getter 函数（始终最新）           |
| 依赖追踪 | deps 数组        | 自动响应式           | 手动 observeState/observeLocation |
| 清理机制 | useEffect return | onUnmounted          | useEffect return / ctx.cleanups   |
| 组合方式 | 调用多个 hooks   | 调用多个 composables | 调用多个函数/hooks                |
| 条件调用 | 禁止             | 允许                 | 允许（setup 只执行一次）          |

## Hooks 系统

Lark Mvc 提供了一套内置 hooks（`src/hooks.ts`），在 setup 函数中调用：

### useState：视图本地状态

```typescript
// src/hooks.ts
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();

  // 设置初始值（仅首次）
  const existing = ctx.updater.get<unknown>(key);
  if (existing === undefined) {
    ctx.updater.set({ [key]: initial });
  }

  // getter 始终从 updater.data 读取最新值（避免闭包过期）
  const getter = (): T => ctx.updater.get<T>(key);
  const setter = (v: T): void => {
    ctx.updater.set({ [key]: v }).digest();
  };

  return [getter, setter];
}
```

**关键设计**：返回 `[getter, setter]` 而非 `[value, setter]`。getter 是函数，每次调用都读取最新值，彻底避免了 React 中常见的闭包过期问题。

```typescript
const CounterView = defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      // 即使这个事件处理器在 setup 时创建，
      // getCount() 始终返回最新值
      "incr<click>": () => setCount(getCount() + 1),
    },
  };
});
```

### useEffect：副作用与清理

```typescript
// src/hooks.ts
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
```

与 React 不同：

- **同步执行**：在 setup 期间立即执行（不延迟到渲染后）
- **无依赖数组**：只执行一次，不存在"依赖变化重新执行"
- **清理时机**：视图销毁时统一执行所有 cleanup

```typescript
const TimerView = defineView((ctx) => {
  useEffect(() => {
    const ws = new WebSocket("wss://realtime.example.com");
    ws.onmessage = (e) => {
      ctx.updater.set({ message: e.data }).digest();
    };
    // 视图销毁时自动关闭连接
    return () => ws.close();
  });

  return { template };
});
```

### useStore：绑定外部 Store

```typescript
// src/hooks.ts
export function useStore<T extends object>(
  store: StoreApi<T>,
  selector?: (s: T) => Partial<T>,
): () => Partial<T> {
  const ctx = getCtx();
  bindStore(ctx, store, selector);

  if (selector) {
    return (): Partial<T> => selector(store.getState());
  }
  return (): Partial<T> => {
    const data = ctx.updater.get<Record<string, unknown>>();
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      if (key !== "vId" && typeof data[key] !== "function") {
        result[key] = data[key];
      }
    }
    return result as Partial<T>;
  };
}
```

### useInterval / useTimeout：定时器

```typescript
// src/hooks.ts
export function useInterval(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setInterval(fn, delay);
  ctx.cleanups.push(() => clearInterval(timer));
}

export function useTimeout(fn: () => void, delay: number): void {
  const ctx = getCtx();
  const timer = setTimeout(fn, delay);
  ctx.cleanups.push(() => clearTimeout(timer));
}
```

### useResource：资源捕获

```typescript
// src/hooks.ts
export function useResource(
  key: string,
  resource: unknown,
  destroyOnRender = false,
): void {
  const ctx = getCtx();
  ctx.capture(key, resource, destroyOnRender);
}
```

### useEvent：事件注册

```typescript
// src/hooks.ts
export function useEvent(event: string, handler: AnyFunc): void {
  const ctx = getCtx();
  const off = ctx.on(event, handler);
  ctx.cleanups.push(off);
}
```

## 自定义 Hooks 模式

将可复用的逻辑提取为独立函数，在多个视图的 setup 中调用：

### 示例：usePagination

```typescript
// hooks/use-pagination.ts
import { useState } from "@mm/lark-mvc";
import type { ViewCtx } from "@mm/lark-mvc";

interface PaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

export function usePagination(ctx: ViewCtx, options: PaginationOptions = {}) {
  const { pageSize = 20, initialPage = 1 } = options;

  const [getPage, setPage] = useState("page", initialPage);
  const [getPageSize] = useState("pageSize", pageSize);
  const [getTotal, setTotal] = useState("total", 0);

  const getTotalPages = () => Math.ceil(getTotal() / getPageSize());

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, getTotalPages()));
    setPage(clamped);
  };

  const nextPage = () => goToPage(getPage() + 1);
  const prevPage = () => goToPage(getPage() - 1);

  return {
    getPage,
    getPageSize,
    getTotal,
    setTotal,
    getTotalPages,
    goToPage,
    nextPage,
    prevPage,
  };
}
```

在视图中使用：

```typescript
const ListView = defineView((ctx) => {
  const pagination = usePagination(ctx, { pageSize: 10 });

  useEffect(() => {
    fetchList(pagination.getPage(), pagination.getPageSize()).then(
      ctx.wrapAsync((data) => {
        pagination.setTotal(data.total);
        ctx.updater.set({ items: data.items }).digest();
      }),
    );
  });

  return {
    template,
    events: {
      "next<click>": () => {
        pagination.nextPage();
        // 重新加载数据...
      },
      "prev<click>": () => {
        pagination.prevPage();
      },
    },
  };
});
```

### 示例：useFetch

```typescript
// hooks/use-fetch.ts
import { useState, useEffect } from "@mm/lark-mvc";
import type { ViewCtx } from "@mm/lark-mvc";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useFetch<T>(
  ctx: ViewCtx,
  url: string,
  options?: { immediate?: boolean },
) {
  const { immediate = true } = options ?? {};

  const [getData, setData] = useState<T | null>("fetchData", null);
  const [getLoading, setLoading] = useState("fetchLoading", immediate);
  const [getError, setError] = useState<string | null>("fetchError", null);

  const execute = (fetchUrl?: string) => {
    setLoading(true);
    setError(null);

    fetch(fetchUrl ?? url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(
        ctx.wrapAsync((data: T) => {
          setData(data);
          setLoading(false);
        }),
      )
      .catch(
        ctx.wrapAsync((err: Error) => {
          setError(err.message);
          setLoading(false);
        }),
      );
  };

  if (immediate) {
    execute();
  }

  return { getData, getLoading, getError, execute };
}
```

### 示例：useDebounce

```typescript
// hooks/use-debounce.ts
import { useEffect } from "@mm/lark-mvc";
import type { ViewCtx } from "@mm/lark-mvc";

export function useDebounce(
  ctx: ViewCtx,
  fn: (...args: unknown[]) => void,
  delay: number,
): (...args: unknown[]) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  // 视图销毁时清理未执行的定时器
  useEffect(() => {
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  return (...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
}
```

## 提取共享 Setup 逻辑为函数

对于不使用 hooks 的传统模式，可以将 setup 中的逻辑片段提取为普通函数：

### 示例：共享的位置观察逻辑

```typescript
// shared/observe-location.ts
import type { ViewCtx } from "@mm/lark-mvc";

export function setupLocationSync(ctx: ViewCtx, keys: string[]) {
  ctx.observeLocation(keys);

  return {
    assign() {
      const loc = Router.parse();
      const data: Record<string, unknown> = {};
      for (const key of keys) {
        data[key] = loc.get(key);
      }
      ctx.updater.set(data);
      return true;
    },
  };
}
```

```typescript
// 在多个视图中复用
const SearchView = defineView((ctx) => {
  const locationSync = setupLocationSync(ctx, ["keyword", "page", "sort"]);

  return {
    template,
    assign: locationSync.assign,
    events: {/* ... */},
  };
});

const FilterView = defineView((ctx) => {
  const locationSync = setupLocationSync(ctx, [
    "category",
    "price_min",
    "price_max",
  ]);

  return {
    template,
    assign: locationSync.assign,
    events: {/* ... */},
  };
});
```

### 示例：共享的事件处理模式

```typescript
// shared/form-handlers.ts
import type { ViewCtx } from "@mm/lark-mvc";

export function setupFormHandlers(ctx: ViewCtx, formKey: string) {
  const getFormData = () =>
    ctx.updater.get<Record<string, unknown>>(formKey) ?? {};

  const setField = (field: string, value: unknown) => {
    const form = getFormData();
    ctx.updater.set({ [formKey]: { ...form, [field]: value } }).digest();
  };

  const resetForm = (initial: Record<string, unknown> = {}) => {
    ctx.updater.set({ [formKey]: initial }).digest();
  };

  const validate = (rules: Record<string, (v: unknown) => string | null>) => {
    const form = getFormData();
    const errors: Record<string, string> = {};
    for (const [field, rule] of Object.entries(rules)) {
      const error = rule(form[field]);
      if (error) errors[field] = error;
    }
    ctx.updater.set({ [`${formKey}_errors`]: errors }).digest();
    return Object.keys(errors).length === 0;
  };

  return { getFormData, setField, resetForm, validate };
}
```

## Store 共享逻辑

将业务逻辑封装在 Store 中，多个视图共享同一份逻辑和状态：

```typescript
// stores/auth.ts
import { createStore, computed } from "@mm/lark-mvc";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean; // computed
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

const useAuthStore = createStore<AuthState>("auth", (set, get) => ({
  user: null,
  token: null,

  isAuthenticated: computed(["token"], () => !!get().token),

  login: async (username: string, password: string) => {
    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const { user, token } = await res.json();
    set({ user, token });
  },

  logout: () => {
    set({ user: null, token: null });
  },

  refreshToken: async () => {
    const { token } = get();
    if (!token) return;
    const res = await fetch("/api/refresh", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { token: newToken } = await res.json();
    set({ token: newToken });
  },
}));

export { useAuthStore };
```

在任意视图中使用：

```typescript
import { useStore } from "@mm/lark-mvc";
import { useAuthStore } from "../stores/auth";

const ProfileView = defineView((ctx) => {
  const getAuth = useStore(useAuthStore, (s) => ({
    user: s.user,
    isAuthenticated: s.isAuthenticated,
  }));

  return {
    template,
    events: {
      "logout<click>": () => {
        useAuthStore.getState().logout();
      },
    },
  };
});
```

## 组合多个关注点

在单个 setup 函数中组合多个独立的关注点：

```typescript
const ComplexView = defineView((ctx, params) => {
  // 关注点 1：分页
  const pagination = usePagination(ctx, { pageSize: 20 });

  // 关注点 2：数据获取
  const {
    getData,
    getLoading,
    execute: refetch,
  } = useFetch<Item[]>(ctx, `/api/items?page=${pagination.getPage()}`);

  // 关注点 3：搜索防抖
  const debouncedSearch = useDebounce(
    ctx,
    (keyword: string) => {
      ctx.updater.set({ keyword }).digest();
      refetch(`/api/items?q=${keyword}&page=1`);
    },
    300,
  );

  // 关注点 4：Store 绑定（购物车）
  const getCart = useStore(useCartStore, (s) => ({ itemCount: s.itemCount }));

  // 关注点 5：定时刷新
  useInterval(() => {
    refetch();
  }, 30000);

  // 关注点 6：URL 同步
  ctx.observeLocation(["page", "keyword"]);

  // 关注点 7：清理
  useEvent("destroy", () => {
    console.log("ComplexView destroyed, all resources cleaned up");
  });

  return {
    template,
    events: {
      "search<input>": (e) => debouncedSearch(e.target.value),
      "nextPage<click>": () => pagination.nextPage(),
      "addToCart<click>": (e) => {
        useCartStore.getState().addItem({ id: e.params.id, qty: 1 });
      },
    },
    assign() {
      // URL 变化时更新本地状态
      const loc = Router.parse();
      pagination.goToPage(Number(loc.get("page", "1")));
      return true;
    },
  };
});
```

## 高级模式：Hook 工厂

创建可配置的 hook 工厂函数：

```typescript
// hooks/create-resource-hook.ts
import type { ViewCtx } from "@mm/lark-mvc";

interface ResourceOptions<T> {
  create: () => T;
  destroy: (resource: T) => void;
  destroyOnRender?: boolean;
}

export function createResourceHook<T>(options: ResourceOptions<T>) {
  const { create, destroy, destroyOnRender = false } = options;

  return (ctx: ViewCtx, key: string): T => {
    // 检查是否已存在
    const existing = ctx.capture(key) as T | undefined;
    if (existing) return existing;

    // 创建资源
    const resource = create();

    // 包装 destroy 方法
    const wrapped = {
      ...(resource as object),
      destroy: () => destroy(resource),
    };

    ctx.capture(key, wrapped, destroyOnRender);
    return resource;
  };
}

// 使用工厂创建特定资源的 hook
const useWebSocket = createResourceHook<WebSocket>({
  create: () => new WebSocket("wss://api.example.com"),
  destroy: (ws) => ws.close(),
});

const useMapInstance = createResourceHook<MapSDK>({
  create: () => new MapSDK({ container: "map" }),
  destroy: (map) => map.destroy(),
  destroyOnRender: true,
});
```

## 与 React Hooks 的关键差异

### 1. 无闭包过期问题

```typescript
// React：闭包过期问题
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setCount(count + 1); // BUG：count 始终是 0
    }, 1000);
    return () => clearInterval(timer);
  }, []); // 空依赖
}

// Lark：getter 函数始终返回最新值
const Counter = defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  useInterval(() => {
    setCount(getCount() + 1); // 正确：getCount() 始终读取最新值
  }, 1000);
  return { template };
});
```

### 2. 无条件调用限制

```typescript
// React：禁止条件调用 hooks
function Component({ flag }) {
  if (flag) {
    const [x] = useState(0); // 违反 Rules of Hooks
  }
}

// Lark：setup 只执行一次，条件调用完全合法
const Component = defineView((ctx, params) => {
  if (params.needTimer) {
    useInterval(() => {
      /* ... */
    }, 1000);
  }
  if (params.needWebSocket) {
    useEffect(() => {
      const ws = new WebSocket(params.wsUrl);
      return () => ws.close();
    });
  }
  return { template };
});
```

### 3. 无依赖数组

```typescript
// React：需要正确管理依赖
useEffect(() => {
  fetchData(userId);
}, [userId]); // 忘记加依赖 → bug

// Lark：setup 执行一次，通过 assign/observeLocation 响应变化
const View = defineView((ctx) => {
  ctx.observeLocation(["userId"]);
  useEffect(() => {
    // 只执行一次的初始化
  });
  return {
    template,
    assign() {
      // 每次 URL 变化时调用，获取最新参数
      const userId = Router.parse().get("userId");
      ctx.updater.set({ user: fetchUser(userId) });
      return true;
    },
  };
});
```

## 最佳实践

1. **单一职责**：每个自定义 hook 只处理一个关注点
2. **命名规范**：以 `use` 开头（如 `usePagination`、`useFetch`）
3. **返回 getter 而非值**：保持与 `useState` 一致的 `[getter, setter]` 模式
4. **清理副作用**：在 `useEffect` 中返回清理函数
5. **接受 ctx 参数**：自定义 hook 的第一个参数应为 `ViewCtx`
6. **Store 用于跨视图**：视图间共享的逻辑和状态放入 Store
7. **函数用于视图内**：视图内部的逻辑复用通过提取函数实现
8. **避免过度抽象**：简单的逻辑直接写在 setup 中，不必强行提取
