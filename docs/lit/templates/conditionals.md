---
title: 条件
eleventyNavigation:
  key: 条件
  parent: 模板
  order: 3
versionLinks:
  v1: components/templates/#use-properties-loops-and-conditionals-in-a-template
  v2: templates/conditionals/
---

由于 Lit 利用普通的 JavaScript 表达式，你可以使用标准的 JavaScript 控制流结构（如[条件运算符](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_Operator)、函数调用以及 `if` 或 `switch` 语句）来渲染条件内容。

JavaScript 条件还允许你组合嵌套的模板表达式，你甚至可以将模板结果存储在变量中以供其他地方使用。

## 使用条件（三元）运算符的条件

使用条件运算符 `?` 的三元表达式是添加内联条件的绝佳方式：

```ts
render() {
  return this.userName
    ? html`Welcome ${this.userName}`
    : html`Please log in <button>Login</button>`;
}
```

## 使用 if 语句的条件

你可以在模板外部使用 if 语句来表达条件逻辑，计算要在模板内部使用的值：

```ts
render() {
  let message;
  if (this.userName) {
    message = html`Welcome ${this.userName}`;
  } else {
    message = html`Please log in <button>Login</button>`;
  }
  return html`<p class="message">${message}</p>`;
}
```

或者，你可以将逻辑提取到单独的函数中以简化模板：

```ts
getUserMessage() {
  if (this.userName) {
    return html`Welcome ${this.userName}`;
  } else {
    return html`Please log in <button>Login</button>`;
  }
}
render() {
  return html`<p>${this.getUserMessage()}</p>`;
}
```

## 缓存模板结果：cache 指令

在大多数情况下，JavaScript 条件就是条件模板所需的全部。但是，如果你在大型复杂模板之间切换，你可能希望节省每次切换时重新创建 DOM 的开销。

在这种情况下，你可以使用 `cache` _指令_。cache 指令会缓存当前未渲染的模板的 DOM。

```ts
render() {
  return html`${cache(this.userName ?
    html`Welcome ${this.userName}`:
    html`Please log in <button>Login</button>`)
  }`;
}
```

更多信息请参阅 [cache 指令](/docs/v3/templates/directives/#cache)。

## 条件性地不渲染任何内容 { #conditionally-rendering-nothing }

有时，你可能想在条件运算符的某个分支中不渲染任何内容。这通常用于子表达式，有时也需要用于属性表达式。

对于子表达式，值 `undefined`、`null`、空字符串（`''`）以及 Lit 的 [nothing](/docs/v3/api/templates/#nothing) 哨兵值都不会渲染任何节点。更多信息请参阅[移除子内容](/docs/v3/templates/expressions/#removing-child)。

此示例在值存在时渲染它，否则不渲染任何内容：

```ts
render() {
  return html`<user-name>${this.userName ?? nothing}</user-name>`;
}
```

对于属性表达式，Lit 的 [nothing](/docs/v3/api/templates/#nothing) 哨兵值会移除该属性。更多信息请参阅[移除属性](/docs/v3/templates/expressions/#removing-attribute)。

此示例条件性地渲染 `aria-label` 属性：

```ts
html`<button aria-label="${this.ariaLabel || nothing}"></button>`;
```
