---
title: Lit Labs
eleventyNavigation:
  key: Lit Labs
  parent: 相关库
  order: 3
  labs: true
versionLinks:
  v2: libraries/labs/
---

Lit Labs 是 Lit 正在开发中的包的总称，我们正在积极征集反馈。虽然我们鼓励在实际项目中使用以帮助反馈流程，但请注意：

- Lit Labs 项目发布在 `@lit-labs` npm 作用域下。
- 破坏性变更可能比非 labs 包更频繁地发生，但它们仍然会遵循标准的语义化版本控制准则，所有变更都会发布到 CHANGELOG 文件中。
- 虽然我们努力及时解决所有 bug，但非 labs 项目中的 bug 通常比 labs 项目中的 bug 获得更高的优先级。
- 当一个 Lit Labs 项目准备好从 labs 毕业时，我们将开始在 `@lit` 作用域下发布它。（例如，`@lit-labs/task` 毕业为 `@lit/task`。）一旦一个包毕业，它在 `@lit` 作用域下的第一个版本将与 `@lit-labs` 中的最新版本匹配——但只有 `@lit` 版本会收到后续更新。
- 我们可能会决定弃用某个 Lit Labs 项目。在这种情况下，我们会通知社区，并在 npm 包中添加弃用警告。被弃用的包将至少获得 6 个月的 bug 修复支持。历史 labs 包的记录将保留在此页面上。

目前正在征集以下 Labs 包的反馈：

<style>
  .labs-table-links {
    font-size: 0.9em;
    line-height: 1.5;
  }
</style>

<table class="directory">
<thead><tr><th>包</th><th>描述</th><th>链接</th></tr></thead>
<tbody>
<tr class="subheading"><td colspan=3>即将毕业</td></tr>

<tr>
<td>

[scoped-registry-mixin](https://www.npmjs.com/package/@lit-labs/scoped-registry-mixin)

</td>
<td>

用于 Lit 的混入，与实验性的 [Scoped CustomElementRegistry polyfill](https://github.com/webcomponents/polyfills/tree/master/packages/scoped-custom-element-registry) 集成。

</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/scoped-registry-mixin#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3364 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fscoped-registry-mixin%5D "Issues")

</td>
</tr>

<tr class="subheading"><td colspan=3>开发中</td></tr>

<tr>
<td>

[eleventy-plugin-lit](https://www.npmjs.com/package/@lit-labs/eleventy-plugin-lit)

</td>
<td>

一个用于 [Eleventy](https://www.11ty.dev) 的插件，在构建时预渲染 Lit 组件，并支持可选的水合。

</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/eleventy-plugin-lit#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3356 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Feleventy-plugin-lit%5D "Issues")

</td>
</tr>

<tr>
<td>

[motion](https://www.npmjs.com/package/@lit-labs/motion)

</td>
<td>用于 Lit 模板的动画辅助工具。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/motion#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3351 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fmotion%5D "Issues")

</td>
</tr>

<tr>
<td>

[observers](https://www.npmjs.com/package/@lit-labs/observers)

</td>
<td>一组便于使用平台观察器对象的响应式控制器。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/observers#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3355 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fobservers%5D "Issues")

</td>
</tr>

<tr>
<td>

[signals](https://www.npmjs.com/package/@lit-labs/signals)

</td>
<td>TC39 Signals 提案 polyfill 与 Lit 的集成。</td>
<td class="labs-table-links">

[📄&nbsp;文档](/docs/data/signals/ "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/4779 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fsignals%5D "Issues")

</td>
</tr>

<tr>
<td>

[ssr](https://www.npmjs.com/package/@lit-labs/ssr)

</td>
<td>用于服务端渲染 Lit 模板和组件的包。</td>
<td class="labs-table-links">

[📄&nbsp;文档](/docs/v3/ssr/overview "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3353 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fssr%5D "Issues")

</td>
</tr>

<tr>
<td>

[testing](https://www.npmjs.com/package/@lit-labs/testing)

</td>
<td>包含 Lit 测试工具的包，包括生成服务端渲染的测试夹具。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/testing#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3359 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Ftesting%5D "Issues")

</td>
</tr>

<tr>
<td>

[virtualizer](https://www.npmjs.com/package/@lit-labs/virtualizer)

</td>
<td>为 Lit 提供基于视口的虚拟化（包括虚拟滚动）的包。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/virtualizer#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3362 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fvirtualizer%5D "Issues")

</td>
</tr>

<tr class="subheading"><td colspan=3>原型阶段</td></tr>

<tr>
<td>

[analyzer](https://www.npmjs.com/package/@lit-labs/analyzer)

</td>
<td>Lit 的静态分析器。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/analyzer#readme "Docs")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fanalyzer%5D "Issues")

</td>
</tr>

<tr>
<td>

[cli](https://www.npmjs.com/package/@lit-labs/cli)

</td>
<td>Lit 的命令行工具。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/cli#readme "Docs")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fcli%5D "Issues")

</td>
</tr>

<tr>
<td>

[compiler](https://www.npmjs.com/package/@lit-labs/compiler)

</td>
<td>用于优化 Lit 模板的编译器。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/compiler#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/4117 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fcompiler%5D "Issues")

</td>
</tr>

<tr>
<td>

[preact-signals](https://www.npmjs.com/package/@lit-labs/preact-signals)

</td>
<td>Preact Signals 与 Lit 的集成。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/preact-signals#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/4115 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Fpreact-signals%5D "Issues")

</td>
</tr>

<tr>
<td>

[router](https://www.npmjs.com/package/@lit-labs/router)

</td>
<td>以响应式控制器形式提供的面向组件的路由 API。</td>
<td class="labs-table-links">

[📄&nbsp;文档](https://github.com/lit/lit/tree/main/packages/labs/router#readme "Docs")<br>[💬&nbsp;反馈](https://github.com/lit/lit/discussions/3354 "Feedback")<br>[🐞&nbsp;问题](https://github.com/lit/lit/issues?q=is%3Aissue+is%3Aopen+in%3Atitle+%5Blabs%2Frouter%5D "Issues")

</td>
</tr>

</tbody>
</table>
