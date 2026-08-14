---
title: 使用 Lark 的多种方式
description: Lark Mvc 框架的多种使用方式详解，涵盖所有 8 个导出路径、Vite/Webpack/Rspack 集成、独立编译器使用、运行时辅助函数、Module Federation 及 CDN 使用模式。
---

# 使用 Lark 的多种方式

Lark Mvc 框架采用模块化的包导出设计，通过 `package.json` 的 `exports` 字段提供 8 个独立的导入路径，每个路径对应不同的使用场景。本章将详细介绍每种使用方式的配置方法、适用场景和最佳实践。

## 一、导出路径总览

`@mm/lark-mvc` 包提供以下 8 个导出路径：

| 导出路径     | 用途                    | 使用场景                |
| ------------ | ----------------------- | ----------------------- |
| `.`          | 主入口（完整框架 API）  | 应用运行时              |
| `./vite`     | Vite 插件               | Vite 构建配置           |
| `./webpack`  | Webpack Loader + Plugin | Webpack 构建配置        |
| `./rspack`   | Rspack Loader + Plugin  | Rspack/Rsbuild 构建配置 |
| `./runtime`  | 模板运行时辅助函数      | 编译后模板模块依赖      |
| `./compiler` | 独立模板编译器          | 自定义构建工具集成      |
| `./devtool`  | Devtool 调试桥接        | 浏览器扩展通信          |
| `./client`   | 客户端类型声明          | TypeScript 类型增强     |

每个路径均提供 ESM（`.js`）和 CJS（`.cjs`）双格式，以及对应的类型声明文件（`.d.ts` / `.d.cts`）：

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./vite": {
      "import": { "types": "./dist/vite.d.ts", "default": "./dist/vite.js" },
      "require": { "types": "./dist/vite.d.cts", "default": "./dist/vite.cjs" }
    },
    "./webpack": {
      "import": {
        "types": "./dist/webpack.d.ts",
        "default": "./dist/webpack.js"
      },
      "require": {
        "types": "./dist/webpack.d.cts",
        "default": "./dist/webpack.cjs"
      }
    },
    "./rspack": {
      "import": {
        "types": "./dist/rspack.d.ts",
        "default": "./dist/rspack.js"
      },
      "require": {
        "types": "./dist/rspack.d.cts",
        "default": "./dist/rspack.cjs"
      }
    },
    "./runtime": {
      "import": {
        "types": "./dist/runtime.d.ts",
        "default": "./dist/runtime.js"
      },
      "require": {
        "types": "./dist/runtime.d.cts",
        "default": "./dist/runtime.cjs"
      }
    },
    "./compiler": {
      "import": {
        "types": "./dist/compiler.d.ts",
        "default": "./dist/compiler.js"
      },
      "require": {
        "types": "./dist/compiler.d.cts",
        "default": "./dist/compiler.cjs"
      }
    },
    "./devtool": {
      "import": {
        "types": "./dist/devtool.d.ts",
        "default": "./dist/devtool.js"
      },
      "require": {
        "types": "./dist/devtool.d.cts",
        "default": "./dist/devtool.cjs"
      }
    },
    "./client": {
      "types": "./dist/client.d.ts"
    }
  }
}
```

## 二、主入口（`@mm/lark-mvc`）

### 2.1 完整 API 导出

主入口是框架的公共 API 桶导出（barrel export），包含所有运行时所需的 API：

```typescript
// 框架核心
export { Framework } from "./framework";
export { defineView } from "./view";
export { EventDelegator } from "./event-delegator";

// 状态管理
export { State } from "./state";
export { createStore, computed, bindStore } from "./store";

// 路由
export { Router } from "./router";

// Frame（视图生命周期管理）
export { Frame, createFrame } from "./frame";
export { registerViewClass, invalidateViewClass } from "./frame";

// Hooks
export {
  useState,
  useEffect,
  useStore,
  useInterval,
  useTimeout,
  useResource,
  useEvent,
} from "./hooks";

// Service（API 请求管理）
export { createService } from "./service";

// URL 状态同步
export { useUrlState } from "./url-state";

// VDOM 引擎
export { vdomCreate } from "./vdom";

// 全量类型导出
export * from "./types";
```

### 2.2 基本使用

```typescript
import { Framework, defineView, Router, State } from "@mm/lark-mvc";
import type { ViewCtx, FrameworkConfig } from "@mm/lark-mvc";

