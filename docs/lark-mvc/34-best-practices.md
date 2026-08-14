---
title: 最佳实践
description: Lark Mvc 开发最佳实践，涵盖函数式组合模式、状态选型策略、避免闭包陷阱、useEffect 清理、签名感知异步、视图拆分策略与性能模式
---

# 最佳实践

本文档汇总 Lark Mvc 开发中的最佳实践，帮助编写可维护、高性能、无 Bug 的应用代码。

## 函数式组合模式

Lark Mvc 的视图系统完全基于函数式组合——无 `class`、无 `this`、无 `prototype`、无 `mixin`。所有 API 通过闭包访问。

### 视图定义模式

```ts
import { defineView, useState, useEffect, useStore } from "@mm/lark-mvc";

export default defineView((ctx, params) => {
  // 1. 声明状态
  const [getCount, setCount] = useState("count", 0);
  const [getLoading, setLoading] = useState("loading", false);

  // 2. 声明副作用
  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  });

  // 3. 声明观察
  ctx.observeLocation("page,size");
  ctx.observeState("theme");

  // 4. 返回模板和事件
  return {
    template: (data) => `<div>...</div>`,
    events: {
      "incr<click>": () => setCount(getCount() + 1),
    },
    assign(options) {
      // 路由变化时的数据更新逻辑
      ctx.updater.snapshot();
      ctx.updater.set({ page: Router.parse().get("page") });
      return ctx.updater.altered();
    },
  };
});
```

### 组合函数抽取

将可复用逻辑抽取为独立函数：

```ts
// composables/use-pagination.ts
export function usePagination(ctx: ViewCtx, defaultSize = 20) {
  const [getPage, setPage] = useState("page", 1);
  const [getSize, setSize] = useState("size", defaultSize);
  const [getTotal, setTotal] = useState("total", 0);

  ctx.observeLocation("page,size");

  const totalPages = () => Math.ceil(getTotal() / getSize());

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages()));
    Router.to({ page: clamped });
  };

  return {
    getPage,
    setPage,
    getSize,
    getTotal,
    setTotal,
    totalPages,
    goToPage,
  };
}

// views/list.ts
export default defineView((ctx) => {
  const { getPage, getSize, setTotal, goToPage } = usePagination(ctx);

  return {
    template: (data) => `...`,
    events: {
      "next<click>": () => goToPage(getPage() + 1),
      "prev<click>": () => goToPage(getPage() - 1),
    },
  };
});
```

## 状态选型策略

### 决策树

```
需要跨视图共享？
├── 否 → 使用 useState（视图本地状态）
└── 是 → 需要派生数据或动作函数？
    ├── 否 → 数据量大或需要精确订阅？
    │   ├── 否 → 使用 State（简单共享值）
    │   └── 是 → 使用 createStore
    └── 是 → 使用 createStore
```

### useState：视图本地状态

适合仅当前视图使用的 UI 状态：

```ts
// 适合：表单输入、展开/折叠、加载指示器
const [getOpen, setOpen] = useState("isDropdownOpen", false);
const [getKeyword, setKeyword] = useState("searchKeyword", "");
const [getLoading, setLoading] = useState("isLoading", false);
```

### State：简单全局共享

适合少量键的跨视图通信：

```ts
// 适合：主题、语言、登录状态、全局配置
State.set({ theme: "dark", locale: "zh-CN" });
State.digest();

// 视图中观察
ctx.observeState("theme");
State.clean("theme")(ctx);
```

### createStore：复杂响应式状态

适合包含业务逻辑的状态容器：

```ts
// 适合：购物车、用户会话、数据列表 + 筛选 + 排序
const useListStore = createStore("list", (set, get) => ({
  items: [],
  filter: "",
  filtered: computed(["items", "filter"], () => {
    const { items, filter } = get();
    return filter ? items.filter((i) => i.name.includes(filter)) : items;
  }),
  setFilter(f: string) {
    set({ filter: f });
  },
  async load() {
    const items = await api.getList();
    set({ items });
  },
}));
```

## 避免闭包陷阱（Getter 模式）

### 问题：过期闭包

Lark 的 setup 函数只执行一次。如果在事件处理器中直接捕获变量值，会得到过期数据：

