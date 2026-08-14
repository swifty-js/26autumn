---
title: 表达式
eleventyNavigation:
  key: 表达式
  parent: 模板
  order: 2
versionLinks:
  v1: components/templates/#bind-properties-to-templated-elements
  v2: templates/expressions/
---

Lit 模板可以包含称为表达式的动态值。表达式可以是任何 JavaScript 表达式。表达式在模板求值时被求值，表达式的结果在模板渲染时被包含。在 Lit 组件中，这意味着每当 `render` 方法被调用时。

表达式只能放置在模板中的特定位置，表达式的解释方式取决于它出现的位置。元素标签内部的表达式影响该元素。元素内容内部（子节点所在位置）的表达式渲染子节点或文本。

表达式的有效值因表达式出现的位置而异。通常所有表达式都接受字符串和数字等原始值，某些表达式支持额外的值类型。此外，所有表达式都可以接受*指令*，这些是自定义表达式处理和渲染方式的特殊函数。更多信息请参阅[自定义指令](/docs/v3/templates/custom-directives/)。

以下是快速参考，随后是每种表达式类型的更详细信息。

<table class="wide-table">
<thead>
<tr>
<th class="no-wrap-cell">类型</th>
<th class="wide-cell">示例</th>
</tr>
</thead>
<tbody>
<tr>
<td class="no-wrap-cell">

