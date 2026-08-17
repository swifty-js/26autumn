---
title: 装饰器
eleventyNavigation:
  key: Decorators
  parent: Components
  order: 8
versionLinks:
  v1: components/decorators/
  v2: components/decorators/
---

装饰器是可以用于以声明式方式注解和修改类行为的函数。

Lit 提供了一组可选的装饰器，为注册元素、定义响应式属性和查询属性，或为事件处理方法添加事件选项等功能提供声明式 API。

例如，`@customElement` 和 `@property()` 装饰器让你以紧凑的声明式方式注册自定义元素并定义响应式属性：

```ts
@customElement("my-element")
export class MyElement extends LitElement {
  @property()
  greeting = "Welcome";
}
```

{% aside "info" "no-header"%}

Lit 支持 JavaScript 装饰器提案的两个不同版本——一个是 TypeScript 支持的早期版本，我们称之为*实验性装饰器*；另一个是新的最终版本，我们称之为*标准装饰器*。

两个提案之间在使用上有一些小的差异（标准装饰器通常需要 `accessor` 关键字）。我们的代码示例是为实验性装饰器编写的，因为我们目前推荐在生产环境中使用它们。

有关更多详细信息，请参阅[装饰器版本](#decorator-versions)。

{% endaside %}

## 内置装饰器

| 装饰器                                                        | 概述                                                             | 更多信息                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| {% api-v3 "@customElement" "customElement" %}                 | 定义一个自定义元素。                                             | [定义组件](/docs/v3/components/defining/)                          |
| {% api-v3 "@eventOptions" "eventOptions" %}                   | 添加事件监听器选项。                                             | [事件](/docs/v3/components/events/#event-options-decorator)        |
| {% api-v3 "@property" "property" %}                           | 定义一个公共属性。                                               | [属性](/docs/v3/components/properties/#declare-with-decorators)    |
| {% api-v3 "@state" "state" %}                                 | 定义一个私有状态属性                                             | [属性](/docs/v3/components/properties/#declare-with-decorators)    |
| {% api-v3 "@query" "query" %}                                 | 定义一个返回组件模板中元素的属性。                               | [Shadow DOM](/docs/v3/components/shadow-dom/#query)                |
| {% api-v3 "@queryAll" "queryAll" %}                           | 定义一个返回组件模板中元素列表的属性。                           | [Shadow DOM](/docs/v3/components/shadow-dom/#query-all)            |
| {% api-v3 "@queryAsync" "queryAsync" %}                       | 定义一个返回 Promise 的属性，该 Promise 解析为组件模板中的元素。 | [Shadow DOM](/docs/v3/components/shadow-dom/#query-async)          |
| {% api-v3 "@queryAssignedElements" "queryAssignedElements" %} | 定义一个返回分配给特定插槽的子元素的属性。                       | [Shadow DOM](/docs/v3/components/shadow-dom/#query-assigned-nodes) |
| {% api-v3 "@queryAssignedNodes" "queryAssignedNodes" %}       | 定义一个返回分配给特定插槽的子节点的属性。                       | [Shadow DOM](/docs/v3/components/shadow-dom/#query-assigned-nodes) |

## 导入装饰器

你可以通过 `lit/decorators.js` 模块导入所有 Lit 装饰器：

```js
import {
  customElement,
  property,
  eventOptions,
  query,
} from "lit/decorators.js";
```

为了减少运行组件所需的代码量，可以将装饰器单独导入到组件代码中。所有装饰器都可以在 `lit/decorators/<decorator-name>.js` 中找到。例如：

```js
import { customElement } from "lit/decorators/custom-element.js";
import { eventOptions } from "lit/decorators/event-options.js";
```

## 启用装饰器 { #enabling-decorators }

要使用装饰器，你需要使用编译器（如 [TypeScript](#decorators-typescript) 或 [Babel](#decorators-babel)）来构建代码。

未来当浏览器原生支持装饰器时，这将不再必要。

### 在 TypeScript 中使用装饰器 { #decorators-typescript }

TypeScript 同时支持实验性装饰器和标准装饰器。我们建议 TypeScript 开发者目前使用实验性装饰器以获得[最优的编译器输出](#compiler-output-considerations)。如果你的项目需要使用标准装饰器或设置 `"useDefineForClassFields": true`，请跳到[迁移到标准装饰器](#migrating-typescript-standard-decorators)。

要使用实验性装饰器，你必须启用 `experimentalDecorators` 编译器选项。

你还应该确保 `useDefineForClassFields` 设置为 `false`。这仅在 `target` 设置为 `ES2022` 或更高版本时才需要，但建议显式将其设置为 `false`。这是为了[避免声明属性时出现类字段问题](/docs/v3/components/properties/#avoiding-issues-with-class-fields)所必需的。

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false
  }
```

不需要启用 `emitDecoratorMetadata`，也不推荐启用。

#### 将 TypeScript 实验性装饰器迁移到标准装饰器 { #migrating-typescript-standard-decorators }

Lit 装饰器被设计为支持[标准装饰器语法](#standard-decorators)（在类字段装饰器上使用 `accessor`），同时兼容 TypeScript 的实验性装饰器模式。

这允许从实验性装饰器进行增量迁移，首先向被装饰的属性添加 `accessor` 关键字，而不会改变行为。一旦所有被装饰的类字段都使用了 `accessor` 关键字，你就可以更改编译器选项以完成向标准装饰器的迁移：

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": false, // TypeScript 5.0 及更高版本的默认值
    "useDefineForClassFields": true // 当 "target" 为 "ES2022" 或更高时的默认值
  }
}
```

注意：`accessor` 关键字在 TypeScript 4.9 中引入，带有元数据的标准装饰器需要 TypeScript ≥5.2。

### 在 Babel 中使用装饰器 { #decorators-babel }

[Babel](https://babeljs.io/docs/en/) 从 7.23 版本开始通过 [`@babel/plugin-proposal-decorators`](https://babeljs.io/docs/en/babel-plugin-proposal-decorators) 插件支持标准装饰器。Babel 不支持 TypeScript 实验性装饰器，因此你必须使用[标准装饰器语法](#standard-decorators)在被装饰的类字段上使用 `accessor` 关键字来使用 Lit 装饰器。

通过添加 [`@babel/plugin-proposal-decorators`](https://babeljs.io/docs/en/babel-plugin-proposal-decorators) 并配置以下 Babel 设置来启用装饰器：

```json
// babel.config.json
{
  "plugins": [["@babel/plugin-proposal-decorators", { "version": "2023-05" }]]
}
```

注意：Lit 装饰器仅支持 `"version": "2023-05"`。其他版本，包括之前支持的 `"2018-09"`，均不受支持。

## 装饰器版本

装饰器是一个[第 3 阶段提案](https://github.com/tc39/proposal-decorators)，旨在添加到 ECMAScript 标准中。像 [Babel](https://babeljs.io/) 和 [TypeScript](https://www.typescriptlang.org/) 这样的编译器支持装饰器，尽管目前还没有浏览器实现它们。Lit 装饰器可以与 Babel 和 TypeScript 配合使用，当浏览器原生实现装饰器后也将可以在浏览器中使用。

{% aside "info" %}

第 3 阶段意味着什么？

这意味着规范文本已经完成，可供浏览器实现。一旦规范在多个浏览器中实现，它就可以进入最终阶段——第 4 阶段，并被添加到 ECMAScript 标准中。第 3 阶段的提案只有在实现过程中发现关键问题时才会更改。

{% endaside %}

### 早期的装饰器提案

在 TC39 提案达到第 3 阶段之前，编译器实现了装饰器规范的早期版本。

其中最值得注意的是 [TypeScript 的*实验性装饰器*](https://www.typescriptlang.org/docs/handbook/decorators.html)，Lit 从一开始就支持它，这也是我们目前推荐使用的版本。

Babel 也随着时间推移支持了规范的不同版本，正如[装饰器插件的 `"version"` 选项](https://babeljs.io/docs/babel-plugin-proposal-decorators#version)所示。过去，Lit 2 为 Babel 用户支持了 `"2018-09"` 版本，但现在已放弃该版本，转而使用下面描述的*标准* `"2023-05"` 版本。

### 标准装饰器 { #standard-decorators }

*标准装饰器*是在 TC39（定义 ECMAScript/JavaScript 的组织）中达到第 3 阶段共识的装饰器版本。

标准装饰器在 TypeScript 和 Babel 中受支持，原生浏览器支持也即将到来。

标准装饰器和实验性装饰器之间最大的区别是，出于性能原因，标准装饰器不能更改被装饰和替换的类成员的*类型*——字段、访问器和方法——只会产生相同类型的成员。

由于许多 Lit 装饰器会生成访问器，这意味着装饰器需要应用于访问器，而不是类字段。

为了方便这一点，标准装饰器规范添加了 `accessor` 关键字来声明"自动访问器"：

```ts
class MyClass {
  accessor foo = 42;
}
```

自动访问器创建一个 getter 和 setter 对，从私有字段读取和写入。装饰器可以包装这些 getter 和 setter。

在实验性装饰器中作用于类字段的 Lit 装饰器——如 `@property()`、`@state()`、`@query()` 等——在标准装饰器中必须应用于访问器或自动访问器：

```ts
@customElement("my-element")
export class MyElement extends LitElement {
  @property()
  accessor greeting = "Welcome";
}
```

### 编译器输出方面的考量

不幸的是，标准装饰器的编译器输出相当大，因为需要生成访问器、私有存储以及装饰器 API 中的其他对象。

因此我们建议希望使用装饰器的用户，如果可能的话，目前使用 TypeScript 实验性装饰器。

未来，Lit 团队计划在我们的可选 Lit 编译器中添加装饰器转换，以将标准装饰器编译为更紧凑的编译器输出。原生浏览器支持也将完全消除对任何编译器转换的需求。
