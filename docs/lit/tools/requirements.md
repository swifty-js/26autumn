---
title: 要求
eleventyNavigation:
  key: 要求
  parent: 工具
  order: 2
versionLinks:
  v1: tools/build/#build-requirements
  v2: tools/requirements/
---

为了与各种浏览器和工具配合使用，关于 Lit 最重要的了解是：

- Lit 以 ES2021 的形式发布。
- Lit 使用"裸模块说明符"来导入模块。
- Lit 使用现代 Web API，如 `<template>`、自定义元素、shadow DOM 和 `ParentNode`。

这些特性被主流浏览器的最新版本（包括 Chrome、Edge、Safari 和 Firefox）和大多数流行工具（如 Rollup、Webpack、Babel 和 Terser）所支持——浏览器对裸模块说明符的支持除外。

在使用 Lit 开发应用时，你的目标浏览器需要原生支持这些特性，或者你的工具需要处理它们。虽然有大量浏览器对现代 Web 特性的支持程度各不相同，但为了简单起见，我们建议将浏览器分为两类：

- 现代浏览器支持 ES2021 和 web components。工具必须解析裸模块说明符。
- 旧版浏览器支持 ES5，不支持 web components 或更新的 DOM API。工具必须编译 JavaScript 并加载 polyfill。

本页概述了如何在开发和生产环境中满足这些要求。

有关满足这些要求的工具和配置建议，请参阅[开发](/docs/v3/tools/development/)、[测试](/docs/v3/tools/testing/)和[为生产环境构建](/docs/v3/tools/production/)。

## 现代浏览器的要求 {#building-for-modern-browsers}

在现代浏览器上使用 Lit 所需的唯一转换是将裸模块说明符转换为浏览器兼容的 URL。

Lit 使用裸模块说明符在其子包之间导入模块，如下所示：

```js
import { html } from "lit-html";
```

现代浏览器目前仅支持从 URL 或相对路径加载模块，不支持引用 npm 包的裸名称，因此构建系统需要处理它们。这应该通过将说明符转换为适用于浏览器中 ES 模块的形式，或者通过生成不同类型的模块作为输出来完成。

Webpack 自动处理裸模块说明符；对于 Rollup，你需要一个插件（[@rollup/plugin-node-resolve](https://github.com/rollup/plugins/tree/master/packages/node-resolve)）。

为什么使用裸模块说明符？裸模块说明符让你无需知道包管理器将包安装在哪里即可导入模块。一个名为 [Import maps](https://github.com/WICG/import-maps) 的标准提案[已经开始在浏览器中发布](https://chromestatus.com/feature/5315286962012160)，它将让浏览器支持裸模块说明符。在此期间，裸导入说明符可以作为构建步骤轻松转换。也有一些支持 import maps 的 polyfill 和模块加载器。

### 现代浏览器细分

所有现代浏览器都会自动更新，用户很可能拥有最近的版本。Lit 和相关库在 Chromium、Safari 和 Firefox 的当前版本以及 Chromium 和 Safari 的前两个主要版本和 Firefox 的扩展支持版本（ESR）上进行了测试。旧版本可能仍然可以工作，但只能尽力而为，不作保证。

## 关于旧版浏览器的说明 {#note-on-legacy-browsers}

Lit 3 未在旧版浏览器上进行测试，具体来说，由于非标准 DOM 行为，不支持 Internet Explorer 11 和 Classic Edge。如果你必须支持旧版浏览器，请考虑使用 Lit 2 并按照[为旧版浏览器构建](/docs/v2/tools/requirements#building-for-legacy-browsers)中所述进行额外的编译和/或使用 polyfill。
