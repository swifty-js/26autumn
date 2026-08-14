---
title: 使用 Shadow DOM
eleventyNavigation:
  key: Shadow DOM
  parent: Components
  order: 6
versionLinks:
  v1: components/templates/#accessing-nodes-in-the-shadow-dom
  v2: components/shadow-dom/
---

Lit 组件使用 [shadow DOM](https://developers.google.com/web/fundamentals/web-components/shadowdom) 来封装其 DOM。Shadow DOM 提供了一种向元素添加独立的、隔离的、封装的 DOM 树的方式。DOM 封装是解锁与页面上运行的任何其他代码（包括其他 Web Components 或 Lit 组件）互操作性的关键。

Shadow DOM 提供三个好处：

- DOM 作用域。像 `document.querySelector` 这样的 DOM API 不会找到组件 shadow DOM 中的元素，因此全局脚本更难意外破坏你的组件。
- 样式作用域。你可以为 shadow DOM 编写封装样式，这些样式不会影响 DOM 树的其余部分。
- 组合。组件的 shadow root 包含其内部 DOM，与组件的子元素分离。你可以选择子元素如何在组件的内部 DOM 中渲染。

有关 shadow DOM 的更多信息：

- Web Fundamentals 上的 [Shadow DOM v1: Self-Contained Web Components](https://developers.google.com/web/fundamentals/web-components/shadowdom)。
- MDN 上的[使用 shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)。

<div class="alert alert-info">

旧版浏览器。在原生 shadow DOM 不可用的旧版浏览器上，可以使用 [web components polyfills](https://github.com/webcomponents/polyfills/tree/master/packages/webcomponentsjs)。请注意，Lit 的 `polyfill-support` 模块必须与 web components polyfills 一起加载。有关详细信息，请参阅[旧版浏览器的要求](/docs/v3/tools/requirements/#building-for-legacy-browsers)。

</div>

## 访问 shadow DOM 中的节点

Lit 将组件渲染到其 `renderRoot`，默认情况下是一个 shadow root。要查找内部元素，你可以使用 DOM 查询 API，如 `this.renderRoot.querySelector()`。

`renderRoot` 应该始终是 shadow root 或元素，它们共享 `.querySelectorAll()` 和 `.children` 等 API。

你可以在组件初始渲染后查询内部 DOM（例如在 `firstUpdated` 中），或使用 getter 模式：

```js
firstUpdated() {
  this.staticNode = this.renderRoot.querySelector('#static-node');
}

get _closeButton() {
  return this.renderRoot.querySelector('#close-button');
}
```

LitElement 提供了一组装饰器，提供了定义此类 getter 的简写方式。

### @query、@queryAll 和 @queryAsync 装饰器

`@query`、`@queryAll` 和 `@queryAsync` 装饰器都提供了一种方便的方式来访问内部组件 DOM 中的节点。

<div class="alert alert-info">

使用装饰器。装饰器是一项提议中的 JavaScript 特性，因此你需要使用 Babel 或 TypeScript 等编译器来使用装饰器。有关详细信息，请参阅[使用装饰器](/docs/v3/components/decorators/)。

</div>

#### @query { #query }

修改一个类属性，将其变成一个从 render root 返回节点的 getter。可选的第二个参数为 true 时，仅执行一次 DOM 查询并缓存结果。这可以用作性能优化，适用于被查询的节点不会更改的情况。

```js
import { LitElement, html } from "lit";
import { query } from "lit/decorators/query.js";

class MyElement extends LitElement {
  @query("#first")
  _first;

  render() {
    return html`
      <div id="first"></div>
      <div id="second"></div>
    `;
  }
}
```

此装饰器等同于：

```js
get _first() {
  return this.renderRoot?.querySelector('#first') ?? null;
}
```

#### @queryAll { #query-all }

与 `query` 相同，只是它返回所有匹配的节点，而不是单个节点。它等同于调用 `querySelectorAll`。

```js
import { LitElement, html } from "lit";
import { queryAll } from "lit/decorators/queryAll.js";

class MyElement extends LitElement {
  @queryAll("div")
  _divs;

  render() {
    return html`
      <div id="first"></div>
      <div id="second"></div>
    `;
  }
}
```

这里，`_divs` 将返回模板中的两个 `<div>` 元素。对于 TypeScript，`@queryAll` 属性的类型是 `NodeListOf<HTMLElement>`。如果你确切知道要检索什么类型的节点，类型可以更具体：

```js
@queryAll('button')
_buttons!: NodeListOf<HTMLButtonElement>
```

`buttons` 后面的感叹号（`!`）是 TypeScript 的[非空断言运算符](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-0.html#non-null-assertion-operator)。它告诉编译器将 `buttons` 视为始终已定义，永远不是 `null` 或 `undefined`。

#### @queryAsync { #query-async }

与 `@query` 类似，只是它不直接返回节点，而是返回一个 `Promise`，在任何待处理的元素渲染完成后解析为该节点。代码可以使用它来代替等待 `updateComplete` promise。

例如，如果 `@queryAsync` 返回的节点可能因另一个属性更改而改变，这很有用。

## 使用插槽渲染子元素 {#slots}

你的组件可能接受子元素（就像 `<ul>` 元素可以有 `<li>` 子元素一样）。

```html
<my-element>
  <p>A child</p>
</my-element>
```

默认情况下，如果元素有 shadow 树，其子元素根本不会渲染。

要渲染子元素，你的模板需要包含一个或多个 [`<slot>` 元素](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/slot)，它们充当子节点的占位符。

### 使用 slot 元素

要渲染元素的子元素，在元素的模板中为它们创建一个 `<slot>`。子元素不会在 DOM 树中*移动*，但它们会*像*是 `<slot>` 的子元素一样被渲染。例如：

{% playground-ide "v3-docs/components/shadowdom/slots/" %}

### 使用命名插槽

要将子元素分配到特定插槽，确保子元素的 `slot` 特性与插槽的 `name` 特性匹配：

- 命名插槽只接受具有匹配 `slot` 特性的子元素。

  例如，`<slot name="one"></slot>` 只接受具有 `slot="one"` 特性的子元素。

- 具有 `slot` 特性的子元素只会在具有匹配 `name` 特性的插槽中渲染。

  例如，`<p slot="one">...</p>` 只会放在 `<slot name="one"></slot>` 中。

{% playground-ide "v3-docs/components/shadowdom/namedslots/" %}

### 指定插槽后备内容 {#fallback}

你可以为插槽指定后备内容。当没有子元素被分配到插槽时，会显示后备内容。

```html
<slot>I am fallback content</slot>
```

<div class="alert alert-info">

渲染后备内容。如果有任何子节点被分配到插槽，其后备内容不会渲染。没有名称的默认插槽接受任何子节点。即使唯一被分配的节点是包含空白的文本节点（例如 `<example-element> </example-element>`），它也不会渲染后备内容。当使用 Lit 表达式作为自定义元素的子元素时，请确保在适当时使用非渲染值，以便任何插槽后备内容都能渲染。有关更多信息，请参阅[移除子内容](/docs/v3/templates/expressions/#removing-child)。

</div>

## 访问插槽子元素 { #accessing-slotted-children }

要访问分配到 shadow root 中插槽的子元素，你可以使用标准的 `slot.assignedNodes` 或 `slot.assignedElements` 方法配合 `slotchange` 事件。

例如，你可以创建一个 getter 来访问特定插槽的已分配元素：

```js
get _slottedChildren() {
  const slot = this.shadowRoot.querySelector('slot');
  return slot.assignedElements({flatten: true});
}
```

{% aside "info" %}

元素仅在插槽渲染后才被分配。

如果你需要在启动时访问已分配的元素，你需要等待 `firstUpdated` 或 `updated`。如果你想在渲染更改时访问已分配的元素，可以使用 `slotchange`。

{% endaside %}

你可以使用 `slotchange` 事件在节点首次被分配或更改时采取行动。
以下示例提取所有插槽子元素的文本内容。

```js
handleSlotchange(e) {
  const childNodes = e.target.assignedNodes({flatten: true});
  // ... 对 childNodes 执行某些操作 ...
  this.allText = childNodes.map((node) => {
    return node.textContent ? node.textContent : ''
  }).join('');
}

render() {
  return html`<slot @slotchange=${this.handleSlotchange}></slot>`;
}
```

有关更多信息，请参阅 MDN 上的 [HTMLSlotElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSlotElement)。

### @queryAssignedElements 和 @queryAssignedNodes 装饰器 { #query-assigned-nodes }

`@queryAssignedElements` 和 `@queryAssignedNodes` 将类属性转换为 getter，分别返回在组件 shadow 树中给定插槽上调用
[`slot.assignedElements`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSlotElement/assignedElements) 或 [`slot.assignedNodes`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSlotElement/assignedNodes) 的结果。
使用这些来查询分配给给定插槽的元素或节点。

两者都接受一个具有以下属性的可选对象：

| 属性                                     | 描述                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `flatten`                                | 布尔值，指定是否通过用已分配节点替换任何子 `<slot>` 元素来展平已分配节点。 |
| `slot`                                   | 插槽名称，指定要查询的插槽。留空以选择默认插槽。                           |
| `selector`（仅 `queryAssignedElements`） | 如果指定，则仅返回匹配此 CSS 选择器的已分配元素。                          |

决定使用哪个装饰器取决于你是想查询分配给插槽的文本节点还是仅查询元素节点。此决定特定于你的用例。

<div class="alert alert-info">

使用装饰器。装饰器是一项提议中的 JavaScript 特性，因此你需要使用 Babel 或 TypeScript 等编译器来使用装饰器。有关详细信息，请参阅[使用装饰器](/docs/v3/components/decorators/)。

</div>

```ts
@queryAssignedElements({slot: 'list', selector: '.item'})
_listItems!: Array<HTMLElement>;

@queryAssignedNodes({slot: 'header', flatten: true})
_headerNodes!: Array<Node>;
```

上面的示例等同于以下代码：

```js
get _listItems() {
  const slot = this.shadowRoot.querySelector('slot[name=list]');
  return slot.assignedElements().filter((node) => node.matches('.item'));
}

get _headerNodes() {
  const slot = this.shadowRoot.querySelector('slot[name=header]');
  return slot.assignedNodes({flatten: true});
}
```

## 自定义 render root {#renderroot}

每个 Lit 组件都有一个 render root——一个作为其内部 DOM 容器的 DOM 节点。

默认情况下，LitElement 创建一个开放的 `shadowRoot` 并在其中渲染，产生以下 DOM 结构：

```html
<my-element>
  #shadow-root
  <p>child 1</p>
  <p>child 2</p></my-element
>
```

有两种方式可以自定义 LitElement 使用的 render root：

- 设置 `shadowRootOptions`。
- 实现 `createRenderRoot` 方法。

### 设置 `shadowRootOptions`

自定义 render root 的最简单方式是设置 `shadowRootOptions` 静态属性。`createRenderRoot` 的默认实现在创建组件的 shadow root 时将 `shadowRootOptions` 作为 options 参数传递给 `attachShadow`。可以设置它以自定义 [ShadowRootInit](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow#parameters) 字典中允许的任何选项，例如 `mode` 和 `delegatesFocus`。

```js
class DelegatesFocus extends LitElement {
  static shadowRootOptions = {
    ...LitElement.shadowRootOptions,
    delegatesFocus: true,
  };
}
```

有关更多信息，请参阅 MDN 上的 [Element.attachShadow()](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow)。

### 实现 `createRenderRoot`

`createRenderRoot` 的默认实现创建一个开放的 shadow root，并向其中添加在 `static styles` 类字段中设置的任何样式。有关样式的更多信息，请参阅[样式](/docs/v3/components/styles/)。

要自定义组件的 render root，实现 `createRenderRoot` 并返回你希望模板渲染到的节点。

例如，要将模板渲染到主 DOM 树中作为元素的子元素，实现 `createRenderRoot` 并返回 `this`。

<div class="alert alert-info">

渲染到子元素中。通常不建议渲染到子元素而非 shadow DOM 中。你的元素将无法访问 DOM 或样式作用域，并且无法将元素组合到其内部 DOM 中。

</div>

{% playground-ide "v3-docs/components/shadowdom/renderroot/" %}
