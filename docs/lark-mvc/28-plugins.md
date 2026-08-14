---
title: 插件与构建集成
description: Lark Mvc 构建级插件系统详解——Vite 插件、Webpack Loader/Plugin、Rspack 集成、HMR 自动注入、模板编译与变量提取
---

# 插件与构建集成

Lark Mvc **没有运行时插件系统**（没有 `app.use()`、没有 `install()` 方法）。所有"插件"都存在于**构建层面**：它们负责将 `.html` 模板文件编译为 JavaScript 函数模块，并自动注入 HMR（热模块替换）代码。

这种设计意味着：

- 运行时零开销——没有插件注册表、没有中间件链、没有钩子系统
- 构建产物就是最终代码——没有运行时编译步骤
- 扩展能力通过入口文件显式 `import` 或 `Framework.use(...)` 实现（`FrameworkConfig.extensions` 目前仅为预留字段，见文末说明）

---

## 构建集成概览

| 构建工具 | 入口                   | 推荐方式              |
| -------- | ---------------------- | --------------------- |
| Vite     | `@mm/lark-mvc/vite`    | `larkMvcPlugin()`     |
| Webpack  | `@mm/lark-mvc/webpack` | `new LarkMvcPlugin()` |
| Rspack   | `@mm/lark-mvc/rspack`  | `new LarkMvcPlugin()` |

三种集成方式功能完全对等：

1. **模板编译**：`.html` → JS 函数模块
2. **HMR 注入**：自动为模板和视图文件注入热更新代码
3. **变量提取**：通过 AST 分析自动提取模板中的全局变量

---

## Vite 插件

### 安装与配置

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { larkMvcPlugin } from "@mm/lark-mvc/vite";

export default defineConfig({
  plugins: [
    larkMvcPlugin({
      debug: false, // 调试模式（行号追踪）
      vdom: false, // 虚拟 DOM 输出模式
    }),
  ],
});
```

### 配置选项

```ts
interface LarkMvcVitePluginOptions {
  /** 启用调试模式，模板错误包含行号信息（默认 false） */
  debug?: boolean;
  /** 启用虚拟 DOM 输出（默认 false，使用 innerHTML 字符串模式） */
  vdom?: boolean;
}
```

### 插件工作流程

Vite 插件注册了三个钩子：

#### 1. resolveId — 模块解析

拦截所有 `.html` 文件的导入，添加 `?lark-template` 后缀标记：

```ts
resolveId(source, importer) {
  const sourcePath = source.split('?')[0];
  if (sourcePath.endsWith('.html') && importer) {
    let resolved = resolve(dirname(importerPath), sourcePath);
    return resolved + '?lark-template';
  }
  return undefined;
}
```

#### 2. load — 模板编译

对标记为 `lark-template` 的模块执行编译：

```ts
async load(id) {
  if (query.includes('lark-template')) {
    const raw = readFileSync(filePath, 'utf-8');
    // AST 分析提取全局变量（零配置）
    const globalVars = await extractGlobalVars(raw);
    // 编译模板为 JS 函数
    const compiled = await compileTemplate(raw, { debug, globalVars, vdom });
    // 注入 HMR 代码
    return { code: injectTemplateHmrSnippet(compiled, 'vite'), map: null };
  }
}
```

#### 3. transform — 视图 HMR 注入

对导入了 `.html` 的 `.ts` 文件注入视图级 HMR：

```ts
transform(code, id) {
  if (!/\.[tj]s$/.test(id)) return undefined;
  if (id.includes('node_modules')) return undefined;
  // 快速路径：跳过不导入 .html 的文件
  if (!importsHtmlTemplate(code)) return undefined;
  const transformed = injectViewHmrSnippet(code, 'vite');
  if (transformed === code) return undefined;
  return { code: transformed, map: null };
}
```

---

## Webpack 集成

Webpack 提供两种集成模式：

### 模式一：Plugin（推荐）

```js
// webpack.config.mjs
import { LarkMvcPlugin } from "@mm/lark-mvc/webpack";

export default {
  plugins: [
    new LarkMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
  ],
};
```

Plugin 自动注册两条 loader 规则：

1. **`.html` 模板编译规则**：
   - `test: /\.html$/`
   - `exclude: /node_modules/`
   - `type: "javascript/auto"`（确保输出被视为 JS 模块）

2. **`.ts/.js` 视图 HMR 规则**：
   - `test: /\.[jt]s$/`
   - `exclude: /node_modules/`
   - `enforce: "pre"`（在 ts-loader/SWC 之前执行）

### 模式二：Loader（手动配置）

```js
// webpack.config.mjs
export default {
  module: {
    rules: [
      {
        test: /\.html$/,
        loader: "@mm/lark-mvc/webpack",
        options: { debug: false, vdom: false },
      },
    ],
  },
};
```

### 配置选项

```ts
interface LarkMvcWebpackPluginOptions {
  /** 调试模式（默认 false） */
  debug?: boolean;
  /** 虚拟 DOM 输出（默认 false） */
  vdom?: boolean;
  /** 匹配的文件扩展名（默认 /\.html$/） */
  test?: RegExp;
  /** 排除模式（默认 /node_modules/） */
  exclude?: RegExp;
}
```

### Loader 实现

```ts
async function larkMvcLoader(source: string): Promise<string> {
  const options = this.getOptions() || {};
  const { debug = false, vdom = false, hmr } = options;

  // 视图 HMR 模式
  if (hmr === "view") {
    return injectViewHmrSnippet(source, "webpack");
  }

  // 模板编译模式
  const globalVars = await extractGlobalVars(source);
  const compiled = await compileTemplate(source, { debug, globalVars, vdom });
  return injectTemplateHmrSnippet(compiled, "webpack");
}
```

---

## Rspack 集成

Rspack 集成与 Webpack 完全对等，API 一致：

### Plugin 模式（推荐）

```ts
// rspack.config.ts
import { LarkMvcPlugin } from "@mm/lark-mvc/rspack";