[子节点](#child-expressions)

</td>
<td>

```js
html` <h1>Hello ${name}</h1>
  <ul>
    ${listItems}
  </ul>`;
```

</td>
</tr>
<tr>
<td class="no-wrap-cell">

[属性](#attribute-expressions)

</td>
<td>

```js
html`<div class=${highlightClass}></div>`;
```

</td>
</tr>
<tr>
<td class="no-wrap-cell">

[布尔属性](#boolean-attribute-expressions)

</td>
<td>

```js
html`<div ?hidden=${!show}></div>`;
```

</td>
</tr>
<tr>
<td class="no-wrap-cell">

[属性（Property）](#property-expressions)

</td>
<td>

```js
html`<input .value=${value} />`;
```

</td>
</tr>
<tr>
<td class="no-wrap-cell">

[事件监听器](#event-listener-expressions)

</td>
<td>

```js
html`<button @click=${this._clickHandler}>Go</button>`;
```

</td>
</tr>
<tr>
<td class="no-wrap-cell">

[元素指令](#element-expressions)

</td>
<td>

```js
html`<input ${ref(inputRef)} />`;
```

</td>
</tr>
</tbody>
</table>

这个基本示例展示了多种不同类型的表达式。

{% playground-example "v3-docs/templates/expressions" "my-element.ts" %}

以下各节更详细地描述每种表达式。有关模板结构的更多信息，请参阅[格式良好的 HTML](#well-formed-html) 和[有效的表达式位置](#expression-locations)。

## 子表达式 { #child-expressions }

出现在元素的开始标签和结束标签之间的表达式可以向元素添加子节点。例如：

```js
html`<p>Hello, ${name}</p>`;
```

或者：

```js
html`<main>${bodyText}</main>`;
```

子位置的表达式可以接受多种类型的值：

- 字符串、数字和布尔值等原始值。
- 使用 [`html`](/docs/v3/api/templates/#html) 函数（或如果表达式在 `<svg>` 元素内，则使用 [`svg`](/docs/v3/api/templates/#svg) 函数）创建的 `TemplateResult` 对象。
- DOM 节点。
- 哨兵值 [`nothing`](/docs/v3/templates/conditionals/#conditionally-rendering-nothing) 和 [`noChange`](/docs/v3/templates/custom-directives/#signaling-no-change)。
- 任何支持类型的数组或可迭代对象。

### 原始值

Lit 可以渲染几乎所有[原始值](https://developer.mozilla.org/en-US/docs/Glossary/Primitive)，并在将它们插入文本内容时将它们转换为字符串。

像 `5` 这样的数值会渲染字符串 `'5'`。BigInt 的处理方式类似。

布尔值 `true` 会渲染 `'true'`，`false` 会渲染 `'false'`，但像这样渲染布尔值并不常见。通常布尔值用于条件语句中以渲染其他适当的值。有关条件的更多信息，请参阅[条件](/docs/v3/templates/conditionals/)。

空字符串 `''`、`null` 和 `undefined` 会被特殊处理，不渲染任何内容。更多信息请参阅[移除子内容](#removing-child)。

Symbol 值无法转换为字符串，放置在子表达式中时会抛出异常。

### 哨兵值

Lit 提供了一些可以在子表达式中使用的特殊哨兵值。

`noChange` 哨兵值不会更改表达式的现有值。它通常用于自定义指令中。更多信息请参阅[通知无变化](/docs/v3/templates/custom-directives/#signaling-no-change)。

`nothing` 哨兵值不渲染任何内容。更多信息请参阅[移除子内容](#removing-child)。

### 模板

由于子位置的表达式可以返回 `TemplateResult`，你可以嵌套和组合模板：

```js
const nav = html`<nav>...</nav>`;
const page = html`
  ${nav}
  <main>...</main>
`;
```

这意味着你可以使用纯 JavaScript 来创建条件模板、重复模板等。

```js
html`
  ${
    this.user.isloggedIn ? html`Welcome ${this.user.name}` : html`Please log in`
  }
`;
```

有关条件的更多信息，请参阅[条件](/docs/v3/templates/conditionals/)。

有关使用 JavaScript 创建重复模板的更多信息，请参阅[列表](/docs/v3/templates/lists/)。

### DOM 节点

任何 DOM 节点都可以传递给子表达式。通常 DOM 节点应该通过使用 `html` 指定模板来渲染，但在需要时也可以直接渲染 DOM 节点。该节点会在此时附加到 DOM 树中，因此会从任何当前父节点中移除：

```js
const div = document.createElement("div");
const page = html`
  ${div}
  <p>This is some text</p>
`;
```

### 任何支持类型的数组或可迭代对象

表达式还可以返回任何支持类型的数组或可迭代对象，可以是任意组合。你可以将此功能与标准 JavaScript（如 Array 的 `map` 方法）一起使用来创建重复模板和列表。示例请参阅[列表](/docs/v3/templates/lists/)。

### 移除子内容 {#removing-child}

值 `null`、`undefined`、空字符串 `''` 以及 Lit 的 [nothing](/docs/v3/api/templates/#nothing) 哨兵值会移除任何先前渲染的内容并且不渲染任何节点。

设置或移除子内容通常基于条件来完成。更多信息请参阅[条件性地不渲染任何内容](/docs/v3/templates/conditionals/#conditionally-rendering-nothing)。

不渲染任何节点在表达式是包含带有回退内容的 `slot` 的 Shadow DOM 元素的子元素时可能很重要。不渲染任何节点可确保回退内容被渲染。更多信息请参阅[回退内容](/docs/v3/components/shadow-dom/#fallback)。

## 属性表达式 {#attribute-expressions }

除了使用表达式添加子节点外，你还可以使用它们来设置元素的属性（attribute）和属性（property）。

默认情况下，属性值中的表达式设置该属性（attribute）：

```js
html`<div class=${this.textClass}>Stylish text.</div>`;
```

由于属性值始终是字符串，表达式应该返回一个可以转换为字符串的值。

如果表达式构成整个属性值，你可以省略引号。如果表达式只构成属性值的一部分，你需要给整个值加引号：

```js
html`<img src="/images/${this.image}" />`;
```

注意，某些原始值在属性中会被特殊处理。布尔值会被转换为字符串，因此例如 `false` 会渲染 `'false'`。`undefined` 和 `null` 都会渲染为空字符串的属性。

### 布尔属性 {#boolean-attribute-expressions }

要设置布尔属性，请在属性名前使用 `?` 前缀。如果表达式求值为真值则添加该属性，如果求值为假值则移除：

```js
html`<div ?hidden=${!this.showAdditional}>This text may be hidden.</div>`;
```

### 移除属性 { #removing-attribute }

有时你只想在某些条件下设置属性，否则移除该属性。对于像 `disabled` 和 `hidden` 这样常见的"布尔属性"，你想在真值时将属性设置为空字符串，否则移除它，请使用[布尔属性](#boolean-attribute-expressions)。但有时你可能需要不同的条件来添加或移除属性。

例如，考虑：

```js
html`<img src="/images/${this.imagePath}/${this.imageFile}" />`;
```

如果 `this.imagePath` 或 `this.imageFile` 未定义，则不应设置 `src` 属性，否则会发生无效的网络请求。

Lit 的 [nothing](/docs/v3/api/templates/#nothing) 哨兵值通过在属性值中的任何表达式求值为 `nothing` 时移除该属性来解决这个问题。

```js
html`<img
  src="/images/${this.imagePath ?? nothing}/${this.imageFile ?? nothing}"
/>`;
```

在此示例中，`this.imagePath` 和 `this.imageFile` 属性都必须定义才会设置 `src` 属性。`??` [空值合并运算符](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator)在左侧值为 `null` 或 `undefined` 时返回右侧值。

Lit 还提供了 [ifDefined](/docs/v3/api/directives/#ifDefined) 指令，它是 `value ?? nothing` 的语法糖。

```js
html`<img
  src="/images/${ifDefined(this.imagePath)}/${ifDefined(this.imageFile)}"
/>`;
```

你可能还想在值不为真值时移除属性，这样 `false` 或空字符串 `''` 的值会移除该属性。例如，考虑一个 `this.ariaLabel` 默认值为空字符串 `''` 的元素：

```js
html`<button aria-label="${this.ariaLabel || nothing}"></button>`;
```

在此示例中，只有当 `this.ariaLabel` 不是空字符串时才会渲染 `aria-label` 属性。

设置或移除属性通常基于条件来完成。更多信息请参阅[条件性地不渲染任何内容](/docs/v3/templates/conditionals/#conditionally-rendering-nothing)。

## 属性（Property）表达式 {#property-expressions}

你可以使用 `.` 前缀和属性名称来设置元素的 JavaScript 属性（property）：

```js
html`<input .value=${this.itemCount} />`;
```

上面代码的行为与直接设置 `input` 元素的 `value` 属性相同，例如：

```js
inputEl.value = this.itemCount;
```

你可以使用属性表达式语法将复杂数据沿树向下传递给子组件。例如，如果你有一个带有 `listItems` 属性的 `my-list` 组件，你可以传递一个对象数组：

```js
html`<my-list .listItems=${this.items}></my-list>`;
```

请注意，此示例中的属性名称——`listItems`——是混合大小写的。虽然 HTML *属性（attribute）*不区分大小写，但 Lit 在处理模板时会保留属性（property）名称的大小写。

有关组件属性的更多信息，请参阅[响应式属性](/docs/v3/components/properties/)。

## 事件监听器表达式 {#event-listener-expressions}

模板还可以包含声明式事件监听器。使用前缀 `@` 后跟事件名称。表达式应该求值为一个事件监听器。

```js
html`<button @click=${this.clickHandler}>Click Me!</button>`;
```

这类似于在 button 元素上调用 `addEventListener('click', this.clickHandler)`。

事件监听器可以是一个普通函数，也可以是一个带有 `handleEvent` 方法的对象——与标准 [`addEventListener`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener) 方法的 `listener` 参数相同。

在 Lit 组件中，事件监听器会自动绑定到组件，因此你可以在处理程序内部使用 `this` 值来引用组件实例。

```js
clickHandler() {
  this.clickCount++;
}
```

有关组件事件的更多信息，请参阅[事件](/docs/v3/components/events/)。

## 元素表达式 {#element-expressions}

你还可以添加一个访问元素实例的表达式，而不是元素上的单个属性或特性：

```js
html`<div ${myDirective()}></div>`;
```

元素表达式只能与[指令](/docs/v3/templates/directives/)一起使用。元素表达式中的任何其他值类型都会被忽略。

可以在元素表达式中使用的一个内置指令是 `ref` 指令。它提供对渲染元素的引用。

```js
html`<button ${ref(this.myRef)}></button>`;
```

更多信息请参阅 [ref](/docs/v3/templates/directives/#ref)。

## 格式良好的 HTML { #well-formed-html }

Lit 模板必须是格式良好的 HTML。模板在任何值被插值之前由浏览器内置的 HTML 解析器解析。遵循以下规则以确保模板格式良好：

- 当所有表达式被空值替换时，模板必须是格式良好的 HTML。

- 模板可以有多个顶级元素和文本。

- 模板*不应包含*未关闭的元素——它们会被 HTML 解析器关闭。

  ```js
  // HTML 解析器在 "Some text" 之后关闭此 div
  const template1 = html`<div class="broken-div">Some text</div>`;
  // 当连接时，"more text" 不会在 .broken-div 中
  const template2 = html`${template1} more text. </div>`;
  ```

<div class="alert alert-info">

由于浏览器内置的解析器非常宽松，大多数格式错误的模板在运行时是不可检测的，因此你不会看到警告——只是模板不按你预期的方式工作。我们建议在开发过程中使用 <a href="/docs/tools/development/#linting">lint 工具</a>和 <a href="/docs/tools/development/#ide-plugins">IDE 插件</a>来发现模板中的问题。

</div>

## 有效的表达式位置 { #expression-locations }

表达式只能出现在 HTML 中可以放置属性值和子元素的位置。

```html
<!-- 属性值 -->
<div label="${label}"></div>
<button ?disabled="${isDisabled}">Click me!</button>
<input .value="${currentValue}" />
<button @click="${this.handleClick()}">
  <!-- 子内容 -->
  <div>${textContent}</div>
</button>
```

元素表达式可以出现在标签名之后的开始标签内：

```html
<div ${ref(elementReference)}></div>
```

### 无效位置 { #invalid-locations }

表达式通常不应出现在以下位置：

- 标签名或属性名应出现的位置。Lit 不支持在此位置动态更改值，在开发模式下会报错。

  ```html
  <!-- 错误 -->
  <${tagName}></${tagName}>

  <!-- 错误 -->
  <div ${attrName}=true></div>
  ```

- `<template>` 元素内容内部（template 元素本身的属性表达式是允许的）。Lit 不会递归到 template 内容中动态更新表达式，在开发模式下会报错。

  ```html
  <!-- 错误 -->
  <template>${content}</template>

  <!-- 正确 -->
  <template id="${attrValue}">static content ok</template>
  ```

- `<textarea>` 元素内容内部（textarea 元素本身的属性表达式是允许的）。注意 Lit 可以将内容渲染到 textarea 中，但编辑 textarea 会破坏 Lit 用于动态更新的 DOM 引用，Lit 会在开发模式下发出警告。请改为绑定到 textarea 的 `.value` 属性。

  ```html
  <!-- 注意 -->
  <textarea>${content}</textarea>

  <!-- 正确 -->
  <textarea .value="${content}"></textarea>

  <!-- 正确 -->
  <textarea id="${attrValue}">static content ok</textarea>
  ```

- 类似地，在带有 `contenteditable` 属性的元素内部。请改为绑定到元素的 `.innerText` 属性。

  ```html
  <!-- 注意 -->
  <div contenteditable>${content}</div>

  <!-- 正确 -->
  <div contenteditable .innerText="${content}"></div>

  <!-- 正确 -->
  <div contenteditable id="${attrValue}">static content ok</div>
  ```

- HTML 注释内部。Lit 不会更新注释中的表达式，表达式将改为使用 Lit 令牌字符串渲染。但这不会破坏后续表达式，因此在开发过程中注释掉可能包含表达式的 HTML 块是安全的。

  ```html
  <!-- 不会更新: ${value} -->
  ```

- 使用 ShadyCSS polyfill 时在 `<style>` 元素内部。更多详情请参阅[表达式和 style 元素](/docs/v3/components/styles/#style-element)。

请注意，使用[静态表达式](#static-expressions)时，上述所有无效情况中的表达式都是有效的，尽管由于涉及的效率低下（见下文），这些不应用于性能敏感的更新。

## 静态表达式 { #static-expressions }

静态表达式返回特殊值，在模板被 Lit 作为 HTML 处理*之前*被插值到模板中。因为它们成为模板静态 HTML 的一部分，所以它们可以放置在模板中的任何位置——甚至在通常不允许表达式的位置，如属性和标签名中。

要使用静态表达式，你必须从 Lit 的 `static-html` 模块导入特殊版本的 `html` 或 `svg` 模板标签：

```ts
import { html, literal } from "lit/static-html.js";
```

`static-html` 模块包含支持静态表达式的 `html` 和 `svg` 标签函数，应使用它们代替 `lit` 模块中提供的标准版本。使用 `literal` 标签函数来创建静态表达式。

你可以将静态表达式用于不太可能更改的配置选项，或用于自定义普通表达式无法做到的模板部分——详情请参阅[有效的表达式位置](#expression-locations)一节。例如，`my-button` 组件可能渲染一个 `<button>` 标签，但子类可能改为渲染一个 `<a>` 标签。这是使用静态表达式的好地方，因为该设置不会频繁更改，并且自定义 HTML 标签无法用普通表达式完成。

{% switchable-sample %}

```ts
import { LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { html, literal } from "lit/static-html.js";

@customElement("my-button")
class MyButton extends LitElement {
  tag = literal`button`;
  activeAttribute = literal`active`;
  @property() caption = "Hello static";
  @property({ type: Boolean }) active = false;

  render() {
    return html`
      <${this.tag} ${this.activeAttribute}=${this.active}>
        <p>${this.caption}</p>
      </${this.tag}>`;
  }
}
```

```js
import { LitElement } from "lit";
import { html, literal } from "lit/static-html.js";

class MyButton extends LitElement {
  static properties = {
    caption: {},
    active: { type: Boolean },
  };

  tag = literal`button`;
  activeAttribute = literal`active`;

  constructor() {
    super();
    this.caption = "Hello static";
    this.active = false;
  }

  render() {
    return html`
      <${this.tag} ${this.activeAttribute}=${this.active}>
        <p>${this.caption}</p>
      </${this.tag}>`;
  }
}
customElements.define("my-button", MyButton);
```

{% endswitchable-sample %}

{% switchable-sample %}

```ts
@customElement("my-anchor")
class MyAnchor extends MyButton {
  tag = literal`a`;
}
```

```js
class MyAnchor extends MyButton {
  tag = literal`a`;
}
customElements.define("my-anchor", MyAnchor);
```

{% endswitchable-sample %}

<div class="alert alert-warning">

更改静态表达式的值代价很高。使用 `literal` 值的表达式不应频繁更改，因为它们会导致新模板被重新解析，并且每个变体都保存在内存中。

</div>

在上面的示例中，如果模板重新渲染且 `this.caption` 或 `this.active` 发生变化，Lit 会高效地更新模板，只更改受影响的表达式。但是，如果 `this.tag` 或 `this.activeAttribute` 发生变化，由于它们是使用 `literal` 标记的静态值，会创建一个全新的模板；更新是低效的，因为 DOM 会被完全重新渲染。此外，更改传递给表达式的 `literal` 值会增加内存使用，因为每个唯一模板都会缓存在内存中以提高重新渲染性能。

由于这些原因，最好将使用 `literal` 的表达式更改保持在最低限度，并避免使用响应式属性来更改 `literal` 值，因为响应式属性本身就是用来变化的。

### 模板结构

在静态值被插值之后，模板必须像普通 Lit 模板一样格式良好，否则模板中的动态表达式可能无法正常工作。更多信息请参阅[格式良好的 HTML](#well-formed-html) 一节。

### 非字面量静态值

在极少数情况下，你可能需要将不在脚本中定义的静态 HTML 插值到模板中，因此无法使用 `literal` 函数标记。对于这些情况，可以使用 `unsafeStatic()` 函数基于非脚本来源的字符串创建静态 HTML。

```ts
import { html, unsafeStatic } from "lit/static-html.js";
```

<div class="alert alert-warning">

仅用于受信任的内容。注意 `unsafeStatic()` 中使用了 _unsafe_。传递给 `unsafeStatic()` 的字符串必须是开发者控制的，不能包含不受信任的内容，因为它会被直接解析为 HTML 而不进行任何清理。不受信任内容的示例包括查询字符串参数和来自用户输入的值。使用此指令渲染的不受信任内容可能导致[跨站脚本（XSS）](https://en.wikipedia.org/wiki/Cross-site_scripting)漏洞。

</div>

{% switchable-sample %}

```ts
@customElement("my-button")
class MyButton extends LitElement {
  @property() caption = "Hello static";
  @property({ type: Boolean }) active = false;

  render() {
    // 这些字符串必须是受信任的，否则这是一个 XSS 漏洞
    const tag = getTagName();
    const activeAttribute = getActiveAttribute();
    // html 应从 `lit/static-html.js` 导入
    return html`
      <${unsafeStatic(tag)} ${unsafeStatic(activeAttribute)}=${this.active}>
        <p>${this.caption}</p>
      </${unsafeStatic(tag)}>`;
  }
}
```

```js
class MyButton extends LitElement {
  static properties = {
    caption: {},
    active: { type: Boolean },
  };

  constructor() {
    super();
    this.caption = "Hello static";
    this.active = false;
  }

  render() {
    // 这些字符串必须是受信任的，否则这是一个 XSS 漏洞
    const tag = getTagName();
    const activeAttribute = getActiveAttribute();
    // html 应从 `lit/static-html.js` 导入
    return html`
      <${unsafeStatic(tag)} ${unsafeStatic(activeAttribute)}=${this.active}>
        <p>${this.caption}</p>
      </${unsafeStatic(tag)}>`;
  }
}
customElements.define("my-button", MyButton);
```

{% endswitchable-sample %}

请注意，使用 `unsafeStatic` 的行为与 `literal` 有相同的注意事项：由于更改值会导致新模板被解析和缓存在内存中，它们不应频繁更改。
