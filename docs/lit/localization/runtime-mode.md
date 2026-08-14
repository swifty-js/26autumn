---
title: 运行时本地化模式
eleventyNavigation:
  key: Runtime mode
  parent: Localization
  order: 2
versionLinks:
  v2: localization/runtime-mode/
---

在 Lit Localize 运行时模式下，会为每个语言区域生成一个 JavaScript 或 TypeScript 模块。每个生成的模块包含该语言区域的本地化模板。当你的应用切换语言区域时，会导入该语言区域的模块，并重新渲染所有本地化组件。

有关 Lit Localize 输出模式的比较，请参阅[输出模式](/docs/v3/localization/overview/#output-modes)。

#### 输出示例

```js
// locales/es-419.ts
export const templates = {
  h3c44aff2d5f5ef6b: html`Hola <b>Mundo!</b>`,
};
```

## 使用运行时模式的示例

以下示例演示了一个使用 Lit Localize 运行时模式构建的应用：

{% playground-example "v3-docs/libraries/localization/runtime" "x-greeter.ts" %}

Lit 的 GitHub 仓库包含了 Lit Localize 运行时模式的完整可运行示例
（[JavaScript](https://github.com/lit/lit/tree/main/packages/localize/examples/runtime-js)、
[TypeScript](https://github.com/lit/lit/tree/main/packages/localize/examples/runtime-ts)），
你可以将其用作模板。

## 配置运行时模式

在你的 `lit-localize.json` 配置中，将 `output.mode` 属性设置为 `runtime`，并将 `output.outputDir` 属性设置为你希望生成本地化模板模块的位置。更多详情请参阅[运行时模式设置](/docs/v3/localization/cli-and-config#runtime-mode-settings)。

接下来，将 `output.localeCodesModule` 设置为你选择的一个文件路径。Lit Localize 将在此处生成一个 `.js` 或 `.ts` 模块，该模块将配置文件中的 `sourceLocale` 和 `targetLocales` 设置镜像为导出变量。生成的模块大致如下：

```js
export const sourceLocale = "en";
export const targetLocales = ["es-419", "zh-Hans"];
export const allLocales = ["en", "es-419", "zh-Hans"];
```

最后，在你的 JavaScript 或 TypeScript 项目中，调用 `configureLocalization`，并传入一个包含以下属性的对象：

- `sourceLocale: string`：由你生成的 `output.localeCodesModule` 模块导出的 `sourceLocale` 变量。

- `targetLocales: string[]`：由你生成的 `output.localeCodesModule` 模块导出的 `targetLocales` 变量。

- `loadLocale: (locale: string) => Promise<LocaleModule>`：一个加载本地化模板的函数。返回一个 Promise，该 Promise 解析为给定语言区域代码对应的已生成本地化模板模块。有关可在此处使用的函数示例，请参阅[加载语言区域模块的方式](#approaches-for-loading-locale-modules)。

`configureLocalization` 返回一个包含以下属性的对象：

- `getLocale`：返回活动语言区域代码的函数。如果新的语言区域已开始加载，`getLocale` 将继续返回上一个语言区域的代码，直到新的语言区域完成加载。

- `setLocale`：开始将活动语言区域切换到给定代码的函数，并返回一个在新语言区域加载完成时解析的 Promise。用法示例：

例如：

```js
import { configureLocalization } from "@lit/localize";
// 通过 output.localeCodesModule 生成
import { sourceLocale, targetLocales } from "./generated/locale-codes.js";

export const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: (locale) => import(`/locales/${locale}.js`),
});
```

## 自动重新渲染

要在每次活动语言区域切换时自动触发组件的重新渲染，在编写 JavaScript 时请在 `constructor` 中应用 `updateWhenLocaleChanges` 函数，或在编写 TypeScript 时在你的类上应用 `@localized` 装饰器。

{% switchable-sample %}

```ts
import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import {msg, localized} from '@lit/localize';

@customElement('my-element');
@localized()
class MyElement extends LitElement {
  render() {
    // 每当调用 setLocale() 且该语言区域的模板完成加载后，
    // 此 render() 函数将被重新调用。
    return msg(html`Hello <b>World!</b>`);
  }
}
```

```js
import { LitElement, html } from "lit";
import { msg, updateWhenLocaleChanges } from "@lit/localize";

class MyElement extends LitElement {
  constructor() {
    super();
    updateWhenLocaleChanges(this);
  }

  render() {
    // 每当调用 setLocale() 且该语言区域的模板完成加载后，
    // 此 render() 函数将被重新调用。
    return msg(html`Hello <b>World!</b>`);
  }
}
customElements.define("my-element", MyElement);
```

{% endswitchable-sample %}

## 状态事件

每当语言区域切换开始、完成或失败时，`lit-localize-status` 事件都会在 `window` 上触发。你可以使用此事件来：

- 在无法使用 `@localized` 装饰器时进行重新渲染（例如直接使用 Lit 的 `render` 函数时）。

- 在语言区域切换开始时立即进行渲染，即使尚未完成加载（例如显示加载指示器）。

- 执行其他与本地化相关的任务（例如设置语言区域偏好 cookie）。

### 事件类型

`detail.status` 字符串属性告诉你发生了哪种状态变化，其值可以是 `loading`、`ready` 或 `error`：

<dl class="params">
  <dt class="paramName">loading</dt>
  <dd class="paramDetails">
    <p>一个新的语言区域已开始加载。</p>
    <p><code>detail</code> 对象包含：</p>
    <ul>
      <li><code>loadingLocale: string</code>：已开始加载的语言区域的代码。</li>
    </ul>
    <p>如果在第一个语言区域完成加载之前请求了第二个语言区域，则会派发一个新的 <code>loading</code> 事件，并且不会为第一个请求派发 <code>ready</code> 或 <code>error</code> 事件。</p>
    <p><code>loading</code> 状态之后可以跟随 <code>ready</code>、<code>error</code> 或 <code>loading</code> 状态。</p>
  </dd>

  <dt class="paramName">ready</dt>
  <dd class="paramDetails">
    <p>一个新的语言区域已成功加载并准备好进行渲染。</p>
    <p><code>detail</code> 对象包含：</p>
    <ul>
      <li><code>readyLocale: string</code>：已成功加载的语言区域的代码。</li>
    </ul>
    <p><code>ready</code> 状态之后只能跟随 <code>loading</code> 状态。</p>
  </dd>

  <dt class="paramName">error</dt>
  <dd class="paramDetails">
    <p>一个新的语言区域加载失败。</p>
    <p><code>detail</code> 对象包含：</p>
    <ul>
      <li><code>errorLocale: string</code>：加载失败的语言区域的代码。</li>
      <li><code>errorMessage: string</code>：语言区域加载失败的错误消息。</li>
    </ul>
    <p><code>error</code> 状态之后只能跟随 <code>loading</code> 状态。</p>
  </dd>
</dl>

### 使用状态事件的示例

```ts
// 每当新的语言区域正在加载时显示/隐藏进度指示器，
// 并在每次新的语言区域成功加载时重新渲染应用。
window.addEventListener("lit-localize-status", (event) => {
  const spinner = document.querySelector("#spinner");

  if (event.detail.status === "loading") {
    console.log(`Loading new locale: ${event.detail.loadingLocale}`);
    spinner.removeAttribute("hidden");
  } else if (event.detail.status === "ready") {
    console.log(`Loaded new locale: ${event.detail.readyLocale}`);
    spinner.setAttribute("hidden", "");
    renderApplication();
  } else if (event.detail.status === "error") {
    console.error(
      `Error loading locale ${event.detail.errorLocale}: ` +
        event.detail.errorMessage,
    );
    spinner.setAttribute("hidden", "");
  }
});
```

## 加载语言区域模块的方式

Lit Localize 允许你以任何方式加载语言区域模块，因为你可以将任何函数作为 `loadLocale` 选项传入。以下是几种常见的模式：

### 延迟加载

使用[动态导入](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports)仅在语言区域变为活动状态时才加载它。这是一个很好的默认选择，因为它最大限度地减少了用户需要下载和执行的代码量。

```js
import { configureLocalization } from "@lit/localize";
import { sourceLocale, targetLocales } from "./generated/locale-codes.js";

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: (locale) => import(`/locales/${locale}.js`),
});
```

### 预加载

在页面加载时开始预加载所有语言区域。仍然使用动态导入以确保在获取语言区域模块时不会阻塞页面上的其余脚本。

```js
import { configureLocalization } from "@lit/localize";
import { sourceLocale, targetLocales } from "./generated/locale-codes.js";

const localizedTemplates = new Map(
  targetLocales.map((locale) => [locale, import(`/locales/${locale}.js`)]),
);

const { getLocale, setLocale } = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale) => localizedTemplates.get(locale),
});
```

### 静态导入

使用[静态导入](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import)以阻塞页面上其他脚本的方式预加载所有语言区域。

<div class="alert alert-warning">

通常不推荐这种方式，因为它会导致在页面上的其余脚本能够执行之前，获取和执行超出必要量的代码，从而阻塞交互性。仅在你的应用非常小、必须以单个 JavaScript 文件分发、或存在其他阻止使用动态导入的限制时才使用此方式。

</div>

```js
import {configureLocalization} from '@lit/localize';
import {sourceLocale, targetLocales} from './generated/locale-codes.js';

import * as templates_es_419 from './locales/es-419.js';
import * as templates_zh_hans from './locales/zh-Hans.js';
...

const localizedTemplates = new Map([
  ['es-419', templates_es_419],
  ['zh-Hans', templates_zh_hans],
  ...
]);

const {getLocale, setLocale} = configureLocalization({
  sourceLocale,
  targetLocales,
  loadLocale: async (locale) => localizedTemplates.get(locale),
});
```
