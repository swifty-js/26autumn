---
title: 组件概述
eleventyNavigation:
  key: Overview
  parent: Components
  order: 0
versionLinks:
  v1: components/templates/
  v2: components/overview/
---

Lit 组件是一个可复用的 UI 片段。你可以将 Lit 组件视为一个容器，它拥有某些状态，并根据其状态显示 UI。它还可以响应用户输入、触发事件——任何你期望 UI 组件能做的事情。而且 Lit 组件就是一个 HTML 元素，因此它拥有所有标准的元素 API。

创建一个 Lit 组件涉及许多概念：

- [定义组件](/docs/v3/components/defining/)。Lit 组件以*自定义元素*的形式实现，并在浏览器中注册。

- [渲染](/docs/v3/components/rendering/)。组件有一个*渲染方法*，用于渲染组件的内容。在渲染方法中，你为组件定义一个*模板*。

- [响应式属性](/docs/v3/components/properties/)。属性保存组件的状态。更改组件的一个或多个*响应式属性*会触发更新周期，重新渲染组件。

- [样式](/docs/v3/components/styles/)。组件可以定义*封装样式*来控制自身的外观。

- [生命周期](/docs/v3/components/lifecycle/)。Lit 定义了一组回调函数，你可以覆盖它们以接入组件的生命周期——例如，在元素被添加到页面时运行代码，或者在组件每次更新时运行代码。

以下是一个示例组件：

{% playground-example "v3-docs/components/overview/simple-greeting" "simple-greeting.ts" %}

<div code-language="ts">

{% aside "info"%}

此示例使用了 TypeScript 装饰器。

有关配置 TypeScript 以使用装饰器的更多信息，请参阅[装饰器](/docs/v3/components/decorators)文档。

{% endaside %}

</div>
