---
title: 独立使用 lit-html
eleventyNavigation:
  key: 独立 lit-html
  parent: 相关库
  order: 1
versionLinks:
  v2: libraries/standalone-templates/
---

Lit 将 LitElement 的组件模型与基于 JavaScript 模板字面量的渲染结合到一个易于使用的包中。然而，Lit 的模板部分被拆分为一个名为 `lit-html` 的独立库，它可以在 Lit 组件模型之外使用，适用于任何需要高效渲染和更新 HTML 的场景。

## lit-html 独立包

`lit-html` 包可以独立于 `lit` 安装：

```sh
npm install lit-html
```

主要的导入是 `html` 和 `render`：

```js
import { html, render } from "lit-html";
```

独立的 `lit-html` 包还包含以下功能的模块，这些功能在完整的 `Lit` 开发者指南中有描述：

- `lit-html/directives/*` - [内置指令](/docs/v3/templates/directives/)
- `lit-html/directive.js` - [自定义指令](/docs/v3/templates/custom-directives/)
- `lit-html/async-directive.js` - [自定义异步指令](/docs/v3/templates/custom-directives/#async-directives)
- `lit-html/directive-helpers.js` - [用于命令式更新的指令辅助工具](</docs/v3/templates/custom-directives/#imperative-dom-access:-update()>)
- `lit-html/static.js` - [静态 html 标签](/docs/v3/templates/expressions/#static-expressions)
- `lit-html/polyfill-support.js` - 支持与 web components polyfill 的交互（参见[样式与 lit-html 模板](#styles-and-lit-html-templates)）

## 渲染 lit-html 模板

Lit 模板使用带有 `html` 标签的 JavaScript 模板字面量编写。字面量的内容大部分是纯声明式 HTML，可以包含用于插入和更新模板动态部分的表达式（完整的 Lit 模板语法参考请参见[模板](/docs/v3/templates/overview/)）。

```html
html`
<h1>Hello ${name}</h1>
`
```

lit-html 模板表达式不会创建或更新任何 DOM。它只是 DOM 的描述，称为 `TemplateResult`。要实际创建或更新 DOM，你需要将 `TemplateResult` 传递给 `render()` 函数，同时指定一个渲染容器：

```js
import { html, render } from "lit-html";

const name = "world";
const sayHi = html`<h1>Hello ${name}</h1>`;
render(sayHi, document.body);
```

## 渲染动态数据

要使模板具有动态性，你可以创建一个*模板函数*。每当数据变化时调用该模板函数。

```js
import { html, render } from "lit-html";

// 定义一个模板函数
const myTemplate = (name) => html`<div>Hello ${name}</div>`;

// 使用一些数据渲染模板
render(myTemplate("earth"), document.body);

// ... 稍后 ...
// 使用不同的数据渲染模板
render(myTemplate("mars"), document.body);
```

当你调用模板函数时，lit-html 会捕获当前的表达式值。模板函数不会创建任何 DOM 节点，因此它既快速又低成本。

模板函数返回一个包含模板和输入数据的 `TemplateResult`。这是使用 lit-html 背后的主要原则之一：将 UI 创建为状态的*函数*。

当你调用 `render` 时，lit-html 只会更新自上次渲染以来发生变化的模板部分。这使得 lit-html 的更新非常快速。

### 渲染选项

`render` 方法还接受一个 `options` 参数，允许你指定以下选项：

- `host`：使用 `@eventName` 语法注册的事件监听器被调用时使用的 `this` 值。此选项仅在你将事件监听器指定为普通函数时适用。如果你使用事件监听器对象来指定事件监听器，则监听器对象将用作 `this` 值。有关事件监听器的更多信息，请参阅[事件监听器表达式](/docs/v3/templates/expressions/#event-listener-expressions)。

- `renderBefore`：`container` 内的一个可选参考节点，lit-html 将在该节点之前进行渲染。默认情况下，lit-html 会追加到容器的末尾。设置 `renderBefore` 允许渲染到容器内的特定位置。

- `creationScope`：lit-html 在克隆模板时调用 `importNode` 的对象（默认为 `document`）。这是为高级用例提供的。

例如，如果你独立使用 `lit-html`，你可能会像这样使用渲染选项：

```html
<div id="container">
  <header>My Site</header>
  <footer>Copyright 2021</footer>
</div>
```

```ts
const template = () => html`...`;
const container = document.getElementById("container");
const renderBefore = container.querySelector("footer");
render(template(), container, { renderBefore });
```

上面的示例会将模板渲染在 `<header>` 和 `<footer>` 元素之间。

<div class="alert alert-info">

渲染选项必须是常量。渲染选项不应在后续的 `render` 调用之间发生变化。

</div>

## 样式与 lit-html 模板

lit-html 专注于一件事：渲染 HTML。你如何为 lit-html 创建的 HTML 应用样式取决于你如何使用它——例如，如果你在像 LitElement 这样的组件系统内使用 lit-html，你可以遵循该组件系统使用的模式。

一般来说，你如何为 HTML 设置样式取决于你是否使用 shadow DOM：

- 如果你没有渲染到 shadow DOM 中，你可以使用全局样式表来设置 HTML 样式。
- 如果你渲染到 shadow DOM 中，那么你可以在 shadow root 内渲染 `<style>` 标签。

<div class="alert alert-info">

在旧版浏览器上为 shadow root 设置样式需要 polyfill。在独立使用 `lit-html` 时配合 [ShadyCSS](https://github.com/webcomponents/polyfills/tree/master/packages/shadycss) polyfill 需要加载 `lit-html/polyfill-support.js`，并在 `RenderOptions` 中传递一个带有宿主标签名的 `scope` 选项来限定渲染内容的作用域。虽然这种方法是可行的，但如果你想在旧版浏览器上支持将 lit-html 模板渲染到 shadow DOM，我们建议使用 [LitElement](/docs/v3/components/overview/)。

</div>

为了帮助实现动态样式，lit-html 提供了两个用于操作元素 `class` 和 `style` 属性的指令：

- [`classMap`](/docs/v3/templates/directives/#classmap) 根据对象的属性在元素上设置类。
- [`styleMap`](/docs/v3/templates/directives/#stylemap) 根据样式属性和值的映射在元素上设置样式。
