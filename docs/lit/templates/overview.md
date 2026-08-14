---
title: 模板概述
eleventyNavigation:
  key: 概述
  parent: 模板
  order: 1
versionLinks:
  v1: components/templates/
  v2: templates/overview/
---

{% todo %}

如果时间允许，按照大纲添加一个关于处理输入的新页面。

{% endtodo %}

Lit 模板使用带有 `html` 标签的 JavaScript 模板字面量编写。字面量的内容大部分是纯声明式 HTML：

```js
html`<h1>Hello ${name}</h1>`;
```

模板语法可能看起来像是在做字符串插值。但使用带标签的模板字面量时，浏览器会将字符串数组（模板的静态部分）和表达式数组（动态部分）传递给标签函数。Lit 利用这一点来构建模板的高效表示，因此它只需重新渲染模板中发生变化的部分。

Lit 模板具有极强的表现力，允许你以多种方式渲染动态内容：

- [表达式](/docs/v3/templates/expressions/)：模板可以包含称为*表达式*的动态值，可用于渲染属性、文本、属性、事件处理程序，甚至其他模板。
- [条件](/docs/v3/templates/conditionals/)：表达式可以使用标准 JavaScript 流程控制来渲染条件内容。
- [列表](/docs/v3/templates/lists/)：使用标准 JavaScript 循环和数组技术将数据转换为模板数组来渲染列表。
- [内置指令](/docs/v3/templates/directives/)：指令是可以扩展 Lit 模板功能的函数。该库包含一组内置指令来帮助满足各种渲染需求。
- [自定义指令](/docs/v3/templates/custom-directives/)：你还可以编写自己的指令来根据需要自定义 Lit 的渲染。

## 独立模板

你也可以在 Lit 组件之外使用 Lit 的模板库进行独立模板化。详情请参阅[独立 lit-html 模板](/docs/v3/libraries/standalone-templates)。
