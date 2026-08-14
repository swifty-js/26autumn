---
title: 上下文
eleventyNavigation:
  key: 上下文
  parent: 数据管理
  order: 1
versionLinks:
  v2: data/context/
---

上下文（Context）是一种让数据对整个组件子树可用的方式，而无需手动将属性绑定到每个组件。数据以"上下文"方式可用，使得数据提供者和数据消费者之间的祖先元素甚至不需要感知到它的存在。

Lit 的上下文实现位于 `@lit/context` 包中：

```bash
npm i @lit/context
```

上下文适用于需要被各种各样、大量的组件所消费的数据——例如应用的数据存储、当前用户、UI 主题——或者当数据绑定不可行时，例如当一个元素需要向其 light DOM 子元素提供数据时。

上下文与 React 的 Context 非常相似，也与 Angular 等依赖注入系统类似，但有一些重要的区别，使上下文能够适应 DOM 的动态特性，并实现不同 Web Components 库、框架和纯 JavaScript 之间的互操作性。

## 示例

使用上下文涉及一个*上下文对象*（有时称为键）、一个*提供者*和一个*消费者*，它们通过上下文对象进行通信。

上下文定义（`logger-context.ts`）：

```ts
import { createContext } from "@lit/context";
import type { Logger } from "my-logging-library";
export type { Logger } from "my-logging-library";
export const loggerContext = createContext<Logger>("logger");
```

提供者：

```ts
import { LitElement, property, html } from "lit";
import { provide } from "@lit/context";

import { Logger } from "my-logging-library";
import { loggerContext } from "./logger-context.js";

@customElement("my-app")
class MyApp extends LitElement {
  @provide({ context: loggerContext })
  logger = new Logger();

  render() {
    return html`...`;
  }
}
```

消费者：

```ts
import { LitElement, property } from "lit";
import { consume } from "@lit/context";

import { type Logger, loggerContext } from "./logger-context.js";

export class MyElement extends LitElement {
  @consume({ context: loggerContext })
  @property({ attribute: false })
  public logger?: Logger;

  private doThing() {
    this.logger?.log("A thing was done");
  }
}
```

## 核心概念

### 上下文协议

