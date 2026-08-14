---
title: 在 Markdown 中使用 Lark Mvc
sidebar_position: 7
description: 在文档中嵌入 Lark Mvc 动态组件和模板语法
---

# 在 Markdown 中使用 Lark Mvc

由于 Lark Docs 的 Markdown 解析器启用了 `html: true`，你可以在 Markdown 中直接使用 HTML——包括 Lark Mvc 的模板语法和组件挂载指令。这让你能够在静态文档中嵌入动态交互组件。

## 基本原理

Markdown 编译流程：

```
.md 文件 → markdown-it 解析（html: true）→ HTML 字符串
→ 运行时渲染为 DOM → mountZone() 扫描 v-lark 属性 → 挂载子视图
```

关键点：markdown-it 的 `html: true` 配置让 HTML 标签原样通过，不做转义。运行时，Lark Mvc 的 `mountZone()` 会扫描渲染后的 DOM，发现 `v-lark` 属性的元素并挂载对应的 View。

## 嵌入子视图

### 基本语法

使用 `v-lark` 属性挂载一个已注册的 Lark Mvc View：

```html
<div v-lark="path/to/view"></div>
```

运行时，框架会：

1. 在 DOM 中发现 `v-lark` 属性
2. 通过 `view-registry` 查找对应的 View setup 函数
3. 创建 Frame 并挂载 View
4. View 渲染自己的模板到该 DOM 元素内

### 传递参数

使用 `*prop` 语法向子视图传递参数：

```html
<div v-lark="path/to/view" *title="Hello" *count="42"></div>
```

在 View 的 `assign()` 方法中接收：

```ts
export default defineView((ctx) => {
  return {
    template,
    assign(options) {
      // options.title === "Hello"
      // options.count === "42"（字符串）
    },
  };
});
```

::: warning
通过 HTML 属性传递的值始终是**字符串**。如需传递数字或对象，需在 View 内部进行类型转换。
:::

### 实际示例：嵌入 TOC 组件

Lark Docs 的 `[[toc]]` 指令实际上就是编译为：

```html
<div v-lark="theme/toc" *inline="true"></div>
```

你也可以直接在 Markdown 中写这个 HTML 达到同样效果。

## 使用模板语法

由于编译后的 HTML 在运行时由 Lark Mvc 模板引擎处理，你可以在 HTML 中使用 Lark 模板语法：

### 变量插值

```html
<div>{{=variableName}}</div>
```

::: warning
在 Markdown 中直接使用 `{{=expr}}` 时，变量必须在当前 View 的 `updater.data` 中存在。对于文档页面，内容 HTML 是静态渲染的，通常不包含动态数据上下文。此语法主要在你自定义的 View 模板中使用。
:::

### 条件渲染

```html
{{if condition}}
<p>条件为真时显示</p>
{{else}}
<p>条件为假时显示</p>
{{/if}}
```

### 循环

```html
{{forOf list as item index}}
<div>{{=index}}: {{=item.name}}</div>
{{/forOf}}
```

### 事件绑定

```html
<button @click="handleClick">点击</button>
```

## 适用场景

### 场景一：嵌入交互式演示

注册一个演示 View，然后在 Markdown 中引用：

```ts
// app/views/demo-counter.ts
import { defineView, useState } from "@mm/lark-docs";
import template from "./demo-counter.html";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

在 Markdown 中：

```markdown
## 计数器示例

下面是一个交互式计数器组件：

<div v-lark="demo-counter"></div>
```

### 场景二：动态数据展示

```ts
// app/views/api-status.ts
import { defineView, useState, useEffect } from "@mm/lark-docs";

export default defineView((ctx) => {
  const [getStatus, setStatus] = useState("status", "loading");

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => setStatus(data.status));
  }, []);

  return { template };
});
```

### 场景三：自定义文档组件

创建可复用的文档组件（如 API 参数表格、版本徽章等）：

```html
<!-- 在 Markdown 中使用 -->
<div v-lark="components/api-badge" *version="2.0" *status="stable"></div>
```

## 注册自定义 View

要在 Markdown 中通过 `v-lark` 引用自定义 View，需要先注册：

```ts
// app/boot.ts
import { registerViewClass } from "@mm/lark-docs";
import DemoCounter from "./views/demo-counter";

// 在 registerThemeViews() 之后注册
registerViewClass("demo-counter", DemoCounter);
```

注册后即可在任何 Markdown 文件中使用：

```html
<div v-lark="demo-counter"></div>
```

## 与 Lark 模板编译的关系

需要区分两种情况：

### 情况一：.html 模板文件（构建时编译）

View 的 `.html` 模板文件在构建时由 `@mm/lark-mvc/compiler` 编译为 JavaScript 渲染函数。模板中的 `{{}}` 语法在此阶段处理。

### 情况二：Markdown 中的 HTML（运行时处理）

Markdown 中的 HTML 在构建时仅被 markdown-it 解析为 HTML 字符串。运行时，这段 HTML 被插入 DOM 后，`mountZone()` 扫描 `v-lark` 属性并挂载子视图。

::: danger 重要区别
Markdown 中的 `{{=expr}}` **不会**被 Lark 模板编译器处理——因为 Markdown 编译和模板编译是两个独立的管道。如果你需要在文档中展示动态数据，应该通过 `v-lark` 挂载一个 View，让 View 的模板（.html 文件）处理动态渲染。
:::

## 事件委托

Lark Mvc 使用**捕获阶段事件委托**——所有 DOM 事件都委托到 `document.body` 上统一处理。这意味着：

- 在 Markdown 中嵌入的交互组件无需手动绑定事件
- View 的 `events` 对象中声明的事件处理器自动生效
- 事件命名格式：`"handlerName<eventType>"`

```ts
events: {
  "handleClick<click>"(e) { /* ... */ },
  "handleInput<input>"(e) { /* ... */ },
  "handleKeydown<keydown>"(e) { /* ... */ },
}
```

## 注意事项

1. **View 必须已注册**：`v-lark` 引用的 View 路径必须在 `registerViewClass()` 中注册过
2. **异步加载**：如果使用 `Framework.config.require` 配置了异步模块加载器，View 可以按需加载
3. **生命周期**：嵌入的 View 随宿主页面渲染而挂载，页面切换时自动卸载
4. **样式隔离**：嵌入组件的样式需要自行管理（Tailwind 工具类或组件级 CSS）
5. **SSR 不兼容**：由于是纯客户端渲染，嵌入的动态组件不支持 SSR
