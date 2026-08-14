---
title: 简介
sidebar_position: 0
description: Lark Docs 文档站点生成器概览
---

# 简介

`@mm/lark-docs` 是基于 [Lark Mvc](../lark-mvc/) 前端框架构建的**静态文档站点生成器**。它将 Markdown 文件编译为高性能的单页应用文档站点，提供开箱即用的写作、导航、搜索和主题定制体验。

## 核心特性

| 特性            | 说明                                              |
| --------------- | ------------------------------------------------- |
| 三构建器支持    | 同时支持 Vite、Webpack、Rspack 三种构建工具       |
| 编译时 Markdown | Markdown 在构建时编译为 JS 模块，零运行时解析开销 |
| Shiki 语法高亮  | 基于 WASM 的精确语法高亮，支持双主题模式          |
| 内置全文搜索    | 基于 MiniSearch 的客户端搜索引擎，无需外部服务    |
| 自动侧边栏      | 根据文件系统目录结构自动生成导航侧边栏            |
| 响应式布局      | 三栏布局（侧边栏 + 内容 + 目录），适配移动端      |
| TypeScript 优先 | 全量 TypeScript 类型定义，配置即类型安全          |
| 暗色模式        | 内置明暗主题切换，支持系统偏好跟随                |
| PWA 支持        | 通过 vite-plugin-pwa 提供离线访问能力             |

## 架构概览

Lark Docs 的工作流程分为三个阶段：

```
┌─────────────────────────────────────────────────────────────┐
│  1. 配置阶段（构建启动）                                       │
│     defineConfig() → 扫描文档目录 → 生成路由/侧边栏            │
│     → 写入 .lark-docs/generated/index.js 运行时模块           │
├─────────────────────────────────────────────────────────────┤
│  2. 编译阶段（打包器插件）                                     │
│     每个 .md 文件被拦截 → compileMarkdown()                    │
│     → 输出 { pageData, contentHtml } JS 模块                  │
├─────────────────────────────────────────────────────────────┤
│  3. 运行时阶段（浏览器）                                       │
│     Framework.boot() → 路由匹配 → 主题 View 渲染              │
│     → 按需加载 Markdown 编译产物 → SPA 导航                    │
└─────────────────────────────────────────────────────────────┘
```

## 与同类工具对比

| 特性     | Lark Docs                | VitePress          | Docusaurus        |
| -------- | ------------------------ | ------------------ | ----------------- |
| 底层框架 | Lark Mvc                 | Vue 3              | React             |
| 构建工具 | Vite / Webpack / Rspack  | Vite               | Webpack           |
| 渲染模式 | 编译时 HTML + 客户端 SPA | SSG + SPA          | SSG + SPA         |
| 搜索引擎 | MiniSearch（内置）       | MiniSearch（内置） | Algolia DocSearch |
| 语法高亮 | Shiki                    | Shiki              | Prism             |
| 包体积   | 极小（零运行时依赖）     | 较小               | 较大              |
| 模板语法 | Lark 模板（`{{}}`）      | Vue SFC            | JSX/MDX           |

## 文档导航

- [什么是 Lark Docs?](./02-what-is-lark-docs) — 设计理念与适用场景
- [快速开始](./03-getting-started) — 从零搭建文档站点
- [路由](./04-routing) — 文件系统路由规则
- [写作](./05-writing) — Markdown 写作指南
- [Markdown 扩展](./06-markdown-extensions) — 自定义容器、代码块、锚点
- [Frontmatter](./07-frontmatter) — 页面元数据配置
- [在 Markdown 中使用 Lark Mvc](./08-using-lark-mvc) — 嵌入动态组件
- [资源处理](./09-asset-handling) — 静态资源与样式管理
- [国际化](./10-i18n) — 多语言文档
- [侧边栏](./11-sidebar) — 导航侧边栏配置
- [搜索](./12-search) — 全文搜索系统
- [自定义](./13-customization) — 站点配置与定制
- [自定义主题](./14-custom-theme) — 从零构建主题
- [扩展默认主题](./15-extending-default-theme) — 覆盖与扩展现有组件
- [构建时数据加载](./16-build-time-data-loading) — 生成模块与数据流
- [部署](./17-deploy) — 生产环境部署
- [配置与 API 参考](./18-api-reference) — 完整 API 文档

## 环境要求

- **Node.js** >= 20
- **ESM** 模块格式（`"type": "module"`）
- **Tailwind CSS** v4（peer dependency）
- **@tailwindcss/typography** >= 0.5.0（peer dependency）

## 安装

```bash
npm install @mm/lark-docs @mm/lark-mvc tailwindcss @tailwindcss/typography
```

## 许可证

MIT
