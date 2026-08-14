---
title: 服务器端渲染（SSR）
eleventyNavigation:
  key: Overview
  parent: Server rendering
  order: 1
versionLinks:
  v2: ssr/overview/
---

{% labs-disclaimer %}

服务器端渲染（SSR）是一种在组件的 JavaScript 实现加载和执行之前，生成并提供组件 HTML（包括 shadow DOM 和样式）的技术。

你可以出于多种原因使用 SSR：

- 性能。某些站点如果先渲染静态 HTML 而不等待 JavaScript 加载，然后（可选地）加载页面的 JavaScript 并水合组件，可以渲染得更快。
- SEO 和 Web 爬虫。虽然主要搜索引擎的 Web 爬虫使用完整的启用 JavaScript 的浏览器来渲染页面，但并非所有 Web 爬虫都支持 JavaScript。
- 健壮性。即使 JavaScript 加载失败或用户禁用了 JavaScript，静态 HTML 仍然可以渲染。

有关服务器端渲染概念和技术的更深入介绍，请参阅 web.dev 上的 [Rendering on the Web](https://web.dev/rendering-on-the-web/)。

Lit 通过 [Lit SSR](https://github.com/lit/lit/tree/main/packages/labs/ssr#readme) 包支持服务器端渲染。Lit SSR 在非浏览器的 JavaScript 环境（如 Node）中将 Lit 组件和模板渲染为静态 HTML 标记。它无需完全模拟浏览器的 DOM 即可工作，并利用 Lit 的声明式模板格式来实现快速性能、实现低首字节时间，并支持流式传输。

Lit SSR 是一个底层库，你可以直接在基于 Node 的服务器或站点生成器中使用它。查看 [Lit SSR 在 Koa 服务器中使用的示例](https://stackblitz.com/edit/lit-ssr-global?file=src/server.js)。

还有一些已发布的集成使 Lit SSR 可以开箱即用：

- [Lit Eleventy 插件](https://github.com/lit/lit/tree/main/packages/labs/eleventy-plugin-lit#lit-labseleventy-plugin-lit)
- [Lit 的 Astro 集成](https://docs.astro.build/en/guides/integrations-guide/lit/)
- [Rocket](https://rocket.modern-web.dev/)
- 使用 [@lit-labs/nextjs](https://www.npmjs.com/package/@lit-labs/nextjs) 的 Next.js pages router
- 使用 [nuxt-ssr-lit](https://www.npmjs.com/package/nuxt-ssr-lit) 的 Nuxt 3
- 还有更多正在开发中！

## 库的状态

此库正在积极开发中，有一些我们希望能解决的显著限制：

- 不支持异步组件工作。参见 issue [#2469](https://github.com/lit/lit/issues/2469)。
- 仅支持使用 shadow DOM 的 Lit 组件。参见 issue [#3080](https://github.com/lit/lit/issues/3080)。
- 声明式 shadow DOM 尚未在所有主要浏览器中实现，但有一个 polyfill 可用。在[客户端使用](/docs/v3/ssr/client-usage#lit-components)中阅读更多相关信息。
- 关于 `ElementRendererRegistry` 与其他自定义元素互操作的公开讨论也尚待进行。