export default {
  plugins: [
    new LarkMvcPlugin({
      debug: process.env.NODE_ENV !== "production",
      vdom: false,
    }),
  ],
};
```

### Loader 模式（手动）

```ts
// rspack.config.ts
export default {
  module: {
    rules: [
      {
        test: /\.html$/,
        loader: "@mm/lark-mvc/rspack",
        options: { debug: false, vdom: false },
      },
    ],
  },
};
```

### 与 Webpack 的差异

唯一的实现差异在于异步 loader 的返回方式：

|          | Webpack                             | Rspack                             |
| -------- | ----------------------------------- | ---------------------------------- |
| 异步结果 | `this.callback()`                   | 直接 `return`                      |
| 原因     | Webpack 5 对 Promise 返回支持不稳定 | Rspack 的 async loader 必须 return |

---

## HMR 自动注入

Lark Mvc 的 HMR 系统完全自动——用户无需编写任何 `import.meta.hot` 代码。

### 两级 HMR

| 级别     | 触发条件           | 行为                             |
| -------- | ------------------ | -------------------------------- |
| 模板 HMR | `.html` 文件修改   | 更新所有挂载视图的模板，保留状态 |
| 视图 HMR | `.ts` 视图文件修改 | 热替换 setup 函数，保留状态      |

### 模板 HMR 注入

编译后的模板模块被追加以下代码（Vite 版本）：

```ts
// 自动注入（用户不可见）
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldTemplate = __lark_template__;
  });
  import.meta.hot.accept((newMod) => {
    const newTemplate = newMod?.default;
    const oldTemplate = import.meta.hot.data?.oldTemplate;
    if (oldTemplate && newTemplate && oldTemplate !== newTemplate) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  });
}
```

### 视图 HMR 注入

导入 `.html` 的 `.ts` 文件被转换：

```ts
// 原始代码
export default defineView((ctx) => {
  /* ... */
});

// 转换后
const __lark_view__ = defineView((ctx) => {
  /* ... */
});
export default __lark_view__;

// 自动注入
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldView = __lark_view__;
  });
  import.meta.hot.accept((newMod) => {
    const newView = newMod?.default;
    const oldView = import.meta.hot.data?.oldView;
    if (oldView && newView && oldView !== newView) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByView) hmr.hotSwapByView(oldView, newView);
    }
  });
}
```

### 跨构建工具 HMR 差异

| 构建工具 | HMR API                  | accept(cb) 语义                     |
| -------- | ------------------------ | ----------------------------------- |
| Vite     | `import.meta.hot`        | cb 是更新成功回调（接收 newModule） |
| Webpack  | `import.meta.webpackHot` | cb 是错误处理器（成功时不执行）     |
| Rspack   | `import.meta.webpackHot` | cb 是错误处理器（成功时不执行）     |

Webpack/Rspack 使用 **self-accept 模式**：

```ts
// Webpack/Rspack 版本
if (import.meta.webpackHot) {
  // 顶层检查：HMR 重新执行时 data 已填充
  const oldTemplate = import.meta.webpackHot.data?.oldTemplate;
  if (oldTemplate) {
    const newTemplate = __lark_template__;
    if (oldTemplate !== newTemplate) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  }
  import.meta.webpackHot.dispose((data) => {
    data.oldTemplate = __lark_template__;
  });
  import.meta.webpackHot.accept(); // 无参数 = self-accept
}
```

### globalThis.**lark_hmr**

HMR 交换函数通过 `globalThis.__lark_hmr__` 访问，而非 `import`：

```ts
// framework.ts → boot()
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis["__lark_hmr__"] = { hotSwapByTemplate, hotSwapByView };
}
```

**原因**：在 Module Federation（共享 singleton）场景下，任何对 `@mm/lark-mvc` 的 import/require 都会将调用模块注册为 shared consumer，导致 webpack 标记主 chunk 需要 hot-update——但主 chunk 实际未变化，不会生成 `.hot-update.js` 文件，引发 `ChunkLoadError`。使用 `globalThis` 完全绕开模块解析和 chunk 图的副作用。

---

## 模板编译详解

### 编译流程

```
.html 源文件
    ↓ protectComments()     保护 HTML 注释
    ↓ convertArtSyntax()    {{}} → <% %> 内部语法
    ↓ processViewEvents()   处理 @event(带括号) 属性
    ↓ processViewBindings() 处理 v-lark 上的 *prop / @event 绑定
    ↓ restoreComments()     还原被保护的注释
    ↓ compileToFunction()   <% %> → JS 模板函数
    = JS 模块输出

