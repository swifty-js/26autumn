---
title: 扩展默认主题
sidebar_position: 14
description: 覆盖、扩展和定制默认主题的各个组件
---

# 扩展默认主题

大多数情况下，你不需要从零构建主题——只需覆盖或扩展默认主题的特定组件。Lark Docs 的主题系统支持视图级别的精确替换。

## 默认主题组件

`registerThemeViews()` 注册 5 个视图：

| 视图路径             | 工厂函数                | 职责                               |
| -------------------- | ----------------------- | ---------------------------------- |
| `theme/docs-layout`  | `createDocsLayoutView`  | 根布局：导航栏、三栏结构、内容加载 |
| `theme/sidebar`      | `createSidebarView`     | 可折叠导航树                       |
| `theme/toc`          | `createTocView`         | 标题大纲 + 滚动监听                |
| `theme/search`       | `createSearchView`      | MiniSearch 命令面板                |
| `theme/theme-toggle` | `createThemeToggleView` | 明暗模式切换                       |

## 覆盖单个组件

### 基本原理

`registerViewClass()` 对同一路径的多次调用，**后注册的覆盖先注册的**。因此只需在 `registerThemeViews()` 之后重新注册目标路径：

```ts
import {
  registerThemeViews,
  registerViewClass,
  defineView,
} from "@mm/lark-docs";

// 先注册默认主题
registerThemeViews();

// 再覆盖特定组件
import MyCustomToc from "./views/custom-toc";
registerViewClass("theme/toc", MyCustomToc);
```

### 示例：自定义 TOC

```ts
// app/views/custom-toc.ts
import { defineView, State } from "@mm/lark-docs";
import template from "./custom-toc.html";

interface Heading {
  level: number;
  text: string;
  slug: string;
}

export default defineView((ctx) => {
  ctx.updater.set({ headings: [] });

  // observeState 只接收 key（或 key 数组），没有回调参数；
  // 状态变化时框架会调用 renderMethod / render
  ctx.observeState("currentPageHeadings");

  ctx.renderMethod = () => {
    const headings = (State.get("currentPageHeadings") as Heading[]) ?? [];
    ctx.updater.set({ headings });
    ctx.updater.digest();
  };

  return {
    template,
    events: {
      "scrollTo<click>": (e: Event) => {
        e.preventDefault();
        let el = e.target instanceof HTMLElement ? e.target : null;
        while (el && !el.dataset["slug"]) el = el.parentElement;
        const slug = el?.dataset["slug"];
        if (slug) {
          document.getElementById(slug)?.scrollIntoView({ behavior: "smooth" });
        }
      },
    },
  };
});
```

```html
<!-- app/views/custom-toc.html -->
<nav class="my-toc">
  <p class="mb-2 text-sm font-semibold">目录</p>
  {{forOf headings as heading}}
  <a
    href="#{{=heading.slug}}"
    data-slug="{{=heading.slug}}"
    @click="scrollTo()"
    class="block text-sm py-1 {{if heading.level === 3}}pl-4{{/if}}"
  >
    {{=heading.text}}
  </a>
  {{/forOf}}
</nav>
```

### 示例：自定义主题切换

```ts
// app/views/custom-theme-toggle.ts
import { defineView } from "@mm/lark-docs";
import { useState, useResource } from "@mm/lark-mvc";
import template from "./custom-theme-toggle.html";

const STORAGE_KEY = "my-docs-theme";

export default defineView((ctx) => {
  const isDark = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  const [getDark, setDark] = useState("dark", isDark());

  // 初始化时应用主题
  useEffect(() => {
    document.documentElement.classList.toggle("dark", getDark());
  }, []);

  return {
    template,
    events: {
      "toggle<click>"() {
        const next = !getDark();
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      },
    },
  };
});
```

## 使用工厂函数

默认主题导出工厂函数，允许你使用自定义模板但保留原有逻辑：

```ts
import { createTocView } from "@mm/lark-docs/theme";
import myTocTemplate from "./my-toc.html";

// 使用自定义模板 + 默认逻辑
registerViewClass("theme/toc", createTocView(myTocTemplate));
```

::: warning
使用工厂函数时，自定义模板必须包含默认逻辑所期望的 DOM 结构和事件绑定。建议参考默认模板的结构。
:::

## 默认 Layout View 详解

了解 Layout 的内部机制有助于精确扩展：

### 内容加载流程

```ts
ctx.renderMethod = async () => {
  // 1. 从 State 获取 docsConfig 和 loadContent
  // 2. 解析当前路径（Router.parse()）
  // 3. 若路径以 /index、/index.md、/index.html 结尾 → Router.to() 重定向到干净路径
  // 4. 若路径未变 → 仅切换抽屉状态（廉价路径）
  // 5. 显示加载骨架屏
  // 6. await loadContent(path)
  // 7. Zod 验证返回数据；signature 变了则丢弃结果
  // 8. 设置 document.title = `${pageData.title} · ${cfg.title}`
  // 9. 写入 State.currentPageHeadings / currentPageTitle（供 TOC 读）
  // 10. 计算前/后页导航
  // 11. 计算导航栏活跃状态（前缀匹配）
  // 12. 渲染
  // 13. 后处理（setTimeout）：page-in 动画、复制按钮、hash 或顶部滚动
};
```

::: warning “虚拟目录索引”不会被重定向
布局**只**对字面以 `/index`、`/index.md`、`/index.html` 结尾的路径做重定向。

对于没有 `index.md` 的目录（如 `/docs/guide`），扫描器已经把该路径**直接映射到首页的模块**并写进了 loaders，所以 `loadContent("/docs/guide")` 会直接返回内容——URL 保持不变，**没有任何重定向发生**。
:::

