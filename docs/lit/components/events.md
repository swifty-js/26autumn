---
title: 事件
eleventyNavigation:
  key: Events
  parent: Components
  order: 7
versionLinks:
  v1: components/events/
  v2: components/events/
---

事件是元素传达变化的标准方式。这些变化通常由用户交互引起。例如，当用户点击按钮时，按钮会派发一个 click 事件；当用户在输入框中输入值时，输入框会派发一个 change 事件。

除了这些自动派发的标准事件外，Lit 元素还可以派发自定义事件。例如，菜单元素可能会派发一个事件来指示所选项已更改；弹出元素可能会在弹出框打开或关闭时派发一个事件。

任何 JavaScript 代码，包括 Lit 元素本身，都可以监听事件并根据事件采取行动。例如，工具栏元素可能会在选择菜单项时过滤列表；登录元素可能会在处理登录按钮的点击时执行登录操作。

## 监听事件

除了标准的 `addEventListener` API 外，Lit 还引入了一种声明式的方式来添加事件监听器。

### 在元素模板中添加事件监听器

你可以在模板中使用 `@` 表达式为组件模板中的元素添加事件监听器。声明式事件监听器在模板渲染时添加。

{% playground-example "v3-docs/components/events/child/" "my-element.ts" %}

#### 自定义事件监听器选项 {#event-options-decorator}

如果你需要自定义声明式事件监听器使用的事件选项（如 `passive` 或 `capture`），你可以使用 `@eventOptions` 装饰器在监听器上指定这些选项。传递给 `@eventOptions` 的对象会作为 `options` 参数传递给 `addEventListener`。

```js
import {LitElement, html} from 'lit';
import {eventOptions} from 'lit/decorators.js';
//...
@eventOptions({passive: true})
private _handleTouchStart(e) { console.log(e.type) }
```

<div class="alert alert-info">

