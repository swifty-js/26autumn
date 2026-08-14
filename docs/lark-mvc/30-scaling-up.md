---
title: 应用规模化
description: Lark Mvc 大型应用架构指南——项目结构、路由级代码分割、Module Federation 微前端、Store 状态架构、视图注册表管理、扩展系统、错误处理与 DevTool 集成
---

# 应用规模化

Lark Mvc 从设计之初就面向大型单页应用和微前端场景。本文档介绍如何将 Lark 应用从简单原型扩展为企业级架构，涵盖项目组织、代码分割、微前端、状态管理、错误处理等关键主题。

---

## 项目结构

### 推荐目录布局

```
src/
├── boot.ts                 # 应用入口：Framework.boot() 配置
├── routes.ts               # 路由表定义
├── stores/                 # 全局 Store
│   ├── user.ts
│   ├── cart.ts
│   └── notification.ts
├── views/                  # 视图（按功能模块组织）
│   ├── home/
│   │   ├── index.ts        # defineView setup
│   │   └── index.html      # 模板
│   ├── user/
│   │   ├── profile.ts
│   │   ├── profile.html
│   │   ├── settings.ts
│   │   └── settings.html
│   └── order/
│       ├── list.ts
│       ├── list.html
│       ├── detail.ts
│       └── detail.html
├── components/             # 可复用子视图
│   ├── header/
│   ├── sidebar/
│   ├── table/
│   └── modal/
├── services/               # API 请求层
│   ├── user-service.ts
│   └── order-service.ts
├── extensions/             # 启动扩展
│   ├── analytics.ts
│   ├── error-reporter.ts
│   └── auth-guard.ts
└── utils/                  # 工具函数
    ├── format.ts
    └── validators.ts
```

### 入口文件

```ts
// boot.ts
import { Framework } from "@mm/lark-mvc";
import { registerViewClass } from "@mm/lark-mvc";
import { routes } from "./routes";

// 同步注册核心视图（首屏）
import HomeView from "./views/home/index";
registerViewClass("app/views/home", HomeView);

// 扩展模块（埋点、错误上报）显式导入（extensions 配置当前不会被 boot 自动加载）
import "./extensions/analytics";
import "./extensions/error-reporter";

Framework.boot({
  rootId: "app",
  routeMode: "history",
  defaultView: "app/views/home",
  defaultPath: "/home",
  routes,
  error: (err) => {
    console.error("[Lark Error]", err);
    reportToSentry(err);
  },
  // 异步加载非首屏视图
  require: (names) => {
    return Promise.all(
      names.map((name) => import(/* @vite-ignore */ `./${name}.ts`)),
    );
  },
});
```

---

## 路由级代码分割

### 路由配置

```ts
// routes.ts
import type { RouteViewConfig } from "@mm/lark-mvc";

export const routes: Record<string, string | RouteViewConfig> = {
  "/home": "app/views/home",
  "/user/profile": "app/views/user/profile",
  "/user/settings": "app/views/user/settings",
  "/order/list": "app/views/order/list",
  "/order/detail": {
    view: "app/views/order/detail",
    title: "订单详情",
  },
  "/admin": {
    view: "app/views/admin/dashboard",
    title: "管理后台",
  },
};
```

### 异步视图加载

未在注册表中的视图通过 `config.require` 异步加载。Frame 系统在 `mountView` 中自动处理同步/异步分支：

```ts
// frame.ts → mountView（简化）
mountView(viewPathArg: string, viewInitParams?: Record<string, unknown>): void {
  const registered = getViewClass(viewClassName);
  if (registered) {
    // 同步路径：视图已注册
    doMountView(registered, initParams, node, sign);
    return;
  }

  // 异步路径：通过 config.require 加载
  use(viewClassName, (loadedModule: unknown) => {
    // 签名守卫：Frame 可能在异步加载期间被卸载
    if (sign !== frame.signature) return;

    if (isViewSetup(loadedModule)) {
      registerViewClass(viewClassName, loadedModule);
      doMountView(loadedModule, initParams, node, sign);
    } else {
      const errorHandler = frameworkConfig.error;
      if (errorHandler) {
        errorHandler(new Error(`Cannot load view: ${viewClassName}`));
      }
    }
  });
}
```

### Vite 动态导入

