---
title: 渲染
eleventyNavigation:
  key: Rendering
  parent: Components
  order: 2
versionLinks:
  v1: components/templates/
  v2: components/rendering/
---

为你的组件添加一个模板来定义它应该渲染的内容。模板可以包含*表达式*，它们是动态内容的占位符。

要为 Lit 组件定义模板，请添加一个 `render()` 方法：

{% playground-example "v3-docs/templates/define" "my-element.ts" %}

使用 Lit 的 [`html`](/docs/v3/api/templates/#html) 标签函数，在 JavaScript [标签模板字符串](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates)中用 HTML 编写你的模板。

Lit 模板可以包含 JavaScript _表达式_。你可以使用表达式来设置文本内容、特性、属性和事件监听器。`render()` 方法也可以包含任何 JavaScript 代码——例如，你可以创建局部变量供表达式使用。

## 可渲染的值 { #renderable-values }

通常，组件的 `render()` 方法返回一个单独的 `TemplateResult` 对象（与 `html` 标签函数返回的类型相同）。但是，它可以返回任何 Lit 能够作为 HTML 元素子内容进行渲染的值：

- 原始值，如字符串、数字或布尔值。
- 由 `html` 函数创建的 `TemplateResult` 对象。
- DOM 节点。
- 哨兵值 [`nothing`](/docs/v3/templates/conditionals/#conditionally-rendering-nothing) 和 [`noChange`](/docs/v3/templates/custom-directives/#signaling-no-change)。
- 任何受支持类型的数组或可迭代对象。

这与可以渲染到 Lit [子表达式](/docs/v3/templates/expressions/#child-expressions)中的值集合*几乎完全相同*。唯一的区别是子表达式可以渲染由 [`svg`](/docs/v3/api/templates/#svg) 函数返回的 `SVGTemplateResult`。这种类型的模板结果只能作为 `<svg>` 元素的后代进行渲染。

## 编写良好的 render() 方法

为了充分利用 Lit 的函数式渲染模型，你的 `render()` 方法应该遵循以下准则：

- 避免更改组件的状态。
- 避免产生任何副作用。
- 仅使用组件的属性作为输入。
- 在给定相同属性值时返回相同的结果。

遵循这些准则可以保持模板的确定性，并使代码更容易推理。

在大多数情况下，你应该避免在 `render()` 之外进行 DOM 更新。相反，应将组件的模板表达为其状态的函数，并将其状态保存在属性中。

例如，如果你的组件需要在接收到事件时更新其 UI，应让事件监听器设置一个在 `render()` 中使用的响应式属性，而不是直接操作 DOM。

有关更多信息，请参阅[响应式属性](/docs/v3/components/properties/)。

## 组合模板

你可以从其他模板组合 Lit 模板。以下示例从页面头部、底部和主要内容的小模板组合出一个名为 `<my-page>` 的组件模板：

{% playground-example "v3-docs/templates/compose" "my-page.ts" %}

在此示例中，各个模板被定义为实例方法，因此子类可以扩展此组件并覆盖一个或多个模板。

{% todo %}

Move example to composition section, add xref.

{% endtodo %}

你还可以通过导入其他元素并在模板中使用它们来组合模板：

{% playground-ide "v3-docs/templates/composeimports" %}

## 模板何时渲染

Lit 组件在首次被添加到页面的 DOM 中时会渲染其模板。在初始渲染之后，组件响应式属性的任何更改都会触发更新周期，重新渲染组件。

Lit 会批量处理更新以最大化性能和效率。一次设置多个属性只会触发一次更新，在微任务时机异步执行。

在更新期间，只有发生变化的 DOM 部分会被重新渲染。虽然 Lit 模板看起来像字符串插值，但 Lit 只解析和创建一次静态 HTML，之后只更新表达式中变化的值，使更新非常高效。

有关更新周期的更多信息，请参阅[属性更改时会发生什么](/docs/v3/components/properties/#when-properties-change)。

## DOM 封装

Lit 使用 shadow DOM 来封装组件渲染的 DOM。Shadow DOM 允许元素创建自己的、独立的 DOM 树，与主文档树分离。它是 Web Components 规范的核心特性，实现了互操作性、样式封装和其他优势。

有关 shadow DOM 的更多信息，请参阅 Web Fundamentals 上的 [Shadow DOM v1: Self-Contained Web Components
](https://developers.google.com/web/fundamentals/web-components/shadowdom)。

有关在组件中使用 shadow DOM 的更多信息，请参阅[使用 Shadow DOM](/docs/v3/components/shadow-dom/)。

## 另请参阅

- [Shadow DOM](/docs/v3/components/shadow-dom/)
- [模板概述](/docs/v3/templates/overview/)
- [模板表达式](/docs/v3/templates/expressions/)