```ts
// 错误：count 在 setup 时固定为 0
export default defineView((ctx) => {
  let count = 0; // 闭包捕获的是初始值

  return {
    template: (data) => `<button @click="incr()">count: ${data.count}</button>`,
    events: {
      "incr<click>": () => {
        count++; // 这个 count 永远是 setup 时的引用
        ctx.updater.set({ count }).digest();
      },
    },
  };
});
```

### 解决：使用 Getter 函数

`useState` 返回 `[getter, setter]` 对，getter 始终从 `updater.data` 读取最新值：

```ts
// 正确：getCount() 每次调用都读取最新值
export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template: (data) => `<button @click="incr()">count: ${data.count}</button>`,
    events: {
      "incr<click>": () => {
        setCount(getCount() + 1); // getCount() 总是最新值
      },
    },
  };
});
```

### 原理

```ts
// useState 内部实现
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();
  if (ctx.updater.get(key) === undefined) {
    ctx.updater.set({ [key]: initial });
  }
  // getter 通过闭包引用 ctx.updater，每次调用读取实时数据
  const getter = (): T => ctx.updater.get<T>(key);
  const setter = (v: T): void => {
    ctx.updater.set({ [key]: v }).digest();
  };
  return [getter, setter];
}
```

### Store 中的 Getter

Store 的 `get()` 函数同理——始终返回最新状态：

```ts
const store = createStore("counter", (set, get) => ({
  count: 0,
  // 正确：通过 get() 读取最新值
  increment() {
    set({ count: get().count + 1 });
  },
  // 错误：不要缓存 state 引用
  // const cachedCount = get().count; ← 在 action 外部缓存会过期
}));
```

## useEffect 正确清理

### 基本规则

`useEffect` 在 setup 时同步执行，返回的清理函数在视图销毁时调用：

```ts
// 正确：清理定时器
useEffect(() => {
  const timer = setInterval(() => {
    ctx.updater.set({ time: Date.now() }).digest();
  }, 1000);
  return () => clearInterval(timer);
});

// 正确：清理事件监听
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
});

// 正确：清理 AbortController
useEffect(() => {
  const controller = new AbortController();
  fetch("/api/data", { signal: controller.signal })
    .then((res) => res.json())
    .then((data) => ctx.updater.set({ data }).digest());
  return () => controller.abort();
});
```

### 常见错误

```ts
// 错误：忘记清理，导致内存泄漏
useEffect(() => {
  setInterval(tick, 1000); // 没有返回清理函数！
});

// 错误：清理函数引用了过期变量
useEffect(() => {
  let value = 0;
  const timer = setInterval(() => value++, 100);
  return () => {
    clearInterval(timer);
    console.log(value); // 这里的 value 可能是过期的
  };
});
```

### 使用内置 Hook 简化

```ts
// 使用 useInterval 自动清理
useInterval(() => {
  ctx.updater.set({ time: Date.now() }).digest();
}, 1000);

// 使用 useTimeout 自动清理
useTimeout(() => {
  setOpen(false);
}, 3000);

// 使用 useResource 管理可销毁资源
const service = createService(syncFn);
useResource("myService", service.instance(), true);
```

## 签名感知的异步操作

### 问题：过期回调

视图可能在异步操作完成前被销毁或重渲染，此时回调不应执行：

```ts
// 危险：视图销毁后仍可能执行
events: {
  "load<click>": async () => {
    const data = await fetchData(); // 可能耗时很长
    ctx.updater.set({ data }).digest(); // 视图可能已销毁！
  },
}
```

### 解决：wrapAsync

`ctx.wrapAsync(fn)` 捕获当前签名，只有签名未变时才执行：

```ts
events: {
  "load<click>": ctx.wrapAsync(async () => {
    const data = await fetchData();
    ctx.updater.set({ data }).digest(); // 安全：签名不匹配时自动跳过
  }),
}
```

### 原理

```ts
// wrapAsync 内部实现
function wrapAsync<Fn extends AnyFunc>(
  fn: Fn,
): (...args) => ReturnType<Fn> | undefined {
  const currentSignature = signature.value; // 捕获当前签名
  return (...args) => {
    // 只有视图存活且签名未变时才执行
    if (currentSignature > 0 && currentSignature === signature.value) {
      return fn.apply(ctx, args);
    }
    return undefined; // 静默丢弃过期回调
  };
}
```

