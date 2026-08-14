---
title: 构建时数据加载
sidebar_position: 15
description: 生成模块、数据流和运行时内容加载机制
---

# 构建时数据加载

Lark Docs 的核心数据流围绕一个**生成模块**（`.lark-docs/generated/index.js`）展开。这个模块在配置阶段生成，是连接构建时和运行时的桥梁。

## 生成模块

### 生成时机

`defineConfig()` 被调用时立即触发生成：

```ts
// lark-docs.config.ts
import { defineConfig } from "@mm/lark-docs/vite";

export default defineConfig({
  // ← 此处触发生成
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Docs",
});
```

生成过程：

1. `scanDocsDir()` 扫描文档目录
2. `generateSidebar()` 生成侧边栏
3. 构建 loader 映射（每个 `.md` 文件 → 动态 import 路径）
4. 渲染 EJS 模板（`file-content.ejs`）
5. 写入 `.lark-docs/generated/index.js`

### 模块导出

生成的模块导出 4 个成员：

#### routes

```ts
export const routes: Record<string, string>;
```

路由映射表——每个文档路径映射到布局视图。它**不是序列化的字面量**，而是在模块加载时从 `loaders` 的键动态计算出来的：

```js
const LAYOUT_VIEW = "theme/docs-layout";

export const routes = Object.fromEntries(
  Object.keys(loaders).map((k) => [k, LAYOUT_VIEW]),
);
```

等价于：

```js
{
  "/docs": "theme/docs-layout",
  "/docs/guide/intro": "theme/docs-layout",
  "/docs/guide/config": "theme/docs-layout",
  "/docs/api/hooks": "theme/docs-layout",
}
```

所有路由指向同一个视图（`"theme/docs-layout"`），由 Layout 内部处理内容切换。这样避免了把一份大路由表序列化进生成文件。

#### loadContent

```ts
export async function loadContent(
  path: string,
): Promise<{ pageData: PageData; contentHtml: string } | null>;
```

页面内容加载器：

```js
const loaders = {
  "/docs": () => import("../../docs/index.md?lark-docs"),
  "/docs/guide/intro": () => import("../../docs/guide/intro.md?lark-docs"),
  // ...
};

export async function loadContent(path) {
  // 1. 规范化路径：去除尾部斜杠和 /index、/index.md、/index.html 后缀
  let normalized = (path || "/").replace(/\/+$/, "") || "/";
  normalized = normalized.replace(
    /^(.*?)(?:\/index(?:\.md|\.html)?)\/?$/,
    (_m, p1) => p1 || "/",
  );
  // 2. 查找 loader
  const loader = loaders[normalized];
  if (!loader) return null;
  // 3. 动态导入编译后的 .md 模块
  const mod = await loader();
  return { pageData: mod.pageData, contentHtml: mod.contentHtml };
}
```

关键设计：

- 使用相对路径的 `import()`，确保构建后路径正确
- 每个 `.md` 文件是独立 chunk（路由级代码分割）
- `?lark-docs` 后缀触发 Vite 插件的编译管道

#### docsConfig

```ts
export const docsConfig: Omit<DocsConfig, "docs">;
```

序列化的站点配置 JSON：

```js
export const docsConfig = {
  title: "My Docs",
  description: "项目文档",
  baseUrl: "/docs/",
  nav: [
    { text: "指南", link: "/docs/guide/" },
    { text: "API", link: "/docs/api/" },
  ],
  sidebar: {
    "/docs/guide/": [
      { text: "Introduction", link: "/docs/guide/intro" },
      { text: "Configuration", link: "/docs/guide/config" },
    ],
  },
  // search 仅当用户显式设置过才会出现在这里
  search: true,
};
```

实际序列化行为（见 `define-config.ts` 的 `runtimeConfig`）：

| 字段          | 行为                                              |
| ------------- | ------------------------------------------------- |
| `title`       | 原样输出                                          |
| `baseUrl`     | 原样输出                                          |
| `description` | 未配置时输出 `""`                                 |
| `nav`         | 未配置时输出 `[]`；link 已递归加上 baseUrl 前缀   |
| `sidebar`     | `"auto"` 已展开为 `SidebarItem[]`；手动项已加前缀 |
| `search`      | **仅当 `!== undefined` 时才写入**                 |
| `docs`        | **不输出**（文件系统路径不进运行时）              |
| `markdown`    | **不输出**（纯构建期配置）                        |
| `highlight`   | **不输出**（纯构建期配置）                        |