```ts
// boot.ts — Vite 环境
Framework.boot({
  rootId: "app",
  require: (names) => {
    return Promise.all(
      names.map((name) =>
        import(
          /* @vite-ignore */ `./views/${name.replace("app/views/", "")}.ts`
        ).then((mod) => mod.default),
      ),
    );
  },
});
```

### Webpack 动态导入

```ts
// boot.ts — Webpack 环境
Framework.boot({
  rootId: "app",
  require: (names) => {
    return Promise.all(
      names.map((name) =>
        import(/* webpackChunkName: "[request]" */ `./views/${name}`).then(
          (mod) => mod.default,
        ),
      ),
    );
  },
});
```

### 路由重写

`rewrite` 配置允许在路由解析前对路径进行转换：

```ts
Framework.boot({
  rootId: "app",
  routes,
  rewrite: (path, params, routes) => {
    // 将 /user/123 重写为 /user/detail?id=123
    const userMatch = path.match(/^\/user\/(\d+)$/);
    if (userMatch) {
      params["id"] = userMatch[1];
      return "/user/detail";
    }
    return path;
  },
});
```

### 404 处理

```ts
Framework.boot({
  rootId: "app",
  routes,
  unmatchedView: "app/views/404", // 无匹配路由时加载
});
```

---

## Module Federation 微前端

Lark Mvc 原生支持 Webpack Module Federation，适合作为微前端架构的基础框架。

### 架构模式

```
┌─────────────────────────────────────────────┐
│              Host Application                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ Remote A │  │ Remote B │  │ Remote C │    │
│  │ (团队 A) │  │ (团队 B) │  │ (团队 C) │    │
│  └─────────┘  └─────────┘  └─────────┘    │
└─────────────────────────────────────────────┘
```

### Host 配置

```ts
// host/boot.ts
import { Framework } from "@mm/lark-mvc";

Framework.boot({
  rootId: "app",
  projectName: "host-app",
  defaultView: "host-app/views/layout",
  routes: {
    "/": "host-app/views/layout",
    "/dashboard": "remote-a/views/dashboard",
    "/reports": "remote-b/views/reports",
    "/settings": "remote-c/views/settings",
  },
  // Module Federation require
  require: async (names) => {
    return Promise.all(
      names.map(async (name) => {
        // 解析远程模块：remote-a/views/dashboard
        const [remote, ...pathParts] = name.split("/");
        const modulePath = `./${pathParts.join("/")}`;

        // 通过 MF 容器加载
        const container = await loadRemoteContainer(remote);
        const factory = await container.get(modulePath);
        const module = factory();
        return module.default || module;
      }),
    );
  },
});
```

### Webpack MF 配置

```js
// host/webpack.config.js
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "host_app",
      remotes: {
        "remote-a": "remote_a@http://localhost:3001/remoteEntry.js",
        "remote-b": "remote_b@http://localhost:3002/remoteEntry.js",
      },
      shared: {
        "@mm/lark-mvc": { singleton: true, requiredVersion: "^1.0.0" },
      },
    }),
    new LarkMvcPlugin({ debug: true }),
  ],
};
```

### Remote 配置

```js
// remote-a/webpack.config.js
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "remote_a",
      filename: "remoteEntry.js",
      exposes: {
        "./views/dashboard": "./src/views/dashboard/index.ts",
        "./views/analytics": "./src/views/analytics/index.ts",
      },
      shared: {
        "@mm/lark-mvc": { singleton: true, requiredVersion: "^1.0.0" },
      },
    }),
    new LarkMvcPlugin(),
  ],
};
```

### projectName 配置

`projectName` 用于微前端桥接判断视图路径归属：

```ts
Framework.boot({
  projectName: "remote-a", // 当前应用标识
  // 框架据此判断 viewPath 属于本地还是远程
});
```

### MF 场景下的 HMR 注意事项

在 Module Federation 中，HMR 交换函数通过 `globalThis.__lark_hmr__` 访问（而非 import），避免 shared-scope 副作用导致的 `ChunkLoadError`：

```ts
// framework.ts → boot()
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis["__lark_hmr__"] = { hotSwapByTemplate, hotSwapByView };
}
```

---

## Store 状态架构

### 分层状态管理

大型应用建议按以下层次组织状态：

