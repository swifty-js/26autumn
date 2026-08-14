---
title: 内部样式
---

这是一个*仅限内部使用*的页面，用于演示我们文档的样式。

## 文本

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

## 标题

<div style="padding:var(--docs-margin-top) 2em; border:2px solid #eaeaea;">

# 标题 1

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

## 标题 2

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

### 标题 3

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

#### 标题 4

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

</div>

## 链接

这是一个指向另一个页面或章节的[链接](#)。[这也是](#)。

## 强调

这是**粗体**。
这是*斜体*。
这是***粗斜体***。

## 有序列表

1. 这是第一项
2. 这是第二项
   1. 这是一个嵌套项

## 无序列表

- 这是第一项
- 这是第二项
  - 这是一个嵌套项

## 表格

| 浏览器               | 模块说明符 | 现代 JS  | Web 组件 |
| :------------------- | :--------: | :------: | :------: |
| Chrome               |     90     |    80    |    67    |
| Safari               |  需要构建  |    13    |    10    |
| Firefox              |  需要构建  |    72    |    63    |
| Edge (Chromium)      |  需要构建  |    80    |    79    |
| Edge 14-18           |  需要构建  | 需要构建 | polyfill |
| Internet Explorer 11 |  需要构建  | 需要构建 | polyfill |

## 旁注

<div class="alert alert-info">

**信息性旁注优先级较低。** 这些注释补充了与主要讨论相关的周边信息。可能有趣但并非必不可少。它们以引导性标题开头，以便读者可以快速评估该旁注是否与其关注的内容相关。它们在视觉上应该看起来不如周围的文本重要。

</div>

## 警告

<div class="alert alert-warning">

**不要用烤面包机洗澡。** 烤面包机不会喜欢这样，你也不会。这些更高优先级的告诫应该更加醒目。

</div>

## 图片

![继承图，显示 LitElement 继承自 ReactiveElement，而 ReactiveElement 又继承自 HTMLElement。LitElement 负责模板渲染；ReactiveElement 负责管理响应式属性和 attribute；HTMLElement 是所有原生 HTML 元素和自定义元素共享的标准 DOM 接口。](/images/docs/components/lit-element-inheritance.png)

## 行内代码

组件的 `render` 方法可以返回任何 Lit 能够渲染的内容。通常，它返回一个 `TemplateResult` 对象（与 `html` 标签函数返回的类型相同）。

## 无高亮代码片段

```
我只是一些代码
```

## 高亮代码片段

```ts
import { LitElement, html, css, customElement } from 'lit-element';

@customElement('my-element');
class MyElement extends LitElement {
  static style = css`
    my-element #id .class [attr~="foo"] ::part(bar) {
      border: 1px solid blue;
    }
  `;

  render() {
    return html`
      Lorem ipsum ${value}!
      <button attribute="value"></button>
      <button attribute=${value}></button>
      <button .property=${value}></button>
      <button ?boolean=${value}></button>
      <button @event=${this.handler}></button>
    `;
  }
}
```

## 可切换示例

{% switchable-sample %}

```ts
@customElement("my-element")
class MyElement {
  @property({ attribute: false })
  foo;
}
```

```js
class MyElement {
  static properties = {
    foo: { attribute: false },
  };
}
customElements.define("my-element", MyElement);
```

{% endswitchable-sample %}

## 交互式代码片段

{% playground-example "v3-docs/templates/define" "my-element.ts" %}

## 完整 IDE

{% playground-ide "v3-docs/templates/define" %}