所以运行时主题读不到 `markdown` / `highlight`——它们只影响编译阶段的 HTML 产出。

#### getSearchIndex

```ts
export async function getSearchIndex(): Promise<SearchEntry[]>;
```

搜索索引构建函数：

```js
let _searchIndex = null;
const _searchablePaths = new Set(["/docs", "/docs/guide/intro", ...]);

export async function getSearchIndex() {
  if (_searchIndex) return _searchIndex;

  const entries = Object.entries(loaders).filter(([k]) =>
    _searchablePaths.has(k),
  );
  // 并行加载所有页面模块
  const mods = await Promise.all(entries.map(([, loader]) => loader()));
  _searchIndex = mods.map((mod, i) => {
    const link = entries[i][0];
    const pd = mod.pageData || {};
    return {
      title: pd.title || "",
      link,
      headings: (pd.headings || []).map((h) => h.text || ""),
      excerpt: pd.excerpt || pd.description || "",
    };
  });
  return _searchIndex;
}
```

- 首次调用时**并行**加载所有可搜索页面
- 结果缓存，后续调用直接返回
- 虚拟索引路由（`isDirectoryIndex`）不包含在 `_searchablePaths` 中

::: warning `getSearchIndex()` 是无条件生成的
`file-content.ejs` 不看 `search` 配置——即使你设了 `search: false`，生成模块仍然会导出 `getSearchIndex()` 和 `_searchablePaths`。只是没人调用它（布局不会挂载搜索子视图）。
:::

## 数据流全景

```
┌─────────────────────────────────────────────────────────────────┐
│ 构建时                                                           │
│                                                                  │
│  lark-docs.config.ts                                            │
│       │                                                          │
│       ▼                                                          │
│  defineConfig()                                                  │
│       │                                                          │
│       ├─ scanDocsDir() ──→ DocsRoute[]                           │
│       ├─ generateSidebar() ──→ SidebarItem[]                     │
│       └─ 写入 .lark-docs/generated/index.js                     │
│                                                                  │
│  Vite 构建                                                       │
│       │                                                          │
│       ├─ 解析 generated/index.js 中的 import() 路径               │
│       ├─ 对每个 .md 触发 larkDocsPlugin.load()                   │
│       │       └─ compileMarkdown() → JS 模块                     │
│       └─ 输出独立 chunk                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 运行时                                                           │
│                                                                  │
│  boot.ts                                                         │
│       │                                                          │
│       ├─ import { routes, docsConfig, loadContent, getSearchIndex }│
│       ├─ registerThemeViews()                                    │
│       ├─ State.set({ docsConfig, loadContent, getSearchIndex })  │
│       └─ Framework.boot({ routes })                              │
│                                                                  │
│  用户导航到 /docs/guide/intro                                     │
│       │                                                          │
│       ├─ Router 匹配 → "theme/docs-layout"                       │
│       ├─ Layout.observeLocation 触发                             │
│       ├─ loadContent("/docs/guide/intro")                        │
│       │       └─ import("guide-intro-[hash].js")                 │
│       │              └─ 返回 { pageData, contentHtml }            │
│       ├─ 渲染 contentHtml                                        │
│       └─ 更新侧边栏、TOC、document.title                         │
│                                                                  │
│  用户打开搜索                                                     │
│       │                                                          │
│       ├─ getSearchIndex()                                        │
│       │       └─ 加载所有页面模块，提取搜索条目                     │
│       └─ MiniSearch 构建索引 → 即时搜索                           │
└─────────────────────────────────────────────────────────────────┘
```

## Markdown 编译管道

每个 `.md` 文件在构建时经历完整的编译管道：