| 层次           | 工具          | 适用场景                     |
| -------------- | ------------- | ---------------------------- |
| 视图局部状态   | `useState`    | 仅当前视图使用的 UI 状态     |
| URL 状态       | `useUrlState` | 需要持久化到 URL 的筛选/分页 |
| 跨视图共享状态 | `createStore` | 多视图读写的业务数据         |
| 轻量全局通知   | `State`       | 简单的全局标志位             |

### Store 设计模式

```ts
// stores/user.ts
import { createStore, computed } from "@mm/lark-mvc";

export const useUserStore = createStore("user", (set, get) => ({
  // 状态
  user: null as User | null,
  token: "" as string,
  permissions: [] as string[],

  // 计算属性
  isLoggedIn: computed(["token"], () => !!get().token),
  isAdmin: computed(["permissions"], () => get().permissions.includes("admin")),

  // Actions
  login: async (credentials: Credentials) => {
    const { user, token } = await api.login(credentials);
    set({ user, token });
  },
  logout: () => {
    set({ user: null, token: "", permissions: [] });
  },
  updateProfile: (patch: Partial<User>) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...patch } });
  },
}));
```

### 在视图中使用 Store

```ts
import { defineView, useStore } from "@mm/lark-mvc";
import { useUserStore } from "../stores/user";
import template from "./profile.html";

export default defineView((ctx) => {
  // 选择性订阅：仅 user 和 isLoggedIn 变化时触发更新
  const getUser = useStore(useUserStore, (s) => ({
    user: s.user,
    isLoggedIn: s.isLoggedIn,
  }));

  return {
    template,
    events: {
      "logout<click>"(e) {
        useUserStore.getState().logout();
      },
    },
  };
});
```

### Store 生命周期

```ts
// Store 是全局单例，独立于视图生命周期
const store = createStore("cart", (set, get) => ({/* ... */}));

// 视图绑定：useStore 自动在视图销毁时取消订阅
// 手动订阅：需要自行管理生命周期
useEffect(() => {
  const off = store.subscribe((state, prev) => {
    console.log("Cart changed:", state.items.length);
  });
  return off; // 视图销毁时取消
});

// 销毁 Store（通常在应用卸载时）
store.destroy();
```

---

## 视图注册表管理

### 注册表 API

```ts
import {
  registerViewClass,
  getViewClassRegistry,
  invalidateViewClass,
} from "@mm/lark-mvc";

// 注册视图
registerViewClass("app/views/home", HomeViewSetup);

// 获取注册表
const registry = getViewClassRegistry(); // Map<string, ViewSetup>

// 使缓存失效（强制下次重新加载）
invalidateViewClass("app/views/home");
```

### 预加载策略

```ts
// 预加载高频访问的视图
async function preloadViews() {
  const views = [
    "app/views/order/list",
    "app/views/order/detail",
    "app/views/user/profile",
  ];

  await Promise.all(
    views.map(async (name) => {
      const mod = await import(`./views/${name.replace("app/views/", "")}.ts`);
      registerViewClass(name, mod.default);
    }),
  );
}

// 在空闲时预加载
if ("requestIdleCallback" in window) {
  requestIdleCallback(preloadViews);
} else {
  setTimeout(preloadViews, 2000);
}
```

### 路由级懒加载 + 预加载

```ts
// 结合 Router 事件做智能预加载
Router.on("changed", (diff) => {
  const path = diff?.path?.to;
  if (path === "/order/list") {
    // 用户在订单列表页，预加载订单详情
    import("./views/order/detail.ts").then((mod) => {
      registerViewClass("app/views/order/detail", mod.default);
    });
  }
});
```

---

## 扩展模块

### extensions 配置是预留字段

`FrameworkConfig.extensions` 存在于类型声明中，但**当前版本的 `Framework.boot()` 不会自动加载它**。启动时加载扩展模块的正确方式是在入口文件中显式导入：

```ts
// boot.ts —— 副作用 import，模块顶层代码在导入时执行
import "./extensions/analytics";
import "./extensions/error-reporter";
import "./extensions/auth-guard";
import "./extensions/performance-monitor";

Framework.boot({
  rootId: "app",
});
```

### 编写扩展