// 定义视图
const homeView = defineView((ctx: ViewCtx) => {
  ctx.updater.set({ title: "首页" });
  return {
    template: homeTemplate,
    events: {
      "nav<click>"(e: Event) {
        Router.to("/about");
      },
    },
  };
});

// 启动应用
Framework.boot({
  rootId: "root",
  defaultView: "app/views/home",
  routeMode: "hash",
  routes: {
    "/home": "app/views/home",
    "/about": "app/views/about",
  },
});
```

## 三、Vite 集成（`@mm/lark-mvc/vite`）

### 3.1 零配置插件

Vite 插件提供零配置的模板编译体验，自动处理 `.html` 模板文件和视图 HMR：

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { larkMvcPlugin } from "@mm/lark-mvc/vite";

export default defineConfig({
  plugins: [
    larkMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false, // 设为 true 启用 VDOM 模式
    }),
  ],
});
```

### 3.2 插件功能

`larkMvcPlugin` 返回一个 Vite Plugin 对象，包含三个钩子：

```typescript
export interface LarkMvcVitePluginOptions {
  /** 启用调试模式（行追踪）（默认：false） */
  debug?: boolean;
  /** 启用虚拟 DOM 输出（默认：false） */
  vdom?: boolean;
}

export function larkMvcPlugin(options: LarkMvcVitePluginOptions = {}): Plugin {
  return {
    name: "lark-template",
    enforce: "pre",

    // 1. resolveId: 拦截 .html 导入，添加 ?lark-template 标记
    resolveId(source, importer) {
      /* ... */
    },

    // 2. load: 编译 .html 模板为 JS 模块 + 注入模板 HMR
    async load(id) {
      /* ... */
    },

    // 3. transform: 为导入 .html 的 .ts 文件注入视图 HMR
    transform(code, id) {
      /* ... */
    },
  };
}
```

### 3.3 自动 HMR 注入

插件自动为模板和视图文件注入 HMR 代码，开发者无需手动编写：

- **模板 HMR**：`.html` 文件变更时，自动调用 `hotSwapByTemplate` 替换所有已挂载视图的模板
- **视图 HMR**：`.ts` 视图文件变更时，自动调用 `hotSwapByView` 热替换 setup 函数，保留状态

```typescript
// 开发者只需正常编写视图，HMR 自动生效
import template from "./home.html";
import { defineView } from "@mm/lark-mvc";

export default defineView((ctx) => {
  ctx.updater.set({ count: 0 });
  return {
    template,
    events: {
      "inc<click>"() {
        const count = ctx.updater.get<number>("count") + 1;
        ctx.updater.digest({ count });
      },
    },
  };
});
// 修改此文件后，count 值不会丢失（状态保留 HMR）
```

### 3.4 完整 Vite 项目结构

```
my-lark-app/
├── vite.config.ts
├── tsconfig.json
├── index.html
├── package.json
└── src/
    ├── main.ts          # 应用入口
    ├── views/
    │   ├── home.ts      # 视图 setup
    │   ├── home.html    # 视图模板
    │   ├── about.ts
    │   └── about.html
    └── stores/
        └── app.ts       # Store 定义
```

```typescript
// src/main.ts
import { Framework, registerViewClass } from "@mm/lark-mvc";
import homeView from "./views/home";
import aboutView from "./views/about";

// 注册视图
registerViewClass("app/views/home", homeView);
registerViewClass("app/views/about", aboutView);

// 启动
Framework.boot({
  rootId: "root",
  defaultView: "app/views/home",
  routes: {
    "/home": "app/views/home",
    "/about": "app/views/about",
  },
});
```

## 四、Webpack 集成（`@mm/lark-mvc/webpack`）

### 4.1 Plugin 模式（推荐）

Webpack 插件自动注册 loader 规则，零配置即可使用：

```javascript
// webpack.config.mjs
import { LarkMvcPlugin } from "@mm/lark-mvc/webpack";

export default {
  entry: "./src/main.ts",
  plugins: [
    new LarkMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
  ],
  module: {
    rules: [
      // TypeScript 编译（SWC / ts-loader / babel）
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: "swc-loader",
      },
    ],
  },
};
```

### 4.2 Plugin 内部机制

`LarkMvcPlugin` 在 `apply` 阶段自动注入两条 loader 规则：

