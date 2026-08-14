---
title: 快速开始
sidebar_position: 2
description: 从零搭建一个 Lark Docs 文档站点
---

# 快速开始

本指南将带你从零开始搭建一个完整的 Lark Docs 文档站点。

## 环境要求

- **Node.js** >= 20
- 包管理器：npm / pnpm / yarn / bun
- 项目使用 ESM 模块格式（`package.json` 中 `"type": "module"`）

## 安装依赖

```bash
npm install @mm/lark-docs @mm/lark-mvc tailwindcss @tailwindcss/typography
npm install -D vite @tailwindcss/vite
```

## 项目结构

创建如下目录结构：

```
my-docs/
├── docs/                    # 文档源文件目录
│   ├── index.md            # 首页
│   └── guide/
│       ├── introduction.md
│       └── configuration.md
├── app/
│   └── boot.ts             # 应用启动入口
├── public/                  # 静态资源（favicon 等）
│   └── favicon.svg
├── index.html              # HTML 入口
├── main.css                # 样式入口
├── lark-docs.config.ts    # 文档站点配置
├── vite.config.ts          # Vite 构建配置
├── package.json
└── tsconfig.json
```

## 配置文件

### lark-docs.config.ts

在项目根目录创建 `lark-docs.config.ts`：

```ts
import { defineConfig } from "@mm/lark-docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/docs/",
  title: "My Documentation",
  description: "项目技术文档",
  nav: [
    { text: "指南", link: "/guide/" },
    { text: "API", link: "/api/" },
  ],
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": "auto",
  },
  highlight: {
    theme: "github-light",
    darkTheme: "github-dark",
  },
  search: true,
});
```

`defineConfig()` 在调用时会立即执行以下操作：

1. 扫描 `docs/` 目录，发现所有 `.md` 文件
2. 生成文件系统路由映射
3. 为标记为 `"auto"` 的前缀自动生成侧边栏
4. 将运行时模块写入 `.lark-docs/generated/index.js`

### vite.config.ts

```ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { larkDocsPlugin } from "@mm/lark-docs/vite";
import docsConfig from "./lark-docs.config";

export default defineConfig({
  plugins: [tailwindcss(), ...larkDocsPlugin({ config: docsConfig })],
  build: {
    outDir: "dist-docs",
  },
});
```

`larkDocsPlugin()` 返回一个包含两个 Vite 插件的数组：

- `lark-docs`：拦截 `.md` 文件导入，调用 `compileMarkdown()` 编译
- `lark-template`（来自 `@mm/lark-mvc`）：编译 `.html` 模板文件为渲染函数

## HTML 入口

### index.html

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Documentation</title>
    <link rel="icon" href="/favicon.svg" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/app/boot.ts"></script>
  </body>
</html>
```

## 启动入口

### app/boot.ts

```ts
import {
  Framework,
  State,
  registerThemeViews,
  type FrameworkConfig,
} from "@mm/lark-docs";
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@lark-docs/generated";
import "./main.css";

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  routes,
  vdom: false,
  defaultPath: "/docs/",
  defaultView: "theme/docs-layout",
  // 布局自己渲染 404 状态，所以未匹配路径也指向它
  unmatchedView: "theme/docs-layout",
};

// 必须在 Framework.boot() 之前调用，并传入与配置一致的 vdom
registerThemeViews({ vdom: config.vdom });

// 注入运行时数据到 State
State.set({ docsConfig, loadContent, getSearchIndex });

Framework.boot(config);
```

### 关键步骤说明

1. **`registerThemeViews({ vdom })`**：注册 5 个默认主题视图（layout、sidebar、toc、search、theme-toggle）。**必须在 `Framework.boot()` 之前调用** —— boot 期间就会挂载默认视图，此时视图必须已注册。不传 `vdom` 时默认使用字符串模式模板。
2. **`State.set()`**：将配置和数据加载器注入全局状态，供主题视图读取
3. **`Framework.boot()`**：启动 Lark Mvc 框架，绑定路由并开始渲染

::: tip 关于 `@lark-docs/generated`
这是推荐写法，需要在构建工具中配置别名指向 `.lark-docs/generated`（见下方“路径别名”）。也可以直接写相对路径 `../.lark-docs/generated/index.js`，但那样拿不到 `@mm/lark-docs/client` 提供的环境类型声明。
:::

## 样式配置

### main.css

```css
@import "tailwindcss";

