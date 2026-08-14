---
title: 为生产环境构建
eleventyNavigation:
  key: 生产环境
  parent: 工具
  order: 6
versionLinks:
  v1: tools/build/
  v2: tools/production/
---

本页重点介绍为使用 Lit 组件的*应用程序*进行生产构建的建议。有关在将可复用的 Lit *组件*发布到 npm 之前对源代码执行的构建步骤的建议，请参阅[发布](/docs/v3/tools/publishing/)。

在构建包含 Lit 组件的应用程序时，你可以使用常见的 JavaScript 构建工具（如 [Rollup](https://rollupjs.org/) 或 [webpack](https://webpack.js.org/)）来准备源代码和依赖，以便在生产环境中提供服务。

有关构建 Lit 代码的完整要求列表（适用于开发和生产环境），请参阅[要求](/docs/v3/tools/requirements/)。

除了这些最低要求之外，本页还描述了在准备生产代码时应考虑的优化，以及一个实现这些优化的具体 Rollup 配置。

## 为生产环境准备代码 {#preparing-code-for-production}

Lit 项目受益于与其他 Web 项目相同的构建时优化。在生产环境中提供 Lit 应用程序时，建议进行以下优化：

- 打包 JavaScript 模块以减少网络请求（例如，使用 [Rollup](https://rollupjs.org/) 或 [webpack](https://webpack.js.org/)）。
- 压缩 JavaScript 代码以获得更小的负载大小（[Terser](https://www.npmjs.com/package/terser) 对 Lit 效果很好，因为它支持现代 JavaScript）。
- [向现代浏览器提供现代代码](https://web.dev/serve-modern-code-to-modern-browsers/)，因为它通常更小更快，并在旧版浏览器上回退到编译后的代码。
- [对静态资源（包括打包的 JavaScript）进行哈希](https://web.dev/love-your-cache/#fingerprinted-urls)，以便更容易进行缓存失效。
- [启用服务端压缩](https://web.dev/reduce-network-payloads-using-text-compression/#data-compression)（如 gzip 或 brotli），以减少传输的字节数。

此外，请注意，由于 Lit 模板定义在 JavaScript 模板字符串字面量中，它们不会被标准 HTML 压缩器处理。添加一个压缩模板字符串字面量中 HTML 的插件可以适度减少代码大小。有几个包可以执行此优化：

- Rollup：[rollup-plugin-minify-html-literals](https://www.npmjs.com/package/rollup-plugin-minify-html-literals?activeTab=readme)
- Webpack：[minify-html-literals-loader](https://www.npmjs.com/package/minify-html-literals-loader)

## 使用 Rollup 构建 {#building-with-rollup}

有许多工具可以用来执行提供 Lit 代码所需的必需和可选构建步骤，Lit 不要求任何特定的工具。然而，我们推荐 Rollup，因为它专为使用标准 ES 模块格式而设计，并输出利用客户端原生模块的最优代码。

有许多方法可以设置 Rollup 来打包你的项目。[Modern Web](https://modern-web.dev/) 项目维护了一个优秀的 Rollup 插件 [`@web/rollup-plugin-html`](https://modern-web.dev/docs/building/rollup-plugin-html/)，它将许多构建应用程序的最佳实践整合到一个易于使用的包中。下面描述了使用此插件的示例配置。

### 仅现代浏览器构建

下面带有注释的 `rollup.config.js` 文件将构建一个满足本页描述的[现代浏览器构建要求](/docs/v3/tools/requirements/#building-for-modern-browsers)和[生产优化](#preparing-code-for-production)的应用程序。此配置适用于可以在不使用 polyfill 的情况下运行 ES2021 JS 的现代浏览器。

所需的 node 模块：

```sh
npm i --save-dev rollup \
  @web/rollup-plugin-html \
  @web/rollup-plugin-copy \
  @rollup/plugin-node-resolve \
  @rollup/plugin-terser \
  rollup-plugin-minify-html-literals \
  rollup-plugin-summary
```

`rollup.config.js:`

```js
// 导入 rollup 插件
import html from "@web/rollup-plugin-html";
import { copy } from "@web/rollup-plugin-copy";
import resolve from "@rollup/plugin-node-resolve";
import { terser } from "@rollup/plugin-terser";
import minifyHTML from "rollup-plugin-minify-html-literals";
import summary from "rollup-plugin-summary";

export default {
  plugins: [
    // 应用程序构建的入口点；可以指定 glob 来为非 SPA 应用
    // 构建多个 HTML 文件
    html({
      input: "index.html",
    }),
    // 将裸模块说明符解析为相对路径
    resolve(),
    // 压缩 HTML 模板字面量
    minifyHTML(),
    // 压缩 JS
    terser({
      ecma: 2021,
      module: true,
      warnings: true,
    }),
    // 打印打包摘要
    summary(),
    // 可选：将任何静态资源复制到构建目录
    copy({
      patterns: ["images/**/*"],
    }),
  ],
  output: {
    dir: "build",
  },
  preserveEntrySignatures: "strict",
};
```

运行 rollup 构建：

```sh
rollup -c
```
