---
title: 列表
eleventyNavigation:
  key: 列表
  parent: 模板
  order: 4
versionLinks:
  v1: components/templates/#use-properties-loops-and-conditionals-in-a-template
  v2: templates/lists/
---

你可以使用标准的 JavaScript 结构来创建重复模板。

Lit 还提供了一个 `repeat` 指令来更高效地构建某些类型的动态列表。

## 渲染数组

当子位置的表达式返回数组或可迭代对象时，Lit 会渲染数组中的所有项：

{% playground-example "v3-docs/templates/lists-arrays/" "my-element.ts" %}

在大多数情况下，你会希望将数组项转换为更有用的形式。

## 使用 map 重复模板

要渲染列表，你可以使用 `map` 将数据列表转换为模板列表：

{% playground-example "v3-docs/templates/lists-map/" "my-element.ts" %}

请注意，此表达式返回一个 `TemplateResult` 对象数组。Lit 会渲染子模板和其他值的数组或可迭代对象。

## 使用循环语句重复模板

你还可以构建一个模板数组并将其传递给模板表达式。

```ts
render() {
  const itemTemplates = [];
  for (const i of this.items) {
    itemTemplates.push(html`<li>${i}</li>`);
  }

  return html`
    <ul>
      ${itemTemplates}
    </ul>
  `;
}
```

## repeat 指令

在大多数情况下，使用循环或 `map` 是构建重复模板的高效方式。但是，如果你想重新排序一个大型列表，或通过添加和删除单个条目来变更它，这种方法可能涉及更新大量 DOM 节点。

`repeat` 指令可以在这里提供帮助。

repeat 指令基于用户提供的键执行列表的高效更新：

```ts
repeat(items, keyFunction, itemTemplate);
```

其中：

- `items` 是一个数组或可迭代对象。
- `keyFunction` 是一个接受单个项作为参数并返回该项的唯一键的函数。
- `itemTemplate` 是一个模板函数，接受该项及其当前索引作为参数，并返回一个 `TemplateResult`。

例如：

{% playground-example "v3-docs/templates/lists-repeat/" "my-element.ts" %}

如果你重新排序 `employees` 数组，`repeat` 指令会重新排列现有的 DOM 节点。

要将此与 Lit 对列表的默认处理进行比较，考虑反转一个大型名称列表：

- 对于使用 `map` 创建的列表，Lit 维护列表项的 DOM 节点，但重新赋值。
- 对于使用 `repeat` 创建的列表，`repeat` 指令重新排列*现有的* DOM 节点，因此代表第一个列表项的节点会移动到最后位置。

### 何时使用 map 或 repeat

哪种方式更高效取决于你的用例：

- 如果更新 DOM 节点比移动它们更昂贵，使用 `repeat` 指令。

- 如果 DOM 节点具有*不*由模板表达式控制的状态，使用 `repeat` 指令。

  例如，考虑这个列表：

  ```js
  html`${this.users.map(
    (user) => html` <div><input type="checkbox" /> ${user.name}</div> `,
  )}`;
  ```

  复选框具有选中或未选中状态，但它不受模板表达式控制。

  如果你在用户选中一个或多个复选框后重新排序列表，Lit 会更新与复选框关联的名称，但不会更新复选框的状态。

如果这两种情况都不适用，使用 `map` 或循环语句。
