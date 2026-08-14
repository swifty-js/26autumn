---
title: 侧边栏
sidebar_position: 10
description: 自动侧边栏生成、手动配置与运行时行为
---

# 侧边栏

侧边栏是文档站点的核心导航组件。Lark Docs 支持**自动生成**和**手动配置**两种模式，可以按路由前缀混合使用。

## 自动侧边栏

### 基本配置

将侧边栏前缀设置为 `"auto"`，由 `generateSidebar()` 根据文件系统结构自动生成导航树：

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": "auto",
    "/docs/api/": "auto",
  },
});
```

### 生成规则

对于以下目录结构：

```
docs/
├── guide/
│   ├── index.md              (sidebar_position: 0)
│   ├── installation.md       (sidebar_position: 1)
│   ├── configuration.md      (sidebar_position: 2)
│   └── advanced/
│       ├── plugins.md        (sidebar_position: 0)
│       └── theming.md        (sidebar_position: 1)
└── api/
    ├── overview.md
    └── hooks.md
```

`/docs/guide/` 前缀生成的侧边栏：

```
指南
├── 首页            → /docs/guide
├── Installation   → /docs/guide/installation
├── Configuration  → /docs/guide/configuration
└── Advanced（分组）
    ├── Plugins    → /docs/guide/advanced/plugins
    └── Theming    → /docs/guide/advanced/theming
```

### 结构规则

1. **根级文件**：直接作为侧边栏顶级条目
2. **子目录**：渲染为可折叠分组，分组标题由目录名派生（连字符/下划线替换为空格，首字母大写）
3. **虚拟索引排除**：`isDirectoryIndex` 路由不出现在侧边栏中
4. **index.md**：作为目录的顶级条目（链接到目录路径本身）

::: warning 自动生成的树最多两层
`generateSidebar()` 按“相对于前缀的第一个路径段”分组：只有一段的进顶层，多于一段的全部归入**第一段名字的分组**。因此无论目录嵌套多深，自动侧边栏**总是只有顶层项 + 一层分组**，不会递归生成更深层级。

例如 `guide/advanced/deep/x.md` 会直接出现在 `Advanced` 分组下（与 `guide/advanced/y.md` 平级），而不会多出一层 `Deep` 分组。需要更深层级请改用手动配置（手动 `SidebarItem[]` 可以任意嵌套，运行时侧边栏会递归扁平化并按 `depth` 缩进）。
:::

### 排序逻辑

`sortDocsRoutes()` 实现排序：

**全有或全无规则**：

- 如果目录内**所有**文件都设置了 `sidebar_position`，按 `sidebar_position` 数值升序排列
- 如果**任何一个**文件缺少 `sidebar_position`，整个目录回退到按文件名字母序排列

```
# 所有文件都有 sidebar_position → 按数值排序
installation.md  (sidebar_position: 1)
configuration.md (sidebar_position: 2)
deployment.md    (sidebar_position: 3)

# 部分文件缺少 → 全部按文件名排序
advanced.md      (sidebar_position: 1)
basics.md        (无 sidebar_position)  ← 触发回退
configuration.md (sidebar_position: 3)
# 结果：advanced.md, basics.md, configuration.md（字母序）
```

### 分组标题格式化

`formatGroupLabel()` 将目录名转为可读标题：

| 目录名            | 分组标题          |
| ----------------- | ----------------- |
| `advanced`        | `Advanced`        |
| `getting-started` | `Getting Started` |
| `api_reference`   | `Api Reference`   |

## 手动配置

### SidebarItem 接口

```ts
interface SidebarItem {
  text: string; // 显示文本
  link?: string; // 链接路径（叶子节点）
  collapsed?: boolean; // 初始折叠状态（分组节点），默认 false
  items?: SidebarItem[]; // 子项（分组节点）
}
```

### 配置示例

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": [
      {
        text: "入门",
        items: [
          { text: "介绍", link: "/docs/guide/introduction" },
          { text: "安装", link: "/docs/guide/installation" },
          { text: "配置", link: "/docs/guide/configuration" },
        ],
      },
      {
        text: "进阶",
        collapsed: true, // 默认折叠
        items: [
          { text: "插件", link: "/docs/guide/plugins" },
          { text: "主题", link: "/docs/guide/theming" },
        ],
      },
      { text: "部署", link: "/docs/guide/deployment" },
    ],
  },
});
```

