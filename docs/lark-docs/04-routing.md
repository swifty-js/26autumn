---
title: 路由
sidebar_position: 3
description: Lark Docs 文件系统路由规则与客户端导航机制
---

# 路由

Lark Docs 采用**基于文件系统的路由**——文档目录中的每个 `.md` 文件自动映射为一个 URL 路径。路由在配置阶段由 `scanDocsDir()` 扫描生成，运行时通过 Lark Mvc 的 `Router`（history 模式）进行 SPA 导航。

## 路由映射规则

### 基本映射

| 文件路径              | 生成路由            |
| --------------------- | ------------------- |
| `docs/index.md`       | `/docs`             |
| `docs/guide/index.md` | `/docs/guide`       |
| `docs/guide/intro.md` | `/docs/guide/intro` |
| `docs/api/config.md`  | `/docs/api/config`  |

规则说明：

- `index.md` 映射为其所在目录的路径（目录级索引）
- 其他 `.md` 文件映射为去除扩展名后的路径（stem）
- 所有路由以配置的 `baseUrl` 为前缀
- 路由**不带尾部斜杠**

### baseUrl 前缀

`baseUrl` 配置项决定所有路由的公共前缀：

```ts
defineConfig({
  baseUrl: "/docs/", // 所有路由以 /docs 开头
  // ...
});
```

如果 `baseUrl` 为 `"/lark/"`，则 `docs/guide/intro.md` 映射为 `/lark/guide/intro`。

## 文件扫描规则

`scanDocsDir()` 递归遍历文档目录，遵循以下规则：

### 包含的文件

- 扩展名为 `.md` 的文件

### 排除的文件和目录

| 排除规则               | 示例                                                |
| ---------------------- | --------------------------------------------------- |
| 以 `_` 开头的文件/目录 | `_drafts/`、`_private.md`                           |
| 以 `.` 开头的文件/目录 | `.git/`、`.DS_Store`                                |
| 特定目录名             | `node_modules`、`__tests__`、`__fixtures__`、`dist` |
| 工具目录               | `.vitepress`、`.lark-docs`                          |

> 想隐藏未完成的页面，把文件名或目录名以 `_` 开头即可（如 `_drafts/`、`_wip.md`）。

### 扫描 API

```ts
import { scanDocsDir } from "@mm/lark-docs/vite";

const routes = scanDocsDir(
  "/absolute/path/to/docs", // 文档目录绝对路径
  "/docs/", // baseUrl
);
```

返回值 `DocsRoute[]`：

```ts
interface DocsRoute {
  path: string; // 路由路径，如 "/docs/guide/intro"
  filePath: string; // 文件系统绝对路径
  pageData: PageData; // 页面元数据
  isDirectoryIndex?: boolean; // 是否为虚拟目录索引
}
```

## 虚拟目录索引

当一个目录**没有 `index.md`** 文件时，扫描器会为该目录生成一个**虚拟索引路由**：

```
docs/
└── guide/
    ├── intro.md          (sidebar_position: 0)
    └── configuration.md  (sidebar_position: 1)
```

此时访问 `/docs/guide` 会生成一个虚拟路由，指向该目录下的**第一个页面**（按排序规则确定）。

### 第一个页面的选择规则

1. 如果所有页面都设置了 `sidebar_position`，取 `sidebar_position` 最小的
2. 否则按文件名字母序取第一个
3. 这是一个"全有或全无"规则——要么所有文件都有 `sidebar_position`，要么都按文件名排序

### 虚拟索引的特征

- 标记为 `isDirectoryIndex: true`
- 不出现在侧边栏中（避免重复链接）
- 不包含在搜索索引中（`_searchablePaths` 排除了它）
- 运行时访问该路径会**直接渲染首页内容，URL 保持不变**

::: warning 虚拟索引不会发生重定向
扫描器已经把虚拟索引路径（如 `/docs/guide`）直接映射到首页的 `.md` 模块并写进了 loaders，因此 `loadContent("/docs/guide")` 会直接返回内容。

布局视图里唯一的重定向逻辑只针对字面以 `/index`、`/index.md`、`/index.html` 结尾的路径（剔除这些后缀后 `Router.to(cleanPath, {}, true)`）。
:::

## 生成模块

配置阶段最终将路由信息写入 `.lark-docs/generated/index.js`，导出：

### routes

```ts
export const routes: Record<string, string>;
// 示例：{ "/docs": "theme/docs-layout", "/docs/guide/intro": "theme/docs-layout", ... }
```

