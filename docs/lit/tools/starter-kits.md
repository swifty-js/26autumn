---
title: 入门套件
eleventyNavigation:
  key: 入门套件
  parent: 工具
  order: 7
versionLinks:
  v1: getting-started/#component-project
  v2: tools/starter-kits/
---

Lit 入门套件是可复用 Lit 组件的项目模板，可以发布供他人使用。

要在本地开始开发组件，你可以使用以下入门项目之一：

- [Lit JavaScript 入门项目](https://github.com/lit/lit-element-starter-js)
- [Lit TypeScript 入门项目](https://github.com/lit/lit-element-starter-ts)

两个项目都定义了一个 Lit 组件。它们还添加了一组可选工具，用于开发、代码检查和测试组件：

- 用于管理依赖的 Node.js 和 npm。_需要 Node.js 10 或更高版本。_
- 本地开发服务器 [Web Dev Server](https://modern-web.dev/docs/dev-server/overview/)。
- 使用 [ESLint](https://eslint.org/) 和 [lit-analyzer](https://www.npmjs.com/package/lit-analyzer) 进行代码检查。
- 使用 [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/) 进行测试。
- 使用 [web-component-analyzer](https://www.npmjs.com/package/web-component-analyzer) 和 [eleventy](https://www.11ty.dev/) 构建的静态文档站点。

这些工具都不是使用 Lit 所*必需*的。它们代表了一组可能的工具，可以提供良好的开发体验。

<div class="alert alert-info">

替代起点。作为官方 Lit 入门项目的替代，Open WC 项目有一个使用 Lit 的 web components [项目生成器](https://open-wc.org/docs/development/generator/)。Open WC 脚本会询问一系列问题并为你搭建项目。

</div>

### 下载入门项目

在本地尝试项目的最快方式是将入门项目之一下载为 zip 文件。

1.  从 GitHub 下载入门项目为 zip 文件：
    - [JavaScript 入门项目](https://github.com/lit/lit-element-starter-js/archive/main.zip)
    - [TypeScript 入门项目](https://github.com/lit/lit-element-starter-ts/archive/main.zip)

1.  解压缩 zip 文件。

1.  安装依赖。

    ```bash
    cd <project folder>
    npm i
    ```

<div class="alert alert-info">

想要放在 GitHub 上？如果你熟悉 git，你可能想为你的入门项目创建一个 GitHub 仓库，而不是仅仅下载 zip 文件。你可以使用 [GitHub 模板仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template)功能从 [JavaScript 入门项目](https://github.com/PolymerLabs/lit-element-starter-js)或 [TypeScript 入门项目](https://github.com/PolymerLabs/lit-element-starter-ts)创建你自己的仓库。然后克隆你的新仓库并安装依赖，如上所述。

</div>

### 试用你的项目

1.  如果你使用的是 TypeScript 版本的入门项目，构建你项目的 JavaScript 版本：

    ```bash
    npm run build
    ```

    要监视文件并在文件修改时重新构建，在单独的 shell 中运行以下命令：

    ```bash
    npm run build:watch
    ```

    如果你使用的是 JavaScript 版本的入门项目，则不需要构建步骤。

1.  运行开发服务器：

    ```bash
    npm run serve
    ```

1.  在浏览器标签页中打开项目演示页面。例如：

    [http://localhost:8000/dev/](http://localhost:8000/dev/)

    你的服务器可能使用不同的端口号。请检查终端输出中的 URL 以获取正确的端口号。

### 编辑你的组件

编辑你的组件定义。你编辑的文件取决于你使用的语言：

- JavaScript。编辑项目根目录中的 `my-element.js` 文件。
- TypeScript。编辑 `src` 目录中的 `my-element.ts` 文件。

代码中需要注意的几件事：

- 代码为组件定义了一个类（`MyElement`）并将其注册为名为 `<my-element>` 的自定义元素。

  {% switchable-sample %}

  ```ts
  @customElement("my-element")
  export class MyElement extends LitElement {
    /* ... */
  }
  ```

  ```js
  export class MyElement extends LitElement {
    /* ... */
  }

  customElements.define("my-element", MyElement);
  ```

  {% endswitchable-sample %}

- 组件的 `render` 方法定义了一个[模板](/docs/v3/templates/overview/)，它将作为组件的一部分被渲染。在这种情况下，它包含一些文本、一些数据绑定和一个按钮。有关更多信息，请参阅[模板](/docs/v3/templates/overview/)。

  ```js
  export class MyElement extends LitElement {
    // ...
    render() {
      return html`
        <h1>Hello, ${this.name}!</h1>
        <button @click=${this._onClick}>Click Count: ${this.count}</button>
        <slot></slot>
      `;
    }
  }
  ```

- 组件定义了一些属性。组件会响应这些属性的变化（例如，在必要时重新渲染模板）。有关更多信息，请参阅[属性](/docs/v3/components/properties/)。

  {% switchable-sample %}

  ```ts
  export class MyElement extends LitElement {
    // ...
    @property({ type: String })
    name = "World";
    //...
  }
  ```

  ```js
  export class MyElement extends LitElement {
    // ...
    static properties = {
      name: { type: String },
    };

    constructor() {
      super();
      this.name = "World";
    }
    // ...
  }
  ```

  {% endswitchable-sample %}

### 重命名你的组件

你可能想将组件名从 "my-element" 更改为更合适的名称。使用 IDE 或其他允许你在整个项目中进行全局搜索和替换的文本编辑器最容易做到这一点。

1.  如果你使用的是 TypeScript 版本，删除生成的文件：

    ```bash
    npm run clean
    ```

1.  在项目的所有文件中搜索并替换 "my-element" 为你的新组件名（`node_modules` 文件夹除外）。
1.  在项目的所有文件中搜索并替换 "MyElement" 为你的新类名（`node_modules` 文件夹除外）。
1.  重命名源文件和测试文件以匹配新的组件名：

    JavaScript：
    - `src/my-element.js`
    - `src/test/my-element_test.js`

    TypeScript：
    - `src/my-element.ts`
    - `src/test/my-element_test.ts`

1.  如果你使用的是 TypeScript 版本，重新构建项目：

    ```bash
    npm run build
    ```

1.  测试并确保你的组件仍然正常工作：

    ```bash
    npm run serve
    ```

### 后续步骤

准备好为你的组件添加功能了吗？前往[组件](/docs/v3/components/overview/)了解如何构建你的第一个 Lit 组件，或查看[模板](/docs/v3/templates/overview/)了解编写模板的详细信息。

有关运行测试和使用其他工具的详细信息，请参阅入门项目的 README：

- [TypeScript 项目 README](https://github.com/PolymerLabs/lit-element-starter-ts/blob/master/README.md)
- [JavaScript 项目 README](https://github.com/PolymerLabs/lit-element-starter-js/blob/master/README.md)

有关将组件发布到 `npm` 的指南，请参阅[发布](/docs/v3/tools/publishing/)。