### 链接前缀处理

手动配置的 `link` 会自动添加 `baseUrl` 前缀（如果尚未包含）：

```ts
// 配置中写：
{ text: "介绍", link: "/guide/introduction" }

// 运行时变为（假设 baseUrl 为 "/docs/"）：
{ text: "介绍", link: "/docs/guide/introduction" }
```

外部链接（含协议）和锚点链接（`#` 开头）不会被添加前缀。

## 混合模式

不同前缀可以使用不同模式：

```ts
defineConfig({
  sidebar: {
    "/docs/guide/": "auto", // 自动生成
    "/docs/api/": [
      // 手动配置
      { text: "概览", link: "/docs/api/overview" },
      {
        text: "Hooks",
        items: [
          { text: "useState", link: "/docs/api/hooks/use-state" },
          { text: "useEffect", link: "/docs/api/hooks/use-effect" },
        ],
      },
    ],
  },
});
```

## Frontmatter 控制

### sidebar_position

控制自动侧边栏中的排序：

```yaml
---
sidebar_position: 0
---
```

### sidebar_label

覆盖侧边栏显示文本：

```yaml
---
sidebar_label: 快速上手
---
```

显示文本优先级：`sidebar_label` > `title` > 第一个 `# 标题` > 文件名派生

### 隐藏页面

把文件名以 `_` 开头（如 `_wip.md`），扫描器会跳过它，页面自然不会出现在侧边栏、路由和搜索索引中。

## 运行时行为

### Sidebar View

侧边栏由 `theme/sidebar` View 渲染，核心行为：

#### 数据模型

侧边栏配置被扁平化为行列表（`SidebarRow[]`）：

```ts
interface SidebarRow {
  key: string; // 唯一标识
  text: string; // 显示文本
  link: string; // 链接路径
  depth: number; // 嵌套深度
  padPx: number; // 左内边距（px）
  isActive: boolean; // 是否为当前页面
  isGroup: boolean; // 是否为分组标题
  groupOpen: boolean; // 分组是否展开
  containsActive: boolean; // 分组内是否包含活跃项
}
```

#### 缩进计算

- 分组标题：`padPx = 10 + depth * 14`
- 叶子条目：`padPx = 14 + depth * 14`

#### 活跃状态检测

叶子条目的活跃判定是**精确匹配**：去掉尾斜杠后 `item.link === currentPath` 才算活跃（不是前缀匹配）。分组则递归检查其下是否包含活跃链接（`containsActive`）。

> 对比：导航栏（navbar）的活跃态才是前缀匹配。

#### 折叠状态管理

- 使用闭包内的 `Map` 存储用户手动切换的折叠状态
- 状态在页面导航间保持（View 不重新挂载）
- 自动展开只在“该分组从不含当前路由变为包含当前路由”的**跳变时刻**触发（此时会删除用户的折叠记录）。因此用户手动折叠后，在**同一分组内**继续跳转不会被强行展开

#### 事件处理

| 事件           | 行为                                   |
| -------------- | -------------------------------------- |
| `toggleGroup`  | 切换顶级分组的折叠状态                 |
| `toggleNested` | 切换嵌套分组的折叠状态                 |
| `navigateTo`   | SPA 导航到目标页面，同时关闭移动端抽屉 |

### 响应式行为

| 断点              | 侧边栏表现                           |
| ----------------- | ------------------------------------ |
| >= `lg`（1024px） | 固定显示在左侧，`sticky` 定位        |
| < `lg`            | 隐藏，通过导航栏汉堡按钮打开抽屉面板 |

抽屉面板行为：

- 从左侧滑入
- 带半透明遮罩
- Escape 键关闭
- Tab 焦点陷阱（无障碍）
- 打开时锁定 body 滚动

## 生成模块中的侧边栏数据

`defineConfig()` 将处理后的侧边栏配置序列化到生成模块的 `docsConfig.sidebar` 中：

```js
// .lark-docs/generated/index.js
export const docsConfig = {
  // ...
  sidebar: {
    "/docs/guide/": [
      { text: "Introduction", link: "/docs/guide/introduction" },
      { text: "Advanced", collapsed: false, items: [...] },
    ],
  },
};
```

运行时，Layout 视图从 `State.docsConfig` 读取侧边栏配置，根据当前路径前缀匹配对应的侧边栏树，传递给 Sidebar View 渲染。
