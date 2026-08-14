---
title: Lit SSR 客户端使用
eleventyNavigation:
  key: Client usage
  parent: Server rendering
  order: 3
versionLinks:
  v2: ssr/client-usage/
---

{% labs-disclaimer %}

Lit SSR 生成静态 HTML 供浏览器解析和绘制，无需任何 JavaScript。（不支持声明式 Shadow DOM 的浏览器需要一些 JavaScript polyfill 来让利用 Shadow DOM 编写的 Lit 组件正常工作。）对于具有静态内容的页面，这就是所需的全部。但是，如果页面内容需要是动态的并响应用户交互，则需要 JavaScript 来重新应用该响应性。

如何在客户端重新应用该响应性取决于你是渲染独立的 Lit 模板还是利用 Lit 组件。

## 独立的 Lit 模板

Lit 模板的"水合"是让 Lit 重新将 Lit 模板的表达式与它们在 DOM 中应该更新的节点关联起来，以及添加事件监听器的过程。为了水合 Lit 模板，`@lit-labs/ssr-client` 包中提供了 `hydrate()` 方法。在使用 `render()` 更新服务器渲染的容器之前，你必须首先使用与服务器上渲染时相同的模板和数据在该容器上调用 `hydrate()`：

```js
import { render } from "lit";
import { hydrate } from "@lit-labs/ssr-client";
import { myTemplate } from "./my-template.js";
// 渲染前需要初始水合：
// （必须与服务器上渲染时使用的数据相同）
const initialData = getInitialAppData();
hydrate(myTemplate(initialData), document.body);

// 水合后，render 将高效地更新服务器渲染的 DOM：
const update = (data) => render(myTemplate(data), document.body);
```

## Lit 组件

要为 Lit 组件重新应用响应性，需要加载自定义元素定义以使它们升级，启用其生命周期回调，并且组件 shadow root 中的模板需要被水合。

升级可以通过简单地加载注册自定义元素的组件模块来实现。这可以通过加载页面所有组件定义的包来完成，也可以基于更复杂的启发式方法，仅按需加载定义的子集。为确保 `LitElement` shadow root 中的模板被水合，请加载 `@lit-labs/ssr-client/lit-element-hydrate-support.js` 模块，该模块安装了对 `LitElement` 的支持，使其在检测到它是使用声明式 shadow DOM 进行服务器端渲染时自动水合自身。此模块必须在 `lit` 模块加载之前加载（包括任何导入 `lit` 的组件模块），以确保水合支持被正确安装。

当 Lit 组件被服务器端渲染时，它们的 shadow root 内容会被输出到 `<template shadowroot>` 中，也称为[声明式 Shadow Root](https://web.dev/declarative-shadow-dom/)。声明式 shadow root 在解析 HTML 时会自动将其内容附加到模板父元素的 shadow root 上，无需 JavaScript。

在所有浏览器都包含声明式 shadow DOM 支持之前，有一个非常小的 polyfill 可以内联到你的页面中。这让你现在就可以对任何启用了 JavaScript 的浏览器使用 SSR，并随着该功能在其他浏览器中推出而逐步解决非 JavaScript 用例。[`template-shadowroot` polyfill](https://github.com/webcomponents/template-shadowroot) 的使用方式如下所述。

### 加载 `@lit-labs/ssr-client/lit-element-hydrate-support.js`

这需要在任何组件模块和 `lit` 库之前加载。

例如：

```html
<body>
  <!-- 使用声明式 shadow DOM 渲染的应用组件放在这里。 -->

  <!-- ssr-client lit-element-hydrate-support 应该首先加载。 -->
  <script
    type="module"
    src="/node_modules/@lit-labs/ssr-client/lit-element-hydrate-support.js"
  ></script>

  <!-- 当组件定义加载时，你的预渲染组件将变得活跃并可交互。 -->
  <script src="/app-components.js"></script>
</body>
```

如果你正在[打包](/docs/v2/tools/production/)代码，请确保 `@lit-labs/ssr-client/lit-element-hydrate-support.js` 首先被导入：

```js
// index.js
import "@lit-labs/ssr-client/lit-element-hydrate-support.js";
import "./app-components.js";
```

### 使用 `template-shadowroot` polyfill

下面的 HTML 代码片段包含了一个可选策略，在 polyfill 加载之前隐藏 body 以防止布局偏移。

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- 在尚不支持原生声明式 shadow DOM 的浏览器上，
        在部分或全部预渲染 HTML 被解析之后，
        但在声明式 shadow DOM polyfill 生效之前，可能会发生绘制。
        这种绘制是不可取的，因为它不会包含任何组件的 shadow DOM。
        为了防止由此渲染导致的布局偏移，我们使用
        "dsd-pending" 特性来确保只在 shadow DOM 激活后才进行绘制。 -->
    <style>
      body[dsd-pending] {
        display: none;
      }
    </style>
  </head>

  <body dsd-pending>
    <script>
      if (HTMLTemplateElement.prototype.hasOwnProperty("shadowRoot")) {
        // 此浏览器具有原生声明式 shadow DOM 支持，因此我们可以
        // 立即允许绘制。
        document.body.removeAttribute("dsd-pending");
      }
    </script>

    <!-- 使用声明式 shadow DOM 渲染的应用组件放在这里。 -->

    <!-- 使用 type=module 脚本以便我们可以使用动态模块导入。
        注意此模式在 IE11 中不起作用。 -->
    <script type="module">
      // 检查我们是否需要 template shadow root polyfill。
      if (!HTMLTemplateElement.prototype.hasOwnProperty("shadowRoot")) {
        // 获取 template shadow root polyfill。
        const { hydrateShadowRoots } =
          await import("/node_modules/@webcomponents/template-shadowroot/template-shadowroot.js");

        // 应用 polyfill。这是一次性操作，因此重要的是
        // 它发生在所有 HTML 被解析之后。
        hydrateShadowRoots(document.body);

        // 此时，没有原生声明式 shadow DOM 支持的浏览器
        // 可以绘制组件的初始状态了！
        document.body.removeAttribute("dsd-pending");
      }
    </script>
  </body>
</html>
```

### 综合示例

此示例展示了一种策略，结合了 `@lit-labs/ssr-client/lit-element-hydrate-support.js` 和 `template-shadowroot` polyfill 的加载，并提供一个包含 SSR 组件的页面以在客户端进行水合。

[Lit SSR 在 Koa 服务器中](https://stackblitz.com/edit/lit-ssr-global?file=src/server.js)