```typescript
class LarkMvcPlugin {
  apply(compiler) {
    // 规则 1：.html 模板编译 + HMR 注入
    compiler.options.module.rules.push({
      test: /\.html$/, // 匹配 .html 文件
      exclude: /node_modules/,
      type: "javascript/auto", // 确保输出作为 JS 模块处理
      use: [
        {
          loader: __filename, // 指向 larkMvcLoader
          options: { debug, vdom },
        },
      ],
    });

    // 规则 2：.ts/.js 视图文件 HMR 注入
    compiler.options.module.rules.push({
      test: /\.[jt]s$/,
      exclude: /node_modules/,
      enforce: "pre", // 在 ts-loader/SWC 之前执行
      use: [
        {
          loader: __filename,
          options: { hmr: "view" },
        },
      ],
    });
  }
}
```

### 4.3 Loader 模式（手动配置）

如需更精细的控制，可直接使用 loader：

```javascript
// webpack.config.mjs
export default {
  module: {
    rules: [
      {
        test: /\.html$/,
        exclude: /node_modules/,
        type: "javascript/auto",
        loader: "@mm/lark-mvc/webpack",
        options: {
          debug: false,
          vdom: false,
        },
      },
    ],
  },
};
```

### 4.4 Loader 选项

```typescript
export type LarkMvcWebpackLoaderOptions = {
  /** 启用调试模式（行追踪） */
  debug?: boolean;
  /** 启用 VDOM 输出 */
  vdom?: boolean;
  /** HMR 模式："view" 表示视图 HMR 注入 */
  hmr?: "view";
};

export interface LarkMvcWebpackPluginOptions extends LarkMvcWebpackLoaderOptions {
  /** 文件匹配正则（默认：/\.html$/） */
  test?: RegExp;
  /** 排除正则（默认：/node_modules/） */
  exclude?: RegExp;
}
```

## 五、Rspack 集成（`@mm/lark-mvc/rspack`）

### 5.1 Plugin 模式（推荐）

Rspack 集成与 Webpack 几乎一致，API 完全对齐：

```typescript
// rspack.config.ts
import { LarkMvcPlugin } from "@mm/lark-mvc/rspack";
import { defineConfig } from "@rspack/cli";

export default defineConfig({
  entry: { main: "./src/main.ts" },
  plugins: [
    new LarkMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: "builtin:swc-loader",
          options: { jsc: { parser: { syntax: "typescript" } } },
        },
      },
    ],
  },
});
```

### 5.2 与 Rsbuild 配合使用

```typescript
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { LarkMvcPlugin } from "@mm/lark-mvc/rspack";

export default defineConfig({
  tools: {
    rspack: {
      plugins: [new LarkMvcPlugin({ debug: true })],
    },
  },
});
```

### 5.3 Rspack 与 Webpack 的差异

Rspack loader 与 Webpack loader 的关键区别在于异步处理方式：

```typescript
// Rspack: 异步 loader 必须直接返回结果（不能用 this.callback()）
export async function larkMvcLoader(
  this: LoaderContext,
  source: string,
): Promise<string> {
  const options = this.getOptions();
  const { debug = false, vdom = false, hmr } = options;

  if (hmr === "view") {
    return injectViewHmrSnippet(source, "rspack");
  }

  const globalVars = await extractGlobalVars(source);
  const compiled = await compileTemplate(source, { debug, globalVars, vdom });
  return injectTemplateHmrSnippet(compiled, "rspack");
}
```

## 六、独立编译器（`@mm/lark-mvc/compiler`）

### 6.1 编译器 API

编译器模块可独立使用，适用于自定义构建工具或预编译场景：

```typescript
import { compileTemplate, extractGlobalVars } from "@mm/lark-mvc/compiler";
import type { CompileOptions } from "@mm/lark-mvc";

// 编译模板
const htmlSource = `
<div class="greeting">
  <h1>{{=title}}</h1>
  <p>{{=content}}</p>
  {{if showFooter}}
  <footer>{{=footer}}</footer>
  {{/if}}
</div>
`;

// 自动提取模板中使用的变量
const globalVars = await extractGlobalVars(htmlSource);
// → ["title", "content", "showFooter", "footer"]

// 编译为 ES 模块
const compiled = await compileTemplate(htmlSource, {
  debug: false,
  globalVars,
  vdom: false,
  file: "greeting.html",
});

console.log(compiled);
// 输出 ES 模块代码：
// import { encHtml as __lark_enc_html__, ... } from "@mm/lark-mvc/runtime";
// function __lark_template__(data, viewId, refData) { ... }
// export default __lark_template__;
```

### 6.2 编译选项

