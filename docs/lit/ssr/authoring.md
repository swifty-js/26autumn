---
title: 为 Lit SSR 编写组件
eleventyNavigation:
  key: Authoring components
  parent: Server rendering
  order: 4
versionLinks:
  v2: ssr/authoring/
---

{% labs-disclaimer %}

Lit 在服务器环境中渲染 Web 组件的方式对组件代码施加了一些限制，以实现高效的服务器渲染。在编写组件时，请记住以下注意事项以确保它们与 Lit SSR 兼容。

注意：本页列出的限制可能会随着我们对 Lit SSR 的改进而变化。如果你希望看到某个特定用例得到支持，请[提交 issue](https://github.com/lit/lit/issues/new/choose) 或开始一个[讨论](https://github.com/lit/lit/discussions)线程。

## 仅限浏览器的代码

大多数浏览器 DOM API 在 Node 环境中不可用。Lit SSR 使用了一个 DOM 垫片（shim），它仅包含渲染 Lit 模板和组件所需的最低限度。有关可用 API 的完整列表，请参阅 [DOM 模拟](/docs/v3/ssr/dom-emulation)页面。

在编写组件时，仅在客户端调用的生命周期方法中执行命令式 DOM 操作，而不是在服务器端。例如，如果你需要测量更新后的 DOM，请使用 `updated()`。此回调仅在浏览器中运行，因此访问 DOM 是安全的。

有关哪些特定方法在服务器上调用、哪些仅限浏览器的列表，请参阅下面的[生命周期](#lifecycle)部分。

某些定义 Lit 组件的模块可能还有使用浏览器 API 的副作用——例如检测某些浏览器特性——使得模块在非浏览器环境中导入时会出错。在这种情况下，你可以将副作用代码移到仅限浏览器的生命周期回调中，或者添加条件使其仅在浏览器中运行。

对于简单的情况，向某些 DOM 访问添加条件判断或可选链可能就足以防止不可用的 DOM API 出错。例如：

```js
const hasConstructableStylesheets =
  typeof globalThis.CSSStyleSheet?.prototype.replaceSync === "function";
```

`lit` 包还提供了一个 `isServer` 环境检查器，可用于编写针对不同环境的条件代码块：

```js
import { isServer } from "lit";

if (isServer) {
  // 仅在 Node 等服务器环境中运行
} else {
  // 在浏览器中运行
}
```

### 条件导出

对于更复杂的用例，考虑利用[条件导出](https://nodejs.org/api/packages.html#conditional-exports)，专门匹配 `"node"` 环境，这样你可以根据模块是为 Node 还是为浏览器导入而有不同的代码。用户会根据是从 Node 还是从浏览器导入而获得适当版本的包。导出条件也受到流行的打包工具的支持，如 [rollup](https://github.com/rollup/plugins/tree/master/packages/node-resolve#exportconditions) 和 [webpack](https://webpack.js.org/configuration/resolve/#resolveconditionnames)，因此用户可以为你的包引入适当的代码。

示例配置可能如下所示：

```json
// package.json
{
  "name": "my-awesome-lit-components",
  "exports": {
    "./button.js": {
      "node": "./button-node.js",
      "default": "./button.js"
    }
  }
}
```

Node 入口文件可以手动创建，或者你可以使用打包工具来生成它们。

### 打包工具

{% aside "warn" %}

如果可能，避免将 Lit 内联打包到已发布的组件中。

因为 Lit 包使用条件导出为 Node 和浏览器环境提供不同的模块，我们强烈不建议将 `lit` 打包到发布到 NPM 的包中。如果你这样做了，你的包将只包含为你打包的环境准备的 `lit` 模块，并且不会根据环境自动切换。

{% endaside %}

如果你使用 ESBuild 或 Rollup 等打包工具来转换代码，你可以将包标记为*外部*依赖，这样它们就不会被打包到你的组件中。ESBuild 有一个 [`packages`](https://esbuild.github.io/api/#packages) 选项可以将所有依赖外部化，或者你可以只在 [external](https://esbuild.github.io/api/#external) 选项中标记 `lit` 和相关包。类似地，Rollup 也有一个等效的 ["external"](https://rollupjs.org/configuration-options/#external) 配置选项。

如果你必须将 Lit 库代码打包到组件中（例如通过 CDN 分发），我们建议创建两个入口：一个用于浏览器，一个用于 Node。打包工具会有选项来选择目标平台（如浏览器或 Node），或者允许你显式指定用于解析模块的导出条件。

例如，ESBuild 有 [`platform`](https://esbuild.github.io/api/#platform) 选项，在 Rollup 中你可以向 `@rollup/plugin-node-resolve` 的 [`exportConditions`](https://github.com/rollup/plugins/tree/master/packages/node-resolve#exportconditions) 选项提供 `"node"`。

这些用于浏览器和 Node 目标的入口必须在你的组件库的 `package.json` 文件中指定。有关更多详细信息，请参阅[条件导出](#conditional-exports)。

## 生命周期

在服务器端渲染期间只运行某些生命周期回调。这些回调生成组件的初始样式和标记。额外的生命周期方法在客户端水合期间以及组件水合后的运行时被调用。

下表列出了标准自定义元素和 Lit 生命周期方法，以及它们是否在 SSR 期间被调用。所有生命周期在元素注册和水合后在浏览器中都可用。

{% aside "warn" "no-header" %}

在服务器上调用的方法不应包含对未被垫片处理的浏览器/DOM API 的引用。不在服务器端调用的方法可以包含这些引用而不会导致错误。

{% endaside %}

{% aside "labs" "no-header" %}

在 Lit SSR 作为 Lit Labs 的一部分期间，方法是否在服务器上调用可能会发生变化。

{% endaside %}

<!-- TODO(augustinekim) Replace emoji with appropriate icon -->

### 标准自定义元素和 LitElement

| 方法                         | 是否在服务器上调用 | 说明                   |
| ---------------------------- | ------------------ | ---------------------- |
| `constructor()`              | 是 ⚠️              |                        |
| `connectedCallback()`        | 否                 |                        |
| `disconnectedCallback()`     | 否                 |                        |
| `attributeChangedCallback()` | 否                 |                        |
| `adoptedCallback()`          | 否                 |                        |
| `hasChanged()`               | 是 ⚠️              | 设置属性时调用         |
| `shouldUpdate()`             | 否                 |                        |
| `willUpdate()`               | 是 ⚠️              | 在 `render()` 之前调用 |
| `update()`                   | 否                 |                        |
| `render()`                   | 是 ⚠️              |                        |
| `firstUpdate()`              | 否                 |                        |
| `updated()`                  | 否                 |                        |

### ReactiveController

| 方法                 | 是否在服务器上调用 | 说明 |
| -------------------- | ------------------ | ---- |
| `constructor()`      | 是 ⚠️              |      |
| `hostConnected()`    | 否                 |      |
| `hostDisconnected()` | 否                 |      |
| `hostUpdate()`       | 否                 |      |
| `hostUpdated()`      | 否                 |      |

### Directive

| 方法             | 是否在服务器上调用 | 说明       |
| ---------------- | ------------------ | ---------- |
| `constructor()`  | 是 ⚠️              |            |
| `update()`       | 否                 |            |
| `render()`       | 是 ⚠️              |            |
| `disconnected()` | 否                 | 仅异步指令 |
| `reconnected()`  | 否                 | 仅异步指令 |

## 异步性

目前没有一种机制可以在继续渲染之前等待异步结果（例如来自异步指令或控制器的结果），尽管我们正在考虑未来允许这样做的选项。当前的解决方法是在服务器上渲染顶层模板之前完成所有异步工作，并将数据作为某个特性或属性提供给模板。

例如：

- 异步指令如 `asyncAppend()` 或 `asyncReplace()` 在服务器端不会产生任何可渲染的结果。
- `until()` 指令只会产生最高优先级的非 Promise 占位符值。

## 测试

`@lit-labs/testing` 包包含一些工具函数，它们利用 [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/) 插件来创建使用 `@lit-labs/ssr` 进行服务器端渲染的测试夹具。它可以帮助测试你的组件是否可以进行服务器端渲染。在 [readme](https://github.com/lit/lit/tree/main/packages/labs/testing#readme) 中查看更多信息。
