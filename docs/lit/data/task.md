---
title: 异步任务
eleventyNavigation:
  key: 异步任务
  parent: 数据管理
  order: 2
---

## 概述

有时组件需要渲染只能*异步*获取的数据。这些数据可能从服务器获取、从数据库获取，或者通常从异步 API 检索或计算得到。

虽然 Lit 的响应式更新生命周期是批处理和异步的，但 Lit 模板总是*同步*渲染的。模板中使用的数据必须在渲染时可读。要在 Lit 组件中渲染异步数据，你必须等待数据就绪，将其存储为可读形式，然后触发一次新的渲染来同步使用该数据。通常还需要考虑在数据获取期间渲染什么内容，以及数据获取失败时的处理方式。

`@lit/task` 包提供了一个 `Task` 响应式控制器来帮助管理这种异步数据工作流。

`Task` 是一个控制器，它接受一个异步任务函数，并在参数变化时手动或自动运行它。Task 存储任务函数的结果，并在任务函数完成时更新宿主元素，以便结果可以用于渲染。

### 示例

这是一个使用 `Task` 通过 [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) 调用 HTTP API 的示例。每当 `productId` 参数变化时都会调用该 API，组件在数据获取期间渲染一条加载消息。

{% switchable-sample %}

```ts
import { Task } from "@lit/task";

class MyElement extends LitElement {
  @property() productId?: string;

  private _productTask = new Task(this, {
    task: async ([productId], { signal }) => {
      const response = await fetch(`http://example.com/product/${productId}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error(response.status);
      }
      return response.json() as Product;
    },
    args: () => [this.productId],
  });

  render() {
    return this._productTask.render({
      pending: () => html`<p>Loading product...</p>`,
      complete: (product) => html`
        <h1>${product.name}</h1>
        <p>${product.price}</p>
      `,
      error: (e) => html`<p>Error: ${e}</p>`,
    });
  }
}
```

```js
import { Task } from "@lit/task";

class MyElement extends LitElement {
  static properties = {
    productId: {},
  };