```typescript
export interface CompileOptions {
  /** 启用调试模式（行追踪 + try-catch 错误报告） */
  debug?: boolean;
  /** 全局变量名列表（从 data 对象解构） */
  globalVars?: string[];
  /** 文件路径（用于调试错误信息） */
  file?: string;
  /** 生成 VDOM 输出而非 HTML 字符串 */
  vdom?: boolean;
}
```

### 6.3 自定义 Rollup 插件示例

```javascript
// rollup-plugin-lark.mjs
import { compileTemplate, extractGlobalVars } from "@mm/lark-mvc/compiler";
import { readFileSync } from "fs";

export function larkTemplate(options = {}) {
  return {
    name: "lark-template",
    async transform(code, id) {
      if (!id.endsWith(".html")) return null;
      const source = readFileSync(id, "utf-8");
      const globalVars = await extractGlobalVars(source);
      const compiled = await compileTemplate(source, {
        debug: options.debug ?? false,
        globalVars,
        vdom: options.vdom ?? false,
        file: id,
      });
      return { code: compiled, map: null };
    },
  };
}
```

### 6.4 预编译工作流

对于 CI/CD 环境，可以预编译所有模板：

```javascript
// scripts/precompile-templates.mjs
import { compileTemplate, extractGlobalVars } from "@mm/lark-mvc/compiler";
import { globSync } from "glob";
import { readFileSync, writeFileSync } from "fs";

const templates = globSync("src/**/*.html");

for (const file of templates) {
  const source = readFileSync(file, "utf-8");
  const globalVars = await extractGlobalVars(source);
  const compiled = await compileTemplate(source, {
    debug: false,
    globalVars,
    file,
  });
  writeFileSync(file + ".js", compiled);
}
```

## 七、运行时辅助函数（`@mm/lark-mvc/runtime`）

### 7.1 导出内容

运行时模块提供编译后模板所需的辅助函数：

```typescript
// runtime.ts 导出
export { strSafe } from "./common"; // 空值安全字符串转换
export { encHtml } from "./common"; // HTML 实体编码（encodeHTML）
export { encUri } from "./common"; // URI 编码（encodeURIExtra）
export { encQuote } from "./common"; // 引号转义（encodeQuote）
export { refFn } from "./common"; // ref token 生成
```

### 7.2 使用场景

运行时模块主要被编译后的模板模块自动导入，通常不需要手动使用。但在以下场景中可能需要直接引用：

```typescript
// 场景 1：手动构建模板输出时需要编码
import { encHtml, strSafe } from "@mm/lark-mvc/runtime";

function renderUserCard(user: { name: string; bio: string | null }): string {
  return `<div class="card">
    <span>${encHtml(user.name)}</span>
    <p>${strSafe(user.bio)}</p>
  </div>`;
}

// 场景 2：自定义模板引擎集成
import { encHtml, encUri, encQuote, refFn } from "@mm/lark-mvc/runtime";
```

### 7.3 编译后模板的依赖关系

编译后的模板模块自动从 `@mm/lark-mvc/runtime` 导入辅助函数：

```javascript
// 字符串模式编译输出
import {
  encHtml as __lark_enc_html__,
  strSafe as __lark_str_safe__,
  refFn as __lark_ref_fn__,
} from "@mm/lark-mvc/runtime";

// VDOM 模式编译输出（不需要 encHtml，VDOM 文本使用 createTextNode）
import { vdomCreate as __lark_vdom_create__ } from "@mm/lark-mvc";
import {
  strSafe as __lark_str_safe__,
  refFn as __lark_ref_fn__,
} from "@mm/lark-mvc/runtime";
```

## 八、Devtool 模块（`@mm/lark-mvc/devtool`）

### 8.1 用途

Devtool 模块提供 Frame 树序列化和 postMessage 通信能力，用于浏览器扩展开发者工具：

```typescript
import {
  installFrameDevtoolBridge,
  serializeFrameTree,
  FrameDevtoolBridge,
} from "@mm/lark-mvc/devtool";

import type {
  SerializedFrameTree,
  SerializedFrameNode,
  SerializedViewInfo,
} from "@mm/lark-mvc/devtool";
```

### 8.2 在框架中启用

通常通过 `FrameworkConfig.devtool` 配置启用，框架内部自动调用 `installFrameDevtoolBridge()`：

```typescript
Framework.boot({
  rootId: "root",
  devtool: true, // 自动安装 Bridge
  // ...
});
```

