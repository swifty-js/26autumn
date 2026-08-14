---
title: 样式
eleventyNavigation:
  key: Styles
  parent: Components
  order: 4
versionLinks:
  v1: components/styles/
  v2: components/styles/
---

组件的模板渲染到其 shadow root 中。你添加到组件的样式会自动*限定作用域*到 shadow root，只影响组件 shadow root 中的元素。

Shadow DOM 为样式提供了强封装。如果 Lit 不使用 Shadow DOM，你将不得不极其小心，不要意外地为组件外部的元素（无论是组件的祖先还是子元素）设置样式。这可能涉及编写冗长、使用不便的类名。通过使用 Shadow DOM，Lit 确保你编写的任何选择器只应用于 Lit 组件 shadow root 中的元素。

## 向组件添加样式 {#add-styles}

你使用标签模板字符串 `css` 函数在静态 `styles` 类字段中定义限定作用域的样式。以这种方式定义样式可以获得最优的性能：

{% playground-example "v3-docs/components/style/basic" "my-element.ts" %}

你添加到组件的样式使用 shadow DOM 进行*作用域限定*。有关快速概述，请参阅 [Shadow DOM](#shadow-dom)。

静态 `styles` 类字段的值可以是：

- 单个标签模板字符串。

  ```js
  static styles = css`...`;
  ```

- 标签模板字符串的数组。

  ```js
  static styles = [ css`...`, css`...`];
  ```

静态 `styles` 类字段*几乎总是*向组件添加样式的最佳方式，但有些用例你无法以这种方式处理——例如，按实例自定义样式。有关添加样式的替代方式，请参阅[在模板中定义限定作用域的样式](#styles-in-the-template)。

### 在静态样式中使用表达式 {#expressions}

静态样式应用于组件的所有实例。CSS 中的任何表达式只求值一次，然后在所有实例中重用。

对于基于树的或按实例的样式自定义，使用 CSS 自定义属性来允许元素被[主题化](#theming)。

为了防止 Lit 组件执行潜在的恶意代码，`css` 标签只允许嵌套本身是 `css` 标签字符串或数字的表达式。

```js
const mainColor = css`red`;
...
static styles = css`
  div { color: ${mainColor} }
`;
```

此限制的存在是为了保护应用程序免受安全漏洞的影响，恶意样式甚至恶意代码可能从不受信任的来源（如 URL 参数或数据库值）注入。

如果你必须在 `css` 字面量中使用一个本身不是 `css` 字面量的表达式，并且你确信该表达式来自完全受信任的来源（如你自己代码中定义的常量），那么你可以使用 `unsafeCSS` 函数包装该表达式：

```js
const mainColor = 'red';
...
static styles = css`
  div { color: ${unsafeCSS(mainColor)} }
`;
```

<div class="alert alert-info">

仅对受信任的输入使用 `unsafeCSS` 标签。注入未经清理的 CSS 是一种安全风险。例如，恶意 CSS 可以通过添加指向第三方服务器的图片 URL 来"回传数据"。

</div>

### 从超类继承样式

使用标签模板字符串数组，组件可以继承超类的样式，并添加自己的样式：

{% playground-ide "v3-docs/components/style/superstyles" %}

你也可以在 JavaScript 中使用 `super.styles` 来引用超类的 styles 属性。如果你使用 TypeScript，我们建议避免使用 `super.styles`，因为编译器并不总是能正确转换它。如示例中所示显式引用超类可以避免此问题。

在编写打算在 TypeScript 中被继承的组件时，`static styles` 字段应显式类型为 `CSSResultGroup`，以允许用户灵活地使用数组覆盖 `styles`：

```ts
// 防止 TypeScript 将 `styles` 的类型窄化为 `CSSResult`
// 以便子类可以赋值例如 `[SuperElement.styles, css`...`]`
static styles: CSSResultGroup = css`...`;
```

### 共享样式

你可以通过创建导出标签样式的模块在组件之间共享样式：

```js
export const buttonStyles = css`
  .blue-button {
    color: white;
    background-color: blue;
  }
  .blue-button:disabled {
    background-color: grey;
  }
`;
```

你的元素可以导入样式并将其添加到静态 `styles` 类字段中：

```js
import { buttonStyles } from "./button-styles.js";

class MyElement extends LitElement {
  static styles = [
    buttonStyles,
    css`
      :host {
        display: block;
        border: 1px solid black;
      }
    `,
  ];
}
```

### 在样式中使用 unicode 转义

CSS 的 unicode 转义序列是一个反斜杠后跟四到六个十六进制数字：例如，`\2022` 表示项目符号字符。这与 JavaScript 已弃用的*八进制*转义序列格式类似，因此在 `css` 标签模板字符串中使用这些序列会导致错误。

有两种解决方法可以向样式添加 unicode 转义：

- 添加第二个反斜杠（例如 `\\2022`）。
- 使用以 `\u` 开头的 JavaScript 转义序列（例如 `\u2022`）。

```js
static styles = css`
  div::before {
    content: '\u2022';
  }
```

## Shadow DOM 样式概述 {#shadow-dom}

本节简要概述 shadow DOM 样式。

你添加到组件的样式可以影响：

- [shadow 树](#shadowroot)（组件渲染的模板）。
- [组件本身](#host)。
- [组件的子元素](#slotted)。

### 设置 shadow 树的样式 {#shadowroot}

Lit 模板默认渲染到 shadow 树中。限定作用域到元素 shadow 树的样式不会影响主文档或其他 shadow 树。类似地，除了[继承的 CSS 属性](#inheritance)外，文档级样式不会影响 shadow 树的内容。

当你使用标准 CSS 选择器时，它们只匹配组件 shadow 树中的元素。这意味着你通常可以使用非常简单的选择器，因为你不必担心它们意外地为页面的其他部分设置样式；例如：`input`、`*` 或 `#my-element`。

### 设置组件本身的样式 {#host}

你可以使用特殊的 `:host` 选择器来设置组件本身的样式。（拥有或"承载"shadow 树的元素称为*宿主元素*。）

要为宿主元素创建默认样式，请使用 `:host` CSS 伪类和 `:host()` CSS 伪类函数。

- `:host` 选择宿主元素。
- <code>:host(<var>selector</var>)</code> 选择宿主元素，但仅当宿主元素匹配 _selector_ 时。

{% playground-example "v3-docs/components/style/host" "my-element.ts" %}

请注意，宿主元素也可能受到 shadow 树外部样式的影响，因此你应该将 `:host` 和 `:host()` 规则中设置的样式视为*默认样式*，用户可以覆盖它们。例如：

```css
my-element {
  display: inline-block;
}
```

### 设置组件子元素的样式 {#slotted}

你的组件可能接受子元素（就像 `<ul>` 元素可以有 `<li>` 子元素一样）。要渲染子元素，你的模板需要包含一个或多个 `<slot>` 元素，如[使用 slot 元素渲染子元素](/docs/v3/components/shadow-dom/#slots)中所述。

`<slot>` 元素充当 shadow 树中的占位符，宿主元素的子元素在其中显示。

使用 `::slotted()` CSS 伪元素来选择通过 `<slot>` 包含在模板中的子元素。

- `::slotted(*)` 匹配所有插槽元素。
- `::slotted(p)` 匹配插槽段落。
- `p ::slotted(*)` 匹配 `<slot>` 是段落元素后代的插槽元素。

{% playground-example "v3-docs/components/style/slottedselector" "my-element.ts" %}

请注意，只有直接插槽子元素可以使用 `::slotted()` 设置样式。

```html
<my-element>
  <div>Stylable with ::slotted()</div>
</my-element>

<my-element>
  <div><p>Not stylable with ::slotted()</p></div>
</my-element>
```

此外，子元素可以从 shadow 树外部设置样式，因此你应该将 `::slotted()` 样式视为可以被覆盖的默认样式。

```css
my-element > div {
  /* 外部样式针对插槽子元素可以覆盖 ::slotted() 样式 */
}
```

<div class="alert alert-info">

ShadyCSS polyfill 中关于插槽内容的限制。有关如何以 polyfill 友好的方式使用 `::slotted()` 语法的详细信息，请参阅 [ShadyCSS 限制](https://github.com/webcomponents/polyfills/tree/master/packages/shadycss#limitations)。

</div>

## 在模板中定义限定作用域的样式 {#styles-in-the-template}

我们建议使用[静态 `styles` 类字段](#add-styles)以获得最优性能。但是，有时你可能想在 Lit 模板中定义样式。有两种方式可以在模板中添加限定作用域的样式：

- 使用 [`<style>` 元素](#style-element)添加样式。
- 使用[外部样式表](#external-stylesheet)添加样式（不推荐）。

这些技术各有其优缺点。

### 在 style 元素中 {#style-element}

通常，样式放在[静态 `styles` 类字段](#add-styles)中；但是，元素的静态样式每个类只求值一次。有时，你可能需要按实例自定义样式。为此，我们建议使用 CSS 属性来创建[可主题化的元素](#theming)。或者，你也可以在 Lit 模板中包含 `<style>` 元素。这些会按实例更新。

```js
render() {
  return html`
    <style>
      /* 按实例更新 */
    </style>
    <div>template content</div>
  `;
}
```

<div class="alert alert-info">

ShadyCSS polyfill 中关于按实例样式的限制。使用 ShadyCSS polyfill 不支持按实例样式。有关详细信息，请参阅 [ShadyCSS 限制](https://github.com/webcomponents/polyfills/tree/master/packages/shadycss#limitations)。

</div>

#### 表达式和 style 元素

在 style 元素中使用表达式有一些重要的限制和性能问题。

```js
render() {
  return html`
    <style>
      :host {
        /* 警告：此方法有局限性和性能问题！ */
        color: ${myColor}
      }
    </style>
    <div>template content</div>
  `;
}
```

<div class="alert alert-info">

ShadyCSS polyfill 中关于表达式的限制。由于 ShadyCSS polyfill 的限制，`<style>` 元素中的表达式不会按实例更新。此外，使用 ShadyCSS polyfill 时，`<style>` 节点不能作为表达式值传递。有关更多信息，请参阅 [ShadyCSS 限制](https://github.com/webcomponents/polyfills/tree/master/packages/shadycss#limitations)。

</div>

在 `<style>` 元素中求值表达式效率极低。当 `<style>` 元素中的任何文本更改时，浏览器必须重新解析整个 `<style>` 元素，导致不必要的工作。

为了减轻这种开销，将需要按实例求值的样式与不需要的样式分开。

```js
  static styles = css`/* ... */`;
  render() {
    const redStyle = html`<style> :host { color: red; } </style>`;
    return html`${this.red ? redStyle : ''}`

```

### 导入外部样式表（不推荐） {#external-stylesheet}

虽然你可以使用 `<link>` 在模板中包含外部样式表，但我们不推荐这种方法。相反，样式应放在[静态 `styles` 类字段](#add-styles)中。

<div class="alert alert-info">

外部样式表的注意事项。

- [ShadyCSS polyfill](https://github.com/webcomponents/polyfills/tree/master/packages/shadycss#limitations) 不支持外部样式表。
- 外部样式在加载时可能导致无样式内容闪烁（FOUC）。
- `href` 属性中的 URL 是相对于主文档的。如果你正在构建一个应用程序并且你的资源 URL 是众所周知的，这没问题，但在构建可重用元素时避免使用外部样式表。

</div>

## 动态类和样式

使样式动态化的一种方式是在模板中的 `class` 或 `style` 特性上添加表达式。

Lit 提供了两个指令 `classMap` 和 `styleMap`，可以方便地在 HTML 模板中应用类和样式。

有关这些和其他指令的更多信息，请参阅[内置指令](/docs/v3/templates/directives/)的文档。

要使用 `styleMap` 和/或 `classMap`：

1.  导入 `classMap` 和/或 `styleMap`：

    ```js
    import { classMap } from "lit/directives/class-map.js";
    import { styleMap } from "lit/directives/style-map.js";
    ```

2.  在元素模板中使用 `classMap` 和/或 `styleMap`：

{% playground-example "v3-docs/components/style/maps" "my-element.ts" %}

有关更多信息，请参阅 [classMap](/docs/v3/templates/directives/#classmap) 和 [styleMap](/docs/v3/templates/directives/#stylemap)。

## 主题化 {#theming}

通过同时使用 [CSS 继承](#inheritance)和 [CSS 变量和自定义属性](#customprops)，创建可主题化的元素很容易。通过应用 CSS 选择器来自定义 CSS 自定义属性，基于树的和按实例的主题化可以简单地应用。以下是一个示例：

{% playground-example "v3-docs/components/style/theming" "my-element.ts" %}

### CSS 继承 {#inheritance}

CSS 继承允许父元素和宿主元素将某些 CSS 属性传播给其后代。

并非所有 CSS 属性都会继承。继承的 CSS 属性包括：

- `color`
- `font-family` 和其他 `font-*` 属性
- 所有 CSS 自定义属性（`--*`）

有关更多信息，请参阅 [MDN 上的 CSS 继承](https://developer.mozilla.org/en-US/docs/Web/CSS/inheritance)。

你可以使用 CSS 继承在祖先元素上设置样式，这些样式会被其后代继承：

```html
<style>
  html {
    color: green;
  }
</style>
<my-element> #shadow-root Will be green </my-element>
```

### CSS 自定义属性 {#customprops}

所有 CSS 自定义属性（<code>--<var>custom-property-name</var></code>）都会继承。你可以使用它来使组件的样式可以从外部配置。

以下组件将其背景颜色设置为 CSS 变量。如果 DOM 树中匹配祖先的选择器设置了 `--my-background`，CSS 变量使用该值，否则默认为 `yellow`：

```js
class MyElement extends LitElement {
  static styles = css`
    :host {
      background-color: var(--my-background, yellow);
    }
  `;
  render() {
    return html`<p>Hello world</p>`;
  }
}
```

此组件的用户可以使用 `my-element` 标签作为 CSS 选择器来设置 `--my-background` 的值：

```html
<style>
  my-element {
    --my-background: rgb(67, 156, 144);
  }
</style>
<my-element></my-element>
```

`--my-background` 可以按 `my-element` 的实例进行配置：

```html
<style>
  my-element {
    --my-background: rgb(67, 156, 144);
  }
  my-element.stuff {
    --my-background: #111111;
  }
</style>
<my-element></my-element>
<my-element class="stuff"></my-element>
```

有关更多信息，请参阅 [MDN 上的 CSS 自定义属性](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)。
