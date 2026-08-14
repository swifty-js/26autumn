---
title: Frontmatter
sidebar_position: 6
description: 页面元数据配置——YAML frontmatter 字段参考
---

# Frontmatter

每个 Markdown 文件顶部可以包含 YAML 格式的 frontmatter 块，用于配置页面元数据。Frontmatter 在构建时被提取并编译到页面模块的 `pageData` 中。

## 语法

Frontmatter 使用 `---` 分隔符包裹，必须位于文件最开头：

```markdown
---
title: 页面标题
description: 页面描述
sidebar_position: 0
---

# 正文内容从这里开始
```

解析规则：

- 开头 `---` 必须在文件第一行
- YAML 内容由 `js-yaml` 的 `load()` 方法解析
- 解析失败时静默降级为空对象（不中断构建）
- 结束 `---` 后的空行会被消耗

## 支持的字段

### title

| 属性 | 值           |
| ---- | ------------ |
| 类型 | `string`     |
| 必填 | 否           |
| 作用 | 设置页面标题 |

```yaml
---
title: 配置指南
---
```

页面标题用于：

- 浏览器标签页标题（`document.title`）
- 侧边栏显示文本（优先级高于文件名派生标题）
- 搜索索引条目标题
- 前/后页导航卡片文本

### description

| 属性 | 值       |
| ---- | -------- |
| 类型 | `string` |
| 必填 | 否       |
| 作用 | 页面描述 |

```yaml
---
description: 详细介绍 Lark Docs 的配置选项和使用方法
---
```

用于：

- 搜索索引的摘要回退值（`excerpt` 为空时才用 `description`）

::: tip 缺省值不是空字符串
未写 `description` 时，它会被填为**从文件名推导出的标题**（`deriveTitleFromPath()`），而不是空值。例如 `getting-started.md` 的 `description` 会变成 `"Getting Started"`。

另外，内置主题**不会**把页面级 `description` 写入 `<meta name="description">`——它只设置 `document.title`。站点级描述需自行写在 `index.html` 里。
:::

### sidebar_position

| 属性 | 值                           |
| ---- | ---------------------------- |
| 类型 | `number`                     |
| 必填 | 否                           |
| 默认 | 无（按文件名排序）           |
| 作用 | 控制在自动侧边栏中的排序位置 |

```yaml
---
sidebar_position: 0
---
```

排序规则：

- 数值越小越靠前（0-based）
- **全有或全无规则**：同一目录下，要么所有文件都设置 `sidebar_position`，要么都不设置
- 如果部分文件设置了而部分没有，则所有文件回退到按文件名字母序排列
- 目录分组也参与排序（按目录名）

### sidebar_label

| 属性 | 值                     |
| ---- | ---------------------- |
| 类型 | `string`               |
| 必填 | 否                     |
| 作用 | 覆盖侧边栏中的显示文本 |

```yaml
---
sidebar_label: 快速上手
---
```

如果不设置，侧边栏文本按以下优先级确定：

1. `sidebar_label`（最高优先级）
2. `title`（frontmatter 标题）
3. 正文第一个 `# 标题`
4. 文件名派生标题

::: tip 想隐藏未完成的页面？
Lark Docs 没有草稿机制。把文件名或目录名以 `_` 开头（如 `_wip.md`、`_drafts/`），扫描器会跳过以 `_` 或 `.` 开头的条目，页面就不会进入路由、侧边栏和搜索索引。
:::

## 标题解析链

当页面需要确定标题时（用于 `document.title`、侧边栏、搜索等），按以下优先级依次查找：

```
1. frontmatter.title         → 最高优先级
2. 正文第一个 # 标题          → extractFirstHeading()
3. 文件名派生标题            → deriveTitleFromPath()
```

### 文件名派生规则

`deriveTitleFromPath()` 的逻辑：

| 文件名               | 派生标题                              |
| -------------------- | ------------------------------------- |
| `getting-started.md` | `Getting Started`                     |
| `api-reference.md`   | `Api Reference`                       |
| `index.md`           | 使用父目录名（如 `guide/` → `Guide`） |
| 根 `index.md`        | `Home`                                |

规则：连字符替换为空格，每个单词首字母大写。对于 `index.md` 文件，使用父目录名（目录名中的下划线也会替换为空格）。

## 编译输出

Frontmatter 字段在编译后映射到 `pageData` 对象（snake_case → camelCase）：

```ts
interface PageData {
  title: string; // ← frontmatter.title 或派生
  description?: string; // ← frontmatter.description
  excerpt: string; // ← 正文前 200 字符（自动提取）
  sidebarPosition?: number; // ← frontmatter.sidebar_position
  sidebarLabel?: string; // ← frontmatter.sidebar_label
  headings: HeadingInfo[]; // ← 自动提取的 h2/h3 标题列表
  relativePath: string; // ← 相对于 docs 目录的文件路径
}
```

### 编译后模块示例

对于以下 Markdown 文件：

```markdown
---
title: 路由配置
description: 文件系统路由的详细规则
sidebar_position: 2
---

# 路由配置

## 基本规则

内容...

## 高级用法

内容...
```

编译输出的 `pageData`：

```json
{
  "title": "路由配置",
  "description": "文件系统路由的详细规则",
  "excerpt": "内容... 内容...",
  "sidebarPosition": 2,
  "headings": [
    { "level": 2, "text": "基本规则", "slug": "基本规则" },
    { "level": 2, "text": "高级用法", "slug": "高级用法" }
  ],
  "relativePath": "guide/routing.md"
}
```

## 完整示例

```markdown
---
title: 部署指南
description: 将 Lark Docs 站点部署到各种静态托管平台
sidebar_position: 5
sidebar_label: 部署
---

# 部署指南

本文介绍如何将构建产物部署到生产环境。

## 静态托管

...
```

## 注意事项

- frontmatter 中的 YAML 值遵循标准 YAML 语法（字符串可省略引号，但含特殊字符时建议加引号）
- `sidebar_position` 必须是数字，不能是字符串
- 不支持自定义字段——未列出的字段会被忽略（不报错，但不出现在 `pageData` 中）
- frontmatter 解析使用正则 `/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/`，兼容 Windows 换行符