### 8.3 手动使用

```typescript
// 手动序列化 Frame 树（用于调试或日志）
import { serializeFrameTree } from "@mm/lark-mvc/devtool";

const tree = serializeFrameTree();
console.log(`总 Frame 数: ${tree.totalFrames}`);
console.log(`根节点: ${tree.root?.viewPath}`);
```

## 九、客户端类型声明（`@mm/lark-mvc/client`）

### 9.1 配置方式

`./client` 路径仅提供类型声明（无运行时代码），用于 TypeScript 项目的全局类型增强：

```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["@mm/lark-mvc/client"]
  }
}
```

或在入口文件中引用：

```typescript
// src/env.d.ts
/// <reference types="@mm/lark-mvc/client" />
```

### 9.2 提供的类型增强

引入后自动获得以下全局类型：

```typescript
// 1. .html 模块导入类型
declare module "*.html" {
  const template: ViewTemplate | VDomTemplate;
  export default template;
}

// 2. .css 模块导入类型
declare module "*.css" {
  const content: string;
  export default content;
}

// 3. import.meta.hot HMR 上下文
interface ImportMeta {
  hot?: {
    accept(cb?: (mod: { default?: unknown } | undefined) => void): void;
    dispose(cb: (data: unknown) => void): void;
    invalidate(): void;
  };
}

// 4. HTMLElement 扩展
interface HTMLElement {
  frame?: FrameApi | undefined;
  frameBound?: number;
  autoId?: number;
}

// 5. Element 扩展
interface Element {
  compareKeyCached?: number | undefined;
  cachedCompareKey?: string | undefined;
  "v-lark"?: string | undefined;
}

// 6. 全局 HMR 句柄
var __lark_hmr__: {
  hotSwapByTemplate: (old: ViewTemplate, new_: ViewTemplate) => boolean;
  hotSwapByView: (old: ViewSetup, new_: ViewSetup) => boolean;
};
```

## 十、Module Federation 使用

### 10.1 共享单例配置

在微前端架构中，`@mm/lark-mvc` 必须作为 shared singleton 配置：

```javascript
// 主应用 webpack.config.mjs
import { ModuleFederationPlugin } from "webpack";
import { LarkMvcPlugin } from "@mm/lark-mvc/webpack";

export default {
  plugins: [
    new LarkMvcPlugin(),
    new ModuleFederationPlugin({
      name: "host",
      remotes: {
        remoteApp: "remoteApp@http://localhost:3001/remoteEntry.js",
      },
      shared: {
        "@mm/lark-mvc": {
          singleton: true,
          requiredVersion: "^0.0.19",
        },
      },
    }),
  ],
};
```

### 10.2 远程应用暴露视图

```javascript
// 远程应用 webpack.config.mjs
import { ModuleFederationPlugin } from "webpack";
import { LarkMvcPlugin } from "@mm/lark-mvc/webpack";

export default {
  plugins: [
    new LarkMvcPlugin(),
    new ModuleFederationPlugin({
      name: "remoteApp",
      filename: "remoteEntry.js",
      exposes: {
        "./views/dashboard": "./src/views/dashboard.ts",
        "./views/settings": "./src/views/settings.ts",
      },
      shared: {
        "@mm/lark-mvc": {
          singleton: true,
          requiredVersion: "^0.0.19",
        },
      },
    }),
  ],
};
```

### 10.3 主应用加载远程视图

```typescript
// 主应用 main.ts
import { Framework, registerViewClass } from "@mm/lark-mvc";

// 本地视图
import homeView from "./views/home";
registerViewClass("host/views/home", homeView);

// 启动框架，配置远程模块加载
Framework.boot({
  rootId: "root",
  projectName: "host",
  defaultView: "host/views/home",
  routes: {
    "/": "host/views/home",
    "/dashboard": "remoteApp/views/dashboard",
    "/settings": "remoteApp/views/settings",
  },
  require: async (names) => {
    // Module Federation 动态加载
    const container = (window as any).remoteApp;
    await container.init(__webpack_share_scopes__.default);
    return Promise.all(
      names.map(async (name) => {
        const factory = await container.get(`./${name}`);
        return factory();
      }),
    );
  },
});
```

## 十一、CDN 使用模式

### 11.1 ESM CDN 导入

