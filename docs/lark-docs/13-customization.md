---
title: 自定义
sidebar_position: 12
description: 站点配置、布局定制与行为扩展
---

# 自定义

Lark Docs 提供多层次的自定义能力——从简单的配置选项到完整的主题替换。本文介绍站点级配置和行为定制。

## 站点配置

### defineConfig

所有站点配置通过 `lark-docs.config.ts` 中的 `defineConfig()` 定义：

```ts
import { defineConfig } from "@mm/lark-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Documentation",
  description: "项目技术文档",
  nav: [...],
  sidebar: {...},
  markdown: {...},
  highlight: {...},
  search: true,
});
```

### 配置项概览

| 配置项        | 类型                            | 必填/缺省         | 说明              |
| ------------- | ------------------------------- | ----------------- | ----------------- |
| `docs`        | `string`                        | **必填**          | 文档源目录        |
| `baseUrl`     | `string`                        | **必填**          | 路由前缀          |
| `title`       | `string`                        | **必填**          | 站点标题          |
| `description` | `string`                        | 缺省序列化为 `""` | 站点描述          |
| `nav`         | `NavItem[]`                     | 缺省 `[]`         | 导航栏项目        |
| `sidebar`     | `Record<string, SidebarConfig>` | 缺省 `{}`         | 侧边栏配置        |
| `markdown`    | `MarkdownOptions`               | 缺省不传          | Markdown 扩展选项 |
| `highlight`   | `HighlightOptions`              | 缺省不高亮        | 代码高亮选项      |
| `search`      | `boolean`                       | 缺省视为启用      | 启用搜索 UI       |

> `docs` / `baseUrl` / `title` 在类型上都是必填的，没有运行时默认值。
> 上表就是全部可用字段——`DocsConfig` **没有** `themeConfig` / `lang` / `locales` / `head` / `outDir` / `editLink` / `lastUpdated` / `vdom` 等字段。

### 导航栏配置

```ts
nav: [
  // 站内链接
  { text: "指南", link: "/docs/guide/" },
  { text: "API", link: "/docs/api/" },

  // 外部链接（带协议的不会被加 baseUrl 前缀）
  { text: "GitHub", link: "https://github.com/org/repo" },
];
```

`NavItem` 接口：

```ts
interface NavItem {
  text: string; // 显示文本
  link: string; // 链接地址
  items?: NavItem[]; // 预留：内置主题不渲染
}
```

::: danger 内置主题的导航栏不支持下拉菜单
`docs-layout.html` 渲染导航栏时只用 `item.text` 和 `item.link`，**从不渲染 `item.items`**。写了嵌套 `items` 不会报错（`defineConfig` 依然会递归给它们加 `baseUrl` 前缀），但它们在页面上不可见。

需要下拉菜单请覆盖 `theme/docs-layout` 模板。
:::

导航栏活跃状态通过当前路径前缀匹配确定（`path === target || path.startsWith(target + "/")`，外链不参与匹配）。

## 启动定制

### boot.ts 扩展

`app/boot.ts` 是应用启动入口，可以在这里进行各种定制：

```ts
import {
  Framework,
  State,
  registerThemeViews,
  registerViewClass,
  type FrameworkConfig,
} from "@mm/lark-docs";
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@lark-docs/generated";

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  routes,
  vdom: false,
  defaultView: "theme/docs-layout",
  unmatchedView: "theme/docs-layout",
};

// 1. 注册默认主题（必须在 boot 之前，且传入与配置一致的 vdom）
registerThemeViews({ vdom: config.vdom });

// 2. 注册自定义 View（覆盖或新增）——后注册覆盖先注册
import CustomBanner from "./views/custom-banner";
registerViewClass("custom-banner", CustomBanner);

// 3. 注入运行时数据
State.set({
  docsConfig,
  loadContent,
  getSearchIndex,
  // 可以注入自定义数据
  customData: { version: "2.0.0" },
});

// 4. 启动框架
Framework.boot(config);
```

### FrameworkConfig 选项

`FrameworkConfig` 是 Lark Mvc 同名类型的收窄版——`routeMode` 被限定为字面量 `"history"`，其余字段完全继承：

```ts
type FrameworkConfig = Omit<LarkMvcFrameworkConfig, "routeMode"> & {
  routeMode: "history";
};
```

常用字段：

| 字段            | 说明                                      |
| --------------- | ----------------------------------------- |
| `rootId`        | 根 DOM 元素 ID                            |
| `routeMode`     | 固定为 `"history"`                        |
| `routes`        | 路由映射（来自生成模块）                  |
| `defaultView`   | 默认视图                                  |
| `unmatchedView` | 未匹配路由的视图（布局自己渲染 404 状态） |
| `defaultPath`   | 默认跳转路径                              |
| `vdom`          | 启用 VDOM 渲染模式                        |
| `error`         | 全局错误回调                              |

> 完整字段请参考 Lark Mvc 的 `FrameworkConfig` 类型定义。