### 签名变化时机

- `ctx.render()` 调用时：`signature.value++`
- `unmountCtx(ctx)` 调用时：`signature.value = 0`

因此，任何重渲染或销毁都会使旧的 `wrapAsync` 回调失效。

### 在 Store 异步操作中

Store 不依赖视图签名，需要手动处理竞态：

```ts
const useDataStore = createStore("data", (set, get) => ({
  data: null,
  loading: false,
  _requestId: 0,

  async fetchData() {
    const requestId = ++get()._requestId; // 递增请求 ID
    set({ loading: true });

    const data = await api.getData();

    // 只有最新请求才更新状态
    if (get()._requestId === requestId) {
      set({ data, loading: false });
    }
  },
}));
```

## 视图拆分策略

### 原则：单一职责

每个视图负责一个独立的功能区域：

```
PageView（页面容器）
├── HeaderView（导航栏）
├── FilterView（筛选面板）
├── ListView（数据列表）
│   └── ItemView（列表项）
└── PaginationView（分页器）
```

### 拆分时机

- 模板超过 100 行
- 同一视图内有多个独立的数据源
- 部分区域需要独立刷新（避免整体重渲染）
- 逻辑可复用于多个页面

### 子视图通信

```ts
// 父视图通过 v-lark 挂载子视图
// parent.html
`<div v-lark="views/child?data={{@list}}"></div>`;

// 子视图通过 params 接收数据
export default defineView((ctx, params) => {
  const data = params?.data || [];
  return { template: (d) => `...` };
});
```

### 共享状态代替深层传递

当多个视图需要相同数据时，使用 State 或 Store 代替层层传递：

```ts
// 不推荐：通过 URL 参数层层传递
Router.to("/detail", { id: "1", tab: "info", filter: "active", sort: "name" });

// 推荐：使用 Store 管理共享筛选状态
const useFilterStore = createStore("filter", (set, get) => ({
  filter: "all",
  sort: "name",
  setFilter(f) {
    set({ filter: f });
  },
  setSort(s) {
    set({ sort: s });
  },
}));
```

## 命名规范

### 文件命名

```
views/
├── home.ts          # 视图文件（小写 + 连字符）
├── user-profile.ts
├── order-list.ts
stores/
├── cart.ts          # Store 文件
├── user-session.ts
composables/
├── use-pagination.ts  # 组合函数（use- 前缀）
├── use-auth.ts
```

### 变量命名

```ts
// Store：use 前缀 + 名词
const useCartStore = createStore("cart", ...);
const useUserStore = createStore("user", ...);

// useState：get/set 前缀
const [getName, setName] = useState("name", "");
const [getVisible, setVisible] = useState("visible", false);

// 事件处理器：动词 + 名词
events: {
  "submitForm<click>": ...,
  "deleteItem<click>": ...,
  "handleInput<input>": ...,
}
```

### 事件键命名

```ts
events: {
  // 格式：名称<事件类型>；处理器的实际分发依赖模板中的 @event 属性
  "btn<click>": handler,           // 模板：<button @click="btn()">
  "press<click,mousedown>": handler, // 多事件绑定
  "$window<resize>": handler,      // 全局 window 事件
  "$document<keydown>": handler,   // 全局 document 事件
}
```

> 注意：键名中的名称部分只允许 `\w` 字符（`"$.item<click>"` 不会被注册）；`$selector` 形式当前仅注册事件类型、不按 CSS 选择器分发，元素级事件请用模板 `@event` + `"name<type>"`。

## 错误边界

### 视图级错误处理

```ts
export default defineView((ctx) => {
  const [getError, setError] = useState("error", null);

  return {
    template: (data) => {
      if (data.error) {
        return `<div class="error-panel">出错了: ${data.error}</div>`;
      }
      return `<div class="content">...</div>`;
    },
    events: {
      "retry<click>": () => {
        setError(null);
        ctx.render();
      },
    },
    assign() {
      try {
        // 数据处理逻辑
      } catch (e) {
        ctx.updater.set({ error: e.message });
        return true;
      }
    },
  };
});
```

### 异步错误处理

