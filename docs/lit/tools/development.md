---
title: 开发
eleventyNavigation:
  key: 开发
  parent: 工具
  order: 3
versionLinks:
  v1: lit-html/tools/#development
  v2: tools/development/
---

在项目的开发阶段，当你编写 Lit 组件时，以下工具可以帮助提升你的生产力：

- 开发服务器，用于在没有构建步骤的情况下预览代码。
- TypeScript，用于编写类型检查的代码。
- 代码检查工具，用于捕获 JavaScript 错误。
- 代码格式化工具，用于保持代码格式的一致性。
- Lit 专用的 IDE 插件，用于对 Lit 模板进行代码检查和语法高亮。

查看[入门套件](/docs/v3/tools/starter-kits/)文档，可以轻松设置一个预配置了所有这些功能的开发环境。

## 开发和生产构建

所有 Lit 包都发布了开发和生产构建版本，使用 Node 对[导出条件](https://nodejs.org/api/packages.html#packages_conditional_exports)的支持。

生产构建使用了非常激进的压缩设置进行了优化。开发构建未经压缩，便于调试，并包含额外的检查和警告。默认构建是生产构建，这样项目不会意外部署更大的开发构建。

你必须通过在支持导出条件的工具（如 Rollup、Webpack 和 Web Dev Server）中指定 `"development"` 导出条件来选择使用开发构建。每个工具的配置方式不同。

例如，在 Rollup 中，使用 `@rollup/node-resolve` 插件，你可以通过 `exportConditions` 选项选择开发构建：

```js
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  // ...
  plugins: [
    nodeResolve({
      exportConditions: ["development"],
    }),
  ],
};
```

### 开发构建运行时警告

`ReactiveElement` 和 `LitElement` 的开发构建支持额外的运行时警告，可以帮助识别在生产构建中检查成本过高的问题。

一些警告始终会显示。还有两类*可选警告*可以开启或关闭：

- `'migration'`。与从 LitElement 2.x 迁移相关的警告。默认关闭。
- `'change-in-update'`。与在更新期间更改响应式状态相关的警告。默认开启。

你可以使用 `ReactiveElement.disableWarning()` 和 `ReactiveElement.enableWarning()` 方法来控制可选警告。你可以在 `ReactiveElement` 的任何子类上调用它们，包括 `LitElement` 和你自己的类。在给定类上调用这些方法会开启或关闭该类及其所有子类的警告。例如，你可以在所有 `ReactiveElement` 类上、所有 `LitElement` 类上或特定的 `LitElement` 子类上关闭某类警告。

这些方法仅在开发构建中可用，因此请确保对其访问进行保护。我们建议使用可选链。

示例：

```ts
import { LitElement, ReactiveElement } from "lit";

// 在所有 ReactiveElement 上关闭迁移警告，
// 包括 LitElement
ReactiveElement.disableWarning?.("migration");

// 在所有 LitElement 上关闭更新警告
LitElement.disableWarning?.("change-in-update");

// 在一个元素上关闭更新警告
MyElement.disableWarning?.("change-in-update");
```

你还可以通过定义 `static enabledWarnings` 属性来控制单个类中的警告：

```ts
class MyElement extends LitElement {
  static enabledWarnings = ["migration"];
}
```

为了代码体积，最好在你自己的生产构建中消除控制警告的代码。

#### 多版本 Lit 警告 {#multiple-lit-versions}

当检测到 Lit 核心包（`lit-html`、`lit-element`、`@lit/reactive-element`）的多个版本，甚至同一版本的多个副本时，会触发一个仅在开发模式下的警告。

如果 Lit 被用作元素的内部依赖，元素可以使用不同版本的 Lit 并且完全可互操作。我们也注意确保 Lit 2 和 Lit 3 大部分彼此兼容。例如，你可以将 Lit 2 模板传递给 Lit 3 的 render 函数，反之亦然。

那么，为什么会有这个警告？Lit 有时会被与框架进行比较，而框架在混合使用不同版本的组件时通常会出问题。因此，很容易在不知情的情况下意外安装多个重复版本的 Lit。

加载多个兼容版本的 Lit 并非最优，因为额外的重复字节必须发送给用户。

如果你正在发布一个使用 Lit 的库，请遵循我们的[发布最佳实践](https://lit.dev/docs/tools/publishing/#don't-bundle-minify-or-optimize-modules)，以便你的库的使用者能够在他们的项目中去重 Lit。

##### 解决多版本 Lit 问题

按照以下步骤操作后，可能仍然无法去重 Lit，例如，你依赖的某个库打包了特定版本的 Lit。在这些情况下，可以忽略该警告。

如果你看到 `Multiple versions of Lit loaded` 开发模式警告，可以尝试以下几种方法：

1. 通过在浏览器控制台中检查以下变量来确定哪些 Lit 库加载了多个版本：`window.litElementVersions`、`window.reactiveElementVersions` 和 `window.litHtmlVersions`。

2. 使用 `npm ls`（注意，你可以指定要查找的确切库，例如 `npm ls @lit/reactive-element`）来缩小哪些依赖加载了多个不同版本的 Lit。

3. 尝试使用 `npm dedupe` 来去重 Lit。使用 `npm ls` 验证重复的 Lit 包是否已成功去重。

4. 可以通过将核心 Lit 包的特定版本作为项目的直接依赖来安装，以促使 `npm` 提升特定版本：`npm i @lit/reactive-element@latest lit-element@latest lit-html@latest`。将 `latest` 替换为你想要去重到的版本。

5. 如果仍然存在重复，你可能需要删除包锁文件和 `node_modules`。然后显式安装你想要的 `lit` 版本，之后再安装你的依赖。

## 本地开发服务器 { #devserver }

Lit 以 JavaScript 模块的形式打包，并使用裸模块说明符，而大多数浏览器尚未原生支持裸模块说明符。裸说明符被广泛使用，你可能也想在自己的代码中使用它们。例如：

```js
import { LitElement, html, css } from "lit";
```

要在浏览器中运行此代码，裸说明符（`'lit'`）需要被转换为浏览器可以加载的 URL（例如 `'/node_modules/lit/lit.js'`）。

有许多开发服务器可以处理模块说明符。如果你已经有一个可以处理此问题并与你的构建流程集成的开发服务器，那就足够了。

如果你需要一个开发服务器，我们推荐 [Web Dev Server](https://modern-web.dev/docs/dev-server/overview/)。

### Web Dev Server { #web-dev-server }

[Web Dev Server](https://modern-web.dev/docs/dev-server/overview/) 是一个开源开发服务器，支持无构建的开发流程。

它处理将裸模块说明符重写为浏览器所需的有效 URL。

安装 Web Dev Server：

```bash
npm i @web/dev-server --save-dev
```

在你的 `package.json` 文件中添加一个命令：

```json
"scripts": {
  "start": "web-dev-server"
}
```

以及一个 `web-dev-server.config.js` 文件：

```js
export default {
  open: true,
  watch: true,
  appIndex: "index.html",
  nodeResolve: {
    exportConditions: ["development"],
  },
};
```

运行开发服务器：

```bash
npm run start
```

#### 旧版浏览器支持

对于像 IE11 这样的旧版浏览器，Web Dev Server 可以将 JavaScript 模块转换为使用向后兼容的 SystemJS 模块加载器，并自动提供 web components polyfill。你需要配置 `@web/dev-server-legacy` 包来支持旧版浏览器。

安装 Web Dev Server legacy 包：

```bash
npm i @web/dev-server-legacy --save-dev
```

配置 `web-dev-server.config.js`：

```js
import { legacyPlugin } from "@web/dev-server-legacy";

export default {
  // ...
  plugins: [
    // 确保此插件始终在最后
    legacyPlugin({
      polyfills: {
        webcomponents: true,
        // 将 lit 的 polyfill-support 模块注入测试文件，
        // 这是与 webcomponents polyfill 交互所必需的
        custom: [
          {
            name: "lit-polyfill-support",
            path: "node_modules/lit/polyfill-support.js",
            test: "!('attachShadow' in Element.prototype)",
            module: false,
          },
        ],
      },
    }),
  ],
};
```

有关完整的安装和使用说明，请参阅 [Web Dev Server 文档](https://modern-web.dev/docs/dev-server/overview/)。

## TypeScript { #typescript }

Lit 支持使用 TypeScript 开发组件，包括 Lit API 的完整类型声明、标准和实验性装饰器，以及用于模板类型检查和代码检查的社区工具。

因为 Lit 只是一个库，不需要编译器或使用非标准语言语法，所以没有特定的 TypeScript 工具是必需的。Lit 可以与官方 TypeScript 编译器 `tsc`、TypeScript 包装器（如 Rollup、Vite 或 Webpack 的包装器）以及替代编译器（如 `esbuild`）一起工作。

TypeScript 项目的主要要求是：

- 启用现代 JavaScript 语言级别，例如使用 `"ES2021"` [lib](https://www.typescriptlang.org/tsconfig/#lib)。
- 使用 `"DOM"` [lib](https://www.typescriptlang.org/tsconfig/#lib) 启用 DOM 类型。
- 如果你选择使用 TypeScript 的实验性装饰器，可选地[启用实验性装饰器](https://www.typescriptlang.org/tsconfig/#experimentalDecorators)并[禁用类字段的 "define" 语义](https://www.typescriptlang.org/tsconfig/#useDefineForClassFields)。

这些选项通常在项目的 tsconfig 中设置。

### 安装

要在项目中安装 TypeScript：

```bash
npm i -D typescript
```

要构建代码：

```bash
npx tsc --watch
```

有关完整的安装和使用说明，请参阅 [TypeScript 网站](https://www.typescriptlang.org/)。要开始使用，[安装 TypeScript](https://www.typescriptlang.org/docs/handbook/typescript-tooling-in-5-minutes.html) 和[使用其功能](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html) 部分特别有帮助。

### 装饰器

TypeScript 支持两个版本的装饰器：实验性和标准。有关更多信息，请参阅我们的[装饰器](/docs/v3/components/decorators/#decorators-typescript)文档。

## JavaScript 和 TypeScript 代码检查 { #linting }

代码检查可以帮助捕获代码中的错误。我们推荐使用 [ESLint](https://eslint.org) 来检查 Lit 代码。

要在项目中安装 ESLint：

```bash
npm install eslint --save-dev
npx eslint --init
```

要运行它：

```bash
npx eslint yourfile.js
```

或将其添加到你的 npm scripts 中：

```json
{
  "scripts": {
    "lint": "eslint \"**/*.{js,ts}\""
  }
}
```

有关完整的安装和使用说明，请参阅 [ESLint 文档](https://eslint.org/docs/user-guide/getting-started)。

我们还推荐 [`eslint-plugin-lit` for ESLint](https://www.npmjs.com/package/eslint-plugin-lit)，它为 Lit 的 HTML 模板提供代码检查，包括常见的 HTML 检查以及 Lit 特定的规则。

将代码检查集成到你的 IDE 工作流中可以帮助尽早捕获错误。请参阅 [Lit 专用 IDE 插件](#ide-plugins) 来为你的 IDE 配置 Lit。

## 源代码格式化 { #formatting }

使用代码格式化工具可以帮助确保代码一致且可读。将你选择的格式化工具与 IDE 集成可以确保你的代码始终干净整洁。

一些流行的选项包括：

- [Prettier](https://prettier.io/)：[VS Code 插件](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Beautifier](https://beautifier.io/)：[VS Code 插件](https://marketplace.visualstudio.com/items?itemName=HookyQR.beautify)
- [Clang](https://www.npmjs.com/package/clang-format)：[VS Code 插件](https://marketplace.visualstudio.com/items?itemName=xaver.clang-format)

## Lit 专用 IDE 插件 { #ide-plugins }

有许多 IDE 插件在使用 Lit 开发时可能很有用。特别是，我们推荐使用适用于 Lit 模板的语法高亮工具。

### lit-plugin

`lit-plugin` 为 Lit 模板提供语法高亮、类型检查等功能。它[可用于 VS Code](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin)，或者你可以使用 [`ts-lit-plugin` TypeScript 编译器插件](https://github.com/runem/lit-analyzer/tree/master/packages/ts-lit-plugin)，它适用于 Sublime Text 和 Atom。

`lit-plugin` 和 `ts-lit-plugin` 提供：

- 语法高亮
- 类型检查
- 代码补全
- 悬停文档
- 跳转到定义
- 代码检查
- 快速修复

### ESLint

ESLint 有许多代码编辑器的[集成](https://eslint.org/docs/user-guide/integrations#editors)。如果你的 ESLint 配置中安装了 [`eslint-plugin-lit` for ESLint](https://www.npmjs.com/package/eslint-plugin-lit)，你的 IDE 将显示 Lit 特定的错误和警告。

### 其他插件

有关其他 IDE 插件以及额外的工具和信息，请参阅 [awesome-lit-html](https://github.com/web-padawan/awesome-lit-html#ide-plugins) 仓库。
