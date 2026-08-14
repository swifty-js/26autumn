---
title: 什么是 Lark Docs?
sidebar_position: 1
description: Lark Docs 的设计理念、适用场景与技术架构
---

# 什么是 Lark Docs?

Lark Docs（`@mm/lark-docs`）是一个基于 Lark Mvc 前端框架的**静态文档站点生成器**。它的设计目标是为 Lark 生态系统提供一流的文档编写和发布体验，同时保持极小的运行时体积和出色的性能表现。

## 设计理念

### 编译时优先

Lark Docs 将尽可能多的工作推到构建阶段完成：

- **Markdown 编译**：每个 `.md` 文件在构建时被编译为包含 `pageData`（元数据）和 `contentHtml`（渲染后 HTML）的 JavaScript 模块，浏览器端无需任何 Markdown 解析器。
- **语法高亮**：Shiki 在构建时通过 WASM 引擎生成带内联样式的 HTML，运行时零开销。
- **路由生成**：文件系统扫描在配置阶段完成，生成静态路由映射表。
- **侧边栏生成**：目录结构在配置阶段转换为导航树，无需运行时计算。

### 零运行时依赖

Lark Mvc 框架本身没有任何运行时依赖（Babel 和 htmlparser2 仅用于构建时模板编译）。Lark Docs 继承这一理念——浏览器端加载的代码仅包含框架核心和主题视图，不携带 Markdown 解析器、YAML 解析器等构建工具。

### 函数式架构

所有主题组件使用 Lark Mvc 的 `defineView()` 函数式 API 定义：

```ts
export default defineView((ctx, params) => {
  // setup 只执行一次
  const [getData, setData] = useState("data", initial);
  return {
    template,
    events: {/* 事件处理 */},
  };
});
```

没有 class、没有 this、没有 prototype——所有状态通过闭包和 hooks 管理。

## 适用场景

### 适合使用 Lark Docs 的场景

- **Lark Mvc 项目文档**：为基于 Lark Mvc 的框架或库编写技术文档
- **API 参考文档**：利用自动侧边栏和搜索快速组织大量 API 页面
- **团队知识库**：Markdown 写作 + 全文搜索，快速搭建内部知识站点
- **多语言文档**：基于目录的国际化方案，无需额外配置
- **离线文档**：PWA 支持让文档可以在无网络环境下访问

### 不适合的场景

- 需要服务端渲染（SSR）的内容站点
- 需要 CMS 集成的动态内容管理
- 博客类站点（无日期归档、标签分类等功能）

## 技术架构

### 三阶段流水线

```
配置阶段                编译阶段                  运行时阶段
─────────             ─────────               ──────────
defineConfig()        larkDocsPlugin          Framework.boot()
    │                     │                        │
    ├─ scanDocsDir()      ├─ resolveId(.md)        ├─ 路由匹配
    ├─ generateSidebar()  ├─ load → compileMarkdown│  ├─ loadContent(path)
    ├─ 生成路由映射        │   ├─ extractFrontmatter│  ├─ 渲染 contentHtml
    └─ 写入生成模块        │   ├─ markdown-it parse │  ├─ 挂载子视图
                          │   ├─ Shiki highlight   │  └─ 更新侧边栏/TOC
                          │   └─ 输出 JS 模块       └─ SPA 导航
                          └─ larkMvcPlugin(.html)
```

### 包结构

`@mm/lark-docs` 提供 8 个导出路径（含主入口），按职责分离：

| 子路径                   | 用途                             | 运行环境      |
| ------------------------ | -------------------------------- | ------------- |
| `@mm/lark-docs`          | 主入口：类型、主题工厂、工具函数 | 浏览器 + Node |
| `@mm/lark-docs/vite`     | Vite 插件 + 构建时工具           | Node          |
| `@mm/lark-docs/webpack`  | Webpack loader + 插件            | Node          |
| `@mm/lark-docs/rspack`   | Rspack loader + 插件             | Node          |
| `@mm/lark-docs/compiler` | `compileMarkdown()` 编译器       | Node          |
| `@mm/lark-docs/runtime`  | 浏览器安全工具（`slugify`）      | 浏览器        |
| `@mm/lark-docs/theme`    | 主题视图注册 + 工厂函数          | 浏览器        |
| `@mm/lark-docs/client`   | 环境类型声明                     | 类型          |

### 主题组件

默认主题由 5 个 Lark Mvc View 组成：

| 视图        | 路径                 | 职责                                    |
| ----------- | -------------------- | --------------------------------------- |
| DocsLayout  | `theme/docs-layout`  | 根布局：导航栏、三栏结构、前/后页导航   |
| Sidebar     | `theme/sidebar`      | 可折叠导航树，活跃状态追踪              |
| Toc         | `theme/toc`          | 标题大纲，IntersectionObserver 滚动监听 |
| Search      | `theme/search`       | MiniSearch 命令面板（Cmd+K）            |
| ThemeToggle | `theme/theme-toggle` | 明暗模式切换，localStorage 持久化       |

### 样式系统

主题样式基于 Tailwind CSS v4 的 CSS-first 配置方案：

- 使用 OKLCH 色彩空间的语义化设计令牌
- shadcn 风格的 `:root` / `.dark` CSS 变量架构
- `@tailwindcss/typography` 提供 prose 排版
- 双主题 Shiki 代码高亮（`--shiki-light` / `--shiki-dark` CSS 变量）
- 内置动画：`fade-in`、`page-in`、`dialog-in`、`shimmer`
- 支持 `prefers-reduced-motion` 无障碍偏好

## 与 Lark Mvc 的关系

Lark Docs **完全构建在 Lark Mvc 之上**：

- 所有 UI 组件使用 `defineView()` 定义
- 路由使用 Lark Mvc 的 `Router`（history 模式）
- 跨组件通信使用 `State` 单例
- 模板使用 Lark 模板语法（`{{}}`）编译
- 事件系统使用 Lark 的委托事件机制
- 主入口重新导出 `Framework`、`defineView`、`State`、`Router`、`registerViewClass`

这意味着使用 Lark Docs 时**无需单独安装 `@mm/lark-mvc`**——所有需要的框架 API 都可以直接从 `@mm/lark-docs` 导入。

## 性能特征

| 指标     | 实现方式                                     |
| -------- | -------------------------------------------- |
| 首屏加载 | 仅加载框架核心 + 布局视图 + 当前页面编译产物 |
| 页面切换 | SPA 导航，按需 `import()` 目标页面模块       |
| 搜索索引 | 首次打开搜索时懒加载，后续缓存               |
| 语法高亮 | 构建时完成，运行时零 JS 开销                 |
| 代码分割 | 每个 `.md` 文件独立 chunk，路由级按需加载    |
| 离线访问 | PWA Service Worker 预缓存所有静态资源        |
