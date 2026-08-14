---
title: Lit SSR 服务器使用
eleventyNavigation:
  key: Server usage
  parent: Server rendering
  order: 2
versionLinks:
  v2: ssr/server-usage/
---

{% labs-disclaimer %}

## 渲染模板

服务器渲染从使用 `@lit-labs/ssr` 包中提供的服务器专用 `render()` 函数渲染 Lit *模板*开始。

render 函数的签名是：

```ts
render(value: unknown, renderInfo?: Partial<RenderInfo>): RenderResult
```

通常 `value` 是由 Lit 模板表达式产生的 `TemplateResult`，例如：

```ts
html`<h1>Hello</h1>`;
```

模板可以包含自定义元素。如果自定义元素在服务器上已定义，它们将依次被渲染，连同它们的模板一起。

```ts
import { render } from "@lit-labs/ssr";
import { html } from "lit";
// 在服务器上导入 `my-element` 以对其进行服务器渲染。
import "./my-element.js";

const result = render(html`
  <h1>Hello SSR!</h1>
  <my-element></my-element>
`);
```

要渲染单个元素，你渲染一个只包含该元素的模板：

```ts
import { html } from "lit";
import "./my-element.js";

const result = render(html`<my-element></my-element>`);
```

### 处理 RenderResult

`render()` 返回一个 `RenderResult`：一个可以流式传输或拼接为字符串的值的可迭代对象。

`RenderResult` 可以包含字符串、嵌套的渲染结果，或字符串或渲染结果的 Promise。并非所有渲染结果都包含 Promise——当自定义元素执行异步任务（如获取数据）时可能会出现 Promise——但由于 `RenderResult` 可以包含 Promise，将其处理为字符串或 HTTP 响应*可能*是一个异步操作。

即使 `RenderResult` 可以包含 Promise，它仍然是一个同步可迭代对象，而不是异步可迭代对象。这是因为同步可迭代对象比异步可迭代对象更快，而且许多服务器渲染不需要异步渲染，因此不应该承担异步可迭代对象的开销。

在同步可迭代对象中允许 Promise 创建了一种混合同步/异步迭代协议。当消费 `RenderResult` 时，你必须检查每个值是否是 Promise 或可迭代对象，并根据需要进行等待或递归。

`@lit-labs/ssr` 包含三个工具来为你完成此操作：

- `RenderResultReadable`
- `collectResult()`
- `collectResultSync()`

#### `RenderResultReadable`

`RenderResultReadable` 是一个 Node `Readable` 流实现，提供来自 `RenderResult` 的值。这可以通过管道传输到 `Writable` 流中，或传递给 Koa 等 Web 服务器框架。

这是在与流式 HTTP 服务器或其他支持流的 API 集成时处理 SSR 结果的首选方式。

```ts
import { render } from "@lit-labs/ssr";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable.js";
import { html } from "lit";

// 使用 Koa 进行流式传输
app.use(async (ctx) => {
  const result = render(html`<my-element></my-element>`);
  ctx.type = "text/html";
  ctx.body = new RenderResultReadable(result);
});
```

#### `collectResult()`

`collectResult(result: RenderResult): Promise<string>`

`collectResult()` 是一个异步函数，接收一个 `RenderResult` 并将其拼接为字符串。它会等待 Promise 并递归进入嵌套的可迭代对象。

##### 示例

```ts
import { render } from "@lit-labs/ssr";
import { collectResult } from "@lit-labs/ssr/lib/render-result.js";
import { html } from "lit";

const result = render(html`<my-element></my-element>`);
const contents = await collectResult(result);
```

#### `collectResultSync()`

`collectResultSync(result: RenderResult): Promise<string>`

`collectResultSync()` 是一个同步函数，接收一个 `RenderResult` 并将其拼接为字符串。它会递归进入嵌套的可迭代对象，但当遇到 Promise 时会*抛出异常*。

因为此函数不支持异步渲染，建议仅在无法等待异步函数时使用它。

```ts
import { render } from "@lit-labs/ssr";
import { collectResultSync } from "@lit-labs/ssr/lib/render-result.js";
import { html } from "lit";

const result = render(html`<my-element></my-element>`);
// 如果 `result` 包含 Promise 则抛出异常！
const contents = collectResultSync(result);
```

### 渲染选项

`render()` 的第二个参数是一个 `RenderInfo` 对象，用于向组件和子模板传递选项和当前渲染状态。

调用者可以设置的主要选项有：

- `deferHydration`：控制顶层自定义元素是否添加 `defer-hyddration` 特性以表示元素不应自动水合。默认为 `false`，因此顶层元素*会*自动水合。
- `elementRenderers`：用于渲染自定义元素的 `ElementRenderer` 类数组。默认情况下包含 `LitElementRenderer` 来渲染 Lit 元素。可以设置它以包含自定义的 `ElementRenderer` 实例（文档即将推出），或设置为空数组以完全禁用自定义元素渲染。

