---
title: Lit 3 升级指南
eleventyNavigation:
  key: Lit 3 升级指南
  parent: 版本发布
  order: 3
versionLinks:
  v2: releases/upgrade/
---

<div class="alert alert-info">

如果你正在从 Lit 1.x 迁移到 Lit 2.x，请参阅 [Lit 2 升级指南](/docs/v2/releases/upgrade/)。

</div>

## 概述

Lit 3.0 相对于 Lit 2.x 的破坏性变更非常少：

- 不再支持 IE11。
- Lit 的 npm 模块现在以 ES2021 发布。
- 在 Lit 2.x 版本中标记为已弃用的 API 已被移除。
- SSR 水合支持模块已移至 `@lit-labs/ssr-client` 包。
- 仅类型变更：`ReactiveElement` 的 `renderRoot` 和 `createRenderRoot()` 的类型已更新。
- 移除了对 Babel 装饰器版本 "2018-09" 的支持。
- 装饰器行为已在 TypeScript 实验性装饰器和标准装饰器之间统一。
  - 因此，如果你使用 TypeScript，你需要至少升级到 TypeScript v5.2，以获取两种装饰器的更新类型。

对于绝大多数用户来说，从 Lit 2 升级到 Lit 3 不需要任何代码更改。大多数应用和库应该能够将 npm 版本范围扩展为同时包含 2.x 和 3.x，例如 `"^2.7.0 || ^3.0.0"`。

Lit 2.x 和 3.0 是*可互操作的*——来自一个 Lit 版本的模板、基类和指令可以与另一个版本的配合使用。

## Lit 现在以 ES2021 发布

Lit 2 以 ES2019 发布，而 Lit 3 现在以 ES2021 发布，ES2021 在现代浏览器和构建工具中已获得广泛支持。
如果你需要支持较旧的浏览器版本，并且当前工具无法解析 ES2021，这可能是一个破坏性变更。

### 在 Webpack 4 中使用 Lit 3

Webpack 4 的内部解析器不支持空值合并（`??`）、逻辑赋值（`??=`）或可选链（`?.`），这些是 ES2021 引入的语法，因此在遇到这些语法时会抛出 `Module parse failed: Unexpected token` 错误。

首选解决方案是升级到 Webpack 5，它支持解析这些较新的 JS 语法。但如果你无法升级，可以使用 `babel-loader` 来转换 Lit 3 代码以在 Webpack 4 中工作。

要在 Webpack 4 中转译 Lit 3，请安装以下所需的 babel 包：

```sh
> npm i -D babel-loader@8 \
    @babel/plugin-transform-optional-chaining \
    @babel/plugin-transform-nullish-coalescing-operator \
    @babel/plugin-transform-logical-assignment-operators
```

然后添加一条类似于以下的新规则（你可能需要根据具体项目进行修改）：

```js
// 在 webpack.config.js 中

module.exports = {
  // ...

  module: {
    rules: [
      // ... 你的其他规则

      // 添加一个 babel-loader 规则来降级 Lit 的 ES2021 语法，使 Webpack 4 能够解析它。
      // TODO: 一旦升级到 Webpack 5，可以删除此规则。
      {
        test: /\.js$/,
        include: ["@lit", "lit-element", "lit-html"].map((p) =>
          path.resolve(__dirname, "node_modules/" + p),
        ),
        use: {
          loader: "babel-loader",
          options: {
            plugins: [
              "@babel/plugin-transform-optional-chaining",
              "@babel/plugin-transform-nullish-coalescing-operator",
              "@babel/plugin-transform-logical-assignment-operators",
            ],
          },
        },
      },
    ],
  },
};
```

## Lit 装饰器的更新

JavaScript 装饰器最近已被 TC39 标准化，处于四阶段标准化流程的第三阶段。第三阶段是 JavaScript 实现（如 VM 和编译器）开始实现稳定规范的阶段。TypeScript 5.2 和 Babel 7.23 最近已实现了该标准。

