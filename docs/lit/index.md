---
title: 什么是 Lit？
eleventyNavigation:
  key: What is Lit?
  parent: Introduction
  order: 1
versionLinks:
  v1:
---

<lazy-svg class="logo" width="425" height="200" href="{{ site.baseurl }}/images/logo.svg#full" loading="eager"></lazy-svg>

Lit 是一个用于构建快速、轻量级 Web Components 的简洁库。

Lit 的核心是一个消除样板代码的组件基类，它提供了响应式状态、作用域样式，以及一个小巧、快速且富有表现力的声明式模板系统。

## 我可以用 Lit 构建什么？

你几乎可以用 Lit 构建任何类型的 Web UI！

关于 Lit，首先要了解的是，每一个 Lit 组件都是一个标准的 [Web Component](https://developer.mozilla.org/en-US/docs/Web/Web_Components)。Web Components 拥有互操作性的超能力：它们受到浏览器的原生支持，可以在任何 HTML 环境中使用，无论是否搭配框架。

这使得 Lit 成为开发可共享组件或设计系统的理想选择。Lit 组件可以跨多个应用和站点使用，即使这些应用和站点构建在不同的前端技术栈上。使用 Lit 组件的站点开发者不需要编写甚至不需要看到任何 Lit 代码；他们可以像使用内置 HTML 元素一样使用这些组件。

Lit 也非常适合对基础 HTML 站点进行渐进式增强。浏览器会识别你标记中的 Lit 组件并自动初始化它们——无论你的站点是手工编写的、通过 CMS 管理的、使用服务端框架构建的，还是由 Jekyll 或 eleventy 等工具生成的。

当然，你也可以用 Lit 组件构建高度交互、功能丰富的应用，就像使用 React 或 Vue 等框架一样。Lit 的能力和开发者体验与这些流行的替代方案相当，但 Lit 通过拥抱浏览器原生的组件模型，最大限度地减少了锁定效应，最大化了灵活性，并促进了可维护性。

当你用 Lit 构建应用时，可以轻松地混入"原生"Web Components 或使用其他库构建的 Web Components。你甚至可以逐个组件地更新到 Lit 的主要新版本——或迁移到另一个库——而不会中断产品开发。

## 使用 Lit 开发是什么体验？

如果你有过任何现代的、基于组件的 Web 开发经验，你会觉得 Lit 非常亲切。即使你以前没有使用组件进行过开发，我们认为你也会发现 Lit 非常容易上手。

每个 Lit 组件都是一个自包含的 UI 单元，由更小的构建块组装而成：标准 HTML 元素和其他 Web Components。反过来，每个 Lit 组件本身也是一个构建块，可以在 HTML 文档中、另一个 Web Component 中或框架组件中使用，以构建更大、更复杂的界面。

下面是一个小巧但并非简单的组件（一个倒计时计时器），它展示了 Lit 代码的样子，并突出了几个关键特性：

{% playground-ide "v3-docs/what-is-lit/" %}

一些需要注意的事项：

- Lit 的主要特性是 `LitElement` 基类，它是原生 `HTMLElement` 的一个便捷且功能丰富的扩展。你通过继承它来定义自己的组件。
- Lit 的[富有表现力的声明式模板](/docs/v3/templates/overview/)（利用 JavaScript 标签模板字面量）使得描述组件的渲染方式变得简单。
- [响应式属性](/docs/v3/components/properties/)代表组件的公共 API 和/或内部状态；每当响应式属性发生变化时，你的组件会自动重新渲染。
- [样式](/docs/v3/components/styles)默认具有作用域隔离，使你的 CSS 选择器保持简洁，并确保你的组件样式不会污染（或被污染于）周围的上下文。
- Lit 在纯 JavaScript 中运行良好，你也可以使用 TypeScript 通过装饰器和类型声明获得更好的人体工程学体验。

Lit 在开发过程中不需要编译或构建，因此如果你愿意，几乎可以无需任何工具即可使用。一流的 [IDE 支持](/docs/v3/tools/development/#ide-plugins)（代码补全、代码检查等）和[生产工具](/docs/v3/tools/production/)（本地化、模板压缩等）都可以方便地获取。

## 为什么我应该选择 Lit？

正如我们已经提到的，Lit 是构建各种 Web UI 的绝佳选择，它将 Web Components 基于互操作性的优势与现代、符合人体工程学的开发者体验结合在一起。

Lit 还具有以下特点：

- 简洁。构建在 Web Components 标准之上，Lit 只添加了你保持高效和愉悦所需的：响应式、声明式模板以及少量精心设计的特性，用于减少样板代码并让你的工作更轻松。
- 快速。更新是快速的，因为 Lit 会跟踪你的 UI 中的动态部分，并且仅在底层状态发生变化时更新这些部分——无需重建整个虚拟树并将其与 DOM 的当前状态进行差异比较。
- 轻量。大约只有 5 KB（压缩 + 压缩后），Lit 有助于保持包体积小、加载时间短。

Lit 背后的团队从第一天起就参与 Web Components 的工作。我们帮助 Google 维护了数以万计的组件，提供了一套全面的 Web Components polyfill，并深度参与标准和社区工作。

Lit 的每个特性都经过精心设计，充分考虑了 Web 平台的演进；我们的目标是帮助你充分利用平台今天所提供的能力，同时编写能够从未来增强中受益的代码。

## 后续步骤

- [入门](/docs/v3/getting-started/)：完成设置，开始使用 Lit 进行开发。
- [组件](/docs/v3/components/overview/)：了解 Lit 组件模型。
- [模板](/docs/v3/templates/overview/)：使用 lit-html 语法编写模板。
- [代码组织](/docs/v3/composition/overview/)：编写可复用、可维护的代码。
