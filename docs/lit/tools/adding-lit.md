---
title: 将 Lit 添加到现有项目
eleventyNavigation:
  key: 添加 Lit
  parent: 工具
  order: 8
versionLinks:
  v1: tools/use/
  v2: tools/adding-lit/
---

Lit 不需要任何专门的工具，Lit 组件可以在任何 JavaScript 框架中使用，也可以与任何服务器模板系统或 CMS 配合使用，因此 Lit 非常适合添加到现有项目和应用程序中。

## 从 npm 安装

首先，从 npm 安装 `lit` 包：

```sh
npm i lit
```

如果你还没有使用 npm 来管理 JavaScript 依赖，你需要先设置好项目。我们推荐使用 [npm CLI](https://docs.npmjs.com/cli/v7/configuring-npm/install)。

## 添加一个组件

你可以在项目源代码的任何位置创建一个新元素：

_lib/components/my-element.ts_

{% switchable-sample %}

```ts
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

@customElement("my-element")
class MyElement extends LitElement {
  render() {
    return html` <div>Hello from MyElement!</div> `;
  }
}
```

```js
import { LitElement, html } from "lit";

class MyElement extends LitElement {
  render() {
    return html` <div>Hello from MyElement!</div> `;
  }
}
customElements.define("my-element", MyElement);
```

{% endswitchable-sample %}

## 使用你的组件

如何使用组件取决于你的项目以及它所使用的库或框架。你可以在 HTML 中、通过 DOM API 或在模板语言中使用你的组件：

### 纯 HTML

```html
<script type="module" src="/lib/components/my-element.js">
<my-element></my-element>
```

### JSX

JSX 是一种非常常见的模板语言。在 JSX 中，小写的元素名称会创建 HTML 元素，而 Lit 组件正是 HTML 元素。使用你在 `@customElement()` 装饰器中指定的标签名：

```tsx
import './components/my-element.js';

export const App = () => (
  <h1>My App</h1>
  <my-element></my-element>
)
```

### 框架模板

大多数 JavaScript 框架对 web components 和 Lit 都有[很好的支持](https://custom-elements-everywhere.com/)。只需导入你的元素定义并在模板中使用元素标签名即可。

## 后续步骤

此时，你应该能够构建并运行你的项目，看到 "Hello from MyElement!" 消息。

如果你准备为组件添加功能，请前往[组件](/docs/v3/components/overview/)了解如何构建你的第一个 Lit 组件，或查看[模板](/docs/v3/templates/overview/)了解编写模板的详细信息。

有关构建项目的详细信息，包括一些 Rollup 配置示例，请参阅[为生产环境构建](/docs/v3/tools/production/)。