Lit 的上下文基于 W3C [Web Components 社区组](https://www.w3.org/community/webcomponents/)的[上下文社区协议](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md)。

该协议使元素（甚至非元素代码）之间能够实现互操作，无论它们是如何构建的。通过上下文协议，基于 Lit 的元素可以向非 Lit 构建的消费者提供数据，反之亦然。

上下文协议基于 DOM 事件。消费者触发一个携带其所需上下文键的 `context-request` 事件，其上方的任何元素都可以监听该 `context-request` 事件并为该上下文键提供数据。

`@lit/context` 实现了这个基于事件的协议，并通过几个响应式控制器和装饰器使其可用。

### 上下文对象

上下文通过*上下文对象*或*上下文键*来标识。它们是表示某些可能通过上下文对象标识来共享的数据的对象。你可以将它们类比为 Map 的键。

### 提供者

提供者通常是元素（但也可以是任何事件处理代码），为特定的上下文键提供数据。

### 消费者

消费者请求特定上下文键的数据。

### 订阅

当消费者请求某个上下文的数据时，它可以告诉提供者它想要*订阅*该上下文的变化。如果提供者有新数据，消费者将收到通知并可以自动更新。

## 用法

### 定义上下文

每次使用上下文都必须有一个上下文对象来协调数据请求。这个上下文对象表示所提供数据的标识和类型。

上下文对象通过 `createContext()` 函数创建：

```ts
export const myContext = createContext(Symbol("my-context"));
```

建议将上下文对象放在独立的模块中，这样它们可以独立于特定的提供者和消费者被导入。

#### 上下文类型检查

`createContext()` 接受任何值并直接返回它。在 TypeScript 中，该值被转换为一个带类型的 `Context` 对象，该对象携带上下文*值*的类型信息。

如果出现如下错误：

```ts
const myContext = createContext<Logger>(Symbol("logger"));

class MyElement extends LitElement {
  @provide({ context: myContext })
  name: string;
}
```

TypeScript 会警告类型 `string` 不能赋值给类型 `Logger`。请注意，此检查目前仅适用于公共字段。

<!--
  TODO https://github.com/lit/lit/issues/3926 this will likely need to be updated once we move to standard decorators.
 -->

#### 上下文相等性

上下文对象被提供者用来将上下文请求事件匹配到一个值。上下文使用严格相等（`===`）进行比较，因此提供者只有在其上下文键等于请求的上下文键时才会处理上下文请求。

这意味着创建上下文对象主要有两种方式：

1. 使用全局唯一的值，如对象（`{}`）或符号（`Symbol()`）
2. 使用非全局唯一的值，使其在严格相等下可以相等，如字符串（`'logger'`）或*全局*符号（`Symbol.for('logger')`）。

如果你希望两个*独立的* `createContext()` 调用引用同一个上下文，那么使用在严格相等下会相等的键，如字符串：

```ts
// true
createContext("my-context") === createContext("my-context");
```

但请注意，应用中的两个模块可能使用相同的上下文键来引用不同的对象。为避免意外冲突，你可能需要使用相对唯一的字符串，例如使用 `'console-logger'` 而不是 `'logger'`。

通常最好使用全局唯一的上下文对象。符号是实现这一点的最简单方式之一。

### 提供上下文

在 `@lit/context` 中有两种方式来提供上下文值：ContextProvider 控制器和 `@provide()` 装饰器。

#### `@provide()`

如果你使用装饰器，`@provide()` 装饰器是提供值的最简单方式。它会为你创建一个 ContextProvider 控制器。

用 `@provide()` 装饰一个属性并给它上下文键：

```ts
import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { provide } from "@lit/context";
import { myContext, MyData } from "./my-context.js";

class MyApp extends LitElement {
  @provide({ context: myContext })
  myData: MyData;
}
```

你可以使用 `@property()` 或 `@state()` 使该属性同时成为响应式属性，这样设置它时会同时更新提供者元素和上下文消费者。

```ts
  @provide({context: myContext})
  @property({attribute: false})
  myData: MyData;
```

上下文属性通常打算设为私有。你可以使用 `@state()` 使私有属性具有响应性：

```ts
  @provide({context: myContext})
  @state()
  private _myData: MyData;
```

将上下文属性设为公共可以让元素向其子树提供一个公共字段：

```ts
html`<my-provider-element .myData=${someData}></my-provider-element>`;
```

#### ContextProvider

`ContextProvider` 是一个响应式控制器，为你管理 `context-request` 事件处理程序。

```ts
import { LitElement, html } from "lit";
import { ContextProvider } from "@lit/context";
import { myContext } from "./my-context.js";

export class MyApp extends LitElement {
  private _provider = new ContextProvider(this, { context: myContext });
}
```

ContextProvider 可以在构造函数中接受一个初始值作为选项：

```ts
  private _provider = new ContextProvider(this, {context: myContext, initialValue: myData});
```

或者你可以调用 `setValue()`：

```ts
this._provider.setValue(myData);
```

### 消费上下文

#### `@consume()` 装饰器

如果你使用装饰器，`@consume()` 装饰器是消费值的最简单方式。它会为你创建一个 ContextConsumer 控制器。

用 `@consume()` 装饰一个属性并给它上下文键：

```ts
import { LitElement, html } from "lit";
import { consume } from "@lit/context";
import { myContext, MyData } from "./my-context.js";

class MyElement extends LitElement {
  @consume({ context: myContext })
  myData: MyData;
}
```

当此元素连接到文档时，它会自动触发一个 `context-request` 事件，获取提供的值，将其赋给该属性，并触发元素的更新。

#### ContextConsumer

ContextConsumer 是一个响应式控制器，为你管理 `context-request` 事件的派发。当有新值被提供时，该控制器会使宿主元素更新。提供的值可通过控制器的 `.value` 属性访问。

```ts
import { LitElement, property } from "lit";
import { ContextConsumer } from "@lit/context";
import { myContext } from "./my-context.js";

export class MyElement extends LitElement {
  private _myData = new ContextConsumer(this, { context: myContext });

  render() {
    const myData = this._myData.value;
    return html`...`;
  }
}
```

#### 订阅上下文

消费者可以订阅上下文值，这样当提供者有新值时，它可以将新值传递给所有已订阅的消费者，使它们更新。

你可以使用 `@consume()` 装饰器进行订阅：

```ts
  @consume({context: myContext, subscribe: true})
  myData: MyData;
```

以及使用 ContextConsumer 控制器：

```ts
  private _myData = new ContextConsumer(this,
    {
      context: myContext,
      subscribe: true,
    }
  );
```

## 示例用例

### 当前用户、语言环境等

最常见的上下文用例涉及对页面全局的数据，并且可能只在页面中的组件中稀疏地需要。没有上下文的话，大多数或所有组件可能需要接受和传播该数据的响应式属性。

### 服务

应用全局的服务，如日志记录器、分析工具、数据存储，可以通过上下文提供。上下文相比从公共模块导入的优势在于上下文提供的延迟耦合和树级作用域。测试可以轻松地提供模拟服务，或者页面的不同部分可以被给予不同的服务实例。

### 主题

主题是应用于整个页面或页面内整个子树的样式集合——这正是上下文提供的数据作用域类型。

构建主题系统的一种方式是定义一个 `Theme` 类型，容器可以提供该类型来保存命名的样式。想要应用主题的元素可以消费主题对象并按名称查找样式。自定义的主题响应式控制器可以包装 ContextProvider 和 ContextConsumer 以减少样板代码。

### 基于 HTML 的插件

上下文可用于将数据从父元素传递到其 light DOM 子元素。由于父元素通常不创建 light DOM 子元素，它无法利用基于模板的数据绑定来向它们传递数据，但它可以监听并响应 `context-request` 事件。

例如，考虑一个带有不同语言模式插件的代码编辑器元素。你可以使用上下文创建一个纯 HTML 系统来添加功能：

```html
<code-editor>
  <code-editor-javascript-mode></code-editor-javascript-mode>
  <code-editor-python-mode></code-editor-python-mode>
</code-editor>
```

在这种情况下，`<code-editor>` 将通过上下文提供一个用于添加语言模式的 API，而插件元素将消费该 API 并将自己添加到编辑器中。

### 数据格式化器、链接生成器等

有时可复用组件需要以应用特定的方式格式化数据或 URL。例如，一个渲染指向另一个项目的链接的文档查看器。该组件不会知道应用的 URL 空间。

在这些情况下，组件可以依赖于上下文提供的函数，该函数将应用特定的格式化应用于数据或链接。

## API

<div class="alert alert-info">

这些 API 文档是摘要，直到生成的 API 文档可用

</div>

### `createContext()`

创建一个带类型的 Context 对象

导入：

```ts
import { createContext } from "@lit/context";
```

签名：

```ts
function createContext<ValueType, K = unknown>(key: K): Context<K, ValueType>;
```

上下文使用严格相等进行比较。

如果你希望两个独立的 `createContext()` 调用引用同一个上下文，那么使用在严格相等下会相等的键，如字符串或 `Symbol.for()`：

```ts
// true
createContext("my-context") === createContext("my-context");
// true
createContext(Symbol.for("my-context")) ===
  createContext(Symbol.for("my-context"));
```

如果你希望上下文是唯一的，以保证不会与其他上下文冲突，使用在严格相等下唯一的键，如 `Symbol()` 或对象：

```ts
// false
createContext(Symbol("my-context")) === createContext(Symbol("my-context"));
// false
createContext({}) === createContext({});
```

`ValueType` 类型参数是此上下文可以提供的值的类型。它用于在其他上下文 API 中提供准确的类型。

### `@provide()`

一个属性装饰器，向组件添加 ContextProvider 控制器，使其响应来自子级消费者的任何 `context-request` 事件。

导入：

```ts
import { provide } from "@lit/context";
```

签名：

```ts
@provide({context: Context})
```

### `@consume()`

一个属性装饰器，向组件添加 ContextConsumer 控制器，该控制器将通过上下文协议检索属性的值。

导入：

```ts
import { consume } from "@lit/context";
```

签名：

```ts
@consume({context: Context, subscribe?: boolean})
```

`subscribe` 默认为 `false`。将其设置为 `true` 以订阅上下文提供值的更新。

### `ContextProvider`

一个 ReactiveController，通过监听 `context-request` 事件为自定义元素添加上下文提供者行为。

导入：

```ts
import { ContextProvider } from "@lit/context";
```

构造函数：

```ts
ContextProvider(
  host: ReactiveElement,
  options: {
    context: T,
    initialValue?: ContextType<T>
  }
)
```

成员

- `setValue(v: T, force = false): void`

  设置提供的值，如果值发生了变化，则通知所有已订阅的消费者新值。`force` 即使值没有变化也会强制通知，这在对象发生深层属性变化时可能有用。

### `ContextConsumer`

一个 ReactiveController，通过派发 `context-request` 事件为自定义元素添加上下文消费行为。

导入：

```ts
import { ContextConsumer } from "@lit/context";
```

构造函数：

```ts
ContextConsumer(
  host: HostElement,
  options: {
    context: C,
    callback?: (value: ContextType<C>, dispose?: () => void) => void,
    subscribe?: boolean = false
  }
)
```

成员

- `value: ContextType<C>`

  上下文的当前值。

当宿主元素连接到文档时，它将发出一个携带其上下文键的 `context-request` 事件。当上下文请求得到满足时，控制器将调用回调（如果存在），并触发宿主更新，以便它可以响应新值。

当宿主元素断开连接时，它还会调用提供者给出的 dispose 方法。

### `ContextRoot`

ContextRoot 可用于收集未满足的上下文请求，并在有满足匹配上下文键的新提供者可用时重新派发它们。这允许提供者在消费者之后添加到 DOM 树中或进行升级。

导入：

```ts
import { ContextRoot } from "@lit/context";
```

构造函数：

```ts
ContextRoot();
```

成员

- `attach(element: HTMLElement): void`

  将 ContextRoot 附加到此元素并开始监听 `context-request` 事件。

- `detach(element: HTMLElement): void`

  将 ContextRoot 从此元素分离，停止监听 `context-request` 事件。

### `ContextEvent`

消费者触发的事件，用于请求上下文值。此事件的 API 和行为由[上下文协议](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md)规定。

导入：

```ts
import { ContextEvent } from "@lit/context";
```

`context-request` 事件会冒泡且是 composed 的。

成员

- `readonly context: C`

  此事件请求值的上下文对象

- `readonly contextTarget: Element`

  发起上下文请求的 DOM 元素

- `readonly callback: ContextCallback<ContextType<C>>`

  用于提供上下文值的函数

- `readonly subscribe?: boolean`

  消费者是否想要订阅新的上下文值

### `ContextCallback`

由上下文请求者提供的回调，使用满足请求的值进行调用。

此回调可以被上下文提供者多次调用，因为请求的值可能会发生变化。

导入：

```ts
import { type ContextCallback } from "@lit/context";
```

签名：

```ts
type ContextCallback<ValueType> = (
  value: ValueType,
  unsubscribe?: () => void,
) => void;
```