## 在 VM 模块或全局作用域中运行 SSR

为了在 Node 中渲染自定义元素，必须首先使用全局 `customElements` API 定义和注册它们，这是一个仅限浏览器的功能。因此，当 Lit 在 Node 中运行时，它会自动使用一组在服务器上渲染 Lit 所需的最少 DOM API，并定义 `customElements` 全局对象。（有关模拟 API 的列表，请参阅 [DOM 模拟](/docs/v3/ssr/dom-emulation)。）

Lit SSR 提供了两种不同的方式来在服务器端渲染自定义元素：在[全局作用域](#global-scope)中渲染或通过 [VM 模块](#vm-module)渲染。VM 模块利用 Node 的 [`vm.Module`](https://nodejs.org/api/vm.html#class-vmmodule) API，它允许在 V8 虚拟机上下文中运行代码。这两种方法的主要区别在于全局状态（如自定义元素注册表）如何共享。

在全局作用域中渲染时，将定义一个共享的 `customElements` 注册表，并在所有渲染请求之间共享，以及你的组件代码可能设置的任何其他全局状态。

使用 VM 模块渲染允许每个渲染请求拥有自己的上下文，具有与主 Node 进程分离的独立全局对象。`customElements` 注册表仅在该上下文中安装，其他全局状态也将隔离到该上下文中。VM 模块是一个实验性的 Node 功能。

| 全局作用域                                                                                                                                                | VM 模块                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优点：<ul><li>易于使用。可以直接导入组件模块并使用模板调用 `render()`。</li></ul>缺点：<ul><li>自定义元素在不同渲染请求之间的共享注册表中注册。</li></ul> | 优点：<ul><li>在不同渲染请求之间隔离上下文。</li></ul>缺点：<ul><li>使用不太直观。需要编写并指定一个包含要调用函数的模块文件。</li><li>由于模块图需要每个请求重新求值，速度较慢。</li></ul> |

### 全局作用域

使用全局作用域时，你只需使用模板调用 `render()` 获取 `RenderResult` 并将其传递给你的服务器：

```js
import { render } from "@lit-labs/ssr";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable.js";
import { myTemplate } from "./my-template.js";

// ...

// 例如在 Koa 中间件中
app.use(async (ctx) => {
  const ssrResult = render(myTemplate(data));
  ctx.type = "text/html";
  ctx.body = new RenderResultReadable(ssrResult);
});
```

### VM 模块

Lit 还提供了一种将应用代码加载到独立的 VM 上下文中并从中渲染的方式，该上下文拥有自己的全局对象。

```js
// render-template.js
import { render } from "@lit-labs/ssr";
import { myTemplate } from "./my-template.js";

export const renderTemplate = (someData) => {
  return render(myTemplate(someData));
};
```

{% switchable-sample %}

```ts
// server.js
import {ModuleLoader} from '@lit-labs/ssr/lib/module-loader.js';
import {RenderResultReadable} from '@lit-labs/ssr/lib/render-result-readable.js';

// ...

// 例如在 Koa 中间件中
app.use(async (ctx) => {
  const moduleLoader = new ModuleLoader();
  const importResult = await moduleLoader.importModule(
    './render-template.js',  // 要在 VM 上下文中加载的模块
    import.meta.url          // 模块的引用 URL
  );
  const {renderTemplate} = importResult.module.namespace
    as typeof import('./render-template.js')
  const ssrResult = await renderTemplate({some: "data"});
  ctx.type = 'text/html';
  ctx.body = new RenderResultReadable(ssrResult);
});
```

```js
// server.js
import { ModuleLoader } from "@lit-labs/ssr/lib/module-loader.js";
import { RenderResultReadable } from "@lit-labs/ssr/lib/render-result-readable.js";

// ...

// 例如在 Koa 中间件中
app.use(async (ctx) => {
  const moduleLoader = new ModuleLoader();
  const importResult = await moduleLoader.importModule(
    "./render-template.js", // 要在 VM 上下文中加载的模块
    import.meta.url, // 模块的引用 URL
  );
  const { renderTemplate } = importResult.module.namespace;
  const ssrResult = await renderTemplate({ some: "data" });
  ctx.type = "text/html";
  ctx.body = new RenderResultReadable(ssrResult);
});
```

{% endswitchable-sample %}

注意：使用此功能需要 Node 14+ 并向 Node 传递 `--experimental-vm-modules` 标志，因为它使用实验性 VM 模块来创建模块兼容的 VM 上下文。
