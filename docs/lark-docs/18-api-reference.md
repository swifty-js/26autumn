---
title: 配置与 API 参考
sidebar_position: 17
description: 完整的配置选项和 API 接口文档
---

# 配置与 API 参考

本文档是 `@mm/lark-docs` 的完整 API 参考，涵盖所有配置选项、导出函数、类型定义和子路径模块。

## 包导出总览

| 子路径                   | 环境          | 主要导出                                                                       |
| ------------------------ | ------------- | ------------------------------------------------------------------------------ |
| `@mm/lark-docs`          | 浏览器 + Node | 类型、`slugify`、`icons`、`registerThemeViews` + 4 个视图工厂、框架 API 重导出 |
| `@mm/lark-docs/vite`     | Node          | `larkDocsPlugin`、`defineConfig`、`scanDocsDir`、`generateSidebar`             |
| `@mm/lark-docs/webpack`  | Node          | `LarkDocsPlugin`、`larkDocsLoader`、`scanDocsDir`、`generateSidebar`           |
| `@mm/lark-docs/rspack`   | Node          | `LarkDocsPlugin`、`larkDocsLoader`、`scanDocsDir`、`generateSidebar`           |
| `@mm/lark-docs/compiler` | Node          | `compileMarkdown`                                                              |
| `@mm/lark-docs/runtime`  | 浏览器        | `slugify`（仅此一项）                                                          |
| `@mm/lark-docs/theme`    | 浏览器        | `registerThemeViews`、**全 5 个**视图工厂、`icons`                             |
| `@mm/lark-docs/client`   | 类型          | 环境类型声明（无运行时产物）                                                   |

::: warning 两个容易踩到的坑

- **`webpack` / `rspack` 子路径不导出 `defineConfig`** —— 它只在 `./vite` 里。用 Webpack/Rspack 时仍需从 `@mm/lark-docs/vite` 导入 `defineConfig`（它本身不依赖 Vite 运行时）。
- **`client.css` 不在 exports 里**。它会被拷到 `dist/client.css`，但必须用文件路径引用，不能写 `@mm/lark-docs/client.css`。
  :::

## 主入口（@mm/lark-docs）

### 框架 API 重导出

从 `@mm/lark-mvc` 重导出，无需单独安装：

```ts
import {
  Framework, // 框架核心（boot, config, utilities）
  defineView, // View 定义
  State, // 全局状态单例
  Router, // 路由器
  registerViewClass, // View 注册
} from "@mm/lark-docs";
```

### 类型导出

```ts
import type {
  DocsConfig,
  NavItem,
  SidebarConfig,
  SidebarItem,
  MarkdownOptions,
  HighlightOptions,
  PageData,
  HeadingInfo,
  DocsRoute,
  SearchEntry,
  FrontmatterResult,
  CompileMarkdownOptions,
  FrameworkConfig,
  ViewCtx,
  ViewSetup,
} from "@mm/lark-docs";
```

### 运行时导出

```ts
import { slugify } from "@mm/lark-docs";
import {
  createDocsLayoutView,
  createSidebarView,
  createTocView,
  createSearchView,
  registerThemeViews,
  icons,
} from "@mm/lark-docs";
```

::: tip
`createThemeToggleView` 未从主入口导出，需通过 `@mm/lark-docs/theme` 子路径导入。
:::

## 配置接口

### DocsConfig

```ts
interface DocsConfig {
  /** 文档源目录（相对于项目根目录）。**必填** */
  docs: string;

  /** 路由前缀。**必填** */
  baseUrl: string;

  /** 站点标题（显示在导航栏）。**必填** */
  title: string;

  /** 站点描述。未设时序列化为 "" */
  description?: string;

  /** 导航栏项目。未设时序列化为 [] */
  nav?: NavItem[];

  /** 侧边栏配置（按路由前缀）。未设时序列化为 {} */
  sidebar?: Record<string, SidebarConfig>;

  /** Markdown 扩展选项。纯构建期，不进运行时配置 */
  markdown?: MarkdownOptions;

  /** 代码高亮选项。默认 undefined（不高亮）；纯构建期 */
  highlight?: HighlightOptions;

  /** 启用搜索 UI。仅当显式设置时才进运行时配置；布局视图把缺失视为启用 */
  search?: boolean;
}
```

