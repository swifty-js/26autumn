---
title: 自定义主题
sidebar_position: 13
description: 从零构建 Lark Docs 主题
---

# 自定义主题

如果你对默认主题不满意，可以完全从零构建自己的主题。Lark Docs 的主题系统基于 Lark Mvc 的 View 注册机制——主题就是一组通过 `registerViewClass()` 注册的 View。

## 主题架构

### 核心概念

一个 Lark Docs 主题由以下部分组成：

1. **View 注册**：将视图组件注册到框架的视图注册表
2. **模板文件**：`.html` 文件定义视图的 DOM 结构
3. **样式表**：CSS 定义视觉表现
4. **启动逻辑**：`boot.ts` 中的初始化和数据注入

### 必需的 View

Layout View 是唯一的硬性要求——它是路由映射的目标视图：

```ts
// 生成模块中所有路由都指向这个视图
routes = { "/docs/...": "theme/docs-layout", ... }
```

其他 View（sidebar、toc、search、theme-toggle）是可选的——由 Layout 决定是否挂载。

## 从零构建主题

### 步骤一：创建主题目录

```
app/
├── theme/
│   ├── layout.ts          # 布局视图
│   ├── layout.html        # 布局模板
│   ├── sidebar.ts         # 侧边栏视图（可选）
│   ├── sidebar.html
│   └── styles.css         # 主题样式
├── boot.ts                # 启动入口
└── views/                 # 自定义组件
```

### 步骤二：实现 Layout View

::: danger 两个容易写错的地方

1. **`ctx.observeLocation()` 不接受回调**。它的签名是 `observeLocation(params: string | string[] | Record<string, unknown>, observePath?: boolean)` —— 只是声明“监听哪些 query 参数 / 是否监听 path”。路径变化后框架会调用 `ctx.renderMethod`（若定义了）或 `ctx.render()`，加载逻辑要写在 `ctx.renderMethod` 里。`ctx.observeState(keys)` 同理，也没有回调参数。
2. **模板只能读 `updater` 里的数据**。模板中的标识符会被编译为 `__lark_data__.xxx`，所以不能在模板里调用 `useState` 返回的 getter（如 `{{=getTitle()}}`）——必须先 `ctx.updater.set({ title })` 再在模板里写 `{{=title}}`。
   :::

```ts
// app/theme/layout.ts
import { defineView, State, Router } from "@mm/lark-docs";
import template from "./layout.html";

export default defineView((ctx) => {
  ctx.updater.set({ contentHtml: "", title: "", loading: true, navItems: [] });

  // 声明监听 path 变化（第二个参数 true = 观察 path）
  ctx.observeLocation([], true);

  // 路径变化时框架调用这个方法，而不是回调
  ctx.renderMethod = async () => {
    const loadContent = State.get("loadContent") as (
      p: string,
    ) => Promise<{ pageData: { title: string }; contentHtml: string } | null>;
    const path = Router.parse().path || "/";

    ctx.updater.set({ loading: true });
    ctx.updater.digest();

    // 用 signature 防异步竞态：导航期间又发生导航则丢弃旧结果
    const sig = ctx.signature.value;
    const result = await loadContent(path);
    if (ctx.signature.value !== sig) return;

    ctx.updater.set({
      contentHtml: result?.contentHtml ?? "",
      title: result?.pageData.title ?? "",
      loading: false,
    });
    ctx.updater.digest();

    if (result) document.title = `${result.pageData.title} - My Docs`;
  };

  return {
    template,
    events: {
      // 主题自己决定用什么属性标记可导航元素，
      // 内置主题用的是 data-href
      "navigateTo<click>": (e: Event) => {
        let el = e.target instanceof HTMLElement ? e.target : null;
        while (el && !el.dataset["href"]) el = el.parentElement;
        const href = el?.dataset["href"];
        if (href) Router.to(href);
      },
    },
  };
});
```

### 步骤三：编写模板

