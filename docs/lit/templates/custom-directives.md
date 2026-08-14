---
title: 自定义指令
eleventyNavigation:
  parent: 模板
  title: 自定义指令
  key: 自定义指令
  order: 6
versionLinks:
  v1: lit-html/creating-directives/
  v2: templates/custom-directives/
---

指令是通过自定义模板表达式的渲染方式来扩展 Lit 的函数。指令之所以有用且强大，是因为它们可以是有状态的、可以访问 DOM、可以在模板断开连接和重新连接时收到通知，并且可以在渲染调用之外独立更新表达式。

在模板中使用指令就像在模板表达式中调用函数一样简单：

```js
html`<div>${fancyDirective("some text")}</div>`;
```

Lit 附带了许多[内置指令](/docs/v3/templates/directives/)，如 [`repeat()`](/docs/v3/templates/directives/#repeat) 和 [`cache()`](/docs/v3/templates/directives/#cache)。用户也可以编写自己的自定义指令。

指令有两种类型：

- 简单函数
- 基于类的指令

简单函数返回一个要渲染的值。它可以接受任意数量的参数，也可以不接受参数。

```js
export noVowels = (str) => str.replaceAll(/[aeiou]/ig,'x');
```

基于类的指令让你可以做简单函数无法做到的事情。在以下情况使用基于类的指令：

- 直接访问渲染的 DOM（例如，添加、删除或重新排序渲染的 DOM 节点）。
- 在渲染之间持久化状态。
- 在渲染调用之外异步更新 DOM。
- 当指令从 DOM 断开连接时清理资源

本页面的其余部分描述基于类的指令。

## 创建基于类的指令

要创建基于类的指令：

- 将指令实现为继承 {% api-v3 "Directive" %} 类的类。
- 将你的类传递给 {% api-v3 "directive()" "directive" %} 工厂函数，创建一个可在 Lit 模板表达式中使用的指令函数。

```js
import { Directive, directive } from "lit/directive.js";

// 定义指令
class HelloDirective extends Directive {
  render() {
    return `Hello!`;
  }
}
// 创建指令函数
const hello = directive(HelloDirective);

// 使用指令
const template = html`<div>${hello()}</div>`;
```

当此模板被求值时，指令*函数*（`hello()`）返回一个 `DirectiveResult` 对象，它指示 Lit 创建或更新指令*类*（`HelloDirective`）的实例。然后 Lit 调用指令实例上的方法来运行其更新逻辑。

某些指令需要在正常更新周期之外异步更新 DOM。要创建*异步指令*，请继承 `AsyncDirective` 基类而不是 `Directive`。详情请参阅[异步指令](#async-directives)。

## 基于类的指令的生命周期

指令类有几个内置的生命周期方法：

- 类构造函数，用于一次性初始化。
- `render()`，用于声明式渲染。
- `update()`，用于命令式 DOM 访问。

你必须为所有指令实现 `render()` 回调。实现 `update()` 是可选的。`update()` 的默认实现调用并返回 `render()` 的值。

异步指令可以在正常更新周期之外更新 DOM，使用一些额外的生命周期回调。详情请参阅[异步指令](#async-directives)。

### 一次性设置：constructor()

当 Lit 首次在表达式中遇到 `DirectiveResult` 时，它会构造相应指令类的实例（导致指令的构造函数和任何类字段初始化器运行）：

{% switchable-sample %}

```ts
class MyDirective extends Directive {
  // 类字段将被初始化一次，可用于在渲染之间持久化状态
  value = 0;
  // 构造函数仅在给定指令首次在表达式中使用时运行
  constructor(partInfo: PartInfo) {
    super(partInfo);
    console.log('MyDirective created');
  }
  ...
}
```

```js
class MyDirective extends Directive {
  // 类字段将被初始化一次，可用于在渲染之间持久化状态
  value = 0;
  // 构造函数仅在给定指令首次在表达式中使用时运行
  constructor(partInfo) {
    super(partInfo);
    console.log('MyDirective created');
  }
  ...
}
```

{% endswitchable-sample %}

只要每次渲染时在相同的表达式中使用相同的指令函数，之前的实例就会被重用，因此实例的状态在渲染之间持久化。

构造函数接收一个 `PartInfo` 对象，它提供有关指令所使用的表达式的元数据。这在指令设计为仅在特定类型的表达式中使用的情况下提供错误检查时很有用（参阅[将指令限制为一种表达式类型](#limiting-a-directive-to-one-expression-type)）。

### 声明式渲染：render()

`render()` 方法应返回要渲染到 DOM 中的值。它可以返回任何可渲染的值，包括另一个 `DirectiveResult`。

除了引用指令实例上的状态外，`render()` 方法还可以接受传递给指令函数的任意参数：

```js
const template = html`<div>${myDirective(name, rank)}</div>`;
```

为 `render()` 方法定义的参数决定了指令函数的签名：

{% switchable-sample %}

```ts
class MaxDirective extends Directive {
  maxValue = Number.MIN_VALUE;
  // 定义一个 render 方法，它可以接受参数：
  render(value: number, minValue = Number.MIN_VALUE) {
    this.maxValue = Math.max(value, this.maxValue, minValue);
    return this.maxValue;
  }
}
const max = directive(MaxDirective);

// 使用为 `render()` 定义的 `value` 和 `minValue` 参数调用指令：
const template = html`<div>${max(someNumber, 0)}</div>`;
```

```js
class MaxDirective extends Directive {
  maxValue = Number.MIN_VALUE;
  // 定义一个 render 方法，它可以接受参数：
  render(value, minValue = Number.MIN_VALUE) {
    this.maxValue = Math.max(value, this.maxValue, minValue);
    return this.maxValue;
  }
}
const max = directive(MaxDirective);

// 使用为 `render()` 定义的 `value` 和 `minValue` 参数调用指令：
const template = html`<div>${max(someNumber, 0)}</div>`;
```

{% endswitchable-sample %}

### 命令式 DOM 访问：update()

在更高级的用例中，你的指令可能需要访问底层 DOM 并命令式地读取或变更它。你可以通过覆盖 `update()` 回调来实现这一点。

`update()` 回调接收两个参数：

- 一个 `Part` 对象，具有直接管理与表达式关联的 DOM 的 API。
- 一个包含 `render()` 参数的数组。

你的 `update()` 方法应返回 Lit 可以渲染的内容，或者如果不需要重新渲染则返回特殊值 `noChange`。`update()` 回调非常灵活，但典型用法包括：

- 从 DOM 读取数据，并使用它生成要渲染的值。
- 使用 `Part` 对象上的 `element` 或 `parentNode` 引用命令式地更新 DOM。在这种情况下，`update()` 通常返回 `noChange`，表示 Lit 不需要采取任何进一步操作来渲染指令。

#### Part

每个表达式位置都有其特定的 `Part` 对象：

- {% api-v3 "ChildPart" %} 用于 HTML 子位置的表达式。
- {% api-v3 "AttributePart" %} 用于 HTML 属性值位置的表达式。
- {% api-v3 "BooleanAttributePart" %} 用于布尔属性值中的表达式（名称以 `?` 为前缀）。
- {% api-v3 "EventPart" %} 用于事件监听器位置的表达式（名称以 `@` 为前缀）。
- {% api-v3 "PropertyPart" %} 用于属性值位置的表达式（名称以 `.` 为前缀）。
- {% api-v3 "ElementPart" %} 用于元素标签上的表达式。

除了 `PartInfo` 中包含的特定于 part 的元数据外，所有 `Part` 类型都提供对与表达式关联的 DOM `element`（或对于 `ChildPart` 是 `parentNode`）的访问，可以在 `update()` 中直接访问。例如：

{% switchable-sample %}

```ts
// 将父元素的属性名渲染到 textContent
class AttributeLogger extends Directive {
  attributeNames = "";
  update(part: ChildPart) {
    this.attributeNames = (part.parentNode as Element)
      .getAttributeNames?.()
      .join(" ");
    return this.render();
  }
  render() {
    return this.attributeNames;
  }
}
const attributeLogger = directive(AttributeLogger);

const template = html`<div a b>${attributeLogger()}</div>`;
// 渲染为: `<div a b>a b</div>`
```

```js
// 将父元素的属性名渲染到 textContent
class AttributeLogger extends Directive {
  attributeNames = "";
  update(part) {
    this.attributeNames = part.parentNode.getAttributeNames?.().join(" ");
    return this.render();
  }
  render() {
    return this.attributeNames;
  }
}
const attributeLogger = directive(AttributeLogger);

const template = html`<div a b>${attributeLogger()}</div>`;
// 渲染为: `<div a b>a b</div>`
```

{% endswitchable-sample %}

此外，`directive-helpers.js` 模块包含许多作用于 `Part` 对象的辅助函数，可用于在指令的 `ChildPart` 中动态创建、插入和移动 part。

#### 从 update() 调用 render()

`update()` 的默认实现只是调用并返回 `render()` 的值。如果你覆盖了 `update()` 并且仍然想调用 `render()` 来生成值，你需要显式调用 `render()`。

`render()` 的参数作为数组传递给 `update()`。你可以像这样将参数传递给 `render()`：

{% switchable-sample %}

```ts
class MyDirective extends Directive {
  update(part: Part, [fish, bananas]: DirectiveParameters<this>) {
    // ...
    return this.render(fish, bananas);
  }
  render(fish: number, bananas: number) { ... }
}
```

```js
class MyDirective extends Directive {
  update(part, [fish, bananas]) {
    // ...
    return this.render(fish, bananas);
  }
  render(fish, bananas) { ... }
}
```

{% endswitchable-sample %}

### update() 和 render() 之间的区别

虽然 `update()` 回调比 `render()` 回调更强大，但有一个重要的区别：当使用 `@lit-labs/ssr` 包进行服务器端渲染（SSR）时，服务器上*只*会调用 `render()` 方法。为了与 SSR 兼容，指令应该从 `render()` 返回值，并且只使用 `update()` 来处理需要访问 DOM 的逻辑。

## 通知无变化

有时指令可能没有新内容让 Lit 渲染。你通过从 `update()` 或 `render()` 方法返回 `noChange` 来通知这一点。这与返回 `undefined` 不同，后者会导致 Lit 清除与指令关联的 `Part`。返回 `noChange` 会保留先前渲染的值。

返回 `noChange` 有几个常见原因：

- 基于输入值，没有新内容可渲染。
- `update()` 方法已命令式地更新了 DOM。
- 在异步指令中，对 `update()` 或 `render()` 的调用可能返回 `noChange`，因为*还*没有内容可渲染。

例如，指令可以跟踪传递给它的先前值，并执行自己的脏检查来确定指令的输出是否需要更新。`update()` 或 `render()` 方法可以返回 `noChange` 来通知指令的输出不需要重新渲染。

{% switchable-sample %}

```ts
import { Directive } from "lit/directive.js";
import { noChange } from "lit";
class CalculateDiff extends Directive {
  a?: string;
  b?: string;
  render(a: string, b: string) {
    if (this.a !== a || this.b !== b) {
      this.a = a;
      this.b = b;
      // 昂贵且精巧的文本差异算法
      return calculateDiff(a, b);
    }
    return noChange;
  }
}
```

```js
import { Directive } from "lit/directive.js";
import { noChange } from "lit";
class CalculateDiff extends Directive {
  render(a, b) {
    if (this.a !== a || this.b !== b) {
      this.a = a;
      this.b = b;
      // 昂贵且精巧的文本差异算法
      return calculateDiff(a, b);
    }
    return noChange;
  }
}
```

{% endswitchable-sample %}

## 将指令限制为一种表达式类型

某些指令只在一种上下文中有用，例如属性表达式或子表达式。如果放置在错误的上下文中，指令应抛出适当的错误。

例如，`classMap` 指令验证它只在 `AttributePart` 中使用且仅用于 `class` 属性：

{% switchable-sample %}

```ts
class ClassMap extends Directive {
  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (
      partInfo.type !== PartType.ATTRIBUTE ||
      partInfo.name !== 'class'
    ) {
      throw new Error('The `classMap` directive must be used in the `class` attribute');
    }
  }
  ...
}
```

```js
class ClassMap extends Directive {
  constructor(partInfo) {
    super(partInfo);
    if (
      partInfo.type !== PartType.ATTRIBUTE ||
      partInfo.name !== 'class'
    ) {
      throw new Error('The `classMap` directive must be used in the `class` attribute');
    }
  }
  ...
}
```

{% endswitchable-sample %}

## 异步指令

前面的示例指令是同步的：它们从 `render()`/`update()` 生命周期回调中同步返回值，因此它们的结果在组件的 `update()` 回调期间写入 DOM。

有时，你希望指令能够异步更新 DOM——例如，如果它依赖于像网络请求这样的异步事件。

要异步更新指令的结果，指令需要继承 {% api-v3 "AsyncDirective" %} 基类，它提供了一个 `setValue()` API。`setValue()` 允许指令在模板的正常 `update`/`render` 周期之外将新值"推送"到其模板表达式中。

以下是一个渲染 Promise 值的简单异步指令示例：

{% switchable-sample %}

```ts
class ResolvePromise extends AsyncDirective {
  render(promise: Promise<unknown>) {
    Promise.resolve(promise).then((resolvedValue) => {
      // 异步渲染：
      this.setValue(resolvedValue);
    });
    // 同步渲染：
    return `Waiting for promise to resolve`;
  }
}
export const resolvePromise = directive(ResolvePromise);
```

```js
class ResolvePromise extends AsyncDirective {
  render(promise) {
    Promise.resolve(promise).then((resolvedValue) => {
      // 异步渲染：
      this.setValue(resolvedValue);
    });
    // 同步渲染：
    return `Waiting for promise to resolve`;
  }
}
export const resolvePromise = directive(ResolvePromise);
```

{% endswitchable-sample %}

在这里，渲染的模板显示"Waiting for promise to resolve"，然后在 promise 解析后显示解析的值。

异步指令通常需要订阅外部资源。为了防止内存泄漏，异步指令应在指令实例不再使用时取消订阅或释放资源。为此，`AsyncDirective` 提供了以下额外的生命周期回调和 API：

- `disconnected()`：当指令不再使用时调用。指令实例在三种情况下会断开连接：
  - 当包含指令的 DOM 树从 DOM 中移除时
  - 当指令的宿主元素断开连接时
  - 当产生指令的表达式不再解析为相同的指令时。

  在指令收到 `disconnected` 回调后，它应释放在 `update` 或 `render` 期间可能已订阅的所有资源，以防止内存泄漏。

- `reconnected()`：当先前断开连接的指令重新投入使用时调用。因为 DOM 子树可以临时断开连接然后稍后重新连接，断开连接的指令可能需要对重新连接做出反应。这方面的例子包括 DOM 被移除并缓存以供以后使用，或者宿主元素被移动导致断开连接和重新连接。`reconnected()` 回调应始终与 `disconnected()` 一起实现，以便将断开连接的指令恢复到其工作状态。

- `isConnected`：反映指令的当前连接状态。

<div class="alert alert-info">

请注意，`AsyncDirective` 在断开连接时如果其包含的树被重新渲染，仍可能继续接收更新。因此，`update` 和/或 `render` 应始终在订阅任何长期持有的资源之前检查 `this.isConnected` 标志，以防止内存泄漏。

</div>

以下是一个订阅 `Observable` 并适当处理断开连接和重新连接的指令示例：

{% switchable-sample %}

```ts
class ObserveDirective extends AsyncDirective {
  observable: Observable<unknown> | undefined;
  unsubscribe: (() => void) | undefined;
  // 当 observable 变化时，取消订阅旧的并订阅新的
  render(observable: Observable<unknown>) {
    if (this.observable !== observable) {
      this.unsubscribe?.();
      this.observable = observable;
      if (this.isConnected) {
        this.subscribe(observable);
      }
    }
    return noChange;
  }
  // 订阅 observable，每次值变化时调用指令的异步 setValue API
  subscribe(observable: Observable<unknown>) {
    this.unsubscribe = observable.subscribe((v: unknown) => {
      this.setValue(v);
    });
  }
  // 当指令从 DOM 断开连接时，取消订阅以确保指令实例可以被垃圾回收
  disconnected() {
    this.unsubscribe!();
  }
  // 如果指令所在的子树断开连接后重新连接，重新订阅以使指令再次可操作
  reconnected() {
    this.subscribe(this.observable!);
  }
}
export const observe = directive(ObserveDirective);
```

```js
class ObserveDirective extends AsyncDirective {
  // 当 observable 变化时，取消订阅旧的并订阅新的
  render(observable) {
    if (this.observable !== observable) {
      this.unsubscribe?.();
      this.observable = observable;
      if (this.isConnected) {
        this.subscribe(observable);
      }
    }
    return noChange;
  }
  // 订阅 observable，每次值变化时调用指令的异步 setValue API
  subscribe(observable) {
    this.unsubscribe = observable.subscribe((v) => {
      this.setValue(v);
    });
  }
  // 当指令从 DOM 断开连接时，取消订阅以确保指令实例可以被垃圾回收
  disconnected() {
    this.unsubscribe();
  }
  // 如果指令所在的子树断开连接后重新连接，重新订阅以使指令再次可操作
  reconnected() {
    this.subscribe(this.observable);
  }
}
export const observe = directive(ObserveDirective);
```

{% endswitchable-sample %}