::: tip 关于“默认值”
`docs` / `baseUrl` / `title` 在类型上都是**必填**的，没有运行时默认值。`"docs"` 与 `"/docs/"` 只是常见写法。
:::

### NavItem

```ts
interface NavItem {
  /** 显示文本 */
  text: string;
  /** 链接地址 */
  link: string;
  /** 嵌套子项——**预留字段，内置主题不渲染它** */
  items?: NavItem[];
}
```

::: danger `NavItem.items` 不会显示
`defineConfig()` 会递归给子项加 `baseUrl` 前缀，`docs-layout.ts` 的 Zod schema 也接受它，但 `docs-layout.html` 渲染导航栏时是扁平的 `{{forOf navItems as item}}`，只用 `item.text` 和 `item.link`。想要下拉菜单需自行覆盖布局模板。
:::

### SidebarConfig

```ts
type SidebarConfig = "auto" | SidebarItem[];
```

- `"auto"`：根据文件系统自动生成
- `SidebarItem[]`：手动配置

### SidebarItem

```ts
interface SidebarItem {
  /** 显示文本 */
  text: string;
  /** 链接路径（叶子节点） */
  link?: string;
  /** 初始折叠状态（分组节点）。默认 false */
  collapsed?: boolean;
  /** 子项（分组节点） */
  items?: SidebarItem[];
  /** 运行时：是否活跃 */
  isActive?: boolean;
  /** 运行时：自定义 CSS 类 */
  itemClass?: string;
}
```

### MarkdownOptions

```ts
interface MarkdownOptions {
  /** 标题锚点配置 */
  anchor?: {
    /** 是否为 h1-h3 添加 # 永久链接。默认 true */
    permalink?: boolean;
  };

  /** 自定义容器标签 */
  containers?: Record<string, { label: string }>;
}
```

### HighlightOptions

```ts
interface HighlightOptions {
  /** Shiki 主题名。默认 "github-dark" */
  theme?: string;

  /** 暗色模式主题（启用双主题 CSS 变量输出） */
  darkTheme?: string;

  /** 要加载的语言列表。默认 44 种常见语言 */
  languages?: string[];
}
```

### PageData

```ts
interface PageData {
  /** 页面标题 */
  title: string;
  /** 页面描述 */
  description?: string;
  /** 正文摘要（前 200 字符） */
  excerpt: string;
  /** 侧边栏排序位置 */
  sidebarPosition?: number;
  /** 侧边栏显示文本 */
  sidebarLabel?: string;
  /** 标题列表（h2/h3） */
  headings: HeadingInfo[];
  /** 相对于 docs 目录的文件路径 */
  relativePath: string;
}
```

### HeadingInfo

```ts
interface HeadingInfo {
  /** 标题级别（2 或 3） */
  level: number;
  /** 标题文本 */
  text: string;
  /** 锚点 slug */
  slug: string;
}
```

### DocsRoute

```ts
interface DocsRoute {
  /** 路由路径 */
  path: string;
  /** 文件系统绝对路径 */
  filePath: string;
  /** 页面元数据 */
  pageData: PageData;
  /** 是否为虚拟目录索引 */
  isDirectoryIndex?: boolean;
}
```

### SearchEntry

```ts
interface SearchEntry {
  /** 页面标题 */
  title: string;
  /** 页面路由 */
  link: string;
  /** 标题文本列表 */
  headings: string[];
  /** 正文摘要 */
  excerpt: string;
}
```

### CompileMarkdownOptions

```ts
interface CompileMarkdownOptions {
  /** 站点配置 */
  config: DocsConfig;
  /** 文件绝对路径 */
  filePath: string;
  /** 调试模式 */
  debug?: boolean;
  /** 项目根目录 */
  projectRoot?: string;
}
```

## Vite 插件（@mm/lark-docs/vite）

### larkDocsPlugin

```ts
function larkDocsPlugin(options: LarkDocsVitePluginOptions): Plugin[];
```

返回包含两个 Vite 插件的数组：

1. `lark-docs`（enforce: "pre"）：拦截 `.md` 文件，调用 `compileMarkdown()`
2. `lark-template`（来自 `@mm/lark-mvc`）：编译 `.html` 模板文件