```ts
// extensions/analytics.ts
import { Router, Frame } from "@mm/lark-mvc";

// 路由变化时上报 PV
Router.on("changed", (diff) => {
  if (diff?.path) {
    analytics.trackPageView(diff.path.to);
  }
});

// Frame 挂载/卸载时上报组件生命周期
Frame.on("add", ({ frame }) => {
  analytics.trackEvent("frame_mount", {
    id: frame.id,
    view: frame.getViewPath(),
  });
});

export default {}; // 扩展模块需要导出
```

```ts
// extensions/auth-guard.ts
import { Router } from "@mm/lark-mvc";
import { useUserStore } from "../stores/user";

// 全局路由守卫
Router.beforeEach(async (to, from) => {
  const { isLoggedIn } = useUserStore.getState();
  const requiresAuth = to.path?.startsWith("/admin");

  if (requiresAuth && !isLoggedIn) {
    Router.to("/login", { redirect: to.path });
    return false; // 阻止导航
  }
  return true;
});

export default {};
```

```ts
// extensions/error-reporter.ts
import { Framework } from "@mm/lark-mvc";

// 全局错误捕获
window.addEventListener("error", (event) => {
  reportError({
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportError({
    message: "Unhandled Promise Rejection",
    reason: String(event.reason),
  });
});

export default {};
```

---

## 错误处理

### config.error 全局错误处理

```ts
Framework.boot({
  rootId: "app",
  error: (error: Error) => {
    // 所有框架内部 try-catch 捕获的错误都会到这里
    console.error("[Framework Error]", error);

    // 上报到监控系统
    errorReporter.capture(error);

    // 注意：不要在此方法中重新抛出错误
  },
});
```

### 错误触发场景

| 场景           | 说明                            |
| -------------- | ------------------------------- |
| 视图加载失败   | `config.require` 返回非函数模块 |
| 事件处理器异常 | 事件回调中抛出的错误            |
| 模板渲染错误   | 模板函数执行时的运行时错误      |
| 异步回调错误   | `wrapAsync` 包装的回调中的错误  |
| 资源销毁错误   | `destroy()` 方法中的错误        |

### 视图级错误边界

```ts
export default defineView((ctx) => {
  const [getError, setError] = useState("error", null);

  return {
    template,
    events: {
      "riskyAction<click>"(e) {
        try {
          doSomethingRisky();
        } catch (err) {
          setError(err.message);
        }
      },
      "retry<click>"(e) {
        setError(null);
        ctx.render();
      },
    },
  };
});
```

```html
{{if error}}
<div class="error-boundary">
  <p>出错了：{{=error}}</p>
  <button @click="retry()">重试</button>
</div>
{{else}}
<div class="normal-content">
  <!-- 正常内容 -->
</div>
{{/if}}
```

### 异步安全

`ctx.wrapAsync` 确保过期的异步回调被静默丢弃：

```ts
export default defineView((ctx) => {
  useEffect(() => {
    fetchData().then(
      ctx.wrapAsync((data) => {
        // 如果视图已销毁或重渲染，此回调不会执行
        ctx.updater.set({ data }).digest();
      }),
    );
  });

  return { template };
});
```

---

## DevTool 集成

### 启用 DevTool

```ts
Framework.boot({
  rootId: "app",
  devtool: true, // 启用 Frame Devtool Bridge
});
```

### DevTool 功能

启用后，框架安装一个 `postMessage` 监听器，允许 Lark DevTool 浏览器扩展检查 Frame 树：

| 消息类型                    | 方向          | 说明                 |
| --------------------------- | ------------- | -------------------- |
| `LARK_DEVTOOL_PING`         | DevTool → App | 探测是否为 Lark 应用 |
| `LARK_DEVTOOL_PONG`         | App → DevTool | 确认响应             |
| `LARK_DEVTOOL_REQUEST_TREE` | DevTool → App | 请求 Frame 树        |
| `LARK_DEVTOOL_TREE`         | App → DevTool | 返回完整 Frame 树    |
| `LARK_DEVTOOL_TREE_DELTA`   | App → DevTool | 推送 Frame 树变更    |

### 序列化数据

DevTool 可以查看每个 Frame/View 的：