/* client.css 随包发布到 dist，但未列入 package.json 的 exports，
   因此只能用文件路径引用，不能写 "@mm/lark-docs/client.css" */
@import "../node_modules/@mm/lark-docs/dist/client.css";

/* 让 Tailwind 扫到主题模板里用到的工具类 */
@source "../node_modules/@mm/lark-docs/dist/theme.js";

@plugin "@tailwindcss/typography";
```

::: warning 不要写 `@import "@mm/lark-docs/client.css"`
`package.json` 的 `exports` 字段只声明了 8 个子路径（`.`、`./compiler`、`./vite`、`./webpack`、`./rspack`、`./runtime`、`./theme`、`./client`），**不包含 `./client.css`**。用子路径形式引用会解析失败。
:::

`client.css` 是 Lark Docs 的完整主题样式表，它提供：

- 语义化设计令牌（OKLCH 色彩空间）
- 明暗模式 CSS 变量
- 排版、代码块、容器样式
- 布局、动画、响应式规则

它内部已包含 `@import "tailwindcss"` 和 `@plugin "@tailwindcss/typography"`；上面示例里重复写一次是为了让你的项目源文件也能被 Tailwind 扫到。

## 编写内容

### docs/index.md

```markdown
---
title: 首页
description: 欢迎来到项目文档
---

# 欢迎

这是文档站点的首页。

## 快速链接

- [介绍](/docs/guide/introduction)
- [配置](/docs/guide/configuration)
```

### docs/guide/introduction.md

````markdown
---
title: 介绍
sidebar_position: 0
---

# 介绍

欢迎使用本项目。

## 特性

::: tip
使用自定义容器来突出重要信息。
:::

## 代码示例

```typescript
import { defineView } from "@mm/lark-mvc";

export default defineView((ctx) => {
  return { template };
});
```
````

````

## 开发服务器

```bash
npm run dev
````

对应 `package.json` 脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

开发服务器启动后，访问 `http://localhost:5173/docs/` 即可预览文档站点。

开发模式特性：

- Markdown 文件按需编译（仅在路由访问时触发）
- 修改 `.md` 文件触发 HMR 热更新
- 修改 `lark-docs.config.ts` 需重启开发服务器

## 生产构建

```bash
npm run build
```

构建产物输出到 `dist-docs/` 目录：

```
dist-docs/
├── index.html
├── assets/
│   ├── index-[hash].js      # 主 bundle
│   ├── index-[hash].css     # 样式
│   └── [page]-[hash].js     # 各页面独立 chunk
├── favicon.svg
├── sw.js                    # Service Worker（如启用 PWA）
└── manifest.webmanifest     # PWA 清单（如启用）
```

本地预览生产构建：

```bash
npm run preview
```

## TypeScript 支持

在 `tsconfig.json` 中添加类型引用：

```json
{
  "compilerOptions": {
    "types": ["@mm/lark-docs/client"]
  }
}
```

或在入口文件顶部添加：

```ts
/// <reference types="@mm/lark-docs/client" />
```

这为 `.lark-docs/generated/index.js` 生成模块提供类型声明。

## 使用 Webpack

如果你使用 Webpack 而非 Vite：

```js
const { LarkDocsPlugin } = require("@mm/lark-docs/webpack");
const docsConfig = require("./lark-docs.config");

module.exports = {
  plugins: [new LarkDocsPlugin({ config: docsConfig })],
};
```

`LarkDocsPlugin` 会自动向 `compiler.options.module.rules` 注入 `.md` 文件的 loader 规则。

## 使用 Rspack

```js
const { LarkDocsPlugin } = require("@mm/lark-docs/rspack");
const docsConfig = require("./lark-docs.config");

module.exports = {
  plugins: [new LarkDocsPlugin({ config: docsConfig })],
};
```

Rspack 版本的 loader 使用 `async` 函数直接返回 `Promise<string>`，符合 Rspack 的异步 loader 约定。

## 下一步

- 了解[文件系统路由](./04-routing)规则
- 学习 [Markdown 扩展](./06-markdown-extensions)语法
- 配置[侧边栏](./11-sidebar)导航
- 探索[主题定制](./13-customization)选项
