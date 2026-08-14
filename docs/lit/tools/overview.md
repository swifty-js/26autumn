---
title: 工具与工作流概述
eleventyNavigation:
  key: 概述
  parent: 工具
  order: 1
versionLinks:
  v1: lit-html/tools/
  v2: tools/overview/
---

Lit 组件使用纯 JavaScript 或 TypeScript 编写，在现代浏览器上无需额外工具即可开箱即用，因此你*不需要*任何 Lit 专用的编译器、工具或工作流。

然而，Lit 使用了非常*现代的* Web 平台特性，因此确实需要一些工具和 polyfill 才能在旧版浏览器上运行。一些工具也需要配置选项来处理现代 JavaScript。而且，虽然 Lit "只是 JavaScript"，但有一些工具可以让 web components 的开发体验更加出色。

工具与工作流文档涵盖了开发的不同阶段：

- [要求](/docs/v3/tools/requirements/)：工具和浏览器开箱即用 Lit 的通用要求，以及旧版浏览器所需的编译器选项和 polyfill。
- [开发](/docs/v3/tools/development/)：设置本地开发环境，包括开发服务器、代码检查、格式化、语法高亮和类型检查。
- [测试](/docs/v3/tools/testing/)：在现代和旧版浏览器中测试 Lit 项目的建议。
- [发布](/docs/v3/tools/publishing/)：将组件包发布到 npm 的指南。
- [为生产环境构建](/docs/v3/tools/production/)：为生产环境构建应用程序，包括打包、优化以及针对现代和旧版浏览器的差异化服务。
- [入门套件](/docs/v3/tools/starter-kits)：使用我们的 Lit 组件入门套件（JavaScript 和 TypeScript 版本）的说明。
- [添加 Lit](/docs/v3/tools/adding-lit)：安装 Lit 并将其添加到现有项目中。