这意味着存在多个版本的装饰器 API：标准装饰器、TypeScript 的实验性装饰器，以及 Babel 已实现的先前提案（如版本 "2018-09"）。

Lit 2 支持 TypeScript 实验性装饰器和 Babel 的 "2018-09" 装饰器，而 Lit 3 现在支持标准装饰器和 TypeScript 实验性装饰器。

Lit 3 的装饰器与 Lit 2 的 TypeScript 装饰器基本向后兼容——很可能不需要任何更改。

为了使 Lit 装饰器在实验性和标准装饰器模式下行为一致，需要进行一些小的破坏性变更。

Lit 3.0 中 Lit 装饰器行为的变化：

- 对于 `@property()` 和 `@state()` 装饰的访问器，`requestUpdate()` 现在会自动调用，而之前这是 setter 的职责。
- 访问器的值在首次渲染时被读取，并用作 `changedProperties` 和属性反射的初始值。
- Lit 3 装饰器不再支持 `@babel/plugin-proposal-decorators` 的 `version: "2018-09"` 选项。Babel 用户应该[迁移到标准装饰器](#standard-decorator-migration)。
- [可选]：[我们建议将手写的访问器的 `@property()` 和 `@state()` 迁移到 setter 上，以帮助迁移到标准装饰器。](#decorated-getter)

## 已移除的 API 列表

如果你的 Lit 2.x 项目没有弃用警告，则不应受此列表影响。

- [移除了 `ReactiveElement` 的 `UpdatingElement` 别名。](#removed-updating-element)
- [移除了从主 `lit-element` 模块重新导出装饰器。](#removed-re-export-decorators)
- [移除了 `queryAssignedNodes` 装饰器的已弃用调用签名。](#removed-queryassignednodes-non-object)
- [将实验性服务器端渲染水合模块从 `lit`、`lit-element` 和 `lit-html` 移至 `@lit-labs/ssr-client`。](#moved-experimental-hydration)

## 升级步骤

### 移除 `ReactiveElement` 的 `UpdatingElement` 别名 {#removed-updating-element}

将 Lit 2.x 中对 `UpdatingElement` 的使用替换为 `ReactiveElement`。这不是功能性变更，因为 `UpdatingElement` 只是 `ReactiveElement` 的别名。

```ts
// 已移除
import { UpdatingElement } from "lit";

// 更新后
import { ReactiveElement } from "lit";
```

### 移除从 `lit-element` 重新导出装饰器 {#removed-re-export-decorators}

Lit 3.0 的[内置装饰器](/docs/v3/components/decorators/#built-in-decorators)不再由 `lit-element` 导出，而应从 `lit/decorators.js` 导入。

```ts
// 已移除从 lit-element 导出装饰器
import { customElement, property, state } from "lit-element";

// 更新后
import { customElement, property, state } from "lit/decorators.js";
```

### 移除已弃用的 `queryAssignedNodes(slot: string, flatten: bool, selector: string)` 装饰器签名 {#removed-queryassignednodes-non-object}

将任何使用带选择器的 `queryAssignedNodes` 迁移为使用 `queryAssignedElements`。

```ts
// 已移除
@queryAssignedNodes('list', true, '.item')

// 更新后
@queryAssignedElements({slot: 'list', flatten: true, selector: '.item'})
```

不带 `selector` 的用法现在必须接受一个选项对象。

```ts
// 已移除
@queryAssignedNodes('list', true)

// 更新后
@queryAssignedNodes({slot: 'list', flatten: true})
```

### 服务器端渲染实验性水合模块从 `lit`、`lit-element` 和 `lit-html` 中移除 {#moved-experimental-hyddration}

实验性水合支持已从核心库移至 [`@lit-labs/ssr-client`](https://www.npmjs.com/package/@lit-labs/ssr-client)。

```ts
// 已移除
import "lit/experimental-hydrate-support.js";
import { hydrate } from "lit/experimental-hydrate.js";

// 更新后
import "@lit-labs/ssr-client/lit-element-hydrate-support.js";
import { hydrate } from "@lit-labs/ssr-client";
```

## [仅类型变更]：`renderRoot` 和 `createRenderRoot()` 的类型已更新 {#render-root-type-update}

这是一个仅类型变更，没有运行时影响。

`ReactiveElement.renderRoot` 的类型从 `Element | ShadowRoot` 更改为 `HTMLElement | DocumentFragment`，`ReactiveElement.createRenderRoot()` 的返回类型从 `HTMLElement | ShadowRoot` 更改为 `HTMLElement | DocumentFragment`。这使它们彼此一致，也与 lit-html 的 `render()` 一致。

此更改通常不应影响仅访问 `this.renderRoot` 的代码。但是，任何对先前类型有显式类型注解的代码应该更新。

## 可选：升级到标准装饰器 {#standard-decorator-migration}

虽然 Lit 3 添加了对标准装饰器的支持，我们仍然建议 TypeScript 用户继续使用实验性装饰器。这是因为目前 TypeScript 和 Babel 编译器为标准装饰器生成的代码相当大。

当浏览器支持标准装饰器时，或者当我们在新的 Lit 编译器中发布装饰器转换支持时，我们将推荐在生产环境中使用标准装饰器。

但你现在就可以尝试标准装饰器，它们在 TypeScript 5.2 及以上版本和带有 `@babel/plugin-proposal-decorators` 插件的 Babel 7.23 中都可以工作。

### 配置

#### TypeScript

安装 TypeScript 5.2 或更高版本，如果 tsconfig 中存在 `"experimentalDecorators"` 设置，请将其*移除*。

#### Babel

安装 Babel 7.23 或更高版本，以及 [`@babel/plugin-proposal-decorators`](https://babeljs.io/docs/babel-plugin-proposal-decorators)。确保向该插件传递 `"version": "2023-05"` 选项。

### 代码更改

#### 为装饰的字段添加 `accessor` 关键字 {#add-accessor-to-decorated-fields}

标准装饰器不允许更改它们所装饰的类成员的*类型*。需要创建 getter 和 setter 的装饰器必须应用于现有的 getter 和 setter。为了使这更符合人体工程学，装饰器标准添加了 `accessor` 关键字，当应用于类字段时会创建"自动访问器"。自动访问器看起来和行为都很像类字段，但在原型上创建由私有存储支持的访问器。

`@property()`、`@state()`、`@query()`、`@queryAll()`、`@queryAssignedElements()` 和 `@queryAssignedNode()` 装饰器需要 `accessor` 关键字。

示例：

```ts
class MyElement extends LitElement {
  @property()
  accessor myProperty = "initial value"
...
}
```

#### 将装饰器从 getter 移到 setter {#decorated-getter}

标准装饰器只能替换它们直接应用的类成员。Lit 装饰器需要拦截属性设置，因此装饰器必须应用于 setter。这与 Lit 2 中建议将装饰器应用于 getter 的做法不同。

对于 `@property()` 和 `@state()`，你还可以移除 setter 中的任何 `this.requestUpdate()` 调用，因为现在这会自动完成。如果你需要*不*调用 `requestUpdate()`，你将不得不使用 `noAccessor` 属性选项。

请注意，对于 `@property()` 和 `@state()`，在设置属性时装饰器会调用 _getter_ 来获取旧值。这意味着你*必须*同时定义 getter 和 setter。

之前：

```ts
class MyElement extends LitElement {
  private _foo = 42;
  set(v) {
    const oldValue = this._foo;
    this._foo = v;
    this.requestUpdate("foo", oldValue);
  }
  @property()
  get() {
    return this._foo;
  }
}
```

之后：

```ts
class MyElement extends LitElement {
  private _foo = 42;
  @property()
  set(v) {
    this._foo = v;
  }
  get() {
    return this._foo;
  }
}
```
