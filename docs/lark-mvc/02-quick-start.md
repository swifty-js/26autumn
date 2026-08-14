---
title: 快速上手
description: 从零开始用 Lark Mvc 创建第一个单页应用：安装、配置 Vite 插件、定义视图、编写模板并启动框架。
---

# 快速上手

本章将带你从零开始，用 Lark Mvc 创建一个可运行的单页应用。完成本章后，你将拥有一个支持点击计数、模板渲染与路由的最小可用项目。

> 涉及源码：
>
> - 启动函数：`packages/lark-mvc/src/framework.ts`（`Framework.boot`）
> - Vite 插件：`packages/lark-mvc/src/vite.ts`（`larkMvcPlugin`）
> - 视图定义：`packages/lark-mvc/src/view.ts`（`defineView`）

## 前置条件

- Node.js 18+
- 一个包管理器：`pnpm`（推荐）、`npm` 或 `yarn`
- Vite 8+（用于模板编译插件，作为 peer dependency）

## 第一步：安装

使用你偏好的包管理器安装框架：

```bash
# pnpm
pnpm add @mm/lark-mvc

# npm
npm install @mm/lark-mvc

# yarn
yarn add @mm/lark-mvc
```

框架本体没有任何运行时依赖。`@babel/parser` 等仅在构建期参与模板编译，不会进入运行时产物。

## 第二步：配置 Vite 插件

Lark Mvc 的 `.html` 模板需要在构建期被编译为 JavaScript 渲染函数。通过 `@mm/lark-mvc/vite` 提供的 `larkMvcPlugin` 可以零配置完成这一过程。

在项目根目录创建 `vite.config.ts`：

```ts
import { defineConfig } from "vite";
import { larkMvcPlugin } from "@mm/lark-mvc/vite";

export default defineConfig({
  plugins: [
    larkMvcPlugin({
      debug: false, // 调试模式：在错误中附带模板行号
      vdom: false, // 是否启用 VDOM 输出模式（默认字符串模式）
    }),
  ],
});
```

`larkMvcPlugin` 的选项定义如下（见 `src/vite.ts`）：

```ts
export interface LarkMvcVitePluginOptions {
  /** 启用调试模式，附带行号追踪（默认 false） */
  debug?: boolean;
  /** 启用虚拟 DOM 输出（默认 false） */
  vdom?: boolean;
}
```

该插件会自动完成：

- 解析 `.html` 导入并通过 `compileTemplate` 编译；
- 基于 AST 自动提取模板变量（零配置）；
- 为模板模块与视图模块自动注入 HMR 代码片段；
- 处理 `@event` 事件属性与 `*prop` 组件属性绑定。

> 如果你使用 Webpack 或 Rspack，请改用 `@mm/lark-mvc/webpack` 或 `@mm/lark-mvc/rspack` 提供的 `larkMvcLoader`，配置方式见 README。

## 第三步：创建 HTML 入口

创建 `index.html` 作为应用入口，其中包含一个用于挂载根视图的容器节点（默认 id 为 `root`）：

```html
<!doctype html>
<html>
  <head>
    <title>Lark Mvc App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## 第四步：编写模板

创建 `src/views/home.html`。Lark Mvc 使用 `{{ }}` 风格的模板语法，`{{=expr}}` 表示经过 HTML 转义的输出，`@click="handler()"` 用于绑定事件：

```html
<!-- src/views/home.html -->
<div class="home">
  <h1>Welcome to Lark Mvc</h1>
  <p>Count: {{=count}}</p>
  <button @click="increment()">Increment</button>
</div>
```

模板中用到的 `count` 变量无需手动声明——编译器会通过 AST 分析自动从视图数据中提取。

## 第五步：定义视图

创建 `src/views/home.ts`。视图通过 `defineView()` 定义，其 setup 函数接收 `ViewCtx`，返回 `{ template, events }`：

```ts
// src/views/home.ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./home.html";