（extractGlobalVars() 通过 AST 分析独立提取全局变量，
  其结果作为 globalVars 传入 compileTemplate）
```

### 模板语法

| 语法                         | 说明                     | 示例                          |
| ---------------------------- | ------------------------ | ----------------------------- |
| `{{=expr}}`                  | 转义输出                 | `{{=userName}}`               |
| `{{!expr}}`                  | 原始输出（不转义）       | `{{!htmlContent}}`            |
| `{{:expr}}`                  | 双向绑定                 | `{{:inputValue}}`             |
| `{{@expr}}`                  | 引用查找（组件数据传递） | `{{@complexObj}}`             |
| `{{if cond}}`                | 条件                     | `{{if count > 0}}`            |
| `{{else if cond}}`           | 否则如果                 | `{{else if count === 0}}`     |
| `{{else}}`                   | 否则                     | `{{else}}`                    |
| `{{/if}}`                    | 关闭条件                 | `{{/if}}`                     |
| `{{forOf list as item}}`     | 数组遍历                 | `{{forOf items as item}}`     |
| `{{forOf list as item idx}}` | 带索引遍历               | `{{forOf items as item i}}`   |
| `{{forIn obj as val key}}`   | 对象遍历                 | `{{forIn config as val key}}` |
| `{{for(init;test;update)}}`  | 通用 for 循环            | `{{for(let i=0;i<10;i++)}}`   |
| `{{set a = b}}`              | 变量声明                 | `{{set total = price * qty}}` |

### 变量提取（零配置）

`extractGlobalVars()` 使用 `@babel/parser` 对模板进行 AST 分析，自动识别模板中引用的外部变量。开发者无需手动声明模板参数：

```html
<!-- 模板中直接使用变量，无需声明 -->
<div class="user-card">
  <h2>{{=user.name}}</h2>
  <p>{{=user.email}}</p>
  {{if showBadge}}
  <span class="badge">VIP</span>
  {{/if}}
</div>
```

编译器自动提取 `user` 和 `showBadge` 作为模板函数参数。

---

## FrameworkConfig.extensions（预留字段）

`FrameworkConfig` 类型中声明了 `extensions` / `initModule` 字段，但**当前版本的 `Framework.boot()` 并不会读取或自动加载它们**（源码中没有任何消费这两个配置的逻辑）。它们是预留给未来版本的配置项。

如需在启动阶段加载扩展模块（埋点、错误上报、路由守卫、全局事件监听等），当前的正确做法是在入口文件中显式导入：

```ts
import { Framework } from "@mm/lark-mvc";

// 方式一：副作用 import（模块顶层代码在导入时执行）
import "./extensions/analytics";
import "./extensions/error-reporter";
import "./extensions/auth-guard";

Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
  routes: {
    "/home": "app/views/home",
    "/about": "app/views/about",
  },
});

// 方式二：用模块加载器动态加载（依赖 config.require 或 dynamic import）
// Framework.use(["app/extensions/analytics"], () => { /* loaded */ });
```

这类扩展模块适合用于：

- 全局行为注入（埋点、错误上报）
- 路由守卫注册（`Router.beforeEach`）
- 全局事件监听
- 第三方库初始化

---

## 调试模式

启用 `debug: true` 后，模板编译会插入行号追踪信息：

```ts
larkMvcPlugin({ debug: true });
```

效果：

- 每个 `{{ }}` 表达式前插入行号标记
- 运行时错误可以追溯到模板原始行号
- 使用 `__lark_dbg_expr__` / `__lark_dbg_art__` 包装表达式
- try-catch 错误包装器提供详细错误上下文

**建议**：仅在开发环境启用，生产构建关闭以避免性能开销。

---

## 虚拟 DOM 模式

通过 `vdom: true` 启用虚拟 DOM 输出：

```ts
larkMvcPlugin({ vdom: true });
```

| 模式     | 默认（字符串）         | VDOM                  |
| -------- | ---------------------- | --------------------- |
| 模板输出 | HTML 字符串            | VDomNode 树           |
| DOM 更新 | innerHTML + keyed diff | VDOM diff + LIS 调和  |
| 适用场景 | 大多数应用             | 频繁局部更新的复杂 UI |

---

## 生产环境注意事项

1. **HMR 代码自动消除**：生产构建中 `import.meta.hot` / `import.meta.webpackHot` 为 `undefined`，整个 HMR 块被 tree-shaken
2. **debug 关闭**：确保生产环境 `debug: false`
3. **sourcemap 兼容**：插件返回 `{ code, map: null }` 避免触发 `[SOURCEMAP_BROKEN]` 警告
4. **Module Federation**：HMR 通过 `globalThis` 访问交换函数，避免 MF shared-scope 副作用
