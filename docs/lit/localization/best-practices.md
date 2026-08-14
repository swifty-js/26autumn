---
title: 本地化最佳实践
eleventyNavigation:
  key: Best practices
  parent: Localization
  order: 5
versionLinks:
  v2: localization/best-practices/
---

## 确保在渲染时重新求值

每次调用 `msg` 函数时，它都会返回给定字符串或 Lit 模板在活动语言区域下的版本。然而，这个结果只是一个普通的字符串或模板；它本身并不具备在语言区域变化时自动重新渲染的能力。

因此，以能够确保每次 Lit 的 `render` 方法运行时都会重新求值的方式来编写 `msg` 调用是非常重要的。这样，当语言区域发生变化时，就会返回最新语言区域对应的正确字符串或模板。

一个容易在此处犯错的情况是在本地化属性默认值时。下面这种写法可能看起来很自然：

```js
// 不要这样做！
label = msg('Default label')

render() {
  return html`<button>${this.label}</button>`;
}
```

然而，上述模式没有提供任何机会让默认标签在语言区域变化时得到更新。默认值将停留在元素实例化时恰好处于活动状态的语言区域所对应的版本。

一个简单的修复方法是将默认值的回退逻辑直接移到 render 方法中：

```js
render() {
  return html`<button>${this.label ?? msg('Default label')}</button>`;
}
```

或者，可以使用自定义的 getter/setter 来创建更自然的接口：

{% switchable-sample %}

```ts
private _label?: string;

@property()
get label() {
  return this._label ?? msg('Default label');
}

set label(label: string) {
  this._label = label;
}

render() {
  return html`<button>${this.label}</button>`;
}
```

```js
static properties = {
  label: {}
};

get label() {
  return this._label ?? msg('Default label');
}

set label(label) {
  this._label = label;
}

render() {
  return html`<button>${this.label}</button>`;
}
```

{% endswitchable-sample %}

## 避免不必要的 HTML 标记

虽然 `@lit/localize` 完全支持在本地化模板中嵌入 HTML 标记，但最好尽可能避免这样做。原因如下：

1. 翻译人员处理简单的字符串短语比处理带有嵌入标记的短语更容易。

2. 当标记发生变化时（例如添加一个影响外观但不改变含义的 class），可以避免不必要的重新翻译工作。

3. 切换语言区域时通常会更快，因为需要更新的 DOM 部分更少。同时，你的包中包含的 JavaScript 也会更少，因为通用标记不需要在每个翻译中重复。

不够理想的写法：

```js
render() {
  // 不要这样做！没有理由在这个本地化模板中包含 <button> 标签。
  return msg(html`<button>Launch rocket</button>`);
}
```

理想的写法：

```js
render() {
  // 好多了！现在短语 "Launch rocket" 可以更容易地独立翻译。
  return html`<button>${msg('Launch rocket')}</button>`;
}
```

将模板拆分为更小的部分也会很有帮助：

```js
render() {
  // 不要这样做！
  return msg(html`
  <p>The red button makes the rocket go up.</p>
  <p>The green button makes the rocket do a flip.</p>
  `);
}
```

```js
render() {
  // 更好！翻译人员不需要处理任何标记，并且每个句子都可以独立翻译。
  return html`
  <p>${msg('The red button makes the rocket go up.')}</p>
  <p>${msg('The green button makes the rocket do a flip.')}</p>
  `;
}
```

<div class="alert alert-info">

使用转换模式时，模板会被自动展平，使其尽可能小且高效。转换后，上面的示例不会有任何占位符，因为它知道字符串可以直接合并到 HTML 模板中。

</div>

有些情况下确实应该在本地化模板中包含 HTML。例如，当一个 HTML 标签需要出现在短语的中间时：

```js
render() {
  return msg(html`Lift off in <b>T-${this.countdown}</b> seconds`);
}
```

## 安全地重新导出或重新赋值 localize API

静态分析用于确定你何时在调用 `@lit/localize` 的 `msg` 函数和其他 API，而不是同名的其他函数。

重新导出或重新赋值 `msg` 函数和其他 API 是可行的，大多数情况下这样做都能正常工作。

然而，某些模式可能过于动态，以至于静态分析无法理解。如果某条消息未能被提取，并且你重新赋值或重新导出了 `msg` 函数，这可能就是原因所在。

要强制将一个函数分析为 `@lit/localize` API，你可以在 JavaScript 中使用 JSDoc 的 `@type` 注释，或在 TypeScript 中使用类型转换：

{% switchable-sample %}

```ts
const myMsg = ... as typeof import('@lit/localize').msg;
```

```js
/** @type import('@lit/localize').msg */
const myMsg = ...;
```

{% endswitchable-sample %}
