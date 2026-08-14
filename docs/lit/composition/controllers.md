---
title: 响应式控制器
eleventyNavigation:
  parent: 组合
  key: 控制器
  order: 4
versionLinks:
  v2: composition/controllers/
---

响应式控制器是一种可以接入组件[响应式更新周期](/docs/v3/components/lifecycle/#reactive-update-cycle)的对象。控制器可以将与某个功能相关的状态和行为捆绑在一起，使其可以在多个组件定义之间复用。

你可以使用控制器来实现需要自身状态和访问组件生命周期的功能，例如：

- 处理全局事件，如鼠标事件
- 管理异步任务，如通过网络获取数据
- 运行动画

响应式控制器允许你通过组合本身不是组件的更小部件来构建组件。它们可以被看作是可复用的、部分组件定义，拥有自己的标识和状态。

{% playground-ide "v3-docs/controllers/overview" "clock-controller.ts" %}

响应式控制器在很多方面类似于类混入。主要区别在于它们有自己的标识，并且不会添加到组件的原型上，这有助于约束它们的 API，并允许你在每个宿主组件中使用多个控制器实例。更多详情请参阅[控制器和混入](/docs/v3/composition/overview/#controllers-and-mixins)。

## 使用控制器

每个控制器都有自己的创建 API，但通常你会创建一个实例并将其存储在组件中：

```ts
class MyElement extends LitElement {
  private clock = new ClockController(this, 1000);
}
```

与控制器实例关联的组件称为宿主组件。

控制器实例会注册自己以接收来自宿主组件的生命周期回调，并在控制器有新数据需要渲染时触发宿主更新。这就是 `ClockController` 示例定期渲染当前时间的方式。

控制器通常会暴露一些功能以供在宿主的 `render()` 方法中使用。例如，许多控制器会有一些状态，比如当前值：

```ts
  render() {
    return html`
      <div>Current time: ${this.clock.value}</div>
    `;
  }
```

由于每个控制器都有自己的 API，请参阅具体控制器的文档以了解如何使用它们。

## 编写控制器

响应式控制器是与宿主组件关联的对象，它实现一个或多个宿主生命周期回调或与其宿主交互。它可以通过多种方式实现，但我们将重点介绍使用 JavaScript 类，用构造函数进行初始化，用方法处理生命周期。

### 控制器初始化

控制器通过调用 `host.addController(this)` 将自己注册到宿主组件上。通常控制器会存储对其宿主组件的引用，以便稍后与其交互。

{% switchable-sample %}

```ts
class ClockController implements ReactiveController {
  private host: ReactiveControllerHost;

  constructor(host: ReactiveControllerHost) {
    // 存储对宿主的引用
    this.host = host;
    // 注册生命周期更新
    host.addController(this);
  }
}
```

```js
class ClockController {
  constructor(host) {
    // 存储对宿主的引用
    this.host = host;
    // 注册生命周期更新
    host.addController(this);
  }
}
```

{% endswitchable-sample %}

你可以添加其他构造函数参数用于一次性配置。

{% switchable-sample %}

```ts
class ClockController implements ReactiveController {
  private host: ReactiveControllerHost;
  timeout: number

  constructor(host: ReactiveControllerHost, timeout: number) {
    this.host = host;
    this.timeout = timeout;
    host.addController(this);
  }
```

```js
class ClockController {
  constructor(host, timeout) {
    this.host = host;
    this.timeout = timeout;
    host.addController(this);
  }
```

{% endswitchable-sample %}

一旦你的控制器注册到宿主组件上，你就可以向控制器添加生命周期回调和其他类字段及方法来实现所需的状态和行为。

### 生命周期

响应式控制器的生命周期定义在 {% api-v3 "ReactiveController" %} 接口中，是响应式更新周期的一个子集。LitElement 在其生命周期回调期间调用所有已安装的控制器。这些回调是可选的。

- `hostConnected()`：
  - 在宿主连接时调用。
  - 在创建 `renderRoot` 之后调用，因此此时 shadow root 已经存在。
  - 适用于设置事件监听器、观察器等。
- `hostUpdate()`：
  - 在宿主的 `update()` 和 `render()` 方法之前调用。
  - 适用于在 DOM 更新之前读取 DOM（例如，用于动画）。
- `hostUpdated()`：
  - 在更新之后、宿主的 `updated()` 方法之前调用。
  - 适用于在 DOM 修改之后读取 DOM（例如，用于动画）。
- `hostDisconnected()`：
  - 在宿主断开连接时调用。
  - 适用于清理在 `hostConnected()` 中添加的内容，如事件监听器和观察器。

有关更多信息，请参阅[响应式更新周期](/docs/v3/components/lifecycle/#reactive-update-cycle)。

### 控制器宿主 API

响应式控制器宿主实现了一个小型 API，用于添加控制器和请求更新，并负责调用其控制器的生命周期方法。

以下是控制器宿主暴露的最小 API：

- `addController(controller: ReactiveController)`
- `removeController(controller: ReactiveController)`
- `requestUpdate()`
- `updateComplete: Promise<boolean>`

你也可以创建专门针对 `HTMLElement`、`ReactiveElement`、`LitElement` 的控制器，并要求更多这些 API；甚至创建绑定到特定元素类或其他接口的控制器。

`LitElement` 和 `ReactiveElement` 是控制器宿主，但宿主也可以是其他对象，如来自其他 Web 组件库的基类、来自框架的组件或其他控制器。

### 从其他控制器构建控制器

控制器也可以由其他控制器组合而成。要做到这一点，创建一个子控制器并将宿主转发给它。

{% switchable-sample %}

```ts
class DualClockController implements ReactiveController {
  private clock1: ClockController;
  private clock2: ClockController;

  constructor(host: ReactiveControllerHost, delay1: number, delay2: number) {
    this.clock1 = new ClockController(host, delay1);
    this.clock2 = new ClockController(host, delay2);
  }

  get time1() {
    return this.clock1.value;
  }
  get time2() {
    return this.clock2.value;
  }
}
```

```js
class DualClockController {
  constructor(host, delay1, delay2) {
    this.clock1 = new ClockController(host, delay1);
    this.clock2 = new ClockController(host, delay2);
  }

  get time1() {
    return this.clock1.value;
  }
  get time2() {
    return this.clock2.value;
  }
}
```

{% endswitchable-sample %}

### 控制器和指令

将控制器与指令结合可以是一种非常强大的技术，特别是对于需要在渲染前后执行工作的指令，如动画指令；或者需要引用模板中特定元素的控制器。

使用控制器与指令有两种主要模式：

- 控制器指令。这些是本身就是控制器的指令，以便接入宿主生命周期。
- 拥有指令的控制器。这些是创建一个或多个指令供宿主模板使用的控制器。

有关编写指令的更多信息，请参阅[自定义指令](/docs/v3/templates/custom-directives/)。

#### 控制器指令

响应式控制器不需要作为实例字段存储在宿主上。使用 `addController()` 添加到宿主上的任何东西都是控制器。特别是，指令也可以是一个控制器。这使得指令可以接入宿主生命周期。

#### 拥有指令的控制器

指令不需要是独立的函数，它们也可以是其他对象（如控制器）上的方法。这在控制器需要特定引用模板中某个元素的情况下很有用。

例如，想象一个 ResizeController，它允许你使用 ResizeObserver 观察元素的大小。要使其工作，我们既需要一个 ResizeController 实例，也需要一个放置在我们想要观察的元素上的指令：

{% switchable-sample %}

```ts
class MyElement extends LitElement {
  private _textSize = new ResizeController(this);

  render() {
    return html`
      <textarea ${this._textSize.observe()}></textarea>
      <p>The width is ${this._textSize.contentRect?.width}</p>
    `;
  }
}
```

```js
class MyElement extends LitElement {
  _textSize = new ResizeController(this);

  render() {
    return html`
      <textarea ${this._textSize.observe()}></textarea>
      <p>The width is ${this._textSize.contentRect?.width}</p>
    `;
  }
}
```

{% endswitchable-sample %}

要实现这一点，你需要创建一个指令并从方法中调用它：

```ts
class ResizeDirective {
  /* ... */
}
const resizeDirective = directive(ResizeDirective);

export class ResizeController {
  /* ... */
  observe() {
    // 传递对控制器的引用，以便指令可以在大小更改时
    // 通知控制器。
    return resizeDirective(this);
  }
}
```

{% todo %}

- 审查并清理此示例

{% endtodo %}

## 用例

响应式控制器非常通用，具有非常广泛的可能用例集。它们特别适用于将组件连接到外部资源，如用户输入、状态管理或远程 API。以下是一些常见用例。

### 外部输入

响应式控制器可以用于连接外部输入。例如，键盘和鼠标事件、resize 观察器或 mutation 观察器。控制器可以提供输入的当前值以在渲染中使用，并在值更改时请求宿主更新。

#### 示例：MouseMoveController

此示例展示了控制器如何在宿主连接和断开连接时执行设置和清理工作，并在输入更改时请求更新：

{% playground-ide "v3-docs/controllers/mouse" "my-element.ts" %}

### 异步任务

异步任务，如长时间运行的计算或网络 I/O，通常具有随时间变化的状态，并且需要在任务状态更改（完成、出错等）时通知宿主。

控制器是将任务执行和状态捆绑在一起的好方法，使其在组件内部易于使用。作为控制器编写的任务通常具有宿主可以设置的输入，以及宿主可以渲染的输出。

`@lit/task` 包含一个通用的 `Task` 控制器，它可以从宿主拉取输入、执行任务函数，并根据任务状态渲染不同的模板。

你可以使用 `Task` 来创建一个自定义控制器，其 API 专为你的特定任务量身定制。这里我们将 `Task` 包装在一个 `NamesController` 中，它可以从演示 REST API 获取指定名称列表中的一个名称。`NameController` 公开一个 `kind` 属性作为输入，以及一个 `render()` 方法，该方法可以根据任务状态渲染四个模板之一。任务逻辑以及它如何更新宿主，对宿主组件是抽象的。

{% playground-ide "v3-docs/controllers/names" %}

{% todo %}

- 动画

{% endtodo %}

## 另请参阅

- [响应式更新周期](/docs/v3/components/lifecycle/#reactive-update-cycle)
- [@lit/task](https://www.npmjs.com/package/@lit/task)