export default defineView((ctx, params) => {
  // 声明视图本地状态：返回 [getter, setter]
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      // "名称<事件类型>" 是事件处理器的命名约定
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

要点说明：

- `useState("count", 0)` 返回一个 `[getter, setter]` 对。getter 始终从 `ctx.updater.data` 读取最新值，避免事件处理器中的「过期闭包」问题；setter 写入数据并触发 digest 重新渲染。
- `events` 中的键 `"increment<click>"` 遵循 `handler<eventType>` 命名约定，框架通过事件委托将其绑定到视图根元素。
- setup 函数仅在挂载时执行**一次**（不同于 React 每次渲染都执行）。

## 第六步：启动框架

创建 `src/main.ts`，调用 `Framework.boot()` 启动应用：

```ts
// src/main.ts
import { Framework } from "@mm/lark-mvc";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  defaultView: "src/views/home",
  routes: {
    "/": "src/views/home",
    "/about": "src/views/about",
  },
});
```

`Framework.boot()` 会依次：合并配置 → 绑定路由与状态变更事件 → 创建根 Frame → 绑定 `hashchange`/`popstate` → 挂载默认视图。详见 [创建一个应用](./03-creating-an-app.md)。

## 第七步：运行应用

启动 Vite 开发服务器：

```bash
pnpm dev
# 或
npm run dev
```

打开浏览器访问开发服务器地址，你将看到：

- 页面渲染出 `Welcome to Lark Mvc` 与 `Count: 0`；
- 点击 `Increment` 按钮，计数递增并实时更新视图；
- 修改 `home.html` 或 `home.ts` 时，HMR 会热替换视图且**保留**当前计数状态，无需整页刷新。

## 完整示例回顾

下面汇总本示例的全部文件，可直接复制到项目中使用。

**`vite.config.ts`**

```ts
import { defineConfig } from "vite";
import { larkMvcPlugin } from "@mm/lark-mvc/vite";

export default defineConfig({
  plugins: [larkMvcPlugin()],
});
```

**`index.html`**

```html
<!doctype html>
<html>
  <head>
    <title>Lark Mvc App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**`src/main.ts`**

```ts
import { Framework } from "@mm/lark-mvc";

Framework.boot({
  rootId: "root",
  routeMode: "history",
  defaultView: "src/views/home",
  routes: {
    "/": "src/views/home",
  },
});
```

**`src/views/home.ts`**

```ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./home.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

**`src/views/home.html`**

```html
<div class="home">
  <h1>Welcome to Lark Mvc</h1>
  <p>Count: {{=count}}</p>
  <button @click="increment()">Increment</button>
</div>
```

## 添加第二个视图与路由

为了让路由真正发挥作用，新增一个 `about` 视图。

**`src/views/about.ts`**

```ts
import { defineView } from "@mm/lark-mvc";
import template from "./about.html";

export default defineView((ctx) => {
  return { template };
});
```

**`src/views/about.html`**

```html
<div class="about">
  <h1>About</h1>
  <p>This is a Lark Mvc demo application.</p>
</div>
```

并在 `main.ts` 的 `routes` 中登记（前面已配置 `"/about": "src/views/about"`）。在 `home.html` 中加入跳转链接或按钮，配合 `Router.to("/about")` 即可在两个视图间切换：

```ts
// 在 home.ts 的 events 中
import { Router } from "@mm/lark-mvc";

events: {
  "goAbout<click>"() {
    Router.to("/about");
  },
},
```

```html
<!-- home.html -->
<button @click="goAbout()">Go to About</button>
```

## 常见问题

**Q：导入 `.html` 时 TypeScript 报「找不到模块」？**

请确保引入了客户端类型声明。在 `tsconfig.json` 的 `types` 中加入 `@mm/lark-mvc/client`，或在某个 `.d.ts` 中：

```ts
/// <reference types="@mm/lark-mvc/client" />
```

**Q：视图渲染为空白？**

通常是 `rootId` 与 HTML 中容器节点的 `id` 不一致，或 `defaultView` / `routes` 中的视图路径与实际文件路径不匹配。请确认 `Framework.boot` 的 `rootId` 对应页面中真实存在的 DOM 节点。

**Q：如何开启调试模式查看模板错误行号？**

在 `larkMvcPlugin({ debug: true })` 中开启。编译后的模板会在运行时报错时附带原始模板表达式与行号，便于定位问题。

## 下一步

- 深入了解 `Framework.boot` 的全部配置项与启动序列：[创建一个应用](./03-creating-an-app.md)
- 掌握完整的模板语法：[模板语法](./04-template-syntax.md)
- 理解数据驱动视图更新的机制：[响应式基础](./05-reactivity-fundamentals.md)