```ts
interface SerializedViewInfo {
  id: string; // 视图 ID
  rendered: boolean; // 是否已渲染
  signature: number; // 签名（> 0 = 活跃）
  observedStateKeys: string[]; // 观察的 State 键
  locationObserved: {
    // URL 观察配置
    flag: number;
    keys: string[];
    observePath: boolean;
  };
  hasTemplate: boolean; // 是否有模板
  eventMethodKeys: string[]; // 注册的事件键
  resourceKeys: string[]; // 捕获的资源键
  hasAssign: boolean; // 是否有 assign 方法
  updaterData: Record<string, unknown>; // 当前数据快照
}
```

### 生产环境

生产环境应关闭 DevTool 以避免 postMessage 监听器的开销：

```ts
Framework.boot({
  devtool: process.env.NODE_ENV === "development",
});
```

---

## 路由守卫与导航控制

### 两阶段路由确认

Lark Router 使用两阶段提交协议：

1. **change 阶段**：URL 即将变化，可以 prevent/reject/resolve
2. **changed 阶段**：URL 已变化，框架重新挂载视图

```ts
// 监听路由变化前事件
Router.on("change", (e) => {
  if (hasUnsavedChanges()) {
    e.prevent(); // 暂停导航
    showConfirmDialog(() => {
      e.resolve(); // 用户确认后继续
    });
  }
});
```

### 异步路由守卫

```ts
// 注册异步守卫（按注册顺序执行）
const removeGuard = Router.beforeEach(async (to, from) => {
  // 权限检查
  const hasAccess = await checkPermission(to.path);
  if (!hasAccess) {
    Router.to("/403");
    return false; // 阻止导航
  }
  return true;
});

// 移除守卫
removeGuard();
```

### 页面离开提示

```ts
Router.on("page_unload", (data) => {
  if (hasUnsavedChanges()) {
    data.msg = "您有未保存的更改，确定要离开吗？";
  }
});
```

---

## 性能优化策略

### 任务分片

框架内置了任务分片机制（`Framework.task`），使用最优调度 API：

```
优先级：scheduler.postTask('background') > requestIdleCallback > setTimeout(0)
```

### 视图观察优化

仅观察必要的 URL 参数，避免不必要的重渲染：

```ts
// 好：只观察需要的参数
ctx.observeLocation(["page", "keyword"]);

// 避免：观察所有参数变化
ctx.observeLocation({ params: ["page", "keyword", "sort", "filter", "view"] });
```

### Store selector 优化

```ts
// 好：精确选择需要的字段
const getData = useStore(useCountStore, (s) => ({ count: s.count }));

// 避免：订阅整个 Store
const getData = useStore(useCountStore); // 任何字段变化都触发更新
```

### Frame 树深度控制

- 避免过深的视图嵌套（建议不超过 5 层）
- 使用 Zone 机制按需挂载子视图
- 不可见的子视图通过 `unmountFrame` 释放

---

## 完整大型应用配置示例

```ts
// boot.ts
import { Framework, Router } from "@mm/lark-mvc";
import { registerViewClass } from "@mm/lark-mvc";
import { routes } from "./routes";

// 首屏视图同步注册
import LayoutView from "./views/layout";
import HomeView from "./views/home";
registerViewClass("app/views/layout", LayoutView);
registerViewClass("app/views/home", HomeView);

Framework.boot({
  rootId: "app",
  routeMode: "history",
  projectName: "my-app",
  defaultView: "app/views/layout",
  defaultPath: "/home",
  routes,
  unmatchedView: "app/views/404",
  devtool: process.env.NODE_ENV === "development",

  // 扩展模块在入口文件中显式导入（extensions 配置当前不会被 boot 自动加载）
  error: (error) => {
    console.error("[App Error]", error);
    if (process.env.NODE_ENV === "production") {
      errorReporter.capture(error);
    }
  },

  // Module Federation 异步加载
  require: async (names) => {
    return Promise.all(
      names.map(async (name) => {
        const [project, ...path] = name.split("/");
        if (project === "my-app") {
          const mod = await import(`./views/${path.join("/")}.ts`);
          return mod.default;
        }
        // 远程模块
        const container = await loadRemote(project);
        const factory = await container.get(`./${path.join("/")}`);
        return factory().default;
      }),
    );
  },

  rewrite: (path, params, routes) => {
    // 路径重写逻辑
    return path;
  },
});
```