## 样式定制

### 覆盖 CSS 变量

在 `main.css` 中覆盖设计令牌：

```css
@import "tailwindcss";
@import "../node_modules/@mm/lark-docs/dist/client.css";

/* 覆盖主色调 */
:root {
  --primary: oklch(0.5 0.2 250); /* 蓝色主色 */
  --primary-foreground: oklch(1 0 0); /* 白色文字 */
}

.dark {
  --primary: oklch(0.7 0.15 250);
}
```

> `client.css` 不在 `exports` 里，必须用文件路径引用；详见[快速开始](./03-getting-started#main-css)。

### 覆盖组件样式

```css
/* 自定义导航栏高度 */
.navbar {
  height: 4rem;
}

/* 自定义侧边栏宽度 */
.sidebar {
  width: 280px;
}

/* 自定义代码块圆角 */
.codeblock {
  border-radius: 12px;
}

/* 自定义容器样式 */
.callout-tip {
  border-left-color: #10b981;
  background: #ecfdf5;
}
```

### 自定义排版

覆盖 `@tailwindcss/typography` 的 prose 样式：

```css
.prose {
  --tw-prose-body: #374151;
  --tw-prose-headings: #111827;
  --tw-prose-links: #2563eb;
  --tw-prose-code: #dc2626;
}

.dark .prose {
  --tw-prose-body: #d1d5db;
  --tw-prose-headings: #f9fafb;
  --tw-prose-links: #60a5fa;
}
```

## VDOM 模式

默认使用字符串模板渲染（Real-DOM diff）。可以切换到 VDOM 模式：

```ts
// 方式一：两处都要设，且保持一致
const config: FrameworkConfig = { /* ... */ vdom: true };
registerThemeViews({ vdom: true }); // 必须显式传
Framework.boot(config);

// 方式二：直接从配置取，避免不一致
registerThemeViews({ vdom: config.vdom });
Framework.boot(config);
```

::: danger 不能只设 `Framework.boot({ vdom: true })`
`registerThemeViews()` 只有在 `Framework.isBooted()` 为 true 时才会去读 `Framework.getConfig("vdom")`。而它必须在 boot **之前**调用，此时自动探测拿不到值，会回退到 `false`——结果是主题用字符串模板而框架跑 VDOM 模式。所以**必须把 `vdom` 同时传给 `registerThemeViews`**。
:::

VDOM 模式使用虚拟 DOM + LIS（最长递增子序列）算法进行 diff，适合频繁更新的场景。

::: tip
对于文档站点，默认的字符串渲染模式已经足够高效——页面内容在导航时整体替换，无需细粒度 diff。VDOM 模式主要适用于嵌入大量动态组件的场景。
:::

## 自定义页面布局

### 覆盖 Layout View

```ts
import { registerViewClass, defineView } from "@mm/lark-docs";
import customLayout from "./views/custom-layout.html";

registerViewClass(
  "theme/docs-layout",
  defineView((ctx) => {
    // 自定义布局逻辑
    return { template: customLayout };
  }),
);
```

::: warning
覆盖 Layout View 需要自行实现内容加载、路由监听、侧边栏/TOC 集成等逻辑。建议先阅读[扩展默认主题](./15-extending-default-theme)了解更轻量的定制方式。
:::

### 添加全局组件

在 Layout 模板之外添加全局组件（如公告横幅、Cookie 提示等）：

```ts
// 在 boot.ts 中注册
registerViewClass(
  "announcement-banner",
  defineView((ctx) => {
    return { template: bannerTemplate };
  }),
);
```

然后通过覆盖 Layout 模板在合适位置挂载：

```html
<div v-lark="announcement-banner"></div>
<!-- 默认布局内容 -->
```

## 环境变量

### Vite 环境变量

通过 `.env` 文件配置环境相关变量：

```bash
# .env.production
VITE_ANALYTICS_ID=UA-XXXXX
VITE_API_BASE=https://api.example.com
```

在代码中访问：

```ts
const analyticsId = import.meta.env.VITE_ANALYTICS_ID;
```

### 条件配置

```ts
// lark-docs.config.ts
const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  // 开发环境包含草稿
  docs: "docs",
  search: !isDev ? true : true,
  // ...
});
```

## 多站点部署

一个项目可以包含多个文档集（如框架文档 + 组件库文档）：

```ts
defineConfig({
  docs: "docs",
  baseUrl: "/",
  nav: [
    { text: "Lark Mvc", link: "/lark-mvc/" },
    { text: "Lark Docs", link: "/lark-docs/" },
  ],
  sidebar: {
    "/lark-mvc/": "auto",
    "/lark-docs/": "auto",
  },
});
```

对应目录结构：

```
docs/
├── lark-mvc/    # 框架文档
│   ├── index.md
│   └── guide/
└── lark-docs/    # 生成器文档
    ├── index.md
    └── guide/
```

每个文档集拥有独立的侧边栏，通过导航栏切换。
