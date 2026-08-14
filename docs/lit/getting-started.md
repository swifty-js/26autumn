---
title: 入门
eleventyNavigation:
  key: Getting Started
  parent: Introduction
  order: 3
versionLinks:
  v1: getting-started/
  v2: getting-started/
---

开始使用 Lit 的方式有很多种，从我们的 Playground 和交互式教程到安装到现有项目中。

## Lit Playground

通过交互式 playground 和示例立即开始。从"[Hello World](/playground)"开始，然后自定义它或继续查看更多示例。

## 交互式教程

参加我们的[分步教程](/tutorials/intro-to-lit)，在几分钟内学习如何构建一个 Lit 组件。

## Lit 入门套件

我们提供了 TypeScript 和 JavaScript 组件入门套件，用于创建独立的可复用组件。参阅[入门套件](/docs/v3/tools/starter-kits/)。

## 从 npm 本地安装

Lit 可通过 npm 以 `lit` 包的形式获取。

```sh
npm i lit
```

然后在 JavaScript 或 TypeScript 文件中导入：

{% switchable-sample %}

```ts
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
```

```js
import { LitElement, html } from "lit";
```

{% endswitchable-sample %}

## 使用打包文件

Lit 也以预构建的单文件打包形式提供。这些打包文件是为了在开发工作流方面提供更大的灵活性：例如，如果你更愿意下载单个文件而不是使用 npm 和构建工具。这些打包文件是标准的 JavaScript 模块，没有任何依赖——任何现代浏览器都应该能够在 `<script type="module">` 中导入和运行这些打包文件，如下所示：

```js
import {
  LitElement,
  html,
} from "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js";
```

<div class="alert alert-warning">

如果你使用 npm 管理客户端依赖，你应该使用 [`lit` 包](#install-locally-from-npm)，而不是这些打包文件。这些打包文件有意地将 Lit 的大部分或全部内容合并到单个文件中，这可能导致你的页面下载超出实际需要的代码量。

</div>

要浏览这些打包文件，请前往 <https://cdn.jsdelivr.net/gh/lit/dist/> 并使用下拉菜单进入特定版本的页面。在该页面上，每个可用的打包类型都会有一个目录。有两种类型的打包文件：

<dl class="params">
  <dt class="paramName">core</dt>
  <dd class="paramDetails">
    <a href="https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js">
      https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js
    </a>
    <br>
    <code>core</code> 导出的内容与
    <a href="https://github.com/lit/lit/blob/main/packages/lit/src/index.ts">
    <code>lit</code> 包的主模块</a>相同。
  </dd>

  <dt class="paramName">all</dt>
  <dd class="paramDetails">
    <a href="https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js">
      https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js
    </a>
    <br>
    <code>all</code> 导出了 <code>core</code> 中的所有内容，外加
    <a href="https://github.com/lit/lit/blob/main/packages/lit/src/index.all.ts">
    <code>lit</code> 中的大多数其他模块</a>。
    <br>
    注意，来自 <code>lit/static-html.js</code> 的 <code>html</code> 和 <code>svg</code> 导出分别被别名为 <code>staticHtml</code> 和 <code>staticSvg</code>，以避免冲突。
  </dd>
  </dd>
</dl>

## 将 Lit 添加到现有项目

有关将 Lit 添加到现有项目或应用的说明，请参阅[将 Lit 添加到现有项目](/docs/v3/tools/adding-lit)。

## Open WC 项目生成器

Open WC 项目提供了一个[项目生成器](https://open-wc.org/docs/development/generator/)，可以使用 Lit 搭建应用项目的脚手架。
