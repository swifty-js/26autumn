---
title: 信号
eleventyNavigation:
  key: 信号
  parent: 数据管理
  order: 3
  labs: true
---

{% labs-disclaimer %}

## 概述

### 什么是信号？

信号是用于管理可观察状态的数据结构。

信号可以保存单个值或依赖于其他信号的计算值。信号是可观察的，因此当它们发生变化时消费者可以收到通知。由于它们形成依赖图，计算信号会在其依赖项发生变化时重新计算并通知消费者。

信号对于建模和管理共享可观察状态非常有用——即许多不同组件可能访问和/或修改的状态。当信号更新时，每个使用并监视该信号的组件，或任何依赖于它的信号，都会更新。

信号是一个通用概念，在 JavaScript 库和框架中有许多不同的实现和变体。现在还有一个 [TC39 提案](https://github.com/tc39/proposal-signals)旨在将信号标准化为 JavaScript 的一部分。

信号 API 通常有三个主要概念：

- 状态信号，保存单个值
- 计算信号，包装可能依赖于其他信号的计算
- 监视器或效果，在信号值变化时运行有副作用的代码

### 示例

以下是使用提议的标准 JavaScript 信号 API 的信号示例：

```ts
//
// 开发者可能编写的用于构建基于信号的状态的代码...
//

// 状态信号保存值：
const count = new Signal.State(0);

// 计算信号包装使用其他信号的计算：
const doubleCount = new Signal.Computed(() => count.get() * 2);

//
// 通常位于框架和信号消费库内部的底层代码...
//

// 当被监视的信号发生变化时，监视器会收到通知：
const watcher = new Signal.subtle.Watcher(async () => {
  // 通知回调不允许同步访问信号
  await 0;
  console.log("doubleCount is", doubleCount);
  // 监视器运行后必须重新启用：
  watcher.watch();
});
watcher.watch(doubleCount);

// 计算信号是惰性的，所以我们需要读取它来运行计算并
// 可能通知监视器：
doubleCount.get();
```

### 信号库

JavaScript 中有许多信号实现。许多与框架紧密集成，只能在这些框架内部使用，还有一些是独立的库，可以从任何其他代码中使用。

虽然具体的信号 API 有一些差异，但它们非常相似。

Preact 的信号库 [`@preact/signals`](https://preactjs.com/guide/v10/signals/) 是一个独立的库，相对快速且小巧，因此我们围绕它构建了第一个 Lit Labs 信号集成包：[`@lit-labs/preact-signals`](https://www.npmjs.com/package/@lit-labs/preact-signals)。

### JavaScript 的信号提案

由于信号 API 之间的高度相似性、框架中越来越多地使用信号来实现响应性，以及信号使用系统之间互操作的需求，一个标准化信号的提案正在 TC39 中进行，地址为 https://github.com/tc39/proposal-signals。

Lit 提供了 [`@lit-labs/signals`](https://www.npmjs.com/package/@lit-labs/signals) 包来与此提案的官方 polyfill 集成。

这个提案对 Web Components 生态系统来说非常令人兴奋。因为所有采用该标准的库和框架都将产生兼容的信号，不同的 Web Components 不必使用相同的库就能互操作地消费和生产信号。

此外，信号有潜力成为各种状态管理系统和可观察性库（无论是新的还是现有的）的基础。这些库中的每一个，如 MobX 或 Redux，目前都需要一个特定的适配器才能与 Lit 生命周期进行人体工程学集成。信号标准化可能意味着我们最终只需要一个 Lit 适配器（或者当信号支持内置到核心 Lit 库中时根本不需要适配器）。

## 信号与 Lit

Lit 目前提供两个信号集成包：用于与 TC39 信号提案集成的 [`@lit-labs/signals`](https://www.npmjs.com/package/@lit-labs/signals)，以及用于与 Preact Signals 集成的 [`@lit-labs/preact-signals`](https://www.npmjs.com/package/@lit-labs/preact-signals)。

由于 TC39 信号提案有望成为 JavaScript 系统趋同的唯一信号 API，我们推荐使用它，并将在本文档中重点介绍其用法。

### 安装

从 npm 安装 `@lit-labs/signals`：

```sh
npm i @lit-labs/signals
```

### 用法

`@lit-labs/signals` 提供三个主要导出：

- `SignalWatcher` mixin，应用于所有使用信号的类
- `watch()` 模板指令，用于监视单个信号并实现精确更新
- `html` 模板标签，自动将 watch 指令应用于模板绑定

像这样导入它们：

```ts
import { SignalWatcher, watch, signal } from "@lit-labs/signals";
```

<div class="alert alert-info">

`@lit-labs/signals` 还为了方便导出了一些 polyfill 的信号 API，以及一个 `withWatch()` 模板标签工厂，以便需要自定义模板标签的开发者可以轻松添加信号监视功能。

</div>

#### 使用 SignalWatcher 自动监视

使用信号的最简单方式是在定义自定义元素类时应用 `SignalWatcher` mixin。应用该 mixin 后，你可以在 Lit 生命周期方法（如 `render()`）中读取信号；这些信号值的任何变化都会自动触发更新。你可以在有意义的任何地方写入信号——例如在事件处理程序中。

在此示例中，`SharedCounterComponent` 读取和写入一个共享信号。组件的每个实例都会显示相同的值，并且当值变化时它们都会更新。

<!--
  TODO (justinfagnani): Make this an editable sample when the @lit-labs/signals
  package is published.
-->

```ts
import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalWatcher, signal } from "@lit-labs/signals";

const count = signal(0);

@customElement("shared-counter")
export class SharedCounterComponent extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`
      <p>The count is ${count.get()}</p>
      <button @click=${this.#onClick}>Increment</button>
    `;
  }

  #onClick() {
    count.set(count.get() + 1);
  }
}
```

```html
<!-- 这两个元素都会显示相同的计数器值 -->
<shared-counter></shared-counter>
<shared-counter></shared-counter>
```

#### 使用 `watch()` 实现精确更新

信号还可以用于实现针对单个绑定而非整个组件的"精确"DOM 更新。要做到这一点，我们需要使用 `watch()` 指令单独监视信号。

出于协调目的，由 `watch()` 指令触发的更新会被批处理，并且仍然参与 Lit 的响应式更新生命周期。但是，当给定的 Lit 更新完全由 `watch()` 指令触发时，只有信号发生变化的绑定会被更新；模板中的其余绑定会被跳过。

此示例与前一个相同，但当 `count` 信号变化时，只有 `${watch(count)}` 绑定会被更新：

```ts
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { SignalWatcher, watch, signal } from "@lit-labs/signals";

const count = signal(0);

@customElement("shared-counter")
export class SharedCounterComponent extends SignalWatcher(LitElement) {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`
      <p>The count is ${watch(count)}</p>
      <button @click=${this.#onClick}>Increment</button>
    `;
  }

  #onClick() {
    count.set(count.get() + 1);
  }
}
```

请注意，这种精确更新所避免的工作实际上非常少：唯一被跳过的是对 `render()` 返回的模板的标识检查和对 `@click` 绑定的值检查，这两者都很廉价。

事实上，在大多数情况下，`watch()` 不会比"普通"Lit 模板渲染带来显著的性能提升。这是因为 Lit 已经只更新值发生变化的绑定的 DOM。

`watch()` 的性能节省往往与模板逻辑的数量和更新中可以跳过的绑定数量成正比，因此在具有大量逻辑和绑定的模板中节省会更显著。

<div class="alert alert-info">

`@lit-labs/signals` 尚未包含信号感知的 `repeat()` 指令。在此之前，数组内容的变化将执行完整渲染。

</div>

#### 使用信号 `html` 模板标签实现自动精确更新

`@lit-labs/signals` 还导出了一个特殊版本的 Lit `html` 模板标签，它会自动将 `watch()` 指令应用于传递给绑定的任何信号值。

这可以方便地避免 `watch()` 指令的额外字符或没有 `watch()` 时所需的 `signal.get()` 调用。

如果你从 `@lit-labs/signals` 而不是从 `lit` 导入 `html`，你将获得自动监视功能：

```ts
import {LitElement} from 'lit';
import {SignalWatcher, html, signal} from '@lit-labs/signals';

// SharedCounterComponent ...
  render() {
    return html`
      <p>The count is ${count}</p>
      <button @click=${this.#onClick}>Increment</button>
    `;
  }
```

<div class="alert alert-warning">

信号 `html` 标签目前还不能与 lit-analyzer 良好配合。分析器会在使用信号的绑定上报告类型错误，因为它看到的是将 `Signal<T>` 赋值给 `T`。

</div>

## 确保正确安装 polyfill

`@lit-labs/signals` 将 `signal-polyfill` 包作为依赖项包含在内，因此你无需显式安装任何其他内容即可开始使用信号。

但由于信号依赖于共享的全局数据结构（信号依赖图），正确安装 polyfill 至关重要：任何页面或应用中只能有一份 polyfill 包的副本。

如果安装了多份 polyfill 副本（由于版本不兼容或其他 npm 问题），则可能会*分割*信号图，使得某些监视器无法与某些信号配合工作，或某些信号不会被跟踪为其他信号的依赖项。

为防止这种情况，请务必使用 `npm ls` 命令检查是否只有一个 `signal-polyfill` 安装：

```sh
npm ls signal-polyfill
```

如果你看到多个 `signal-polyfill` 列表项且行旁没有 `deduped` 标记，则说明你有重复的 polyfill 副本。

通常可以通过运行以下命令来修复：

```sh
npm dedupe
```

如果这不起作用，你可能需要更新依赖项，直到在整个包安装中获得单一兼容版本的 `signal-polyfill`。

## 缺失的功能

`@lit-labs/signals` 尚未功能完整。有一些设想中的功能将使在 Lit 中使用信号更加可行和高性能：

- [ ] 信号感知的 `repeat()` 指令。这将使数组的增量更新更高效。
- [ ] 使用信号进行存储的 `@property()` 装饰器，以统一响应式属性和信号。这将使通用信号工具更容易与 Lit 响应式属性配合使用。
- [ ] 用于将方法标记为计算信号的 `@computed()` 装饰器。由于计算信号是记忆化的，这可以帮助处理昂贵的计算。
- [ ] 用于将方法标记为效果的 `@effect()` 装饰器。这可以比使用单独的工具更人体工程学地运行效果。

## 有用的资源

### `signal-utils`

`signal-utils` npm 包包含许多用于 TC39 信号提案的工具，包括：

- 基于信号的、可观察的集合，如 `Array`、`Map`、`Set`、`WeakMap`、`WeakSet` 和 `Object`
- 用于构建具有基于信号字段的类的装饰器
- 效果和反应

这些集合和装饰器对于从信号构建可观察数据模型很有用，因为你通常需要管理比原始值更复杂的值。

#### 集合

例如，你可以创建一个可观察数组：

```ts
import { SignalArray } from "signal-utils/array";

const numbers = new SignalArray([1, 2, 3]);
```

从数组读取（如迭代它或读取 `.length`）将被跟踪为信号访问，而数组的变更（如来自 `.push()` 或 `.pop()`）将通知任何监视器。

#### 装饰器

装饰器让你可以建模一个具有可观察字段的类，很像 `LitElement`：

```ts
import { signal } from "signal-utils";

class GameState {
  @signal
  accessor playerOneTotal = 0;

  @signal
  accessor playerTwoTotal = 0;

  @signal
  accessor over = false;

  readonly rounds = new SignalArray();

  recordRound(playerOneScore, playerTwoScore) {
    this.playerOneTotal += playerOneScore;
    this.playerTwoTotal += playerTwoScore;
    this.rounds.push([playerOneScore, playerTwoScore]);
  }
}
```

此 `GameState` 类的实例将被访问它的 SignalWatcher 类跟踪，并在游戏状态变化时更新。

## 状态与反馈

此包是 Lit Labs 实验性包家族的一部分，正在积极开发中。可能存在缺失的功能、实现中的严重 bug，以及比核心 Lit 库更频繁的破坏性变更。

此包还依赖于一个本身不稳定的提案和 polyfill。随着信号提案的推进，可能会对提议的 API 进行破坏性变更，然后这些变更也会应用到 polyfill 中。

我们鼓励谨慎使用，以便我们获得 Lit 集成层的经验并获取反馈，但请仔细管理依赖项并审慎测试，以将意外的破坏性变更保持在最低限度。

请在 [@lit-labs/signals 反馈讨论](https://github.com/lit/lit/discussions/4779)中留下反馈，并[提交你遇到的任何问题](https://github.com/lit/lit/issues)。

关于信号提案的反馈可以在[信号提案仓库](https://github.com/tc39/proposal-signals)中留下。polyfill 的问题可以在[这里](https://github.com/proposal-signals/signal-polyfill)提交。