对于原型开发或简单项目，可通过 CDN 直接使用 ESM 版本：

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Lark Mvc CDN Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="importmap">
      {
        "imports": {
          "@mm/lark-mvc": "https://cdn.example.com/@mm/lark-mvc@0.0.19/dist/index.js",
          "@mm/lark-mvc/runtime": "https://cdn.example.com/@mm/lark-mvc@0.0.19/dist/runtime.js"
        }
      }
    </script>
    <script type="module">
      import { Framework, defineView, Router, State } from "@mm/lark-mvc";

      // 注意：CDN 模式下无法使用 .html 模板编译
      // 需要手动编写模板函数或使用字符串模板
      const homeTemplate = (data, viewId, refData) => {
        return `<div><h1>${data.title}</h1></div>`;
      };

      const homeView = defineView((ctx) => {
        ctx.updater.set({ title: "Hello Lark Mvc" });
        return { template: homeTemplate };
      });

      // 注册并启动
      Framework.boot({
        rootId: "root",
        defaultView: "app/views/home",
        routes: { "/": "app/views/home" },
      });
    </script>
  </body>
</html>
```

### 11.2 CDN 模式限制

| 功能            | CDN 可用性 | 说明                                |
| --------------- | ---------- | ----------------------------------- |
| 框架核心 API    | 可用       | defineView, Router, State 等        |
| .html 模板编译  | 不可用     | 需要构建工具（Vite/Webpack/Rspack） |
| HMR 热更新      | 不可用     | 需要开发服务器                      |
| TypeScript 类型 | 不可用     | 需要本地安装                        |
| VDOM 模式       | 可用       | 需手动编写 VDOM 模板                |

### 11.3 推荐：CDN + 预编译模板

结合独立编译器预编译模板，再通过 CDN 加载运行时：

```bash
# 构建阶段：预编译模板
node scripts/precompile-templates.mjs
```

```html
<!-- 运行阶段：加载预编译模板 + CDN 运行时 -->
<script type="importmap">
  {
    "imports": {
      "@mm/lark-mvc": "https://cdn.example.com/@mm/lark-mvc/dist/index.js",
      "@mm/lark-mvc/runtime": "https://cdn.example.com/@mm/lark-mvc/dist/runtime.js"
    }
  }
</script>
<script type="module">
  import { Framework, registerViewClass } from "@mm/lark-mvc";
  // 导入预编译的模板和视图
  import homeView from "./dist/views/home.js";
  registerViewClass("app/views/home", homeView);
  Framework.boot({ rootId: "root", defaultView: "app/views/home" });
</script>
```

## 十二、选择指南

### 12.1 按构建工具选择

```
使用 Vite？     → import { larkMvcPlugin } from "@mm/lark-mvc/vite"
使用 Webpack？  → import { LarkMvcPlugin } from "@mm/lark-mvc/webpack"
使用 Rspack？   → import { LarkMvcPlugin } from "@mm/lark-mvc/rspack"
使用 Rsbuild？  → import { LarkMvcPlugin } from "@mm/lark-mvc/rspack"
自定义工具？    → import { compileTemplate } from "@mm/lark-mvc/compiler"
无构建工具？    → CDN + 手动模板函数
```

### 12.2 按项目规模选择

| 项目规模   | 推荐方案                   | 说明       |
| ---------- | -------------------------- | ---------- |
| 原型/Demo  | CDN + 手动模板             | 最快上手   |
| 单页应用   | Vite + larkMvcPlugin       | 最佳 DX    |
| 企业应用   | Webpack/Rspack + MF        | 微前端支持 |
| 组件库     | 独立 compiler 预编译       | 灵活集成   |
| 多团队协作 | Rspack + Module Federation | 独立部署   |

### 12.3 依赖关系图

```
@mm/lark-mvc (主入口)
    ├── 依赖 → @mm/lark-mvc/runtime (编译后模板自动导入)
    │
@mm/lark-mvc/vite (构建时)
    ├── 依赖 → @mm/lark-mvc/compiler (编译模板)
    └── 输出 → 导入 @mm/lark-mvc/runtime 的模块
    │
@mm/lark-mvc/webpack (构建时)
    ├── 依赖 → @mm/lark-mvc/compiler
    └── 输出 → 导入 @mm/lark-mvc/runtime 的模块
    │
@mm/lark-mvc/rspack (构建时)
    ├── 依赖 → @mm/lark-mvc/compiler
    └── 输出 → 导入 @mm/lark-mvc/runtime 的模块
    │
@mm/lark-mvc/client (仅类型)
    └── 增强 → 全局 TypeScript 类型
```