使用装饰器。装饰器是一项提议中的 JavaScript 特性，因此你需要使用 Babel 或 TypeScript 等编译器来使用装饰器。有关详细信息，请参阅[启用装饰器](/docs/v3/components/decorators/#enabling-decorators)。

</div>

如果你没有使用装饰器，你可以通过向事件监听器表达式传递一个对象来自定义事件监听器选项。该对象必须有一个 `handleEvent()` 方法，并且可以包含通常出现在 `addEventListener()` 的 `options` 参数中的任何选项。

[comment]: <> "The `raw` macro is necessary to prevent the double handlebar in the code sample from messing with the liquid templating syntax"

{% raw %}

```js
render() {
  return html`<button @click=${{handleEvent: () => this.onClick(), once: true}}>click</button>`
}
```

{% endraw %}

### 向组件或其 shadow root 添加事件监听器

要在组件的插槽子元素以及通过组件模板渲染到 shadow DOM 中的子元素派发事件时收到通知，你可以使用标准的 `addEventListener` DOM 方法向组件本身添加监听器。有关完整详细信息，请参阅 MDN 上的 [EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)。

组件构造函数是向组件添加事件监听器的好地方。

```js
constructor() {
  super();
  this.addEventListener('click', (e) => console.log(e.type, e.target.localName));
}
```

向组件本身添加事件监听器是事件委托的一种形式，可以用来减少代码或提高性能。有关详细信息，请参阅[事件委托](#event-delegation)。通常在这种情况下，会使用事件的 `target` 属性来根据触发事件的元素采取行动。

但是，从组件的 shadow DOM 中触发的事件在被组件上的事件监听器听到时会被重新定向。这意味着事件目标是组件本身。有关更多信息，请参阅[在 shadow DOM 中使用事件](#shadowdom)。

重新定向可能会干扰事件委托，为了避免这种情况，可以将事件监听器添加到组件的 shadow root 本身。由于 `shadowRoot` 在 `constructor` 中不可用，可以在 `createRenderRoot` 方法中添加事件监听器，如下所示。请注意，确保从 `createRenderRoot` 方法返回 shadow root 是很重要的。

{% playground-example "v3-docs/components/events/host/" "my-element.ts" %}

### 向其他元素添加事件监听器

如果你的组件向自身或其模板 DOM 以外的任何对象添加了事件监听器——例如向 `Window`、`Document` 或主 DOM 中的某个元素——你应该在 `connectedCallback` 中添加监听器，并在 `disconnectedCallback` 中移除它。

- 在 `disconnectedCallback` 中移除事件监听器可以确保组件分配的任何内存在组件被销毁或从页面断开连接时得到清理。

- 在 `connectedCallback` 中添加事件监听器（而不是例如在构造函数或 `firstUpdated` 中）可以确保组件在断开连接后重新连接到 DOM 时重新创建其事件监听器。

```js
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('resize', this._handleResize);
}
disconnectedCallback() {
  window.removeEventListener('resize', this._handleResize);
  super.disconnectedCallback();
}
```

有关 `connectedCallback` 和 `disconnectedCallback` 的更多信息，请参阅 MDN 上关于使用自定义元素[生命周期回调](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements#Using_the_lifecycle_callbacks)的文档。

### 性能优化

添加事件监听器非常快，通常不会成为性能问题。但是，对于高频使用且需要大量事件监听器的组件，你可以通过[事件委托](#event-delegation)减少使用的监听器数量，以及在渲染后[异步](#async-events)添加监听器来优化首次渲染性能。

#### 事件委托 { #event-delegation }

使用事件委托可以减少使用的事件监听器数量，从而提高性能。有时集中处理事件以减少代码也很方便。事件委托只能用于处理会`冒泡`的事件。有关冒泡的详细信息，请参阅[派发事件](#dispatching-events)。

冒泡事件可以在 DOM 中的任何祖先元素上被听到。你可以利用这一点，在祖先组件上添加单个事件监听器，以便在 DOM 中的任何后代派发冒泡事件时收到通知。使用事件的 `target` 属性根据派发事件的元素采取特定操作。

{% playground-example "v3-docs/components/events/delegation/" "my-element.ts" %}

#### 异步添加事件监听器 { #async-events }

要在渲染后添加事件监听器，请使用 `firstUpdated` 方法。这是一个 Lit 生命周期回调，在组件首次更新并渲染其模板 DOM 后运行。

`firstUpdated` 回调在组件首次更新并调用其 `render` 方法后触发，但在浏览器有机会绘制之前触发。

有关更多信息，请参阅生命周期文档中的 [firstUpdated](/docs/v3/components/lifecycle/#firstupdated)。

要确保在用户可以看到组件后添加监听器，你可以等待一个在浏览器绘制后解析的 Promise。

```js
async firstUpdated() {
  // 给浏览器一个绘制的机会
  await new Promise((r) => setTimeout(r, 0));
  this.addEventListener('click', this._handleClick);
}
```

### 理解事件监听器中的 `this`

使用模板中声明式 `@` 语法添加的事件监听器会自动*绑定*到组件。

因此，你可以在任何声明式事件处理程序中使用 `this` 来引用你的组件实例：

```js
class MyElement extends LitElement {
  render() {
    return html`<button @click="${this._handleClick}">click</button>`;
  }
  _handleClick(e) {
    console.log(this.prop);
  }
}
```

当使用 `addEventListener` 以命令式方式添加监听器时，你需要使用箭头函数以便 `this` 引用组件：

```ts
export class MyElement extends LitElement {
  private _handleResize = () => {
    // `this` 引用组件
    console.log(this.isConnected);
  };

  constructor() {
    window.addEventListener("resize", this._handleResize);
  }
}
```

有关更多信息，请参阅 [MDN 上关于 `this` 的文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this)。

### 监听从重复模板触发的事件

在监听重复项上的事件时，如果事件会冒泡，使用[事件委托](#event-delegation)通常很方便。当事件不会冒泡时，可以在重复的元素上添加监听器。以下是两种方法的示例：

{% playground-example "v3-docs/components/events/list/" "my-element.ts" %}

### 移除事件监听器

向 `@` 表达式传递 `null`、`undefined` 或 `nothing` 将移除任何现有的监听器。

## 派发事件 { #dispatching-events }

所有 DOM 节点都可以使用 `dispatchEvent` 方法派发事件。首先，创建一个事件实例，指定事件类型和选项。然后将其传递给 `dispatchEvent`，如下所示：

```js
const event = new Event("my-event", { bubbles: true, composed: true });
myElement.dispatchEvent(event);
```

`bubbles` 选项允许事件沿 DOM 树向上流动到派发元素的所有祖先。如果你希望事件能够参与[事件委托](#event-delegation)，设置此标志很重要。

`composed` 选项设置为 true 可以允许事件被派发到元素所在的 shadow DOM 树之外。

有关更多信息，请参阅[在 shadow DOM 中使用事件](#shadowdom)。

有关派发事件的完整描述，请参阅 MDN 上的 [EventTarget.dispatchEvent()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent)。

### 何时派发事件

事件应该在响应用户交互或组件状态的异步变化时派发。它们通常不应该在响应组件所有者通过其属性或特性 API 进行的状态更改时派发。这通常是原生 Web 平台元素的工作方式。

例如，当用户在 `input` 元素中输入值时会派发 `change` 事件，但如果代码设置了 `input` 的 `value` 属性，则不会派发 `change` 事件。

类似地，菜单组件应该在用户选择菜单项时派发事件，但如果例如设置了菜单的 `selectedItem` 属性，则不应该派发事件。

这通常意味着组件应该响应其正在监听的另一个事件来派发事件。

{% playground-ide "v3-docs/components/events/dispatch/" "my-dispatcher.ts" %}

### 在元素更新后派发事件

通常，事件应该只在元素更新并渲染后触发。如果事件旨在传达基于用户交互的渲染状态变化，这可能是必要的。在这种情况下，可以在更改状态后、派发事件前等待组件的 `updateComplete` Promise。

{% playground-ide "v3-docs/components/events/update/" "my-dispatcher.ts" %}

### 使用标准事件或自定义事件 { #standard-custom-events }

事件可以通过构造 `Event` 或 `CustomEvent` 来派发。两种方法都是合理的。使用 `CustomEvent` 时，任何事件数据都通过事件的 `detail` 属性传递。使用 `Event` 时，可以创建一个事件子类并将自定义 API 附加到其上。

有关构造事件的详细信息，请参阅 MDN 上的 [Event](https://developer.mozilla.org/en-US/docs/Web/API/Event/Event)。

#### 触发自定义事件：

```js
const event = new CustomEvent("my-event", {
  detail: {
    message: "Something important happened",
  },
});
this.dispatchEvent(event);
```

有关更多信息，请参阅 [MDN 上关于自定义事件的文档](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent)。

#### 触发标准事件：

```js
class MyEvent extends Event {
  constructor(message) {
    super();
    this.type = "my-event";
    this.message = message;
  }
}

const event = new MyEvent("Something important happened");
this.dispatchEvent(event);
```

## 在 shadow DOM 中使用事件 {#shadowdom}

使用 shadow DOM 时，标准事件系统有一些重要的修改需要理解。Shadow DOM 的存在主要是为了在 DOM 中提供一种作用域机制，封装这些"shadow"元素的细节。因此，shadow DOM 中的事件会向外部 DOM 元素封装某些细节。

### 理解 composed 事件派发 {#shadowdom-composed}

默认情况下，在 shadow root 内部派发的事件在该 shadow root 外部是不可见的。要使事件穿过 shadow DOM 边界，你必须将 [`composed` 属性](https://developer.mozilla.org/en-US/docs/Web/API/Event/composed)设置为 `true`。通常将 `composed` 与 `bubbles` 搭配使用，这样 DOM 树中的所有节点都可以看到该事件：

```js
_dispatchMyEvent() {
  let myEvent = new CustomEvent('my-event', {
    detail: { message: 'my-event happened.' },
    bubbles: true,
    composed: true });
  this.dispatchEvent(myEvent);
}
```

如果一个事件是 `composed` 的并且会 `bubble`，那么它可以被派发事件元素的所有祖先接收——包括外部 shadow root 中的祖先。如果一个事件是 `composed` 的但不会 `bubble`，它只能在派发事件的元素和包含 shadow root 的宿主元素上被接收。

请注意，大多数标准用户界面事件，包括所有鼠标、触摸和键盘事件，都是冒泡且 composed 的。有关更多信息，请参阅 [MDN 上关于 composed 事件的文档](https://developer.mozilla.org/en-US/docs/Web/API/Event/composed)。

### 理解事件重新定向 {#shadowdom-retargeting}

从 shadow root 内部派发的 [composed](#shadowdom-composed) 事件会被重新定向，这意味着对于宿主 shadow root 的元素或其任何祖先上的任何监听器来说，它们看起来像是来自宿主元素。由于 Lit 组件渲染到 shadow root 中，从 Lit 组件内部派发的所有 composed 事件看起来都是由 Lit 组件本身派发的。事件的 `target` 属性就是该 Lit 组件。

```html
<my-element onClick="(e) => console.log(e.target)"></my-element>
```

```js
render() {
  return html`
    <button id="mybutton" @click="${(e) => console.log(e.target)}">
      click me
    </button>`;
}
```

在需要确定事件来源的高级情况下，请使用 `event.composedPath()` API。此方法返回事件派发所经过的所有节点的数组，包括 shadow root 内的节点。由于这会破坏封装，应注意避免依赖可能暴露的实现细节。常见的用例包括确定被点击的元素是否是锚标签，用于客户端路由。

```js
handleMyEvent(event) {
  console.log('Origin: ', event.composedPath()[0]);
}
```

有关更多信息，请参阅 [MDN 上关于 composedPath 的文档](https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath)。

## 在事件派发者和监听者之间通信

事件的主要存在目的是将变化从事件派发者传达给事件监听者，但事件也可以用于将信息从监听者传达回派发者。

一种方法是在事件上暴露 API，监听者可以使用它来自定义组件行为。例如，监听者可以在自定义事件的 detail 属性上设置一个属性，派发组件随后使用该属性来自定义行为。

另一种在派发者和监听者之间通信的方式是通过 `preventDefault()` 方法。可以调用它来指示不应执行事件的标准操作。当监听者调用 `preventDefault()` 时，事件的 `defaultPrevented` 属性变为 true。然后监听者可以使用此标志来自定义行为。

以下示例中使用了这两种技术：

{% playground-ide "v3-docs/components/events/comm/" "my-listener.ts" %}