```html
<!-- app/theme/layout.html -->
<div class="my-docs-layout">
  <header class="my-navbar">
    <h1 class="site-title">My Docs</h1>
    <nav>
      {{forOf navItems as item}}
      <a data-href="{{=item.link}}" @click="navigateTo()">{{=item.text}}</a>
      {{/forOf}}
    </nav>
  </header>

  <div class="my-content-wrapper">
    {{if loading}}
    <div class="loading">加载中...</div>
    {{else}}
    <article class="prose">{{!contentHtml}}</article>
    {{/if}}
  </div>
</div>
```

模板语法说明：

- `{{=expr}}`：HTML 转义输出
- `{{!expr}}`：原始 HTML 输出（用于 contentHtml）
- `{{if}}/{{else}}/{{/if}}`：条件渲染
- `{{forOf list as item}}`：循环
- 所有标识符都来自 `ctx.updater.set()` 写入的数据，**不能调用视图闭包里的函数**

### 步骤四：注册视图

```ts
// app/boot.ts
import {
  Framework,
  State,
  registerViewClass,
  type FrameworkConfig,
} from "@mm/lark-docs";
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@lark-docs/generated";
import LayoutView from "./theme/layout";

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  routes,
  vdom: false,
  defaultView: "theme/docs-layout",
};

// 注册自定义布局（使用与默认主题相同的路径），
// 必须在 Framework.boot() 之前完成
registerViewClass("theme/docs-layout", LayoutView);

// 注入数据
State.set({ docsConfig, loadContent, getSearchIndex });

Framework.boot(config);
```

::: warning 完全自建主题时不要调 `registerThemeViews()`
它会无条件注册 5 个内置视图。如果你只想换掉其中几个，反而应该先调 `registerThemeViews()` 再覆盖目标路径（后注册覆盖先注册）——参见[扩展默认主题](./15-extending-default-theme)。
:::

### 步骤五：添加样式

```css
/* app/theme/styles.css */
.my-docs-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.my-navbar {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 2rem;
  height: 60px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.my-content-wrapper {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
```

## 主题 View 工厂模式

Lark Docs 默认主题使用工厂模式——每个 View 是一个接受模板参数的工厂函数：

```ts
// 默认主题的模式
export function createDocsLayoutView(template: ViewTemplate | VDomTemplate): ViewSetup {
  return defineView((ctx) => {
    // 视图逻辑
    return { template, events: {...} };
  });
}
```

这种模式的好处：

- 模板在构建时预编译（字符串模式和 VDOM 模式各一份）
- 运行时通过 `registerThemeViews({ vdom })` 选择对应版本
- 逻辑和模板分离，便于替换

### 自定义主题中使用工厂

```ts
// app/theme/index.ts
import { defineView } from "@mm/lark-docs";
import layoutTemplate from "./layout.html";
import sidebarTemplate from "./sidebar.html";

export function registerMyTheme() {
  registerViewClass(
    "theme/docs-layout",
    defineView((ctx) => {
      return { template: layoutTemplate /* ... */ };
    }),
  );

  registerViewClass(
    "theme/sidebar",
    defineView((ctx) => {
      return { template: sidebarTemplate /* ... */ };
    }),
  );
}
```

## State 数据接口

自定义主题需要从 `State` 读取以下数据：

| State 键              | 类型                                         | 说明                                             |
| --------------------- | -------------------------------------------- | ------------------------------------------------ |
| `docsConfig`          | `Omit<DocsConfig, "docs">`                   | 站点配置（title, baseUrl, nav, sidebar, search） |
| `loadContent`         | `(path) => Promise<{pageData, contentHtml}>` | 页面内容加载器                                   |
| `getSearchIndex`      | `() => Promise<SearchEntry[]>`               | 搜索索引加载器                                   |
| `currentPageHeadings` | `HeadingInfo[]`                              | 当前页面标题列表（供 TOC 使用）                  |
| `searchOpen`          | `boolean`                                    | 搜索面板开关                                     |

### 运行时配置结构

`docsConfig` 的类型标注为 `Omit<DocsConfig, "docs">`，但**实际序列化出来的只有下面这几个字段**（`markdown` / `highlight` 是纯构建期配置，不进运行时）：