```ts
events: {
  "load<click>": ctx.wrapAsync(async () => {
    try {
      setLoading(true);
      const data = await api.fetchData();
      ctx.updater.set({ data, error: null }).digest();
    } catch (e) {
      ctx.updater.set({ error: e.message }).digest();
    } finally {
      setLoading(false);
    }
  }),
}
```

### Store 错误处理

```ts
const useDataStore = createStore("data", (set, get) => ({
  data: null,
  error: null,
  loading: false,

  async load() {
    set({ loading: true, error: null });
    try {
      const data = await api.getData();
      set({ data, loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },
}));
```

## 性能模式

### 批量 set + digest

```ts
// 正确：一次 digest
ctx.updater.set({ name: "Alice" });
ctx.updater.set({ age: 25 });
ctx.updater.set({ role: "admin" });
ctx.updater.digest(); // 只触发一次 DOM 更新

// 错误：多次 digest
ctx.updater.set({ name: "Alice" }).digest();
ctx.updater.set({ age: 25 }).digest();
ctx.updater.set({ role: "admin" }).digest(); // 三次 DOM 更新！
```

### observeState 精确订阅

```ts
// 正确：只观察需要的键
ctx.observeState("theme");

// 错误：观察过多键（任一变化都触发重渲染）
ctx.observeState("theme,locale,user,permissions,settings");
```

### observeLocation 精确订阅

```ts
// 正确：只观察影响当前视图的参数
ctx.observeLocation("page,size");

// 错误：观察 path 导致任何路由变化都重渲染
ctx.observeLocation({ params: [], path: true });
```

### assign 中使用 snapshot/altered

```ts
assign(options) {
  ctx.updater.snapshot(); // 记录当前版本

  // 只在数据真正变化时更新
  const loc = Router.parse();
  ctx.updater.set({ page: loc.get("page") });
  ctx.updater.set({ size: loc.get("size") });

  return ctx.updater.altered(); // 无变化时返回 false，跳过重渲染
}
```

### 条件渲染避免无用计算

```ts
template: (data) => {
  // 只在需要时构建复杂 DOM
  const listHtml = data.showList ? data.items.map(renderItem).join("") : "";
  return `<div>${listHtml}</div>`;
};
```

### 使用 capture 管理短生命周期资源

```ts
// destroyOnRender = true：每次 render 前自动销毁旧资源
const abortController = new AbortController();
ctx.capture("fetch", abortController, true);

fetch(url, { signal: abortController.signal });
// 下次 render 时自动 abort
```

## 完整示例：数据列表页

```ts
import { defineView, useState, useEffect, useStore } from "@mm/lark-mvc";
import { Router, State } from "@mm/lark-mvc";
import { useListStore } from "../stores/list";

export default defineView((ctx) => {
  // 状态
  const [getLoading, setLoading] = useState("loading", false);
  const [getError, setError] = useState("error", null);

  // Store 绑定
  const getListState = useStore(useListStore, (s) => ({
    items: s.filteredItems,
    total: s.total,
  }));

  // 路由观察
  ctx.observeLocation("page,size,keyword");

  // 副作用：初始加载
  useEffect(() => {
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  });

  // 数据加载
  async function loadList(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const loc = Router.parse();
      await useListStore.getState().fetch({
        page: Number(loc.get("page", "1")),
        size: Number(loc.get("size", "20")),
        keyword: loc.get("keyword"),
        signal,
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return {
    template: (data) => `
      <div class="list-page">
        ${data.error ? `<div class="error">${data.error}</div>` : ""}
        ${data.loading ? `<div class="spinner">加载中...</div>` : ""}
        <ul>
          ${
            data.items
              ?.map(
                (item) => `
            <li id="item-${item.id}">${item.name}</li>
          `,
              )
              .join("") || ""
          }
        </ul>
      </div>
    `,
    events: {
      "search<input>": ctx.wrapAsync((e) => {
        Router.to({ keyword: e.target.value, page: 1 });
      }),
      "retry<click>": () => loadList(),
    },
    assign() {
      ctx.updater.snapshot();
      const state = getListState();
      ctx.updater.set({
        items: state.items,
        total: state.total,
        loading: getLoading(),
        error: getError(),
      });
      return ctx.updater.altered();
    },
  };
});
```