**选项：**

```ts
interface LarkDocsVitePluginOptions {
  /** 站点配置（必填） */
  config: DocsConfig;
  /** 调试输出。默认 false */
  debug?: boolean;
  /** VDOM 模式。默认 false */
  vdom?: boolean;
}
```

### defineConfig

```ts
function defineConfig(config: DocsConfig, projectRoot?: string): DocsConfig;
```

身份函数 + 副作用（扫描目录、生成侧边栏、写入生成模块）。`projectRoot` 默认为 `process.cwd()`。

### scanDocsDir

```ts
function scanDocsDir(docsDir: string, baseUrl: string): DocsRoute[];
```

### generateSidebar

```ts
function generateSidebar(routes: DocsRoute[], prefix: string): SidebarItem[];
```

## Webpack 插件（@mm/lark-docs/webpack）

### LarkDocsPlugin

```ts
class LarkDocsPlugin {
  constructor(options: LarkDocsWebpackOptions);
  apply(compiler: Compiler): void;
}
```

**选项：**

```ts
interface LarkDocsWebpackOptions {
  config: DocsConfig;
  debug?: boolean;
  test?: RegExp; // 默认 /\.md$/
  exclude?: RegExp; // 默认 /node_modules/
}
```

`apply()` 向 `compiler.options.module.rules` 注入 loader 规则，loader 指向 `__filename`（包自身）。

### larkDocsLoader

```ts
function larkDocsLoader(this: WebpackLoaderContext, source: string): void;
```

使用 `this.callback()` 异步模式（webpack 5 约定）。

## Rspack 插件（@mm/lark-docs/rspack）

### LarkDocsPlugin

```ts
class LarkDocsPlugin {
  constructor(options: LarkDocsRspackOptions);
  apply(compiler: Compiler): void;
}
```

**选项：**

```ts
interface LarkDocsRspackOptions {
  config: DocsConfig;
  debug?: boolean;
  test?: RegExp; // 默认 /\.md$/
  exclude?: RegExp; // 默认 /node_modules/
}
```

### larkDocsLoader

```ts
async function larkDocsLoader(
  this: RspackLoaderContext,
  source: string,
): Promise<string>;
```

直接返回 `Promise<string>`（Rspack 异步 loader 约定）。

## 编译器（@mm/lark-docs/compiler）

### compileMarkdown

```ts
async function compileMarkdown(
  source: string,
  options: CompileMarkdownOptions,
): Promise<string>;
```

将 Markdown 源码编译为 JS 模块字符串。

**管道步骤：**

1. `extractFrontmatter(source)` → 分离 YAML 和正文
2. `createParser(config.markdown)` → 配置 markdown-it
3. `getHighlighter(theme, langs, darkTheme)` → 初始化 Shiki（如配置）
4. `md.parse(content)` → token 流
5. `renderToLarkTemplate(tokens)` → HTML 字符串
6. 构建 `pageData` 对象
7. 输出 `export const pageData = ...; export const contentHtml = ...;`

## 运行时（@mm/lark-docs/runtime）

### slugify

```ts
function slugify(text: string): string;
```

将文本转换为 URL 安全的锚点 ID：

- 转小写
- 非字母/数字 → `-`（保留 Unicode 字母）
- 空白 → `-`
- 合并连续 `-`
- 去除首尾 `-`
- 数字开头加 `_`

::: warning `createSlugger` 不是公开 API
内部确实有一个带去重的 `createSlugger()`（给重复标题追加 `-1`、`-2` 后缀），供 anchor 插件和标题提取共用，但 **`@mm/lark-docs/runtime` 和主入口都没有导出它** —— `runtime.ts` 只 `export { slugify }`。自定义主题如需去重逻辑请自行实现。
:::

## 主题（@mm/lark-docs/theme）

### registerThemeViews

```ts
function registerThemeViews(options?: { vdom?: boolean }): void;
```

注册 5 个默认主题视图（`theme/docs-layout`、`theme/sidebar`、`theme/toc`、`theme/search`、`theme/theme-toggle`）。

`vdom` 解析顺序：`options.vdom` → （已 boot 时）`Framework.getConfig("vdom")` → `false`。

