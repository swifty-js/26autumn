---
title: 测试
eleventyNavigation:
  key: 测试
  parent: 工具
  order: 4
versionLinks:
  v1: lit-html/tools/#testing
  v2: tools/testing/
---

测试确保你的代码按预期运行，并使你免于繁琐的调试。

有关易于使用的设置（包含完全预配置的测试环境，非常适合测试 Lit 组件），请参阅[入门套件](/docs/v3/tools/starter-kits/)文档。

## 选择测试框架

Lit 是一个标准的现代 JavaScript 库，你几乎可以使用任何 JavaScript 测试框架来测试你的 Lit 代码。有许多流行的选项，包括 [Jest](https://jestjs.io/)、[Karma](https://karma-runner.github.io/)、[Mocha](https://mochajs.org/)、[Jasmine](https://jasmine.github.io/)、[WebdriverIO](https://webdriver.io) 和 [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/)。

为了有效地测试你的 Lit 代码，你需要确保你的测试环境支持以下几点。

### 在浏览器中测试

Lit 组件设计为在浏览器中运行，因此测试应在浏览器环境中进行。专门针对测试 [node](https://nodejs.org/) 代码的工具可能不太适合。

<div class="alert alert-info">
虽然可以通过模拟 DOM 调用在不使用浏览器的情况下进行测试，但我们不推荐这种方法，因为它不会以用户体验代码的方式来测试代码。
</div>

### 支持现代 JavaScript

你使用的测试环境必须支持使用现代 JavaScript，包括使用带有裸模块说明符的模块，或者适当地降级现代 JavaScript。有关更多详细信息，请参阅[旧版浏览器的要求](/docs/v2/tools/requirements/#building-for-legacy-browsers)文档。

### 使用 polyfill

要在旧版浏览器上测试，你的测试环境需要加载一些 polyfill，包括 [web components polyfill](https://github.com/webcomponents/polyfills/tree/master/packages/webcomponentsjs) 和 Lit 的 `polyfill-support` 模块。有关更多详细信息，请参阅 [Polyfill](/docs/v2/tools/requirements/#polyfills) 文档。

## 使用 Web Test Runner { #web-test-runner }

[Web Test Runner](https://modern-web.dev/docs/test-runner/overview/) 专门设计用于使用自定义元素和 shadow DOM 等现代 Web 特性来测试像 Lit 这样的现代 Web 库。请参阅 Web Test Runner 的[入门](https://modern-web.dev/guides/test-runner/getting-started)文档。

为了支持旧版浏览器，你需要按如下方式配置 Web Test Runner：

安装 `@web/dev-server-legacy`：

```bash
npm i @web/dev-server-legacy --save-dev
```

设置 `web-test-runner.config.js`：

```js
import { legacyPlugin } from "@web/dev-server-legacy";

export default {
  /* ... */
  plugins: [
    // 确保此插件始终在最后
    legacyPlugin({
      polyfills: {
        webcomponents: true,
        // 将 lit 的 polyfill-support 模块注入测试文件，
        // 这是与 webcomponents polyfill 交互所必需的
        custom: [
          {
            name: "lit-polyfill-support",
            path: "node_modules/lit/polyfill-support.js",
            test: "!('attachShadow' in Element.prototype)",
            module: false,
          },
        ],
      },
    }),
  ],
};
```

## 使用 WebdriverIO

[WebdriverIO](https://webdriver.io) 是组件测试或端到端测试的一个好选择。它有非常吸引人的优势，如支持[模拟](https://webdriver.io/docs/component-testing/mocking)和[代码覆盖率](https://webdriver.io/docs/component-testing/coverage)报告。

你可以通过以下方式在项目中设置 WebdriverIO：

```bash
npm init wdio@latest ./
```

它将启动一个配置向导，引导你回答一些问题。请确保选择以下内容：

- 你想进行什么类型的测试？<br>组件或单元测试 - 在浏览器中
- 你使用哪个框架来构建组件？<br>Lit

其余问题可以按你的意愿回答。

为了测试组件，你必须在测试开始之前将其渲染到测试页面中，并确保之后进行清理：

```ts
import { expect, $ } from "@wdio/globals";

// Component.ts 包含与以下相同的 <simple-greeting> 组件实现：
// https://lit.dev/docs/components/overview/
import "./components/Component.ts";

describe("Lit Component testing", () => {
  let elem: HTMLElement;

  beforeEach(() => {
    elem = document.createElement("simple-greeting");
  });

  it("should render component", async () => {
    elem.setAttribute("name", "WebdriverIO");
    document.body.appendChild(elem);
    await expect($(elem)).toHaveText("Hello, WebdriverIO!");
  });

  afterEach(() => {
    elem.remove();
  });
});
```

在 WebdriverIO 文档中查找有关[元素断言](https://webdriver.io/docs/api/expect-webdriverio)、在 Shadow DOM 中[查找元素](https://webdriver.io/docs/selectors#deep-selectors)以及[更多](https://webdriver.io/docs/component-testing)的信息。
