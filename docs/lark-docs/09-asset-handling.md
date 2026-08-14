---
title: 资源处理
sidebar_position: 8
description: 静态资源、样式系统、图标、构建产物的管理方式
---

# 资源处理

Lark Docs 的资源处理涵盖静态文件、CSS 样式、图标、代码高亮和构建产物等方面。

## 静态资源

### public 目录

项目根目录下的 `public/` 目录中的文件会被原样复制到构建输出目录：

```
public/
├── favicon.svg
├── logo.png
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

在 Markdown 中使用绝对路径引用：

```markdown
![Logo](/logo.png)
[下载](/files/guide.pdf)
```

::: tip
`public/` 中的文件不经过构建管道处理——不会被哈希、压缩或转换。适合放置 favicon、PWA 图标、不需要处理的静态文件。
:::

### 在 Markdown 中引用资源

```markdown
<!-- 绝对路径（推荐） -->

![架构图](/images/architecture.png)
```

::: danger Markdown 里的资源路径不经过打包器
`![...](...)` 在**构建期**就被 markdown-it 渲染成静态 HTML 字符串，存进编译产物的 `contentHtml`。它**不会进入 Vite/Webpack/Rspack 的模块图**，因此：

- 不会被加 hash、不会被内联为 base64、不会被 `base` 配置重写
- 写相对路径（如 `./img.png`）**会失效** —— 它会相对于当前 URL 而非源文件目录解析

所以 Markdown 中的图片必须放在 `public/` 里并用**绝对路径**引用。如果站点部署在子路径下，还需要手动把前缀写进路径（如 `/docs/images/x.png`）。
:::

## CSS 样式系统

### 样式架构

Lark Docs 的样式基于 Tailwind CSS v4 的 CSS-first 配置方案：

```css
/* main.css — 项目样式入口 */
@import "tailwindcss";
@import "../node_modules/@mm/lark-docs/dist/client.css";
@source "../node_modules/@mm/lark-docs/dist/theme.js";
@plugin "@tailwindcss/typography";
```

::: warning 不能用子路径形式引用 client.css
`client.css` 会被拷到 `dist/client.css` 随包发布，但它**不在 `package.json` 的 `exports` 里**，所以 `@import "@mm/lark-docs/client.css"` 会解析失败——必须用文件路径。

（本仓库自身的 `app/main.css` 用的是 `@import "../src/client.css"`，因为它直接读源码。）
:::

`client.css` 内部已包含 `@import "tailwindcss"` 和 `@plugin "@tailwindcss/typography"`，上面重复写是为了让 Tailwind 也能扫到你自己项目的源文件。

### client.css 主题样式表

`@mm/lark-docs` 的 `dist/client.css` 是完整的主题样式表，包含：

#### 设计令牌

使用 OKLCH 色彩空间的语义化 CSS 变量（绿色调主题）：

```css
:root {
  --background: oklch(0.979 0.004 145);
  --foreground: oklch(0.243 0.022 152);
  --primary: oklch(0.507 0.09 155);
  --muted: oklch(0.947 0.009 150);
  --border: oklch(0.882 0.014 150);
  /* ... */
}

.dark {
  --background: oklch(0.162 0.013 150);
  --foreground: oklch(0.912 0.008 150);
  --primary: oklch(0.723 0.098 155);
  /* ... */
}
```

采用 shadcn 风格的语义化命名：`background`、`foreground`、`primary`、`secondary`、`muted`、`accent`、`destructive`、`border`、`ring` 等。

#### Tailwind v4 主题映射

通过 `@theme inline` 将 CSS 变量映射为 Tailwind 工具类：

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* ... */
}
```

这使得你可以使用 `bg-background`、`text-foreground`、`border-border` 等语义化工具类。

#### 排版

通过 `@tailwindcss/typography` 插件提供 prose 排版样式：

- 标题、段落、列表、表格的标准间距
- 代码块样式（背景、圆角、内边距）
- 引用块样式
- 链接样式

#### 代码高亮样式

双主题 Shiki 支持：

```css
/* 亮色模式使用 --shiki-light 变量 */
.codeblock .shiki span {
  color: var(--shiki-light, inherit);
}

/* 暗色模式使用 --shiki-dark 变量（回退到 --shiki-light） */
.dark .codeblock .shiki span {
  color: var(--shiki-dark, var(--shiki-light, inherit));
}
```

#### 自定义工具类

| 工具类           | 用途                                            |
| ---------------- | ----------------------------------------------- |
| `docs-grid`      | 点阵背景图案（radial-gradient 圆点 + 向下渐隐） |
| `sidebar-scroll` | 侧边栏自定义滚动条                              |
| `skeleton`       | 加载骨架屏动画                                  |

#### 动画

| 动画名       | 用途           |
| ------------ | -------------- |
| `fade-in`    | 通用淡入       |
| `page-in`    | 页面切换入场   |
| `dialog-in`  | 搜索对话框弹出 |
| `overlay-in` | 遮罩层淡入     |
| `shimmer`    | 骨架屏闪烁     |

