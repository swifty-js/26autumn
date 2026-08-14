---
title: 写作
sidebar_position: 4
description: 使用 Markdown 编写文档内容
---

# 写作

Lark Docs 使用标准 Markdown 作为写作格式，并通过扩展语法提供丰富的文档排版能力。每个 `.md` 文件在构建时被编译为一个 JS 模块，导出两个命名成员：`pageData`（页面元数据）和 `contentHtml`（渲染后的 HTML 字符串）。没有 default 导出。

## 基本语法

Lark Docs 使用 [markdown-it](https://github.com/markdown-it/markdown-it) 作为 Markdown 解析器，配置为：

```ts
new MarkdownIt({
  html: true, // 允许内联 HTML
  linkify: true, // 自动识别 URL 并转为链接
  typographer: false, // 不启用排版替换
});
```

支持所有标准 Markdown 语法：

### 标题

```markdown
# 一级标题

## 二级标题

### 三级标题

#### 四级标题
```

::: tip
所有标题（h1-h6）都会自动生成锚点 ID，其中一级到三级标题还会追加永久链接符号（`#`），详见 [Markdown 扩展](./06-markdown-extensions#标题锚点)。
:::

### 文本格式

```markdown
**粗体文本**
_斜体文本_
~~删除线~~
`行内代码`
```

### 列表

```markdown
- 无序列表项
- 另一项
  - 嵌套项

1. 有序列表
2. 第二项
```

### 链接和图片

```markdown
[内部链接](/docs/guide/intro)
[外部链接](https://example.com)
![图片描述](/images/screenshot.png)
```

内部链接（以 `/` 或 `#` 开头）原样输出，点击后走浏览器默认导航（整页加载）；外部链接自动添加 `target="_blank"`。详见[路由](./04-routing#内部链接与外部链接)。

图片路径请使用**绝对路径**并把文件放在 `public/` 下——Markdown 里的 `src` 不会经过打包器处理（详见[资源处理](./09-asset-handling#在-markdown-中引用资源)）。

### 表格

```markdown
| 列 A | 列 B | 列 C |
| ---- | ---- | ---- |
| 值 1 | 值 2 | 值 3 |
```

### 引用

```markdown
> 这是一段引用文本。
> 可以跨多行。
```

### 分割线

```markdown
---
```

## 代码块

使用三个反引号围栏代码块，指定语言以启用语法高亮：

````markdown
```typescript
import { defineView, useState } from "@mm/lark-mvc";

export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  return { template };
});
```
````

渲染结果包含：

- 语言标签（右上角显示语言名称）
- Shiki 语法高亮（构建时生成）
- 复制按钮（运行时挂载）

### 支持的语言

默认加载 44 种语言（面向 Web 前端和配置类场景）：

bash, cjs, css, csv, cts, docker, dockerfile, dotenv, go, graphql, html, http, javascript, js, json, json5, jsonc, jsonl, jsx, less, make, makefile, markdown, md, mdc, mdx, mermaid, mjs, mts, nginx, prisma, proto, protobuf, scss, sql, toml, tsx, typescript, vue, wasm, xml, yaml, yml, zsh

::: warning
`highlight.languages` 配置是**替换**而非追加——指定后仅加载你列出的语言，默认列表不再生效。如需在默认基础上扩展，请手动包含所有需要的语言。
:::

如需自定义语言列表，通过 `highlight.languages` 配置：

```ts
defineConfig({
  highlight: {
    theme: "github-light",
    // 替换默认列表，仅加载以下语言
    languages: ["typescript", "javascript", "python", "rust", "html", "css"],
  },
});
```

## 页面结构建议

### 推荐的文档页面结构

```markdown
---
title: 页面标题
description: 一句话描述页面内容
sidebar_position: 0
---

# 页面标题

简短的引言段落，概述本页内容。

## 主要概念

详细解释...

## 使用方法

代码示例和说明...

## 注意事项

::: warning
需要特别注意的问题。
:::

## 相关页面

- [链接到相关文档](/docs/related-page)
```

### 写作规范

- 每个页面以一级标题（`#`）开头
- 使用二级标题（`##`）划分主要章节
- 使用三级标题（`###`）划分子节
- 代码块始终指定语言标识
- 内部链接使用完整路径（含 `baseUrl` 前缀）
- 图片放在 `public/` 目录中，使用绝对路径引用

## 标题与锚点

所有标题自动生成 ID 锚点：

```markdown
## 安装指南
```

生成：

```html
<h2 id="安装指南" class="scroll-mt-20">
  安装指南
  <a class="header-anchor" href="#安装指南" aria-label="Link to this section"
    >#</a
  >
</h2>
```

### 锚点生成规则

锚点 ID 由 `slugify()` 函数生成：

1. 转为小写
2. 非字母/数字字符替换为 `-`（保留 CJK、西里尔、阿拉伯等 Unicode 字母）
3. 空白字符替换为 `-`
4. 连续 `-` 合并为一个
5. 去除首尾 `-`
6. 以数字开头的添加 `_` 前缀

示例：

| 标题文本        | 生成锚点      |
| --------------- | ------------- |
| `Hello World`   | `hello-world` |
| `安装指南`      | `安装指南`    |
| `API 参考 (v2)` | `api-参考-v2` |
| `3.0 新特性`    | `_3-0-新特性` |

重复标题自动追加数字后缀：`配置`、`配置-1`、`配置-2`。

## 目录（TOC）

在 Markdown 中插入 `[[toc]]` 指令可嵌入目录组件：

```markdown
# 长文档标题

[[toc]]

## 第一章

...

## 第二章

...
```

`[[toc]]` 编译为一个 Lark Mvc 子视图挂载点：

```html
<div v-lark="theme/toc" *inline="true"></div>
```

运行时，TocView 组件从 `State.currentPageHeadings` 读取当前页面的标题列表，渲染为可点击的目录导航。

::: tip
默认主题的右侧栏已内置 TOC 组件（非 inline 模式），通常无需在内容中手动插入 `[[toc]]`。仅在需要内容区域目录时使用。
:::

## 链接行为

### 内部链接

以 `/` 或 `#` 开头的链接被视为内部链接：

```markdown
[配置指南](/docs/guide/configuration)
[回到顶部](#)
[跳转到安装](#安装)
```

编译时**不做任何改写**，点击后走浏览器默认导航（整页加载）；页内锚点（`#xxx`）由浏览器正常滚动。

> 内置主题的 SPA 软导航只存在于主题自己的模板中（`data-href` + `@click="navigateTo()"`），不覆盖正文链接。

### 外部链接

```markdown
[GitHub](https://github.com/example/repo)
```

编译后添加 `target="_blank" rel="noopener noreferrer"`，在新标签页打开。

### 自动链接

由于启用了 `linkify: true`，纯文本 URL 自动转为链接：

```markdown
访问 https://example.com 了解更多。
```

## 转义与特殊字符

### 转义 Markdown 语法

使用反斜杠转义特殊字符：

```markdown
\*不是斜体\*
\#不是标题
\[不是链接\](url)
```

### 在代码中显示模板语法

如果需要在代码块中展示 Lark 模板语法，使用围栏代码块即可（代码块内容不会被 Markdown 解析器处理）：

````markdown
```html
<div>{{=title}}</div>
```
````

## 隐藏未完成的页面

把文件名（或目录名）以 `_` 开头，扫描器会直接跳过它们，页面不会进入路由、侧边栏和搜索索引：

```
docs/
├── guide/
│   ├── intro.md      ✓ 正常发布
│   └── _wip.md       ← 不会被扫描
└── _drafts/          ← 整个目录被跳过
    └── new-feature.md
```
