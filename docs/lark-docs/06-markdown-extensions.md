---
title: Markdown 扩展
sidebar_position: 5
description: 自定义容器、代码块增强、标题锚点、目录指令等扩展语法
---

# Markdown 扩展

Lark Docs 在标准 Markdown 基础上提供四组扩展语法，通过 markdown-it 插件链实现。插件按以下顺序加载：

1. **anchors** — 标题锚点与永久链接
2. **toc** — `[[toc]]` 目录指令
3. **containers** — `:::` 自定义容器
4. **code-blocks** — 代码块增强

## 标题锚点

### 自动 ID 生成

所有标题（h1-h6）自动生成 `id` 属性，可用于锚点跳转：

```markdown
## 安装步骤
```

输出：

```html
<h2 id="安装步骤" class="scroll-mt-20">安装步骤</h2>
```

`scroll-mt-20` 类确保锚点跳转时内容不被固定导航栏遮挡。

### 永久链接符号

h1 到 h3 级别的标题默认追加 `#` 永久链接：

```html
<h2 id="安装步骤" class="scroll-mt-20">
  安装步骤
  <a class="header-anchor" href="#安装步骤" aria-label="Link to this section"
    >#</a
  >
</h2>
```

### 配置

通过 `markdown.anchor.permalink` 控制是否显示永久链接：

```ts
defineConfig({
  markdown: {
    anchor: {
      permalink: false, // 禁用 # 符号，默认 true
    },
  },
});
```

### Slug 生成规则

锚点 ID 由 `slugify()` 函数生成：

```ts
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "-") // 保留 Unicode 字母和数字
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1"); // 数字开头加下划线
}
```

重复标题通过 `createSlugger()` 去重：

| 出现次序 | 生成 ID  |
| -------- | -------- |
| 第 1 次  | `配置`   |
| 第 2 次  | `配置-1` |
| 第 3 次  | `配置-2` |

## 目录指令

### 语法

在 Markdown 中任意位置插入：

```markdown
[[toc]]
```

大小写不敏感（`[[TOC]]`、`[[Toc]]` 均有效）。

### 编译输出

`[[toc]]` 被编译为 Lark Mvc 子视图挂载点：

```html
<div v-lark="theme/toc" *inline="true"></div>
```

运行时由 `TocView` 组件渲染为标题导航列表。`*inline="true"` 参数标识这是内容区域内的内联 TOC（区别于右侧栏的固定 TOC）。

### 工作原理

1. markdown-it 内联规则在 `emphasis` 之前匹配 `[[toc]]` 文本
2. 生成 `toc_placeholder` token
3. 渲染器将该 token 输出为 `v-lark` 挂载点 HTML
4. 运行时 Lark Mvc 的 `mountZone()` 扫描到 `v-lark` 属性，挂载 TocView

## 自定义容器

### 基本语法

使用 `:::` 围栏创建提示容器：

```markdown
::: tip
这是一条提示信息。
:::

::: warning
这是一条警告信息。
:::

::: danger
这是一条危险提示。
:::

::: details
点击展开详细内容。
:::
```

### 渲染输出

**tip / warning / danger** 渲染为带图标的提示框：

```html
<div class="callout callout-tip">
  <p class="callout-title">
    <svg>...</svg>
    <!-- lucide 图标 -->
    TIP
  </p>
  <p>这是一条提示信息。</p>
</div>
```

**details** 渲染为可折叠区域：

```html
<details class="callout callout-details">
  <summary class="callout-title">
    <svg>...</svg>
    DETAILS
  </summary>
  <p>点击展开详细内容。</p>
</details>
```

### 自定义标题

在容器类型后添加文本作为自定义标题：

````markdown
::: tip 推荐方案
使用 Lark Mvc 的 `useState` 管理视图状态。
:::

::: details 点击查看完整代码

```typescript
const [getData, setData] = useState("data", []);
```
````

:::

````

### 容器类型与图标