```ts
{
  title: string;        // 必存在
  baseUrl: string;      // 必存在
  description: string;  // 未配置时为 ""
  nav: NavItem[];       // 未配置时为 []，link 已加 baseUrl 前缀
  sidebar: Record<string, SidebarItem[]>;  // "auto" 已在构建期展开为数组
  search?: boolean;     // 仅当用户显式设置过才存在
}
```

## 子视图挂载

在模板中使用 `v-lark` 挂载子视图：

```html
<!-- 挂载侧边栏 -->
<aside v-lark="theme/sidebar"></aside>

<!-- 挂载 TOC -->
<aside v-lark="theme/toc"></aside>

<!-- 挂载搜索 -->
<div v-lark="theme/search"></div>

<!-- 挂载主题切换 -->
<button v-lark="theme/theme-toggle"></button>
```

子视图通过 `params` 接收属性：

```html
<div v-lark="theme/toc" *inline="true"></div>
```

## 模板编译

### 构建时编译

`.html` 模板文件由 `@mm/lark-mvc` 的 Vite/Webpack/Rspack 插件在构建时编译为 JavaScript 渲染函数：

```ts
// 编译前：layout.html
// <div>{{=title}}</div>

// 编译后：layout.html.js（概念示意）
export default function template(data, viewId, refData) {
  return `<div>${encHtml(data.title)}</div>`;
}
```

### 模板语法参考

| 语法                                        | 说明                     |
| ------------------------------------------- | ------------------------ |
| `{{=expr}}`                                 | HTML 转义输出            |
| `{{!expr}}`                                 | 原始输出（不转义）       |
| `{{@expr}}`                                 | 引用传递（传递 JS 对象） |
| `{{:expr}}`                                 | 双向绑定                 |
| `{{if expr}}...{{else}}...{{/if}}`          | 条件                     |
| `{{forOf list as item index}}...{{/forOf}}` | 数组循环                 |
| `{{forIn obj as val key}}...{{/forIn}}`     | 对象遍历                 |
| `{{set var = expr}}`                        | 变量声明                 |
| `@event="handler(args)"`                    | 事件绑定                 |
| `v-lark="view/path"`                        | 子视图挂载               |
| `*prop="value"`                             | 子视图参数               |

## 完整示例：极简主题

```ts
// app/theme/minimal-layout.ts
import { defineView, State, Router } from "@mm/lark-docs";
import template from "./minimal-layout.html";

export default defineView((ctx) => {
  ctx.updater.set({ contentHtml: "<p>Loading...</p>" });
  ctx.observeLocation([], true);

  ctx.renderMethod = async () => {
    const loadContent = State.get("loadContent") as (
      p: string,
    ) => Promise<{ pageData: { title: string }; contentHtml: string } | null>;
    const sig = ctx.signature.value;
    const result = await loadContent(Router.parse().path || "/");
    if (ctx.signature.value !== sig) return;
    if (result) {
      ctx.updater.set({ contentHtml: result.contentHtml });
      document.title = result.pageData.title;
    }
    ctx.updater.digest();
  };

  return {
    template,
    events: {
      "nav<click>": (e: Event) => {
        let el = e.target instanceof HTMLElement ? e.target : null;
        while (el && !el.dataset["href"]) el = el.parentElement;
        const href = el?.dataset["href"];
        if (href) Router.to(href);
      },
    },
  };
});
```

```html
<!-- app/theme/minimal-layout.html -->
<div class="mx-auto max-w-3xl px-4 py-8">
  <nav class="mb-8 border-b pb-4">
    <a data-href="/docs/" @click="nav()" class="font-bold">Docs</a>
    <a data-href="/docs/guide/" @click="nav()" class="ml-4">Guide</a>
    <a data-href="/docs/api/" @click="nav()" class="ml-4">API</a>
  </nav>
  <article class="prose">{{!contentHtml}}</article>
</div>
```

这个极简主题只有内容区域和简单导航——没有侧边栏、TOC、搜索，适合轻量级文档需求。
