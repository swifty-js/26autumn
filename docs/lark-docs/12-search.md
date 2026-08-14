---
title: 搜索
sidebar_position: 11
description: 基于 MiniSearch 的客户端全文搜索系统
---

# 搜索

Lark Docs 内置基于 [MiniSearch](https://lucaong.github.io/minisearch/) 的客户端全文搜索引擎，无需外部服务（如 Algolia），即可为文档站点提供即时搜索体验。

## 配置

### 启用搜索

搜索默认启用，通过 `search` 配置项控制：

```ts
defineConfig({
  search: true, // 默认值，启用搜索
  // search: false,  // 禁用搜索
});
```

### 搜索 UI

启用后，导航栏显示搜索按钮，用户可通过以下方式打开搜索面板：

- 点击导航栏搜索图标
- 键盘快捷键 `Cmd+K`（macOS）/ `Ctrl+K`（Windows/Linux）
- 按 `/` 键（不在输入框中时）

## 工作原理

### 架构概览

```
构建时                          运行时
──────                         ──────
scanDocsDir()                  用户打开搜索
    │                              │
    ▼                              ▼
生成 loadContent 映射          ensureMiniSearch()
    │                              │
    ▼                              ├─ getSearchIndex()
getSearchIndex() 函数              │   ├─ 加载所有页面模块
写入生成模块                        │   ├─ 提取 title/headings/excerpt
                                   │   └─ 返回 SearchEntry[]
                                   │
                                   ├─ new MiniSearch(entries)
                                   └─ 缓存实例
                                        │
                                        ▼
                                   用户输入查询
                                        │
                                        ▼
                                   miniSearch.search(query)
                                        │
                                        ▼
                                   渲染结果列表（最多 12 条）
```

### 搜索索引构建

搜索索引在**首次打开搜索面板时**懒加载构建：

1. 调用 `State.get("getSearchIndex")()`——这是通过 State 注入的函数
2. 该函数筛出所有可搜索路径（排除虚拟索引路由）
3. 直接并行调用对应的 loader（即 `() => import(...)`，而不是经由 `loadContent()`）加载编译后的页面模块
4. 提取 `SearchEntry`：

```ts
interface SearchEntry {
  title: string; // 页面标题
  link: string; // 页面路由路径
  headings: string[]; // h2/h3 标题文本列表
  excerpt: string; // 正文摘要（前 200 字符）
}
```

5. 构建结果缓存在 `_searchIndex` 变量中，后续调用直接返回

### MiniSearch 配置

```ts
new MiniSearch({
  fields: ["title", "headings", "excerpt"], // 搜索字段
  storeFields: ["title", "link", "headings", "excerpt"], // 存储字段
  searchOptions: {
    prefix: true, // 前缀匹配（输入 "conf" 匹配 "configuration"）
    fuzzy: 0.2, // 模糊匹配容错度
    boost: {
      title: 2, // 标题匹配权重 ×2
      headings: 1.5, // 标题列表匹配权重 ×1.5
    },
  },
});
```

### 搜索评分

MiniSearch 使用 TF-IDF（词频-逆文档频率）算法计算相关性：

- **标题匹配**：权重 ×2（最重要的匹配位置）
- **标题列表匹配**：权重 ×1.5
- **摘要匹配**：权重 ×1（默认）
- **前缀匹配**：输入词作为前缀匹配完整词
- **模糊匹配**：编辑距离 ≤ 0.2 × 词长 的变体也匹配

## 搜索 UI

### 命令面板

搜索面板是一个模态对话框（command palette 风格）：

```
┌─────────────────────────────────────┐
│ 🔍 输入搜索关键词...           [ESC] │
├─────────────────────────────────────┤
│ ▸ 配置指南                          │
│   /docs/guide/configuration         │
│                                     │
│ ▸ API 配置参考                      │
│   /docs/api/config                  │
│                                     │
│ ▸ 高级配置                          │
│   /docs/guide/advanced/config       │
└─────────────────────────────────────┘
```

### 键盘导航

| 按键      | 行为                         |
| --------- | ---------------------------- |
| `↑` / `↓` | 在结果间移动选中状态（循环） |
| `Enter`   | 导航到选中结果               |
| `Escape`  | 关闭搜索面板                 |

键盘导航实现了 IME 安全处理——当 `event.isComposing` 为 `true` 时（用户正在使用输入法），忽略方向键事件。

### 结果高亮

搜索关键词在结果中高亮显示：

```ts
function highlightSegments(text: string, query: string): string {
  // 按查询词分割文本
  // 匹配部分包裹 <mark> 标签
  // 所有文本进行 HTML 转义
}
```

输出示例：

```html
<mark>配置</mark>指南 — 学习如何<mark>配置</mark>文档站点
```

### 最大结果数

搜索结果最多显示 **12 条**（`MAX_RESULTS = 12`）。

### 竞态安全

搜索使用序列号（`seq`）机制防止异步竞态：

```ts
let seq = 0;

async function onSearchInput(query: string) {
  const currentSeq = ++seq;
  const results = await performSearch(query);
  if (currentSeq !== seq) return; // 过期结果，丢弃
  renderResults(results);
}
```

## State 管理

搜索相关的状态通过 Lark Mvc 的 `State` 单例管理：

| State 键         | 类型                           | 用途             |
| ---------------- | ------------------------------ | ---------------- |
| `searchOpen`     | `boolean`                      | 搜索面板开关状态 |
| `getSearchIndex` | `() => Promise<SearchEntry[]>` | 搜索索引加载函数 |

### 打开/关闭

```ts
// 打开搜索
State.set({ searchOpen: true });

// 关闭搜索
State.set({ searchOpen: false });
```

Layout 视图监听 `searchOpen` 状态变化，控制搜索 View 的显示/隐藏。

### 全局快捷键

Layout 视图注册全局键盘事件：

```ts
// Cmd+K / Ctrl+K → 切换搜索
// / → 打开搜索（不在 input/textarea 中时）
```

## 禁用搜索

```ts
defineConfig({
  search: false,
});
```

禁用后：

- 导航栏不显示搜索按钮（模板中 `{{if searchEnabled}}` 为假）
- 搜索对话框不被挂载（`<div v-lark="theme/search">` 不渲染）
- 快捷键仍会注册但无可见效果（`searchOpen` 被置为 true 也没有视图响应）

::: warning 禁用搜索不会减小产物体积
下面这两件事 **不会** 发生：

- 生成模块仍然导出 `getSearchIndex()` —— `file-content.ejs` 无条件生成它，与 `search` 配置无关
- MiniSearch 仍然被打进 bundle —— `theme/search.ts` 顶部是静态 `import MiniSearch from "minisearch"`，而 `theme/index.ts` 静态引入了 `createSearchView`，且 `registerThemeViews()` 无条件注册 5 个视图（包括 `theme/search`）

`search: false` 只是隐藏 UI，不是 tree-shaking 开关。
:::

## 搜索 View 生命周期

```ts
createSearchView(template) → defineView((ctx) => {
  // 1. 观察 State.searchOpen
  // 2. 首次打开时 ensureMiniSearch() 构建索引
  // 3. 输入时执行搜索（防抖 + 竞态保护）
  // 4. 渲染结果列表
  // 5. 导航后自动关闭
  // 6. Escape / 遮罩点击关闭
});
```

### 资源清理

搜索 View 使用 `useEffect` 管理需要清理的资源：

- 文档级 Escape 键监听器（返回清理函数断开监听）
- 打开时由 Layout 视图负责 body 滚动锁定

View 卸载时自动清理这些资源。

## 性能考量

| 方面     | 策略                                             |
| -------- | ------------------------------------------------ |
| 索引构建 | 首次打开搜索时懒加载，不阻塞首屏                 |
| 索引缓存 | 构建后缓存（`_searchIndex` + `mini` 实例）       |
| 搜索执行 | MiniSearch 内存搜索，毫秒级响应                  |
| 索引体积 | 只含标题 + h2/h3 文本 + 200 字摘要，不含正文全文 |

::: warning 首次搜索会一次性拉取全部页面 chunk
`getSearchIndex()` 用 `Promise.all` **并行加载所有**可搜索页面的编译产物。页面数量大时，第一次按 ⌘K 会产生一批并发请求（每个 `.md` 一个 chunk）。这是有意的权衡：避开了把完整索引序列化进首屏 bundle。

另外，MiniSearch **不是**独立按需 chunk——它被静态引入，随主题一起加载。
:::

## 自定义搜索

### 替换搜索 View

通过 `registerViewClass` 替换默认搜索实现：

```ts
import { registerViewClass, defineView } from "@mm/lark-docs";
import customSearchTemplate from "./custom-search.html";

registerViewClass(
  "theme/search",
  defineView((ctx) => {
    // 自定义搜索逻辑
    return { template: customSearchTemplate };
  }),
);
```

### 外部搜索服务

如需使用 Algolia DocSearch 等外部服务，可以：

1. 禁用内置搜索（`search: false`）
2. 注册自定义搜索 View
3. 在自定义 View 中集成外部搜索 SDK
