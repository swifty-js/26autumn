---
title: 转换本地化模式
eleventyNavigation:
  key: Transform mode
  parent: Localization
  order: 3
versionLinks:
  v2: localization/transform-mode/
---

在 Lit Localize 转换模式下，会为每个语言区域生成一个单独的文件夹。每个文件夹包含你的应用在该语言区域下的完整独立构建，其中所有运行时 `@lit/localize` 代码已被移除：

- `msg` 调用被替换为每个语言区域中字符串或模板的静态本地化版本。
- `str` 标签被移除。
- `@lit/localize` 的导入被移除。
- 模板经过优化，通过尽可能将表达式折叠到父模板中来移除不必要的表达式。

例如，给定以下源代码：

```js
// src/launch-button.js
import {msg} from '@lit/localize';

render() {
  return html`<button>${msg('Launch rocket')}</button>`
}
```

将生成以下文件：

```js
// locales/en/launch-button.js
render() {
  return html`<button>Launch rocket</button>`
}

// locales/es-419/launch-button.js
render() {
  return html`<button>Lanza cohete</button>`
}
```

## 配置转换模式

在你的 `lit-localize.json` 配置中，将 `mode` 属性设置为 `transform`，并将 `output.outputDir` 属性设置为你希望生成本地化应用文件夹的位置。更多详情请参阅[转换模式设置](/docs/v3/localization/cli-and-config#transform-mode-settings)。

在你的 JavaScript 或 TypeScript 项目中，可以选择性地调用 `configureTransformLocalization`，并传入一个包含以下属性的对象：

- `sourceLocale: string`：源模板所使用的语言区域。以语言区域代码的形式指定（例如：`"en"`）。

`configureTransformLocalization` 返回一个包含以下属性的对象：

- `getLocale`：返回活动语言区域代码的函数。

例如：

```js
import { configureTransformLocalization } from "@lit/localize";

export const { getLocale } = configureTransformLocalization({
  sourceLocale: "en",
});
```

## 设置初始语言区域

在转换模式下，活动语言区域由你加载的 JavaScript 包决定。如何在页面加载时确定加载哪个包由你自行决定。

例如，如果你的应用的语言区域反映在 URL 路径中，你可以在 HTML 文件中包含一个内联脚本，该脚本检查 URL 并插入适当的 `<script>` 标签：

<div class="alert alert-warning">

在动态选择脚本名称时，务必验证你的语言区域代码。下面的示例是安全的，因为只有在匹配到我们已知的语言区域代码之一时才会加载脚本，但如果我们的匹配逻辑不够精确，可能会导致 bug 或注入不安全 JavaScript 的攻击。

</div>

```js
import { allLocales } from "./generated/locales.js";

const url = new URL(window.location.href);
const unsafeLocale = url.searchParams.get("locale");
const locale = allLocales.includes(unsafeLocale) ? unsafeLocale : "en";

const script = document.createElement("script");
script.type = "module";
script.src = `/${locale}.js`;
document.head.appendChild(script);
```

为了获得更好的性能，你可以在服务器端将适当的 script 标签静态渲染到你的 HTML 文件中。这可以让浏览器尽早开始下载你的脚本。

## 切换语言区域

在转换模式下，`setLocale` 函数不可用。取而代之的是，重新加载页面，以便下一次加载时选择不同的语言区域包。

例如，以下 `locale-picker` 自定义元素在从下拉列表中选择新的语言区域时会加载一个新的 URL：

{% switchable-sample %}

```ts
import {LitElement, html} from 'lit';
import {customElement} from 'lit/decorators.js';
import {getLocale} from './localization.js';
import {allLocales} from './generated/locales.js';

@customElement('locale-picker');
export class LocalePicker extends LitElement {
  render() {
    return html`
      <select @change=${this.localeChanged}>
        ${allLocales.map(
          (locale) =>
            html`<option value=${locale} selected=${locale === getLocale()}>
              ${locale}
            </option>`
        )}
      </select>
    `;
  }

  localeChanged(event: Event) {
    const newLocale = (event.target as HTMLSelectElement).value;
    const url = new URL(window.location.href);
    if (url.searchParams.get('locale') !== newLocale) {
      url.searchParams.set('locale', newLocale);
      window.location.assign(url.href);
    }
  }
}
```

```js
import { LitElement, html } from "lit";
import { getLocale } from "./localization.js";
import { allLocales } from "./generated/locales.js";

export class LocalePicker extends LitElement {
  render() {
    return html`
      <select @change=${this.localeChanged}>
        ${allLocales.map(
          (locale) =>
            html`<option value=${locale} selected=${locale === getLocale()}>
              ${locale}
            </option>`,
        )}
      </select>
    `;
  }

  localeChanged(event) {
    const newLocale = event.target.value;
    const url = new URL(window.location.href);
    if (url.searchParams.get("locale") !== newLocale) {
      url.searchParams.set("locale", newLocale);
      window.location.assign(url.href);
    }
  }
}
customElements.define("locale-picker", LocalePicker);
```

{% endswitchable-sample %}

## Rollup 集成

如果你使用 <a href="https://rollupjs.org/" target="_blank"
rel="noopener">Rollup</a>，并且更倾向于使用集成方案而不是单独运行 `lit-localize build` 命令，可以在你的 Rollup 配置中从 `@lit/localize-tools/lib/rollup.js` 导入 `localeTransformers` 函数。

此函数生成一个 `{locale, transformer}` 对象数组，你可以将其与
<a href="https://github.com/rollup/plugins/tree/master/packages/typescript/#transformers" target="_blank" rel="noopener">transformers</a>
选项配合使用（该选项属于
<a href="https://www.npmjs.com/package/@rollup/plugin-typescript" target="_blank" rel="noopener">@rollup/plugin-typescript</a>），
为每个语言区域生成一个单独的包。

<div class="alert alert-info">

如果你使用的是 JavaScript，不必在意这里使用了 TypeScript 编译器。Lit Localize 依赖 TypeScript 编译器来解析、分析和转换你的源代码，但它同样能处理纯 JavaScript 文件！

</div>

以下 `rollup.config.mjs` 为你的每个语言区域生成一个压缩后的包，输出到 `./bundled/<locale>/` 目录中：

{% switchable-sample %}

```ts
import typescript from "@rollup/plugin-typescript";
import { localeTransformers } from "@lit/localize-tools/lib/rollup.js";
import resolve from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

// 默认从 ./lit-localize.json 读取配置。
// 传入一个路径以从其他位置读取配置。
const locales = localeTransformers();

export default locales.map(({ locale, localeTransformer }) => ({
  input: `src/index.ts`,
  plugins: [
    typescript({
      transformers: {
        before: [localeTransformer],
      },
    }),
    resolve(),
    terser(),
  ],
  output: {
    file: `bundled/${locale}/index.js`,
    format: "es",
  },
}));
```

```js
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";
import summary from "rollup-plugin-summary";
import { localeTransformers } from "@lit/localize-tools/lib/rollup.js";

// 默认从 ./lit-localize.json 读取配置。
// 传入一个路径以从其他位置读取配置。
const locales = localeTransformers();

export default locales.map(({ locale, localeTransformer }) => ({
  input: `src/index.js`,
  plugins: [
    typescript({
      transformers: {
        before: [localeTransformer],
      },
      // 指定要输出的 ES 版本和模块格式。参阅
      // https://www.typescriptlang.org/docs/handbook/tsconfig-json.html
      tsconfig: "jsconfig.json",
      // 转换后的模块在 Rollup 打包之前会输出到的临时目录。
      outDir: "bundled/temp",
      // @rollup/plugin-typescript 始终只匹配 ".ts" 文件，
      // 无论 jsconfig.json 中的设置如何。
      include: ["src/**/*.js"],
    }),
    resolve(),
    terser(),
    summary({
      showMinifiedSize: false,
    }),
  ],
  output: {
    file: `bundled/${locale}/index.js`,
    format: "es",
    sourcemap: true,
  },
}));
```

{% endswitchable-sample %}
