---
title: 混入
eleventyNavigation:
  parent: 组合
  key: 混入
  order: 3
versionLinks:
  v2: composition/mixins/
---

类混入是一种使用标准 JavaScript 在类之间共享代码的模式。与"拥有"（has-a）组合模式（如[响应式控制器](/docs/v3/composition/controllers/)）不同——在后者中，一个类可以*拥有*一个控制器来添加行为——混入实现的是"是一个"（is-a）组合，其中混入使得类本身*成为*被共享行为的一个实例。

你可以使用混入通过添加 API 或覆盖生命周期回调来自定义 Lit 组件。

## 混入基础

混入可以被看作是"子类工厂"，它们覆盖所应用的类并返回一个子类，该子类扩展了混入中的行为。因为混入是使用标准 JavaScript 类表达式实现的，所以它们可以使用子类化中所有可用的惯用方式，如添加新的字段/方法、覆盖现有的超类方法，以及使用 `super`。

<div class="alert alert-info">

为了便于阅读，本页面上的示例省略了混入函数的一些 TypeScript 类型。有关在 TypeScript 中正确为混入添加类型的详细信息，请参阅 [TypeScript 中的混入](#mixins-in-typescript)。

</div>

要定义一个混入，编写一个接受 `superClass` 的函数，并返回一个继承它的新类，根据需要添加字段和方法：

```ts
const MyMixin = (superClass) =>
  class extends superClass {
    /* 用于扩展 superClass 的类字段和方法 */
  };
```

要应用一个混入，只需传入一个类来生成应用了该混入的子类。最常见的是，用户会在定义新类时直接将混入应用到基类上：

```ts
class MyElement extends MyMixin(LitElement) {
  /* 用户代码 */
}
```

混入也可以用于创建具体的子类，用户可以像普通类一样继承它们，其中混入是一个实现细节：

```ts
export const LitElementWithMixin = MyMixin(LitElement);
```

```ts
import { LitElementWithMixin } from "./lit-element-with-mixin.js";

class MyElement extends LitElementWithMixin {
  /* 用户代码 */
}
```

因为类混入是一种标准 JavaScript 模式而非 Lit 特有的，社区中有大量关于利用混入进行代码复用的信息。有关混入的更多阅读，以下是一些好的参考资料：

- MDN 上的 [Class mixins](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/extends#mix-ins)
- Justin Fagnani 的 [Real Mixins with JavaScript
  Classes](https://justinfagnani.com/2015/12/21/real-mixins-with-javascript-classes/)
- TypeScript 手册中的 [Mixins](https://www.TypeScriptlang.org/docs/handbook/mixins.html)。
- open-wc 的 [Dedupe mixin library](https://open-wc.org/docs/development/dedupe-mixin/)，包括关于混入使用何时可能导致重复的讨论，以及如何使用去重库来避免它。
- Elix Web 组件库遵循的 [Mixin conventions](https://component.kitchen/elix/mixins)。虽然不是 Lit 特有的，但包含了关于在为 Web 组件定义混入时应用约定的深思熟虑的建议。

## 为 LitElement 创建混入

应用于 LitElement 的混入可以实现或覆盖任何标准的[自定义元素生命周期](/docs/v3/components/lifecycle/#custom-element-lifecycle)回调，如 `constructor()` 或 `connectedCallback()`，以及任何[响应式更新生命周期](/docs/v3/components/lifecycle/#reactive-update-cycle)回调，如 `render()` 或 `updated()`。

例如，以下混入会在元素被创建、连接和更新时记录日志：

```ts
const LoggingMixin = (superClass) =>
  class extends superClass {
    constructor() {
      super();
      console.log(`${this.localName} was created`);
    }
    connectedCallback() {
      super.connectedCallback();
      console.log(`${this.localName} was connected`);
    }
    updated(changedProperties) {
      super.updated?.(changedProperties);
      console.log(`${this.localName} was updated`);
    }
  };
```

请注意，混入应该始终对 `LitElement` 实现的标准自定义元素生命周期方法进行 super 调用。在覆盖响应式更新生命周期回调时，如果超类上已经存在该方法，则调用 super 方法是良好的实践（如上所示，使用可选链调用 `super.updated?.()`）。

另请注意，混入可以选择在标准生命周期回调的基础实现之前或之后执行工作，通过选择何时进行 super 调用来实现。

混入还可以向被继承的元素添加[响应式属性](/docs/v3/components/properties/)、[样式](/docs/v3/components/styles/)和 API。

下面示例中的混入向元素添加了一个 `highlight` 响应式属性和一个 `renderHighlight()` 方法，用户可以调用该方法来包裹一些内容。当设置了 `highlight` 属性/attribute 时，被包裹的内容会被设置为黄色样式。

{% playground-ide "v3-docs/mixins/highlightable/" "highlightable.ts" %}

请注意，在上面的示例中，混入的使用者被期望从他们的 `render()` 方法中调用 `renderHighlight()` 方法，并且要注意将混入定义的 `static styles` 添加到子类样式中。混入和使用者之间的这种约定的性质取决于混入的定义，应该由混入作者进行文档说明。

## TypeScript 中的混入

在 TypeScript 中编写 `LitElement` 混入时，有一些细节需要注意。

### 为超类添加类型

你应该将 `superClass` 参数约束为你期望用户继承的类类型（如果有的话）。这可以使用如下所示的泛型 `Constructor` 辅助类型来实现：

```ts
import {LitElement} from 'lit';

type Constructor<T = {}> = new (...args: any[]) => T;

export const MyMixin = <T extends Constructor<LitElement>>(superClass: T) => {
  class MyMixinClass extends superClass {
    /* ... */
  };
  return MyMixinClass as /* 见下方"为子类添加类型" */;
}
```

上面的示例确保传递给混入的类继承自 `LitElement`，这样你的混入就可以依赖 Lit 提供的回调和其他 API。

### 为子类添加类型

虽然 TypeScript 对推断使用混入模式生成的子类的返回类型有基本支持，但它有一个严重的限制，即推断的类不能包含带有 `private` 或 `protected` 访问修饰符的成员。

<div class="alert alert-info">

因为 `LitElement` 本身确实有 private 和 protected 成员，默认情况下 TypeScript 会在返回继承 `LitElement` 的类时报错：_"Property '...' of exported class expression may not be private or protected."_

</div>

有两种变通方法，都涉及将混入函数的返回类型进行类型转换以避免上述错误。

#### 当混入不添加新的 public/protected API 时

如果你的混入只是覆盖 `LitElement` 的方法或属性，并且不添加任何自己的新 API，你可以简单地将生成的类转换为传入的超类类型 `T`：

```ts
export const MyMixin = <T extends Constructor<LitElement>>(superClass: T) => {
  class MyMixinClass extends superClass {
    connectedCallback() {
      super.connectedCallback();
      this.doSomethingPrivate();
    }
    private doSomethingPrivate() {
      /* 不需要成为接口的一部分 */
    }
  }
  // 将返回类型转换为传入的超类类型
  return MyMixinClass as T;
};
```

#### 当混入添加新的 public/protected API 时

如果你的混入确实添加了新的 protected 或 public API，并且你需要用户能够在他们的类上使用，你需要将混入的接口与实现分开定义，并将返回类型转换为你的混入接口与超类类型的交叉类型：

```ts
// 定义混入的接口
export declare class MyMixinInterface {
  highlight: boolean;
  protected renderHighlight(): unknown;
}

export const MyMixin = <T extends Constructor<LitElement>>(superClass: T) => {
  class MyMixinClass extends superClass {
    @property() highlight = false;
    protected renderHighlight() {
      /* ... */
    }
  }
  // 将返回类型转换为你的混入接口与超类类型的交叉类型
  return MyMixinClass as Constructor<MyMixinInterface> & T;
};
```

### 在混入中应用装饰器

由于 TypeScript 类型系统的限制，装饰器（如 `@property()`）必须应用于类声明语句，而不是类表达式。

在实践中，这意味着 TypeScript 中的混入需要声明一个类然后返回它，而不是直接从箭头函数返回一个类表达式。

支持的写法：

```ts
export const MyMixin = <T extends LitElementConstructor>(superClass: T) => {
  // 在函数体中定义一个类，然后返回它
  class MyMixinClass extends superClass {
    @property()
    mode = "on";
    /* ... */
  }
  return MyMixinClass;
};
```

不支持的写法：

```ts
export const MyMixin = <T extends LitElementConstructor>(superClass: T) =>
  // 使用箭头函数简写直接返回类表达式
  class extends superClass {
    @property()
    mode = "on";
    /* ... */
  };
```
