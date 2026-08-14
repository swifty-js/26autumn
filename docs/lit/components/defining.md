---
title: 定义组件
eleventyNavigation:
  key: Defining
  parent: Components
  order: 1
versionLinks:
  v1: components/templates/
  v2: components/defining/
---

通过创建一个继承 `LitElement` 的类并将其注册到浏览器中来定义一个 Lit 组件：

```ts
@customElement("simple-greeting")
export class SimpleGreeting extends LitElement {
  /* ... */
}
```

`@customElement` 装饰器是调用 [`customElements.define`](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define) 的简写形式，它会将自定义元素类注册到浏览器中，并将其与一个元素名称关联（在本例中为 `simple-greeting`）。

如果你使用的是 JavaScript，或者你没有使用装饰器，你可以直接调用 `define()`：

```js
export class SimpleGreeting extends LitElement {
  /* ... */
}
customElements.define("simple-greeting", SimpleGreeting);
```

## Lit 组件就是一个 HTML 元素

当你定义一个 Lit 组件时，你实际上是在定义一个[自定义 HTML 元素](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements)。因此你可以像使用任何内置元素一样使用这个新元素：

```html
<simple-greeting name="Markup"></simple-greeting>
```

```js
const greeting = document.createElement("simple-greeting");
```

`LitElement` 基类是 `HTMLElement` 的子类，因此 Lit 组件继承了所有标准的 `HTMLElement` 属性和方法。

具体来说，`LitElement` 继承自 `ReactiveElement`，后者实现了响应式属性，而 `ReactiveElement` 又继承自 `HTMLElement`。

<img alt="继承关系图，显示 LitElement 继承自 ReactiveElement，而 ReactiveElement 又继承自 HTMLElement。LitElement 负责模板渲染；ReactiveElement 负责管理响应式属性和特性；HTMLElement 是所有原生 HTML 元素和自定义元素共享的标准 DOM 接口。" class="centered-image" src="/images/docs/components/lit-element-inheritance.png">

## 提供良好的 TypeScript 类型定义 {#typescript-typings}

TypeScript 会根据标签名称推断从某些 DOM API 返回的 HTML 元素的类。例如，`document.createElement('img')` 返回一个带有 `src: string` 属性的 `HTMLImageElement` 实例。

自定义元素可以通过向 `HTMLElementTagNameMap` 添加条目来获得相同的处理，如下所示：

```ts
@customElement("my-element")
export class MyElement extends LitElement {
  @property({ type: Number })
  aNumber: number = 5;
  /* ... */
}

declare global {
  interface HTMLElementTagNameMap {
    "my-element": MyElement;
  }
}
```

通过这样做，以下代码可以正确地进行类型检查：

```ts
const myElement = document.createElement("my-element");
myElement.aNumber = 10;
```

我们建议为所有用 TypeScript 编写的元素添加 `HTMLElementTagNameMap` 条目，并确保在 npm 包中发布你的 `.d.ts` 类型定义文件。