::: warning 必须在 `Framework.boot()` 之前调用
boot 期间就会挂载 `defaultView`，此时视图必须已注册。又因为此时 `Framework.isBooted()` 为 false，自动探测拿不到 `vdom`——所以用 VDOM 模式时**必须显式传 `{ vdom: true }`**。
:::

该函数**无条件**注册全部 5 个视图，与 `search` 配置无关（`search: false` 只影响布局是否挂载搜索子视图）。

### 视图工厂

```ts
function createDocsLayoutView(template: ViewTemplate | VDomTemplate): ViewSetup;
function createSidebarView(template: ViewTemplate | VDomTemplate): ViewSetup;
function createTocView(template: ViewTemplate | VDomTemplate): ViewSetup;
function createSearchView(template: ViewTemplate | VDomTemplate): ViewSetup;
function createThemeToggleView(
  template: ViewTemplate | VDomTemplate,
): ViewSetup;
```

每个工厂接受预编译的模板，返回 `ViewSetup`（可直接传给 `registerViewClass`）。

### icons

```ts
const icons: Record<string, string>;
```

17 个 lucide SVG 图标的原始字符串映射（键名为 camelCase）：

search, menu, x, sun, moon, chevronDown, chevronRight, copy, check, list, arrowUpRight, arrowLeft, arrowRight, compass, info, triangleAlert, octagonAlert

## 完整配置示例

```ts
import { defineConfig } from "@mm/lark-docs/vite";

export default defineConfig({
  // 文档源目录
  docs: "docs",

  // 路由前缀
  baseUrl: "/docs/",

  // 站点标题
  title: "My Framework",

  // 站点描述
  description: "A modern frontend framework",

  // 导航栏（注意：内置主题扁平渲染，不支持嵌套 items 下拉）
  nav: [
    { text: "指南", link: "/docs/guide/" },
    { text: "API", link: "/docs/api/" },
    { text: "更新日志", link: "/docs/changelog" },
    { text: "GitHub", link: "https://github.com/org/repo" },
  ],

  // 侧边栏
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": [
      { text: "概览", link: "/docs/api/overview" },
      {
        text: "Hooks",
        collapsed: false,
        items: [
          { text: "useState", link: "/docs/api/use-state" },
          { text: "useEffect", link: "/docs/api/use-effect" },
          { text: "useStore", link: "/docs/api/use-store" },
        ],
      },
    ],
  },

  // Markdown 选项
  markdown: {
    anchor: { permalink: true },
    containers: {
      tip: { label: "提示" },
      warning: { label: "注意" },
      danger: { label: "危险" },
      details: { label: "详情" },
    },
  },

  // 代码高亮
  highlight: {
    theme: "github-light",
    darkTheme: "github-dark",
    languages: [
      "typescript",
      "javascript",
      "html",
      "css",
      "bash",
      "json",
      "yaml",
      "markdown",
    ],
  },

  // 搜索
  search: true,
});
```

## 默认语言列表

`highlight.languages` 未指定时加载的 44 种语言：

bash, cjs, css, csv, cts, docker, dockerfile, dotenv, go, graphql, html, http, javascript, js, json, json5, jsonc, jsonl, jsx, less, make, makefile, markdown, md, mdc, mdx, mermaid, mjs, mts, nginx, prisma, proto, protobuf, scss, sql, toml, tsx, typescript, vue, wasm, xml, yaml, yml, zsh

## 依赖清单

| 依赖                    | 用途                  |
| ----------------------- | --------------------- |
| `@mm/lark-mvc`          | 前端框架（workspace） |
| `markdown-it`           | Markdown 解析         |
| `markdown-it-container` | `:::` 容器语法        |
| `shiki`                 | 语法高亮（WASM）      |
| `js-yaml`               | YAML frontmatter 解析 |
| `minisearch`            | 全文搜索引擎          |
| `ejs`                   | 生成模块模板渲染      |
| `lucide-static`         | SVG 图标              |
| `zod`                   | 运行时数据验证        |
| `vite-plugin-pwa`       | PWA 支持              |

**Peer dependencies：**

| 依赖                      | 版本   |
| ------------------------- | ------ |
| `tailwindcss`             | ^4.0.0 |
| `@tailwindcss/typography` | ^0.5.0 |
