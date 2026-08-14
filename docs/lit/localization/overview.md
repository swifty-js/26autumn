---
title: 本地化
eleventyNavigation:
  key: Overview
  parent: Localization
  order: 1
versionLinks:
  v2: localization/overview/
---

本地化是在你的应用和组件中支持多种语言和地区的过程。Lit 通过 `@lit/localize` 库提供了第一方的本地化支持，该库具有多项优势，使其成为优于第三方本地化库的良好选择：

- 原生支持在本地化模板中使用表达式和 HTML 标记。无需为变量替换引入新的语法和插值运行时——直接使用你已有的模板即可。

- 当语言区域切换时，自动重新渲染 Lit 组件。

- 仅增加 1.27 KiB（压缩 + 压缩后）的额外 JavaScript。

- 可选择为每个语言区域进行编译，将额外的 JavaScript 减少到 0 KiB。

## 安装

安装 `@lit/localize` 客户端库和 `@lit/localize-tools` 命令行工具。

```sh
npm i @lit/localize
npm i -D @lit/localize-tools
```

## 快速开始

1. 将字符串或模板包裹在 `msg` 函数中
   （[详情](#making-strings-and-templates-localizable)）。
2. 创建一个 `lit-localize.json` 配置文件（[详情](#config-file)）。
3. 运行 `lit-localize extract` 以生成 XLIFF 文件（[详情](#extracting-messages)）。
4. 编辑生成的 XLIFF 文件，添加 `<target>` 翻译标签
   （[详情](#translation-with-xliff)）。
5. 运行 `lit-localize build` 以输出字符串和模板的本地化版本
   （[详情](#output-modes)）。

## 使字符串和模板可本地化

要使字符串或 Lit 模板可本地化，请将其包裹在 `msg` 函数中。`msg` 函数返回给定字符串或模板在当前活动语言区域下的版本。

<div class="alert alert-info">

在你尚无任何翻译可用之前，`msg` 会简单地返回原始字符串或模板，因此即使你还没有准备好真正进行本地化，也可以安全地使用它。

</div>

{% switchable-sample %}

```ts
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { msg } from "@lit/localize";

@customElement("my-greeter")
class MyGreeter extends LitElement {
  @property()
  who = "World";

  render() {
    return msg(html`Hello <b>${this.who}</b>`);
  }
}
```

```js
import { html, LitElement } from "lit";
import { msg } from "@lit/localize";

class MyGreeter extends LitElement {
  static properties = {
    who: {},
  };

  constructor() {
    super();
    this.who = "World";
  }

  render() {
    return msg(html`Hello <b>${this.who}</b>`);
  }
}
customElements.define("my-greeter", MyGreeter);
```

{% endswitchable-sample %}

### 消息类型

你通常使用 Lit 渲染的任何字符串或模板都可以被本地化，包括包含动态表达式和 HTML 标记的字符串或模板。

纯字符串：

```js
msg("Hello World");
```

带表达式的纯字符串（有关 `str` 的详情，请参阅[带表达式的字符串](#strings-with-expressions)）：

```js
msg(str`Hello ${name}`);
```

HTML 模板：

```js
msg(html`Hello <b>World</b>`);
```

带表达式的 HTML 模板：

```js
msg(html`Hello <b>${name}</b>`);
```

本地化消息也可以嵌套在 HTML 模板中：

```js
html`<button>${msg("Hello World")}</button>`;
```

### 带表达式的字符串

包含表达式的字符串必须使用 `html` 或 `str` 进行标记才能被本地化。当你的字符串不包含任何 HTML 标记时，应该优先使用 `str` 而非 `html`，因为它的性能开销略小。如果你在包含表达式的字符串上忘记了 `html` 或 `str` 标签，运行 `lit-localize` 命令时会抛出一个错误。

错误写法：
<strike>

```js
import { msg } from "@lit/localize";
msg(`Hello ${name}`);
```

</strike>

正确写法：

```js
import { msg, str } from "@lit/localize";
msg(str`Hello ${name}`);
```

在这些情况下需要使用 `str` 标签，因为未标记的模板字符串字面量在被 `msg` 函数接收之前就会被求值为普通字符串，这意味着动态表达式的值将无法被捕获并替换到字符串的本地化版本中。

## 语言区域代码

语言区域代码是一个标识人类语言的字符串，有时还包含地区、文字体系或其他变体信息。

Lit Localize 不强制要求使用任何特定的语言区域代码体系，但强烈建议使用 <a
href="https://www.w3.org/International/articles/language-tags/index.en"
target="_blank" rel="noopener">BCP 47 语言标签标准</a>。BCP 47 语言标签的一些示例包括：

- en：英语
- es-419：拉丁美洲使用的西班牙语
- zh-Hans：以简体文字书写的中文

### 术语

Lit Localize 定义了若干指代语言区域代码的术语。这些术语在本文档、Lit Localize 配置文件以及 Lit Localize API 中均有使用：

<dl class="params">
  <dt class="paramName">源语言区域（Source locale）</dt>
  <dd class="paramDetails">
    <p>用于在源代码中编写字符串和模板的语言区域。</p>
  </dd>

  <dt class="paramName">目标语言区域（Target locales）</dt>
  <dd class="paramDetails">
    <p>你的字符串和模板可以被翻译成的语言区域。</p>
  </dd>

  <dt class="paramName">活动语言区域（Active locale）</dt>
  <dd class="paramDetails">
    <p>当前正在显示的全局语言区域。</p>
  </dd>
</dl>

## 输出模式

Lit Localize 支持两种输出模式：

- 运行时（Runtime）模式使用 Lit Localize 的 API 在运行时加载本地化消息。

- 转换（Transform）模式通过为每个语言区域构建一个独立的 JavaScript 包来消除 Lit Localize 的运行时。

<div class="alert alert-info">

不确定该使用哪种模式？从运行时模式开始。之后切换模式很容易，因为核心的 `msg` API 是完全相同的。

</div>

### 运行时模式

在运行时模式下，会为每个语言区域生成一个 JavaScript 或 TypeScript 模块。每个模块包含该语言区域的本地化模板。当活动语言区域切换时，会导入该语言区域的模块，并重新渲染所有本地化组件。

运行时模式使语言区域切换非常快速，因为不需要重新加载页面。但是，与转换模式相比，渲染性能会有轻微的性能损耗。

#### 生成输出示例

```js
// locales/es-419.ts
export const templates = {
  hf71d669027554f48: html`Hola <b>Mundo</b>`,
};
```

有关运行时模式的完整详情，请参阅[运行时模式](/docs/v3/localization/runtime-mode)页面。

### 转换模式

在转换模式下，会为每个语言区域生成一个单独的文件夹。每个文件夹包含你的应用在该语言区域下的完整独立构建，其中 `msg` 包装器和所有其他 Lit Localize 运行时代码已被完全移除。

转换模式需要 0 KiB 的额外 JavaScript，渲染速度极快。但是，切换语言区域需要重新加载页面，以便加载新的 JavaScript 包。

#### 生成输出示例

```js
// locales/en/my-element.js
render() {
  return html`Hello <b>World</b>`;
}
```

```js
// locales/es-419/my-element.js
render() {
  return html`Hola <b>Mundo</b>`;
}
```

有关转换模式的完整详情，请参阅[转换模式](/docs/v3/localization/transform-mode)页面。

### 差异对比

<!-- TODO(aomarks) Default CSS doesn't have a margin above table -->
<br>

<table>
<thead>
<tr>
  <th></th>
  <th>运行时模式</th>
  <th>转换模式</th>
</tr>
</thead>

<tbody>
<tr>
  <td>输出</td>
  <td>为每个目标语言区域生成一个动态加载的模块。</td>
  <td>为每个语言区域生成一个独立的应用构建。</td>
</tr>

<tr>
  <td>切换语言区域</td>
  <td>调用 <code>setLocale()</code></td>
  <td>重新加载页面</td>
</tr>

<tr>
  <td>JS 字节数</td>
  <td>1.27 KiB（压缩 + 压缩后）</td>
  <td>0 KiB</td>
</tr>

<tr>
  <td>使模板可本地化</td>
  <td><code>msg()</code></td>
  <td><code>msg()</code></td>
</tr>

<tr>
  <td>配置</td>
  <td><code>configureLocalization()</code></td>
  <td><code>configureTransformLocalization()</code></td>
</tr>

<tr>
  <td>优势</td>
  <td>
    <ul>
      <li>更快的语言区域切换。</li>
      <li>切换语言区域时更少的<em>增量</em>字节数。</li>
    </ul>
  </td>
  <td>
    <ul>
      <li>更快的渲染。</li>
      <li>单个语言区域下更少的字节数。</li>
    </ul>
  </td>
</tr>
</tbody>
</table>

## 配置文件

`lit-localize` 命令行工具会在当前目录中查找名为 `lit-localize.json` 的配置文件。复制粘贴下面的示例即可快速开始，有关所有选项的完整参考，请参阅 [CLI 和配置](/docs/v3/localization/cli-and-config)页面。

<div class="alert alert-info">

如果你使用的是 JavaScript，请将 `inputFiles` 属性设置为你的 `.js` 源文件的位置。如果你使用的是 TypeScript，请将 `tsConfig` 属性设置为你的 `tsconfig.json` 文件的位置，并将 `inputFiles` 留空。

</div>

{% switchable-sample %}

```ts
{
  "$schema": "https://raw.githubusercontent.com/lit/lit/main/packages/localize-tools/config.schema.json",
  "sourceLocale": "en",
  "targetLocales": ["es-419", "zh-Hans"],
  "tsConfig": "./tsconfig.json",
  "output": {
    "mode": "runtime",
    "outputDir": "./src/generated/locales",
    "localeCodesModule": "./src/generated/locale-codes.ts"
  },
  "interchange": {
    "format": "xliff",
    "xliffDir": "./xliff/"
  }
}
```

```js
{
  "$schema": "https://raw.githubusercontent.com/lit/lit/main/packages/localize-tools/config.schema.json",
  "sourceLocale": "en",
  "targetLocales": ["es-419", "zh-Hans"],
  "inputFiles": [
    "src/**/*.js"
  ],
  "output": {
    "mode": "runtime",
    "outputDir": "./src/generated/locales",
    "localeCodesModule": "./src/generated/locale-codes.js"
  },
  "interchange": {
    "format": "xliff",
    "xliffDir": "./xliff/"
  }
}
```

{% endswitchable-sample %}

## 提取消息

运行 `lit-localize extract` 为每个目标语言区域生成一个 <a
href="https://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html" target="_blank"
rel="noopener">XLIFF</a> 文件。XLIFF 是一种被大多数本地化工具和服务支持的 XML 格式。XLIFF 文件将被写入由 `interchange.xliffDir` [配置选项](/docs/v3/localization/cli-and-config/#xliff-mode-settings)指定的目录中。

```sh
lit-localize extract
```

例如，给定以下源代码：

```js
msg("Hello World");
msg(str`Hello ${name}`);
msg(html`Hello <b>World</b>`);
```

则会为每个目标语言区域生成一个 `<xliffDir>/<locale>.xlf` 文件：

```xml
<!-- xliff/es-419.xlf -->

<trans-unit id="s3d58dee72d4e0c27">
  <source>Hello World</source>
</trans-unit>

<trans-unit id="saed7d3734ce7f09d">
  <source>Hello <x equiv-text="${name}"/></source>
</trans-unit>

<trans-unit id="hf71d669027554f48">
  <source>Hello <x equiv-text="&lt;b&gt;"/>World<x equiv-text="&lt;/b&gt;"/></source>
</trans-unit>
```

## 使用 XLIFF 进行翻译

XLIFF 文件可以手动编辑，但更常见的做法是将它们发送给第三方翻译服务，由语言专家使用专业工具进行编辑。

将你的 XLIFF 文件上传到所选的翻译服务后，你最终会收到新的 XLIFF 文件作为响应。新的 XLIFF 文件看起来与你上传的文件完全相同，只是在每个 `<trans-unit>` 中插入了 `<target>` 标签。

当你收到新的翻译 XLIFF 文件时，将它们保存到你配置的 `interchange.xliffDir` 目录中，覆盖原始版本。

```xml
<!-- xliff/es-419.xlf -->

<trans-unit id="s3d58dee72d4e0c27">
  <source>Hello World</source>
  <target>Hola Mundo</target>
</trans-unit>

<trans-unit id="saed7d3734ce7f09d">
  <source>Hello <x equiv-text="${name}"/></source>
  <target>Hola <x equiv-text="${name}"/></target>
</trans-unit>

<trans-unit id="hf71d669027554f48">
  <source>Hello <x equiv-text="&lt;b&gt;"/>World<x equiv-text="&lt;/b&gt;"/></source>
  <target>Hola <x equiv-text="&lt;b&gt;"/>Mundo<x equiv-text="&lt;/b&gt;"/></target>
</trans-unit>
```

## 构建本地化模板

使用 `lit-localize build` 命令将翻译整合回你的应用中。该命令的行为取决于你所配置的[输出模式](#output-modes)。

```sh
lit-localize build
```

有关每种模式的构建工作方式的详情，请参阅[运行时模式](/docs/v3/localization/runtime-mode)和[转换模式](/docs/v3/localization/transform-mode)页面。

## 消息描述

使用 `msg` 函数的 `desc` 选项为你的字符串和模板提供人类可读的描述。这些描述会被大多数翻译工具展示给翻译人员，强烈建议使用它们来帮助解释和提供消息含义的上下文。

```js
render() {
  return html`<button>
    ${msg("Launch", {
      desc: "Button that begins rocket launch sequence.",
    })}
  </button>`;
}
```

描述在 XLIFF 文件中使用 `<note>` 元素来表示。

```xml
<trans-unit id="s512957aa09384646">
  <source>Launch</source>
  <note from="lit-localize">Button that begins rocket launch sequence.</note>
</trans-unit>
```

## 消息 ID

Lit Localize 使用字符串的哈希值自动为每个 `msg` 调用生成一个 ID。

如果两个 `msg` 调用共享相同的 ID，则它们被视为同一条消息，这意味着它们将作为一个整体进行翻译，并且在两个位置将替换为相同的翻译。

例如，以下两个 `msg` 调用位于两个不同的文件中，但由于它们具有相同的内容，因此将被视为同一条消息：

```js
// file1.js
msg("Hello World");

// file2.js
msg("Hello World");
```

### ID 生成

以下内容会影响 ID 的生成：

- 字符串内容
- HTML 标记
- 表达式的位置
- 字符串是否使用了 `html` 标签

以下内容不会影响 ID 的生成：

- 表达式内部的代码
- 表达式的计算值
- 文件位置

例如，以下所有消息共享相同的 ID：

```js
msg(html`Hello <b>${name}</b>`);
msg(html`Hello <b>${this.name}</b>`);
```

但以下消息具有不同的 ID：

```js
msg(html`Hello <i>${name}</i>`);
```

注意，虽然提供[描述](#message-descriptions)不会影响 ID 的生成，但具有相同 ID 但不同描述的多条消息会在分析过程中产生错误，以避免提取的翻译单元中出现歧义。以下写法被视为无效：

```js
msg(html`Hello <b>${name}</b>`);
msg(html`Hello <b>${name}</b>`, { desc: "A friendly greeting" });
```

请确保所有具有相同 ID 的消息也具有相同的描述。

### 覆盖 ID

可以通过为 `msg` 函数指定 `id` 选项来覆盖消息 ID。在某些情况下这可能是必要的，例如当一个相同的字符串具有多种含义时，因为每种含义在另一种语言中可能有不同的写法：

```js
msg("Buffalo", { id: "buffalo-animal-singular" });
msg("Buffalo", { id: "buffalo-animal-plural" });
msg("Buffalo", { id: "buffalo-city" });
msg("Buffalo", { id: "buffalo-verb" });
```
