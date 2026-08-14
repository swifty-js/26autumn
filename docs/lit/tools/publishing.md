---
title: 发布
eleventyNavigation:
  key: 发布
  parent: 工具
  order: 5
versionLinks:
  v1: tools/publish/
  v2: tools/publishing/
---

本页提供了将 Lit 组件发布到 [npm](https://www.npmjs.com/) 的指南，npm 是绝大多数 JavaScript 库和开发者使用的包管理器。有关为发布到 npm 而设置的可复用组件模板，请参阅[入门套件](/docs/v3/tools/starter-kits/)。

## 发布到 npm

要将你的组件发布到 npm，[请参阅有关贡献 npm 包的说明](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)。

你的 package.json 配置应该包含 `type`、`main` 和 `module` 字段：

package.json

```json
{
  "type": "module",
  "main": "my-element.js",
  "module": "my-element.js"
}
```

你还应该创建一个 README 来描述如何使用你的组件。

## 发布现代 JavaScript

我们建议以标准 [ES2021](https://compat-table.github.io/compat-table/es2016plus/) 语法发布 JavaScript 模块，因为这在所有常青浏览器上都受支持，并且能产生最快、最小的 JavaScript。你的包的使用者总是可以使用编译器来支持旧版浏览器，但如果你在发布前预编译了代码，他们就无法将旧版 JavaScript 转换为现代语法。

然而，重要的是，如果你使用了新提议的或非标准的 JavaScript 特性（如 TypeScript、装饰器和类字段），你*应该*在发布到 npm 之前将这些特性编译为浏览器原生支持的标准 ES2021。

### 使用 TypeScript 编译

以下 JSON 示例是一个部分的 `tsconfig.json`，使用了针对 ES2021 的推荐选项，启用了装饰器编译，并为用户输出 `.d.ts` 类型：

tsconfig.json

```json
"compilerOptions": {
  "target": "es2021",
  "module": "es2015",
  "moduleResolution": "node",
  "lib": ["es2021", "dom"],
  "declaration": true,
  "declarationMap": true,
  "experimentalDecorators": true,
  "useDefineForClassFields": false
}
```

注意，将 `useDefineForClassFields` 设置为 `false` 应该只在 `target` 设置为 `es2022` 或更高（包括 `esnext`）时才需要，但建议明确确保此设置为 `false`。

从 TypeScript 编译时，你应该在 `package.json` 的 `types` 字段中包含组件类型的声明文件（基于上面的 `declaration: true` 生成），并确保 `.d.ts` 和 `.d.ts.map` 文件也被发布：

package.json

```json
{
  ...
  "types": "my-element.d.ts"
}
```

有关更多信息，请参阅 [tsconfig.json 文档](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html)。

### 使用 Babel 编译

要编译使用了尚未包含在 ES2021 中的提议 JavaScript 特性的 Lit 组件，请使用 Babel。

安装 Babel 和你需要的 Babel 插件。例如：

```sh
npm install --save-dev \
  @babel/core \
  @babel/cli \
  @babel/preset-env \
  @babel/plugin-proposal-decorators
```

配置 Babel。例如：

babel.config.json

```json
{
  "presets": [["@babel/preset-env", { "targets": "defaults" }]],
  "plugins": [["@babel/plugin-proposal-decorators", { "version": "2023-05" }]]
}
```

你可以调整 `"targets"` 选项来指定你想要支持的浏览器。有关可用选项，请参阅 [`@babel/preset-env`](https://babeljs.io/docs/babel-preset-env)。

你可以通过打包器插件（如 [@rollup/plugin-babel](https://www.npmjs.com/package/@rollup/plugin-babel)）或从命令行运行 Babel。有关更多信息，请参阅 [Babel 文档](https://babeljs.io/docs/en/)。

## 发布最佳实践

以下是发布可复用 Web Components 时应遵循的其他良好实践。

### 不要在模块中导入 polyfill

Polyfill 是应用程序层面的关注点，因此应用程序应该直接依赖它们，而不是单个包。所需的确切 polyfill 通常取决于应用程序需要支持的浏览器，这个选择最好留给使用你组件的应用程序开发者。你的组件文档应该清楚地标识它使用的任何可能需要 polyfill 的 API。

包可能需要为测试和演示依赖 polyfill，因此如果需要，它们应该只放在 `devDependencies` 中。

### 不要打包、压缩或优化模块

打包和其他优化是应用程序层面的关注点。在发布到 npm 之前打包可复用组件还可能在用户的应用程序中引入多个版本的 Lit（和其他包），因为 npm 无法去重这些包。这会导致膨胀并可能引起 bug。

在发布前优化模块还可能阻止应用程序级别的优化。

当从 CDN 提供模块时，打包和其他优化可能很有价值，但由于用户可能需要使用多个依赖 Lit 的包，从 CDN 提供可能导致用户加载比必要更多的代码。出于这些原因，我们建议对性能敏感的应用程序始终从 npm 构建（包可以去重），而不是从 CDN 加载打包的包。

如果你想支持从 CDN 使用，我们建议在 CDN 模块和用于生产使用的模块之间做出明确分离。例如，将它们放在单独的文件夹中，或者仅将它们作为 GitHub release 的一部分添加，而不将它们添加到已发布的 npm 模块中。

### 在导入说明符中包含文件扩展名

Node 模块解析不要求文件扩展名，因为它会在文件系统中搜索几种文件扩展名之一（如果没有给出的话）。当你导入 `some-package/foo` 时，如果存在 `some-package/foo.js`，Node 会导入它。同样，将包说明符解析为 URL 的构建工具也可以在构建时进行此文件系统搜索。

然而，[import maps](https://github.com/WICG/import-maps) 规范[已经开始在浏览器中发布](https://chromestatus.com/feature/5315286962012160)，它将允许浏览器使用裸包说明符从源代码*未经转换*地加载模块，方法是在 import map 清单中提供导入说明符到 URL 的映射（该清单可能由工具根据你的例如 npm 安装生成）。

Import maps 将允许将导入映射到 URL，但它们只有两种类型的映射：精确和前缀。这意味着通过将包名映射到单个 URL 前缀，很容易为给定包下的*所有*模块设置别名。然而，如果你编写不带文件扩展名的导入，这意味着你包中的*每个文件*都需要在 import map 中有一个条目。这可能会大大膨胀 import map。

因此，为了让你的源代码现在就能与 import maps 最优兼容，我们建议在导入时编写文件扩展名。

### 发布 TypeScript 类型

为了让你从 TypeScript 中使用你的元素变得容易，我们建议你：

- 为所有用 TypeScript 编写的元素添加 `HTMLElementTagNameMap` 条目。

  ```ts
  @customElement("my-element")
  export class MyElement extends LitElement {
    /* ... */
  }

  declare global {
    interface HTMLElementTagNameMap {
      "my-element": MyElement;
    }
  }
  ```

- 在你的 npm 包中发布你的 `.d.ts` 类型。

有关 `HTMLElementTagNameMap` 的更多信息，请参阅[提供良好的 TypeScript 类型](/docs/v3/components/defining/#typescript-typings)。

### 自定义元素

声明 web component 类的模块应该始终包含对 `customElements.define()`（或 `@customElement` 装饰器）的调用以定义元素。

目前，web components 始终在全局注册表中定义。每个自定义元素定义需要使用唯一的标签名和唯一的 JavaScript 类。尝试注册相同的标签名两次，或相同的类两次，将会失败并报错。简单地导出一个类并期望用户调用 `define()` 是脆弱的。如果两个不同的组件都依赖于一个共享的第三个组件，并且都尝试定义它，其中一个将会失败。如果元素始终在声明其类的同一模块中定义，这就不是问题。

这种方法的一个缺点是，如果两个不同的元素使用相同的标签名，它们不能同时被导入到同一个项目中。

向平台添加 [Scoped Custom Element Registries](https://github.com/WICG/webcomponents/blob/gh-pages/proposals/Scoped-Custom-Element-Registries.md) 的工作正在进行中。作用域注册表允许自定义元素的标签名由组件的使用者为给定的 shadow root 作用域选择。一旦浏览器开始发布此功能，为每个组件发布两个模块将变得实际：一个导出自定义元素类且没有副作用的模块，以及一个使用标签名全局注册它的模块。

在此之前，我们建议继续在全局注册表中注册元素。

### 导出元素类

为了支持子类化，从定义元素的模块中导出你的元素类。这允许出于扩展目的进行子类化，以及将来在 [Scoped Custom Element Registries](https://github.com/WICG/webcomponents/blob/gh-pages/proposals/Scoped-Custom-Element-Registries.md) 中注册。

## 更多阅读

有关创建高质量可复用 web components 的更通用指南，请参阅 [Gold Standard Checklist for Web Components](https://github.com/webcomponents/gold-standard/wiki)。