所有路由都映射到同一个布局视图 `"theme/docs-layout"`。布局视图保持挂载状态，通过 `observeLocation` 监听路由变化并按需加载页面内容。

### loadContent

```ts
export async function loadContent(path: string): Promise<{
  pageData: PageData;
  contentHtml: string;
} | null>;
```

- 规范化路径（去除尾部斜杠、`/index`、`/index.md`、`/index.html` 后缀）
- 在 `loaders` 映射表中查找对应的动态 `import()` 函数
- 返回编译后的页面数据，或 `null`（路径不存在时）

### docsConfig

```ts
export const docsConfig: Omit<DocsConfig, "docs">;
```

运行时站点配置（不含 `docs` 字段），包含 `title`、`baseUrl`、`nav`、`sidebar`、`search` 等。

### getSearchIndex

```ts
export async function getSearchIndex(): Promise<SearchEntry[]>;
```

懒加载搜索索引——首次调用时加载所有可搜索页面的编译模块，提取标题、链接、标题列表和摘要。

## 客户端导航

### 路由模式

Lark Docs 强制使用 **history 模式**（`pushState`），类型层面将 `FrameworkConfig.routeMode` 限定为 `"history"`。

### 导航流程

```
用户点击带 data-href 的元素（主题模板里的链接/卡片）
    │
    ▼
事件委派到 navigateTo<click> 处理器
    │
    ├─ 向上查找携带 data-href 的祖先元素
    ├─ 调用 Router.to(href)
    │
    ▼
Router 触发位置变更
    │
    ├─ Layout 的 observeLocation([], true) 生效
    │
    ▼
renderMethod 执行
    │
    ├─ 路径归一化（去尾斜杠）
    ├─ 若以 /index、/index.md、/index.html 结尾 → 重定向到干净路径
    ├─ 若路径未变 → 只同步抽屉状态后返回
    ├─ 显示加载骨架屏
    ├─ await loadContent(path)
    ├─ Zod 验证返回数据
    ├─ 设置 document.title
    ├─ 计算前/后页链接
    ├─ 渲染 contentHtml
    └─ 后处理：动画、代码复制按钮、滚动定位
```

### 内部链接与外部链接

Markdown 编译时，链接渲染规则：

- 以 `/` 或 `#` 开头的链接：原样输出，点击后走浏览器默认导航（整页加载；页内锚点 `#xxx` 正常滚动）
- 外部链接：添加 `target="_blank" rel="noopener noreferrer"`，新标签页打开

> 内置主题自身的 SPA 导航（侧边栏、导航栏、前/后页卡片）靠的是主题模板里的 `data-href` + `@click="navigateTo()"`，与正文链接无关。若需要拦截正文内部链接实现软导航，请在自定义主题里自行给内容区绑定委派处理器。

### 索引路径重定向

布局视图只对字面以 `/index`、`/index.md`、`/index.html` 结尾的路径做重定向（剔掉后缀后 `Router.to(cleanPath, {}, true)`）。目录虚拟索引不参与重定向——它的内容直接就能加载出来。

### 前/后页导航

Layout 视图把 **所有** sidebar 分组的链接递归扁平化为一个列表，再按 `link === currentPath` 精确定位当前页，取前后一项渲染为页面底部的导航卡片。

> 因为是跨分组扁平化，多文档集站点的“上一页/下一页”可能会跨越文档集边界。

### 过期渲染保护

Layout 使用签名（signature）机制防止异步竞态：每次导航递增签名，`loadContent` 返回后检查签名是否仍有效——如果用户在加载期间又进行了导航，过期的渲染结果会被丢弃。

## 路由配置示例

```ts
defineConfig({
  docs: "docs",
  baseUrl: "/lark/",
  sidebar: {
    "/lark/guide/": "auto",
    "/lark/api/": "auto",
  },
});
```

对应目录结构：

```
docs/
├── index.md              → /lark
├── guide/
│   ├── index.md          → /lark/guide
│   ├── intro.md          → /lark/guide/intro
│   └── advanced.md       → /lark/guide/advanced
└── api/
    ├── overview.md       → /lark/api/overview
    └── hooks.md          → /lark/api/hooks
```

注意 `/lark/api` 没有 `index.md`，因此会生成一个虚拟索引路由指向 `/lark/api/overview`（按排序规则确定的第一个页面）。
