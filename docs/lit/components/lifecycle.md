---
title: 生命周期
eleventyNavigation:
  key: Lifecycle
  parent: Components
  order: 5
versionLinks:
  v1: components/lifecycle/
  v2: components/lifecycle/
---

Lit 组件使用标准的自定义元素生命周期方法。此外，Lit 还引入了一个响应式更新周期，在响应式属性更改时将变化渲染到 DOM。

## 标准自定义元素生命周期 { #custom-element-lifecycle }

Lit 组件是标准的自定义元素，继承了自定义元素的生命周期方法。有关自定义元素生命周期的信息，请参阅 MDN 上的[使用生命周期回调](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements#using_the_lifecycle_callbacks)。

<div class="alert alert-info">

如果你需要自定义任何标准的自定义元素生命周期方法，请确保调用 `super` 实现（如 `super.connectedCallback()`），以保持标准的 Lit 功能。

</div>

### constructor() {#constructor}

在创建元素时调用。此外，当现有元素被升级时也会调用，这发生在自定义元素的定义在元素已经在 DOM 中之后才加载的情况下。

#### Lit 的行为

使用 `requestUpdate()` 方法请求异步更新，因此当 Lit 组件被升级时，它会立即执行一次更新。

保存已经在元素上设置的任何属性。这确保升级前设置的值被保留，并正确覆盖组件设置的默认值。

#### 使用场景

执行必须在第一次[更新](#reactive-update-cycle)之前完成的一次性初始化任务。例如，在不使用装饰器时，可以在构造函数中设置属性的默认值，如[在静态 properties 字段中声明属性](/docs/v3/components/properties/#declaring-properties-in-a-static-properties-field)中所示。

```js
constructor() {
  super();
  this.foo = 'foo';
  this.bar = 'bar';
}
```

### connectedCallback() {#connectedcallback}

在组件被添加到文档的 DOM 时调用。

#### Lit 的行为

Lit 在元素连接后启动第一个元素更新周期。为了准备渲染，Lit 还确保 `renderRoot`（通常是其 `shadowRoot`）已创建。

一旦元素至少连接过一次文档，组件更新将继续进行，无论元素的连接状态如何。

#### 使用场景

在 `connectedCallback()` 中，你应该设置仅在元素连接到文档时才应执行的任务。其中最常见的是向元素外部的节点添加事件监听器，例如向 window 添加 keydown 事件处理程序。通常，在 `connectedCallback()` 中完成的任何事情都应该在元素断开连接时撤销——例如，移除 window 上的事件监听器以防止内存泄漏。

```js
connectedCallback() {
  super.connectedCallback()
  window.addEventListener('keydown', this._handleKeydown);
}
```

### disconnectedCallback() {#disconnectedcallback}

在组件从文档的 DOM 中移除时调用。

#### Lit 的行为

暂停[响应式更新周期](#reactive-update-cycle)。当元素重新连接时恢复。

#### 使用场景

此回调是元素可能不再被使用的主要信号；因此，`disconnectedCallback()` 应确保没有任何东西持有对该元素的引用（例如添加到元素外部节点的事件监听器），以便它可以被垃圾回收。由于元素在断开连接后可能会重新连接，例如元素在 DOM 中移动或缓存的情况，任何此类引用或监听器可能需要通过 `connectedCallback()` 重新建立，以便元素在这些场景中继续按预期工作。例如，移除元素外部节点的事件监听器，如添加到 window 的 keydown 事件处理程序。

```js
disconnectedCallback() {
  super.disconnectedCallback()
  window.removeEventListener('keydown', this._handleKeydown);
}
```

<div class="alert alert-info">

无需移除内部事件监听器。你不需要移除在组件自身 DOM 上添加的事件监听器——包括在模板中声明式添加的监听器。与外部事件监听器不同，这些不会阻止组件被垃圾回收。

</div>

### attributeChangedCallback() { %attributeChangedCallback }

在元素的 `observedAttributes` 之一发生更改时调用。

#### Lit 的行为

Lit 使用此回调将特性的更改同步到响应式属性。具体来说，当设置一个特性时，对应的属性也会被设置。Lit 还会自动设置元素的 `observedAttributes` 数组以匹配组件的响应式属性列表。

#### 使用场景

你很少需要实现此回调。

### adoptedCallback() {#adoptedcallback}

在组件被移动到新文档时调用。

<div class="alert alert-info">

请注意 `adoptedCallback` 没有被 polyfill。

</div>

#### Lit 的行为

Lit 对此回调没有默认行为。

#### 使用场景

此回调应仅用于当元素行为应在其更改文档时发生变化的高级用例。

## 响应式更新周期 { #reactive-update-cycle }

除了标准的自定义元素生命周期外，Lit 组件还实现了一个响应式更新周期。

响应式更新周期在响应式属性更改或显式调用 `requestUpdate()` 方法时触发。Lit 异步执行更新，因此属性更改会被批处理——如果在请求更新之后、更新开始之前有更多属性更改，所有更改都会在同一个更新中被捕获。

更新发生在微任务时机，这意味着它们在浏览器将下一帧绘制到屏幕之前发生。有关浏览器时序的更多信息，请参阅 [Jake Archibald 的文章](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)。

从高层来看，响应式更新周期是：

1. 当一个或多个属性更改或调用 `requestUpdate()` 时，更新被调度。
1. 更新在下一帧绘制之前执行。
   1. 设置反射特性。
   1. 调用组件的 render 方法以更新其内部 DOM。
1. 更新完成，`updateComplete` promise 被解析。

更详细地说，它看起来像这样：

更新前

<img class="centered-image" src="/images/docs/components/update-1.jpg">

<p><img class="centered-image" src="/images/docs/components/update-2.jpg"></p>

更新中

<img class="centered-image" src="/images/docs/components/update-3.jpg">

更新后

<img class="centered-image" src="/images/docs/components/update-4.jpg">

### changedProperties 映射 {#changed-properties}

许多响应式更新方法接收一个已更改属性的 `Map`。`Map` 的键是属性名称，其值是之前的属性值。你始终可以使用 <code>this.<var>property</var></code> 或 <code>this[<var>property</var>]</code> 找到当前的属性值。

#### changedProperties 的 TypeScript 类型

如果你使用 TypeScript 并且想要对 `changedProperties` 映射进行强类型检查，你可以使用 `PropertyValues<this>`，它会推断每个属性名称的正确类型。

```ts
import {LitElement, html, PropertyValues} from 'lit';
...
  shouldUpdate(changedProperties: PropertyValues<this>) {
    ...
  }
```

如果你不太关心强类型——或者你只检查属性名称而不是之前的值——你可以使用限制较少的类型，如 `Map<string, any>`。

请注意 `PropertyValues<this>` 无法识别 `protected` 或 `private` 属性。如果你要检查任何 `protected` 或 `private` 属性，你需要使用限制较少的类型。

#### 在更新期间更改属性 {#changing-properties-during-an-update}

在更新*期间*（直到并包括 `render()` 方法）更改属性会更新 `changedProperties` 映射，但不会触发新的更新。在 `render()` *之后*更改属性（例如在 `updated()` 方法中）会触发新的更新周期，更改的属性会被添加到新的 `changedProperties` 映射中供下一个周期使用。

### 触发更新 {#reactive-update-cycle-triggering}

当响应式属性更改或调用 `requestUpdate()` 方法时，更新被触发。由于更新是异步执行的，在执行更新之前发生的任何和所有更改只会导致一次更新。

#### hasChanged() {#haschanged}

在设置响应式属性时调用。默认情况下 `hasChanged()` 执行严格相等检查，如果返回 `true`，则调度一次更新。有关更多信息，请参阅[配置 `hasChanged()`](/docs/v3/components/properties/#haschanged)。

#### requestUpdate() {#requestUpdate}

调用 `requestUpdate()` 来调度一次显式更新。如果你需要元素在与属性无关的内容发生更改时进行更新和渲染，这会很有用。例如，计时器组件可能每秒调用一次 `requestUpdate()`。

```js
connectedCallback() {
  super.connectedCallback();
  this._timerInterval = setInterval(() => this.requestUpdate(), 1000);
}

disconnectedCallback() {
  super.disconnectedCallback();
  clearInterval(this._timerInterval);
}
```

已更改属性的列表存储在一个 `changedProperties` 映射中，该映射会传递给后续的生命周期方法。映射的键是属性名称，其值是之前的属性值。

可选地，你可以在调用 `requestUpdate()` 时传递属性名称和之前的值，它们将被存储在 `changedProperties` 映射中。如果你为属性实现了自定义 getter 和 setter，这会很有用。有关实现自定义 getter 和 setter 的更多信息，请参阅[响应式属性](/docs/v3/components/properties/)。

```js
this.requestUpdate("state", this._previousState);
```

### 执行更新 {#reactive-update-cycle-performing}

当执行更新时，会调用 `performUpdate()` 方法。此方法调用许多其他生命周期方法。

在组件更新期间发生的、通常会触发更新的任何更改不会调度新的更新。这样做是为了在更新过程中可以计算属性值。在更新期间更改的属性会反映在 `changedProperties` 映射中，因此后续的生命周期方法可以对更改做出响应。

#### shouldUpdate() {#shouldupdate}

调用以确定是否需要更新周期。

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| 参数                 | `changedProperties`：`Map`，键为已更改属性的名称，值为对应的先前值。 |
| 是否触发更新         | 否。此方法内的属性更改不会触发元素更新。                             |
| 是否调用 super？     | 不需要。                                                             |
| 是否在服务器上调用？ | 否。                                                                 |

如果 `shouldUpdate()` 返回 `true`（默认如此），则更新正常进行。如果返回 `false`，则不会调用更新周期的其余部分，但 `updateComplete` Promise 仍会被解析。

你可以实现 `shouldUpdate()` 来指定哪些属性更改应该触发更新。使用 `changedProperties` 映射来比较当前值和先前值。

{% switchable-sample %}

```ts
shouldUpdate(changedProperties: Map<string, any>) {
  // 仅在 prop1 更改时更新元素。
  return changedProperties.has('prop1');
}
```

```js
shouldUpdate(changedProperties) {
  // 仅在 prop1 更改时更新元素。
  return changedProperties.has('prop1');
}
```

{% endswitchable-sample %}

#### willUpdate() {#willupdate}

在 `update()` 之前调用，用于计算更新期间所需的值。

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| 参数                 | `changedProperties`：`Map`，键为已更改属性的名称，值为对应的先前值。 |
| 是否触发更新？       | 否。此方法内的属性更改不会触发元素更新。                             |
| 是否调用 super？     | 不需要。                                                             |
| 是否在服务器上调用？ | 是。                                                                 |

实现 `willUpdate()` 来计算依赖于其他属性并在更新过程的其余部分中使用的属性值。

{% switchable-sample %}

```ts
willUpdate(changedProperties: PropertyValues<this>) {
  // 仅需检查已更改的属性以进行昂贵的计算。
  if (changedProperties.has('firstName') || changedProperties.has('lastName')) {
    this.sha = computeSHA(`${this.firstName} ${this.lastName}`);
  }
}

render() {
  return html`SHA: ${this.sha}`;
}
```

```js
willUpdate(changedProperties) {
  // 仅需检查已更改的属性以进行昂贵的计算。
  if (changedProperties.has('firstName') || changedProperties.has('lastName')) {
    this.sha = computeSHA(`${this.firstName} ${this.lastName}`);
  }
}

render() {
  return html`SHA: ${this.sha}`;
}
```

{% endswitchable-sample %}

#### update() {#update}

调用以更新组件的 DOM。

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| 参数                 | `changedProperties`：`Map`，键为已更改属性的名称，值为对应的先前值。 |
| 是否触发更新？       | 否。此方法内的属性更改不会触发元素更新。                             |
| 是否调用 super？     | 是。如果没有 super 调用，元素的特性和模板将不会更新。                |
| 是否在服务器上调用？ | 否。                                                                 |

将属性值反射到特性，并调用 `render()` 来更新组件的内部 DOM。

通常，你不需要实现此方法。

#### render() {#render}

由 `update()` 调用，应该实现它以返回一个可渲染的结果（如 `TemplateResult`），用于渲染组件的 DOM。

|                      |                                          |
| -------------------- | ---------------------------------------- |
| 参数                 | 无。                                     |
| 是否触发更新？       | 否。此方法内的属性更改不会触发元素更新。 |
| 是否调用 super？     | 不需要。                                 |
| 是否在服务器上调用？ | 是。                                     |

`render()` 方法没有参数，但通常它会引用组件属性。有关更多信息，请参阅[渲染](/docs/v3/components/rendering/)。

```js
render() {
  const header = `<header>${this.header}</header>`;
  const content = `<section>${this.content}</section>`;
  return html`${header}${content}`;
}
```

### 完成更新 {#reactive-update-cycle-completing}

在调用 `update()` 将更改渲染到组件的 DOM 之后，你可以使用以下方法对组件的 DOM 执行操作。

#### firstUpdated() {#firstupdated}

在组件的 DOM 首次更新后调用，紧接着在 [`updated()`](#updated) 被调用之前。

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| 参数                 | `changedProperties`：`Map`，键为已更改属性的名称，值为对应的先前值。 |
| 是否触发更新？       | 是。此方法内的属性更改会调度新的更新周期。                           |
| 是否调用 super？     | 不需要。                                                             |
| 是否在服务器上调用？ | 否。                                                                 |

实现 `firstUpdated()` 以在组件的 DOM 创建后执行一次性工作。一些示例可能包括聚焦特定的渲染元素或向元素添加 [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) 或 [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver)。

```js
firstUpdated() {
  this.renderRoot.getElementById('my-text-area').focus();
}
```

#### updated() {#updated}

每当组件的更新完成且元素的 DOM 已更新和渲染时调用。

|                      |                                                                      |
| -------------------- | -------------------------------------------------------------------- |
| 参数                 | `changedProperties`：`Map`，键为已更改属性的名称，值为对应的先前值。 |
| 是否触发更新？       | 是。此方法内的属性更改会触发元素更新。                               |
| 是否调用 super？     | 不需要。                                                             |
| 是否在服务器上调用？ | 否。                                                                 |

实现 `updated()` 以在更新后执行使用元素 DOM 的任务。例如，执行动画的代码可能需要测量元素 DOM。

{% switchable-sample %}

```ts
updated(changedProperties: Map<string, any>) {
  if (changedProperties.has('collapsed')) {
    this._measureDOM();
  }
}
```

```js
updated(changedProperties) {
  if (changedProperties.has('collapsed')) {
    this._measureDOM();
  }
}
```

{% endswitchable-sample %}

#### updateComplete {#updatecomplete}

`updateComplete` promise 在元素完成更新时解析。使用 `updateComplete` 来等待更新。解析的值是一个布尔值，指示元素是否已完成更新。如果更新周期完成后没有待处理的更新，则为 `true`。

当元素更新时，它可能会导致其子元素也更新。默认情况下，`updateComplete` promise 在元素自身的更新完成时解析，但不会等待任何子元素完成其更新。此行为可以通过覆盖 [`getUpdateComplete`](#getUpdateComplete) 来自定义。

有几种需要知道元素更新何时完成的使用场景：

1. 测试：编写测试时，你可以在对组件的 DOM 进行断言之前等待 `updateComplete` promise。如果断言依赖于组件整个后代树的更新完成，等待 `requestAnimationFrame` 通常是更好的选择，因为 Lit 的默认调度使用浏览器的微任务队列，该队列在动画帧之前被清空。这确保页面上所有待处理的 Lit 更新在 `requestAnimationFrame` 回调之前完成。

2. 测量：某些组件可能需要测量 DOM 以实现某些布局。虽然使用纯 CSS 而非基于 JavaScript 的测量来实现布局总是更好的，但有时 CSS 的限制使这不可避免。在非常简单的情况下，如果你测量的是 Lit 或 ReactiveElement 组件，在状态更改后和测量前等待 `updateComplete` 可能就足够了。但是，由于 `updateComplete` 不会等待所有后代的更新，我们建议使用 [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) 作为在布局更改时触发测量代码的更稳健方式。

3. 事件：在渲染完成后从组件派发事件是一种好的做法，这样事件的监听者可以看到组件的完全渲染状态。为此，你可以在触发事件之前等待 `updateComplete` promise。

   ```js
   async _loginClickHandler() {
     this.loggedIn = true;
     // 等待 `loggedIn` 状态被渲染到 DOM
     await this.updateComplete;
     this.dispatchEvent(new Event('login'));
   }
   ```

如果在更新周期中有未处理的错误，`updateComplete` promise 会被拒绝。有关更多信息，请参阅[处理更新周期中的错误](#errors-in-the-update-cycle)。

### 处理更新周期中的错误 {#errors-in-the-update-cycle}

如果你在 `render()` 或 `update()` 等生命周期方法中有未捕获的异常，它会导致 `updateComplete` promise 被拒绝。
如果你的生命周期方法中有代码可能抛出异常，将其放在 `try`/`catch` 语句中是一种好的做法。

如果你正在等待 `updateComplete` promise，你可能也想使用 `try`/`catch`：

```js
try {
  await this.updateComplete;
} catch (e) {
  /* 处理错误 */
}
```

在某些情况下，代码可能会在意想不到的地方抛出异常。作为后备方案，你可以添加一个 `window.onunhandledrejection` 处理程序来捕获这些问题。例如，你可以用它将错误报告回后端服务，以帮助诊断难以重现的问题。

```js
window.onunhandledrejection = function (e) {
  /* 处理错误 */
};
```

### 实现额外的自定义 {#reactive-update-cycle-customizing}

本节介绍一些不太常见的用于自定义更新周期的方法。

#### scheduleUpdate() {#scheduleupdate}

覆盖 `scheduleUpdate()` 以自定义更新的时机。`scheduleUpdate()` 在即将执行更新时调用，默认情况下它会立即调用 `performUpdate()`。覆盖它以延迟更新——此技术可用于解除对主渲染/事件线程的阻塞。

例如，以下代码将更新调度到下一帧绘制之后执行，如果更新开销很大，这可以减少卡顿：

{% switchable-sample %}

```ts
protected override async scheduleUpdate(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  super.scheduleUpdate();
}
```

```js
async scheduleUpdate() {
  await new Promise((resolve) => setTimeout(resolve));
  super.scheduleUpdate();
}
```

{% endswitchable-sample %}

如果你覆盖了 `scheduleUpdate()`，调用 `super.scheduleUpdate()` 来执行待处理的更新是你的责任。

{% aside "info" %}

异步函数是可选的。

此示例展示了一个[异步函数](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)，它*隐式*返回一个 promise。你也可以将 `scheduleUpdate()` 编写为一个*显式*返回 `Promise` 的函数。在任何一种情况下，下一次更新都不会开始，直到 `scheduleUpdate()` 返回的 promise 解析。

{% endaside %}

#### performUpdate() {#performupdate}

实现响应式更新周期，调用其他方法，如 `shouldUpdate()`、`update()` 和 `updated()`。

调用 `performUpdate()` 以立即处理待处理的更新。通常不需要这样做，但在需要同步更新的罕见情况下可以这样做。（如果没有待处理的更新，你可以调用 `requestUpdate()` 然后调用 `performUpdate()` 来强制同步更新。）

{% aside "info" %}

使用 `scheduleUpdate()` 来自定义调度。

如果你想自定义更新的调度方式，请覆盖 `scheduleUpdate()`。以前，我们建议为此目的覆盖 `performUpdate()`。这仍然有效，但它使调用 `performUpdate()` 来同步处理待处理更新变得更加困难。

{% endaside %}

#### hasUpdated {#hasupdated}

`hasUpdated` 属性在组件至少更新过一次时返回 true。你可以在任何生命周期方法中使用 `hasUpdated` 来仅在组件尚未更新时执行工作。

#### getUpdateComplete() {#getUpdateComplete}

要在 `updateComplete` promise 解析之前等待额外条件，请覆盖 `getUpdateComplete()` 方法。例如，等待子元素的更新可能很有用。首先等待 `super.getUpdateComplete()`，然后等待任何后续状态。

<div class="alert alert-info">

建议覆盖 `getUpdateComplete()` 方法而不是 `updateComplete` getter，以确保与使用 TypeScript ES5 输出的用户兼容（参见 [TypeScript#338](https://github.com/microsoft/TypeScript/issues/338)）。

</div>

```js
class MyElement extends LitElement {
  async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await this._myChild.updateComplete;
    return result;
  }
}
```

## 外部生命周期钩子：控制器和装饰器

除了组件类实现生命周期回调外，外部代码（如[装饰器](/docs/v3/components/decorators/)）可能需要接入组件的生命周期。

Lit 提供了两个概念让外部代码与响应式更新生命周期集成：`static addInitializer()` 和 `addController()`：

#### static addInitializer() {#addInitializer}

`addInitializer()` 允许有权访问 Lit 类定义的代码在类的实例被构造时运行代码。

这在编写自定义装饰器时非常有用。装饰器在类定义时运行，可以替换字段和方法定义等操作。如果它们还需要在创建实例时执行工作，则必须调用 `addInitializer()`。通常使用它来添加[响应式控制器](/docs/v3/composition/controllers/)，以便装饰器可以接入组件生命周期：

{% switchable-sample %}

```ts
// 一个 TypeScript 装饰器
const myDecorator = (proto: ReactiveElement, key: string) => {
  const ctor = proto.constructor as typeof ReactiveElement;

  ctor.addInitializer((instance: ReactiveElement) => {
    // 这在元素构造期间运行
    new MyController(instance);
  });
};
```

```js
// 一个 Babel "Stage 2" 装饰器
const myDecorator = (descriptor) => {
  ...descriptor,
  finisher(ctor) {
    ctor.addInitializer((instance) => {
      // 这在元素构造期间运行
      new MyController(instance);
    });
  },
};
```

{% endswitchable-sample %}

装饰一个字段将导致每个实例运行一个添加控制器的初始化器：

```ts
class MyElement extends LitElement {
  @myDecorator foo;
}
```

初始化器按构造函数存储。向子类添加初始化器不会将其添加到超类。由于初始化器在构造函数中运行，初始化器将按类层次结构的顺序运行，从超类开始，逐步到实例的类。

#### addController() {#addController}

`addController()` 向 Lit 组件添加一个响应式控制器，使组件调用控制器的生命周期回调。有关更多信息，请参阅[响应式控制器](/docs/v3/composition/controllers/)文档。

#### removeController() {#removeController}

`removeController()` 移除一个响应式控制器，使其不再从此组件接收生命周期回调。

## 服务器端响应式更新周期 {#server-reactive-update-cycle}

<div class="alert alert-info">

Lit 的[服务器端渲染包](/docs/v3/ssr/overview/)目前正在积极开发中，因此以下信息可能会发生变化。

</div>

在服务器上渲染 Lit 时，并非所有更新周期都会被调用。以下方法在服务器上被调用。

<img class="centered-image" src="/images/docs/components/update-server.jpg">

<p><!-- Add some space --></p>