| 类型 | 默认标题 | 图标 | 用途 |
|------|----------|------|------|
| `tip` | TIP | info circle | 提示、建议 |
| `warning` | WARNING | triangle alert | 注意事项 |
| `danger` | DANGER | octagon alert | 危险操作警告 |
| `details` | DETAILS | chevron-right | 可折叠内容 |

### 配置容器标签

通过 `markdown.containers` 自定义默认标签文本：

```ts
defineConfig({
  markdown: {
    containers: {
      tip: { label: "提示" },
      warning: { label: "注意" },
      danger: { label: "危险" },
      details: { label: "详情" },
    },
  },
});
````

配置后，未指定自定义标题的容器将使用配置的标签替代默认的英文大写标题。

### 嵌套内容

容器内支持完整的 Markdown 语法：

````markdown
::: warning 性能注意
在大型列表中使用 `{{forOf}}` 循环时：

1. 避免在循环内创建闭包
2. 使用 `trackBy` 优化 diff

```html
{{forOf list as item index}}
<div>{{=item.name}}</div>
{{/forOf}}
```
````

:::

`````

## 代码块增强

### 语言标签

所有围栏代码块自动包裹在 `.codeblock` 容器中，并通过 `data-lang` 属性显示语言标签：

````markdown
```typescript
const x: number = 42;
`````

````

输出结构：

```html
<div class="codeblock" data-lang="typescript">
  <pre class="shiki github-light">
    <code>...</code>
  </pre>
</div>
```

主题 CSS 通过 `data-lang` 属性在代码块右上角显示语言名称标签。

### 语法高亮

当配置了 `highlight` 选项时，代码块使用 Shiki 进行语法高亮：

```ts
defineConfig({
  highlight: {
    theme: "github-light",
    darkTheme: "github-dark",
  },
});
```

#### 单主题模式

仅设置 `theme` 时，Shiki 生成带内联 `style` 属性的 HTML：

```html
<span style="color:#d73a49">const</span>
```

#### 双主题模式

同时设置 `theme` 和 `darkTheme` 时，Shiki 使用 CSS 变量输出：

```html
<span style="--shiki-light:#d73a49;--shiki-dark:#f97583">const</span>
```

主题 CSS 根据 `.dark` 类切换使用 `--shiki-light` 或 `--shiki-dark` 变量值，实现明暗模式下代码高亮颜色的自动切换。

### 未配置高亮的降级

如果未配置 `highlight` 选项，代码块渲染为纯文本（HTML 转义后输出）：

```html
<div class="codeblock" data-lang="typescript">
  <pre class="codeblock-plain">
    <code>const x: number = 42;</code>
  </pre>
</div>
```

### 未知语言降级

如果代码块指定的语言未在 Shiki 中加载，自动降级为 `text`（纯文本）模式，不会报错。

### 复制按钮

运行时，Layout 视图在每次页面渲染后调用 `mountCopyButtons()`，为所有 `.codeblock` 元素挂载复制按钮。点击按钮将代码内容复制到剪贴板。

## 链接处理

### 渲染规则

markdown-it 的 `link_open` 渲染器被覆写：

```ts
// 内部链接（以 / 或 # 开头）：原样输出，浏览器默认导航
<a href="/docs/guide">指南</a>

// 外部链接：其他所有 URL，新标签页打开
<a href="https://example.com" target="_blank" rel="noopener noreferrer">外部</a>
```

### 标题滚动偏移

所有标题的 `heading_open` 渲染器添加 `scroll-mt-20` 类：

```html
<h2 id="配置" class="scroll-mt-20">配置</h2>
```

这确保通过锚点链接跳转时，标题不会被固定定位的导航栏遮挡（偏移量约 5rem）。

## 插件配置总览

```ts
defineConfig({
  markdown: {
    anchor: {
      permalink: true,    // h1-h3 显示 # 永久链接
    },
    containers: {
      tip: { label: "提示" },
      warning: { label: "警告" },
      danger: { label: "危险" },
      details: { label: "详情" },
    },
  },
  highlight: {
    theme: "github-light",
    darkTheme: "github-dark",
    languages: ["typescript", "javascript", "bash"],
  },
});
```
````