```
.md 源文件
    │
    ▼
extractFrontmatter(source)
    │ → { data: {title, description, ...}, content: "正文" }
    │
    ▼
createParser(markdownOptions)
    │ → 配置好的 MarkdownIt 实例
    │   ├─ anchorPlugin（标题 ID + 永久链接）
    │   ├─ tocPlugin（[[toc]] 指令）
    │   ├─ containerPlugin（::: 容器）
    │   └─ codeBlockPlugin（代码块增强）
    │
    ▼
getHighlighter(theme, languages, darkTheme)  [如果配置了 highlight]
    │ → Shiki Highlighter 实例（懒加载 + 缓存）
    │
    ▼
md.parse(content) → tokens
    │
    ▼
renderToLarkTemplate(tokens, md) → HTML 字符串
    │
    ▼
构建 pageData
    │ → { title, description, excerpt, headings, relativePath, ... }
    │
    ▼
输出 JS 模块字符串：
    export const pageData = {...};
    export const contentHtml = "...";
```

### 编译输出格式

```js
// Generated by @mm/lark-docs
// Source: docs/guide/intro.md

export const pageData = {
  title: "介绍",
  description: "框架基础知识",
  excerpt: "介绍 欢迎使用本框架...",
  sidebarPosition: 0,
  headings: [
    { level: 2, text: "安装", slug: "安装" },
    { level: 2, text: "使用", slug: "使用" },
  ],
  relativePath: "guide/intro.md",
};

export const contentHtml = '<h1 id="介绍" class="scroll-mt-20">介绍...</h1>...';
```

## 构建时工具 API

### scanDocsDir

```ts
import { scanDocsDir } from "@mm/lark-docs/vite";

const routes = scanDocsDir(docsDir, baseUrl);
```

| 参数      | 类型     | 说明             |
| --------- | -------- | ---------------- |
| `docsDir` | `string` | 文档目录绝对路径 |
| `baseUrl` | `string` | 路由前缀         |

返回 `DocsRoute[]`，每项包含 `path`、`filePath`、`pageData`、`isDirectoryIndex`。

### generateSidebar

```ts
import { generateSidebar } from "@mm/lark-docs/vite";

const sidebar = generateSidebar(routes, prefix);
```

| 参数     | 类型          | 说明                     |
| -------- | ------------- | ------------------------ |
| `routes` | `DocsRoute[]` | 扫描结果                 |
| `prefix` | `string`      | 侧边栏前缀（含 baseUrl） |

返回 `SidebarItem[]`。

### compileMarkdown

```ts
import { compileMarkdown } from "@mm/lark-docs/compiler";

const jsModule = await compileMarkdown(source, {
  config: docsConfig,
  filePath: "/absolute/path/to/file.md",
  debug: false,
  projectRoot: "/project/root",
});
```

返回 JS 模块字符串（包含 `pageData` 和 `contentHtml` 导出）。

## 运行时 State 注入

`boot.ts` 通过 `State.set()` 将数据注入全局状态：

```ts
State.set({
  docsConfig, // 站点配置
  loadContent, // 内容加载器
  getSearchIndex, // 搜索索引构建器
});
```

各主题 View 通过 `State.get()` 读取：

```ts
// Layout View 中
const config = State.get("docsConfig");
const loader = State.get("loadContent");
```

### 为什么使用 State 而非 import？

- **解耦**：主题 View 不直接依赖生成模块的路径
- **可替换**：自定义主题可以注入不同的数据源
- **类型安全**：通过 Zod schema 验证运行时数据

## 性能优化

### 路由级代码分割

每个 `.md` 文件编译为独立 chunk：

```
assets/
├── index-abc123.js          # 主 bundle（框架 + 主题）
├── guide-intro-def456.js    # 页面 chunk
├── guide-config-ghi789.js   # 页面 chunk
└── api-hooks-jkl012.js      # 页面 chunk
```

用户导航时才加载目标页面 chunk，首屏只加载主 bundle + 当前页面。

### 搜索索引懒加载

搜索索引不在首屏加载——仅在用户首次打开搜索面板时触发 `getSearchIndex()`，加载所有页面模块并构建索引。

### Shiki 高亮器缓存

高亮器实例按 `theme + darkTheme + languages` 组合缓存：

```ts
const cache = new Map<string, Highlighter>();
// key: "github-light+github-dark:css,html,javascript,typescript,..."
```

同一构建中多个 `.md` 文件共享同一个高亮器实例。

### 生成模块的相对路径

Loader 使用相对路径（从 `.lark-docs/generated/` 到 `.md` 文件），确保：

- 项目可以在任意目录结构中工作
- 构建后的 chunk 引用路径正确
- 不依赖绝对路径（跨机器可移植）