所有动画支持 `prefers-reduced-motion` 媒体查询，为有动画敏感性的用户禁用动效。

### 自定义样式

在 `main.css` 中追加自定义样式：

```css
@import "@mm/lark-docs/client.css";

/* 自定义覆盖 */
.callout-tip {
  border-color: green;
}

.codeblock {
  border-radius: 12px;
}
```

## 图标系统

### lucide-static SVG 图标

主题使用 [lucide-static](https://lucide.dev/) 图标库，通过 Vite 的 `?raw` 后缀导入为原始 SVG 字符串：

```ts
// theme/icons.ts
import menuIcon from "lucide-static/icons/menu.svg?raw";
import searchIcon from "lucide-static/icons/search.svg?raw";
import sunIcon from "lucide-static/icons/sun.svg?raw";
import moonIcon from "lucide-static/icons/moon.svg?raw";
// ...

export const icons = {
  menu: menuIcon,
  search: searchIcon,
  sun: sunIcon,
  moon: moonIcon,
  // 共 17 个图标
};
```

### 在模板中使用图标

图标通过 `{{!}}` 原始输出语法渲染（不转义 HTML）：

```html
<button>{{!icons.search}}</button>
```

图标颜色通过 `currentColor` 继承父元素文本颜色，无需额外配置。

### 容器图标

自定义容器（tip/warning/danger/details）使用内联的 lucide SVG：

- `tip` → info circle
- `warning` → triangle alert
- `danger` → octagon alert
- `details` → chevron-right

## 代码高亮资源

### Shiki WASM

Shiki 使用 WebAssembly 引擎进行语法高亮，在构建时运行：

- 首次编译时懒加载 WASM 模块
- 按 `theme + darkTheme + languages` 组合缓存高亮器实例
- 并发安全：使用 `initPromises` Map 防止重复初始化

### 高亮输出

构建时生成带样式的 HTML，运行时**不需要**加载任何高亮相关的 JS 或 CSS：

- 单主题：内联 `style="color:#xxx"` 属性
- 双主题：CSS 变量 `--shiki-light` / `--shiki-dark`

## 生成文件

### .lark-docs/generated/index.js

配置阶段生成的运行时模块，包含：

- 路由映射表
- 页面内容加载器（动态 `import()` 映射）
- 站点配置 JSON
- 搜索索引构建函数

此文件在每次 `defineConfig()` 调用时重新生成。

### TypeScript 声明

`@mm/lark-docs/client` 子路径提供环境类型声明（`client.d.ts`），为生成模块和 `.md` 文件导入提供类型支持：

```ts
/// <reference types="@mm/lark-docs/client" />
```

## 构建产物

### 库构建（dist/）

`@mm/lark-docs` 包本身的构建输出：

```
dist/
├── index.js / index.cjs / index.d.ts      # 主入口
├── compiler.js / compiler.cjs             # 编译器
├── vite.js / vite.cjs                     # Vite 插件
├── webpack.js / webpack.cjs               # Webpack 插件
├── rspack.js / rspack.cjs                 # Rspack 插件
├── runtime.js / runtime.cjs               # 运行时工具
├── theme.js / theme.cjs                   # 主题
└── client.d.ts                            # 类型声明
```

7 个入口点，ESM + CJS 双格式输出。

### 文档站点构建（dist-docs/）

文档站点的生产构建输出：

```
dist-docs/
├── index.html                 # SPA 入口
├── assets/
│   ├── index-[hash].js       # 主 bundle（框架 + 主题）
│   ├── index-[hash].css      # 样式（Tailwind + client.css）
│   ├── [page-a]-[hash].js    # 页面 A 编译产物
│   ├── [page-b]-[hash].js    # 页面 B 编译产物
│   └── ...
├── favicon.svg               # 来自 public/
├── sw.js                     # Service Worker（PWA）
└── manifest.webmanifest      # PWA 清单
```

每个 `.md` 文件编译为独立的 JS chunk，实现路由级代码分割和按需加载。

## PWA 资源

通过 `vite-plugin-pwa` 配置：

- **Service Worker**：使用 Workbox 生成，预缓存所有静态资源
- **预缓存模式**：`**/*.{js,css,html,svg,png,woff2}`
- **Web Manifest**：包含应用名称、图标、主题色等
- **图标集**：从 `public/` 中的 PWA 图标生成各尺寸

## Vite 配置中的资源处理

```ts
// vite.config.ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { larkDocsPlugin } from "@mm/lark-docs/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/docs/", // 静态资源 URL 前缀
  plugins: [
    tailwindcss(),
    ...larkDocsPlugin({ config: docsConfig }),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "My Docs",
        short_name: "Docs",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
```

::: warning 注意区分两个 base 配置

- `lark-docs.config.ts` 中的 `baseUrl`：控制**应用路由**前缀
- `vite.config.ts` 中的 `base`：控制**静态资源 URL** 前缀

两者通常设置为相同值，但它们是独立的配置。
:::
