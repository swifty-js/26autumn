---
title: React
eleventyNavigation:
  key: React
  parent: Frameworks
  order: 1
versionLinks:
  v2: frameworks/react/
---

[@lit/react](https://github.com/lit/lit/tree/main/packages/react) 包提供了用于为 Web Components 创建 React 包装组件的工具，以及从[响应式控制器](../../composition/controllers/)创建自定义 Hook 的工具。

React 组件包装器支持在自定义元素上设置属性（property）（而不仅仅是特性（attribute））、将 DOM 事件映射为 React 风格的回调，并且能够让 TypeScript 在 JSX 中进行正确的类型检查。

这些包装器面向两类不同的受众：

- Web Components 的使用者可以在自己的 React 项目中对组件和控制器进行包装以供自身使用。
- 组件的发布者可以发布 React 包装器，使其 React 用户能够获得符合 React 惯用方式的组件版本。

### 为什么需要包装器？

React 本身已经能够渲染 Web Components，因为自定义元素本质上就是 HTML 元素，而 React 知道如何渲染 HTML。但 React 对 HTML 元素做了一些假设，这些假设并不总是适用于自定义元素，而且它对小写标签名和大写组件名的处理方式不同，这使得自定义元素的使用变得比实际需要的更加困难。

例如，React 假设所有 JSX 属性（property）都映射到 HTML 元素的特性（attribute），并且没有提供设置属性（property）的方式。这使得向 Web Components 传递复杂数据（如对象、数组或函数）变得困难。React 还假设所有 DOM 事件都有对应的"事件属性"（`onclick`、`onmousemove` 等），并使用这些事件属性而不是调用 `addEventListener()`。这意味着要正确使用更复杂的 Web Components，你通常不得不使用 `ref()` 和命令式代码。（有关 React 的 Web Components 集成限制的更多信息，请参阅 [Custom Elements Everywhere](https://custom-elements-everywhere.com/libraries/react/results/results.html)。）

React 团队正在着手修复这些问题，但在此之前，我们的包装器已经为你处理好了属性设置和事件监听的工作。

`@lit/react` 包提供了两个主要导出：

- `createComponent()` 创建一个*包装*现有 Web Component 的 React 组件。该包装器允许你像在普通 React 组件上一样设置 props 和添加事件监听器。

- `useController()` 让你能够将 Lit 响应式控制器作为 React Hook 使用。

## createComponent

`createComponent()` 函数为自定义元素类创建一个 React 组件包装器。该包装器能够正确地将 React 的 `props` 传递给自定义元素所接受的属性（property），并监听自定义元素派发的事件。

### 用法

导入 `React`、一个自定义元素类以及 `createComponent`。

```js
import React from "react";
import { createComponent } from "@lit/react";
import { MyElement } from "./my-element.js";

export const MyElementComponent = createComponent({
  tagName: "my-element",
  elementClass: MyElement,
  react: React,
  events: {
    onactivate: "activate",
    onchange: "change",
  },
});
```

定义好 React 组件后，你可以像使用任何其他 React 组件一样使用它。

```jsx
<MyElementComponent
  active={isActive}
  onactivate={(e) => setIsActive(e.active)}
  onchange={handleChange}
/>
```

{% aside "positive" "no-header" %}

在 [React playground 示例](/playground/#sample=examples/react-basics)中查看实际效果。

{% endaside %}

#### 选项

`createComponent` 接受一个包含以下属性的选项对象：

- `tagName`：自定义元素的标签名。
- `elementClass`：自定义元素的类。
- `react`：导入的 `React` 对象。它用于使用用户提供的 `React` 来创建包装组件。这也可以是 `preact-compat` 的导入。
- `events`：一个将事件处理函数 prop 映射到自定义元素所触发的事件名称的对象。

#### 使用插槽

使用 `createComponent()` 创建的组件的子元素将渲染到自定义元素的默认插槽中。

```jsx
<MyElementComponent>
  <p>This will render in the default slot.</p>
</MyElementComponent>
```

要将子元素渲染到特定的具名插槽中，可以添加标准的 `slot` 特性（attribute）。

```jsx
<MyElementComponent>
  <p slot="foo">This will render in the slot named "foo".</p>
</MyElementComponent>
```

由于 React 组件本身不是 HTML 元素，它们通常不能直接拥有 `slot` 特性（attribute）。要渲染到具名插槽中，需要用一个带有 `slot` 特性（attribute）的容器元素来包裹该组件。如果包裹元素会干扰样式（例如 grid 和 flexbox 布局），可以为其设置 `display: contents;` 样式（[详见 MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/display#box)），这会将容器本身从渲染中移除，只渲染其子元素。

```jsx
<MyElementComponent>
  <div slot="foo" style="display: contents;">
    <ReactComponent />
  </div>
</MyElementComponent>
```

{% aside "positive" "no-header" %}

在 [React 插槽 playground 示例](/playground/#sample=examples/react-slots)中试一试。

{% endaside %}

#### 事件

`events` 选项接受一个将 React prop 名称映射到事件名称的对象。当组件使用者传递一个与某个事件 prop 名称对应的回调 prop 时，包装器会将其添加为对应事件的事件处理函数。

虽然 React prop 名称可以是你想要的任何名称，但推荐的约定是在事件名称前加上 `on`。这与 React 计划为自定义元素实现事件支持的方式一致。你还应该确保此 prop 名称不会与元素上的任何现有属性发生冲突。

在 TypeScript 中，可以通过将事件名称转换为 `EventName` 工具类型来指定事件类型。这是一个好的实践，这样 React 用户就能获得最准确的事件回调类型。

`EventName` 类型是一个字符串，它接受一个事件接口作为类型参数。这里我们将 `'my-event'` 名称转换为 `EventName<MyEvent>` 以提供正确的事件类型：

```ts
import React from "react";
import { createComponent, type EventName } from "@lit/react";
import { MyElement, MyEvent } from "./my-element.js";

export const MyElementComponent = createComponent({
  tagName: "my-element",
  elementClass: MyElement,
  react: React,
  events: {
    "onmy-event": "my-event" as EventName<MyEvent>,
  },
});
```

将事件名称转换为 `EventName<MyEvent>` 会使 React 组件拥有一个 `onMyEvent` 回调 prop，该 prop 接受一个 `MyEvent` 参数而不是普通的 `Event`：

```tsx
<MyElementComponent
  onmy-event={(e: MyEvent) => {
    console.log(e.myEventData);
  }}
/>
```

### 工作原理

在渲染过程中，包装器从 React 接收 props，并根据选项和自定义元素类来改变某些 props 的行为：

- 如果一个 prop 名称是自定义元素上的属性（property）（通过 `in` 检查来确定），包装器会将该元素的该属性设置为 prop 的值
- 如果一个 prop 名称是传递给 `events` 选项的事件名称，则 prop 的值会通过 `addEventListener()` 以事件名称进行传递。
- 否则，该 prop 会传递给 React 的 `createElement()` 以作为特性（attribute）进行渲染。

属性（property）和事件都是在 `componentDidMount()` 和 `componentDidUpdate()` 回调中添加的，因为元素必须已经由 React 实例化之后才能访问它。

对于事件，`createComponent()` 接受一个从 React 事件 prop 名称到自定义元素所触发事件的映射。例如，传递 `{onfoo: 'foo'}` 意味着通过名为 `onfoo` 的 prop 传递的函数将在自定义元素触发 `foo` 事件时被调用，并以该事件作为参数。

## useController

响应式控制器允许开发者接入组件的生命周期，将与某个功能相关的状态和行为捆绑在一起。它们在用户场景和能力方面与 React Hook 类似，但它们是纯 JavaScript 对象，而不是带有隐藏状态的函数。

`useController()` 让你能够从响应式控制器创建 React Hook，从而实现跨 Web Components 和 React 的状态和行为共享。

### 用法

```jsx
import React from "react";
import { useController } from "@lit/react/use-controller.js";
import { MouseController } from "@example/mouse-controller";

// 编写一个自定义 React Hook 函数：
const useMouse = () => {
  // 使用 useController 来创建和存储一个控制器实例：
  const controller = useController(React, (host) => new MouseController(host));
  // 返回相关数据供组件使用：
  return controller.pos;
};

// 现在在 React 组件中使用这个新的 Hook：
const Component = (props) => {
  const mousePosition = useMouse();
  return (
    <pre>
      x: {mousePosition.x}
      y: {mousePosition.y}
    </pre>
  );
};
```

有关其实现，请参阅响应式控制器文档中的 [mouse controller 示例](../../composition/controllers/#example:-mousemovecontroller)。

### 工作原理

`useController()` 为传递给它的控制器创建一个自定义宿主对象，并通过使用 React Hook 来驱动控制器的生命周期。

- `useState()` 用于存储控制器实例和 `ReactControllerHost` 的实例
- Hook 函数体和 `useLayoutEffect()` 回调尽可能紧密地模拟 `ReactiveElement` 的生命周期。
- `ReactControllerHost` 实现了 `addController()`，因此控制器组合能够正常工作，嵌套控制器的生命周期也能被正确调用。
- `ReactControllerHost` 还通过调用 `useState()` 的 setter 来实现 `requestUpdate()`，从而使控制器能够触发其宿主组件的重新渲染。
