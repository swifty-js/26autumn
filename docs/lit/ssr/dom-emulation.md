---
title: Lit SSR DOM 模拟
eleventyNavigation:
  key: DOM emulation
  parent: Server rendering
  order: 5
versionLinks:
  v2: ssr/dom-emulation/
---

{% labs-disclaimer %}

在 Node 中运行时，Lit 会自动导入并使用一组 DOM 垫片（shim），并定义 `customElements` 全局对象。仅实现了定义和注册组件所需的最少 DOM 接口。这些包括一些关键的 DOM 类和一个大致可用的 `CustomElementRegistry`。

✅ 表示该项已实现，功能上与浏览器中相同。

<!-- TODO(augustinekim) Consider replacing emojis below with icons https://github.com/lit/lit.dev/pull/880#discussion_r944821511 -->

| 属性                    | 说明                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Element`               | ⚠️ 部分实现 <table><tbody><tr><td>`attributes`</td><td>✅</td><tr><td>`shadowRoot`</td><td>⚠️ 如果使用 `{mode: 'open'}` 调用了 `attachShadow()`，则返回 `{host: this}`</td><tr><td>`setAttribute()`</td><td>✅</td><tr><td>`removeAttribute()`</td><td>✅</td><tr><td>`hasAttribute()`</td><td>✅</td><tr><td>`attachShadow()`</td><td>⚠️ 返回 `{host: this}`</td><tr><td>`getAttribute()`</td><td>✅</td></tr></tbody></table> |
| `HTMLElement`           | ⚠️ 空类                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `CustomElementRegistry` | <table><tbody><tr><td>`define()`</td><td>✅</td></tr><tr><td>`get()`</td><td>✅</td></tr></tbody></table>                                                                                                                                                                                                                                                                                                                       |
| `customElements`        | `CustomElementRegistry` 的实例                                                                                                                                                                                                                                                                                                                                                                                                  |