  _productTask = new Task(this, {
    task: async ([productId], { signal }) => {
      const response = await fetch(`http://example.com/product/${productId}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error(response.status);
      }
      return response.json();
    },
    args: () => [this.productId],
  });

  render() {
    return this._productTask.render({
      pending: () => html`<p>Loading product...</p>`,
      complete: (product) => html`
        <h1>${product.name}</h1>
        <p>${product.price}</p>
      `,
      error: (e) => html`<p>Error: ${e}</p>`,
    });
  }
}
```

{% endswitchable-sample %}

### 特性

Task 处理了正确管理异步工作所需的许多事项：

- 在宿主更新时收集任务参数
- 在参数变化时运行任务函数
- 跟踪任务状态（初始、进行中、完成或错误）
- 保存任务函数的最后完成值或错误
- 在任务状态变化时触发宿主更新
- 处理竞态条件，确保只有最新的任务调用能完成任务
- 为当前任务状态渲染正确的模板
- 允许使用 [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) 中止任务

这消除了代码中正确使用异步数据的大部分样板代码，并确保了对竞态条件和其他边界情况的健壮处理。

## 什么是异步数据？

异步数据是不能立即获得但可能在未来某个时间获得的数据。例如，与字符串或对象等可同步使用的值不同，promise 在未来提供值。

异步数据通常从异步 API 返回，异步 API 可以有多种形式：

- Promise 或异步函数，如 `fetch()`
- 接受回调的函数
- 发出事件的对象，如 DOM 事件
- 像 observables 和 signals 这样的库

Task 控制器处理的是 promise，因此无论你的异步 API 是什么形式，你都可以将其适配为 promise 以与 Task 一起使用。

## 什么是任务？

Task 控制器的核心是"任务"本身的概念。

任务是一个异步操作，它执行一些工作来产生数据并在 Promise 中返回它。任务可以处于几种不同的状态（初始、进行中、完成和错误），并且可以接受参数。

任务是一个通用概念，可以表示任何异步操作。当存在请求/响应结构时，它们最为适用，例如网络获取、数据库查询，或等待某个操作的单个事件响应。它们不太适用于自发的或流式操作，如开放式事件流、流式数据库响应等。

## 安装

```bash
npm install @lit/task
```

## 用法

`Task` 是一个[响应式控制器](/docs/v3/composition/controllers/)，因此它可以响应 Lit 的响应式更新生命周期并触发更新。

通常你的组件需要执行的每个逻辑任务都有一个 Task 对象。将任务作为类的字段安装：

{% switchable-sample %}

```ts
class MyElement extends LitElement {
  private _myTask = new Task(this, {/*...*/});
}
```

```js
class MyElement extends LitElement {
  _myTask = new Task(this, {/*...*/});
}
```

{% endswitchable-sample %}

作为类字段，任务的状态和值可以轻松访问：

```ts
this._task.status;
this._task.value;
```

### 任务函数

任务声明中最关键的部分是*任务函数*。这是执行实际工作的函数。

任务函数在 `task` 选项中给出。Task 控制器会自动使用参数调用任务函数，参数由单独的 `args` 回调提供。参数会被检查是否有变化，只有在参数发生变化时才会调用任务函数。

任务函数接受任务参数作为第一个参数传递的*数组*，以及作为第二个参数的选项参数：

```ts
new Task(this, {
  task: async ([arg1, arg2], { signal }) => {
    // 在此执行异步工作
  },
  args: () => [this.field1, this.field2],
});
```

任务函数的 args 数组和 args 回调应该具有相同的长度。

{% aside "positive" "no-header" %}

将 `task` 和 `args` 函数编写为箭头函数，这样 `this` 引用就指向宿主元素。

{% endaside %}

### 任务状态

任务可以处于四种状态之一：

- `INITIAL`：任务尚未运行
- `PENDING`：任务正在运行并等待新值
- `COMPLETE`：任务成功完成
- `ERROR`：任务出错

Task 状态可在 Task 控制器的 `status` 字段中访问，由 `TaskStatus` 类枚举对象表示，该对象具有 `INITIAL`、`PENDING`、`COMPLETE` 和 `ERROR` 属性。

```ts
import { TaskStatus } from "@lit/task";

// ...
if (this.task.status === TaskStatus.ERROR) {
  // ...
}
```

通常 Task 会从 `INITIAL` 到 `PENDING` 再到 `COMPLETE` 或 `ERROR` 之一，然后如果任务重新运行则回到 `PENDING`。当任务状态变化时，它会触发宿主更新，以便宿主元素可以处理新的任务状态并在需要时渲染。

{% aside "info" "no-header" %}

理解任务可能处于的状态很重要，但通常不需要直接访问它。

{% endaside %}

Task 控制器上有几个与任务状态相关的成员：

- `status`：任务的状态。
- `value`：任务的当前值（如果已完成）。
- `error`：任务的当前错误（如果出错）。
- `render()`：根据当前状态选择要运行的回调的方法。

### 渲染任务

用于渲染任务的最简单且最常用的 API 是 `task.render()`，因为它会选择正确的代码来运行并提供相关数据。

`render()` 接受一个配置对象，其中包含每个任务状态的可选回调：

- `initial()`
- `pending()`
- `complete(value)`
- `error(err)`

你可以在 Lit 的 `render()` 方法中使用 `task.render()` 来根据任务状态渲染模板：

```ts
  render() {
    return html`
      ${this._myTask.render({
        initial: () => html`<p>Waiting to start task</p>`,
        pending: () => html`<p>Running task...</p>`,
        complete: (value) => html`<p>The task completed with: ${value}</p>`,
        error: (error) => html`<p>Oops, something went wrong: ${error}</p>`,
      })}
    `;
  }
```

### 运行任务

默认情况下，Task 会在参数变化时运行。这由 `autoRun` 选项控制，默认为 `true`。

#### 自动运行

在*自动运行*模式下，任务会在宿主更新时调用 `args` 函数，将参数与之前的参数进行比较，如果参数发生变化则调用任务函数。具有空 `args` 数组的任务只运行一次。没有定义 `args` 的任务处于手动模式。

#### 手动模式

如果 `autoRun` 设置为 false，任务将处于*手动*模式。在手动模式下，你可以通过调用 `.run()` 方法来运行任务，可能从事件处理程序中调用：

{% switchable-sample %}

```ts
class MyElement extends LitElement {
  private _getDataTask = new Task(this, {
    task: async () => {
      const response = await fetch(`example.com/data/`);
      return response.json();
    },
    args: () => [],
  });

  render() {
    return html` <button @click=${this._onClick}>Get Data</button> `;
  }

  private _onClick() {
    this._getDataTask.run();
  }
}
```

```js
class MyElement extends LitElement {
  _getDataTask = new Task(this, {
    task: async () => {
      const response = await fetch(`example.com/data/`);
      return response.json();
    },
    args: () => [],
  });

  render() {
    return html` <button @click=${this._onClick}>Get Data</button> `;
  }

  _onClick() {
    this._getDataTask.run();
  }
}
```

{% endswitchable-sample %}

在手动模式下，你可以直接向 `run()` 提供新参数：

```ts
this._task.run(["arg1", "arg2"]);
```

如果没有向 `run()` 提供参数，则会从 `args` 回调中收集参数。

### 中止任务

任务函数可能在前一次任务运行仍在进行中时被调用。在这些情况下，进行中任务运行的结果将被忽略，你应该尝试取消任何未完成的工作或网络 I/O 以节省资源。

你可以通过传递给任务函数第二个参数的 `signal` 属性中的 [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) 来实现这一点。当进行中的任务运行被新的运行取代时，传递给进行中运行的 `AbortSignal` 会被中止，以通知任务运行取消任何待处理的工作。

`AbortSignal` 不会自动取消任何工作——它只是一个信号。要取消某些工作，你必须自己通过检查信号来实现，或者将信号转发给另一个接受 `AbortSignal` 的 API，如 [`fetch()`](https://developer.mozilla.org/en-US/docs/Web/API/fetch) 或 [`addEventListener()`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)。

使用 `AbortSignal` 的最简单方式是将其转发给接受它的 API，如 `fetch()`。

{% switchable-sample %}

```ts
  private _task = new Task(this, {
    task: async (args, {signal}) => {
      const response = await fetch(someUrl, {signal});
      // ...
    },
  });
```

```js
_task = new Task(this, {
  task: async (args, { signal }) => {
    const response = await fetch(someUrl, { signal });
    // ...
  },
});
```

{% endswitchable-sample %}

将信号转发给 `fetch()` 会使浏览器在信号被中止时取消网络请求。

你还可以在任务函数中检查信号是否已被中止。你应该在从异步调用返回到任务函数后检查信号。`throwIfAborted()` 是一种方便的方式：

{% switchable-sample %}

```ts
  private _task = new Task(this, {
    task: async ([arg1], {signal}) => {
      const firstResult = await doSomeWork(arg1);
      signal.throwIfAborted();
      const secondResult = await doMoreWork(firstResult);
      signal.throwIfAborted();
      return secondResult;
    },
  });
```

```js
_task = new Task(this, {
  task: async ([arg1], { signal }) => {
    const firstResult = await doSomeWork(arg1);
    signal.throwIfAborted();
    const secondResult = await doMoreWork(firstResult);
    signal.throwIfAborted();
    return secondResult;
  },
});
```

{% endswitchable-sample %}

### 任务链

有时你想在一个任务完成时运行另一个任务。
当任务具有不同的参数时，这很有用，这样链式任务可以在第一个任务不重新运行的情况下运行。
在这种情况下，它会像缓存一样使用第一个任务。要做到这一点，你可以将一个任务的值用作另一个任务的参数：

{% switchable-sample %}

```ts
class MyElement extends LitElement {
  private _getDataTask = new Task(this, {
    task: ([dataId]) => getData(dataId),
    args: () => [this.dataId],
  });

  private _processDataTask = new Task(this, {
    task: ([data, param]) => processData(data, param),
    args: () => [this._getDataTask.value, this.param],
  });
}
```

```js
class MyElement extends LitElement {
  _getDataTask = new Task(this, {
    task: ([dataId]) => getData(dataId),
    args: () => [this.dataId],
  });

  _processDataTask = new Task(this, {
    task: ([data, param]) => processData(data, param),
    args: () => [this._getDataTask.value, this.param],
  });
}
```

{% endswitchable-sample %}

你也可以经常使用一个任务函数并等待中间结果：

{% switchable-sample %}

```ts
class MyElement extends LitElement {
  private _getDataTask = new Task(this, {
    task: ([dataId, param]) => {
      const data = await getData(dataId);
      return processData(data, param);
    },
    args: () => [this.dataId, this.param],
  });
}
```

```js
class MyElement extends LitElement {
  _getDataTask = new Task(this, {
    task: ([dataId, param]) => {
      const data = await getData(dataId);
      return processData(data, param);
    },
    args: () => [this.dataId, this.param],
  });
}
```

{% endswitchable-sample %}

### TypeScript 中更精确的参数类型

Task 的参数类型有时会被 TypeScript 推断得过于宽泛。这可以通过使用 `as const` 对参数数组进行类型断言来修复。
考虑以下具有两个参数的任务。

```ts
class MyElement extends LitElement {
  @property() myNumber = 10;
  @property() myText = "Hello world";

  _myTask = new Task(this, {
    args: () => [this.myNumber, this.myText],
    task: ([number, text]) => {
      // 省略实现
    },
  });
}
```

如上所写，任务函数的参数列表类型被推断为 `Array<number | string>`。

但理想情况下，这应该被类型化为元组 `[number, string]`，因为参数的大小和位置是固定的。

`args` 的返回值可以写为 `args: () => [this.myNumber, this.myText] as const`，这将使 `task` 函数的参数列表获得元组类型。

```ts
class MyElement extends LitElement {
  @property() myNumber = 10;
  @property() myText = "Hello world";

  _myTask = new Task(this, {
    args: () => [this.myNumber, this.myText] as const,
    task: ([number, text]) => {
      // 省略实现
    },
  });
}
```