### 模板数据

Layout 模板读的是 `ctx.updater` 里的数据（而不是闭包 getter），字段名如下：

| 变量            | 类型                    | 说明                                 |
| --------------- | ----------------------- | ------------------------------------ |
| `siteTitle`     | `string`                | 站点标题                             |
| `navItems`      | `{text,link,active}[]`  | 导航栏项目（含活跃状态）             |
| `contentHtml`   | `string`                | 页面 HTML 内容                       |
| `loading`       | `boolean`               | 加载状态                             |
| `notFound`      | `boolean`               | 是否 404                             |
| `currentPath`   | `string`                | 当前路径（404 页展示用）             |
| `prevPage`      | `{link,text} \| null`   | 前一页                               |
| `nextPage`      | `{link,text} \| null`   | 后一页                               |
| `drawerOpen`    | `boolean`               | 移动端抽屉状态                       |
| `searchEnabled` | `boolean`               | 搜索是否启用（`cfg.search ?? true`） |
| `icons`         | `Record<string,string>` | lucide SVG 字符串                    |
| `clockIcon`     | `string`                | 按当前小时选的时钟图标               |
| `year`          | `number`                | 页脚年份                             |

> 注意：侧边栏数据**不在**布局的 updater 里——`theme/sidebar` 作为子视图自己从 `State.docsConfig` 读取。

### 事件处理器

| 事件名               | 触发方式        | 行为                 |
| -------------------- | --------------- | -------------------- |
| `navigateTo`         | 点击内部链接    | SPA 导航             |
| `navigateHome`       | 点击 Logo       | 导航到首页           |
| `navigateHomeDrawer` | 抽屉中点击 Logo | 导航到首页并关闭抽屉 |
| `openSearch`         | 点击搜索按钮    | 打开搜索面板         |
| `openDrawer`         | 点击汉堡菜单    | 打开移动端侧边栏     |
| `closeDrawer`        | 点击遮罩/Escape | 关闭侧边栏           |

## 默认 Sidebar View 详解

### 数据流

```
State.docsConfig.sidebar
    │
    ▼
assign() 接收侧边栏配置
    │
    ├─ 匹配当前路径前缀
    ├─ 扁平化为 SidebarRow[]
    ├─ 计算缩进、活跃状态
    └─ 处理分组折叠
    │
    ▼
模板渲染行列表
```

### 折叠状态持久化

Sidebar View 使用闭包内的 Map 存储折叠状态：

```ts
const groupCollapsed = new Map<string, boolean>();
const nestedCollapsed = new Map<string, boolean>();
```

- 用户手动切换时更新 Map
- 页面导航不重置（View 不重新挂载）
- 当活跃项进入某个折叠分组时，自动展开

## 默认 Search View 详解

### 搜索流程

```
用户输入 → onSearchInput
    │
    ├─ 递增 seq（竞态保护）
    ├─ ensureMiniSearch()（首次懒加载索引）
    ├─ miniSearch.search(query)
    ├─ 取前 12 条结果
    ├─ highlightSegments() 高亮关键词
    └─ 检查 seq 有效性 → 渲染结果
```

## 默认 ThemeToggle View 详解

### 主题检测优先级

```
1. localStorage["lark-docs-theme"] → "dark" / "light"
2. prefers-color-scheme: dark → 系统偏好
3. 默认 → light
```

### MutationObserver

ThemeToggle 使用 MutationObserver 监听 `<html>` 的 class 变化，保持内部状态与 DOM 同步——即使主题被其他代码（如 DevTools）修改。

## 添加新组件

除了覆盖现有组件，你还可以添加全新的组件：

### 注册新 View

```ts
import { registerViewClass, defineView } from "@mm/lark-docs";
import VersionBadge from "./views/version-badge";

registerViewClass("version-badge", VersionBadge);
```

### 在模板中使用

如果覆盖了 Layout 模板，可以直接引用：

```html
<div v-lark="version-badge" *version="2.0.0"></div>
```

### 通过 Markdown 使用

由于 Markdown 支持内联 HTML，注册后的 View 可以在任何 `.md` 文件中使用：

```markdown
当前版本：<div v-lark="version-badge" \*version="2.0.0" style="display:inline-block"></div>
```

## 样式覆盖策略

### 优先级顺序

```
1. 内联样式（最高）
2. 自定义 CSS（main.css 中 @import client.css 之后）
3. client.css 主题样式
4. Tailwind 工具类
```

### 推荐做法

```css
/* main.css */
@import "tailwindcss";
@import "../node_modules/@mm/lark-docs/dist/client.css";

/* 在 client.css 之后覆盖 */
:root {
  --primary: oklch(0.6 0.15 145); /* 绿色主色 */
}

.callout {
  border-radius: 8px;
}
.codeblock {
  font-size: 13px;
}
```

> `client.css` 不在 `package.json` 的 `exports` 里，必须用文件路径引用（详见[快速开始](./03-getting-started#main-css)）。

## 双模板模式

默认主题为每个 View 预编译了两份模板：

- `__str`：字符串渲染模式（默认）
- `__vdom`：VDOM 渲染模式

通过虚拟模块（`virtual:lark-docs/*`）在构建时生成。`registerThemeViews({ vdom })` 选择使用哪份：

```ts
// 字符串模式（默认）
registerThemeViews();

// VDOM 模式
registerThemeViews({ vdom: true });
```

如果你使用工厂函数覆盖组件，需要确保传入正确模式的模板。
