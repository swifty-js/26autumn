## Context

当前 vite.config.ts 中 priorityHintsPlugin 使用正则替换处理 3 种标签. 项目基于 @lark.js/docs + Vite 构建, 产物为单页 HTML + 哈希化 JS/CSS. 字体通过 CSS @theme 声明 (Geist Mono, Swifty, Maple Mono), 目前文档中无图片资源, 无外部域名依赖.

## Goals / Non-Goals

Goals:

- 将硬编码正则替换升级为结构化 HTML 处理, 覆盖所有可标注 fetchpriority 的资源类型
- 提供类型安全的配置接口, 支持按资源类型声明优先级
- 支持 preconnect/dns-prefetch 注入
- 保持零运行时开销 (纯构建时处理)

Non-Goals:

- 不处理运行时动态插入的资源 (如 JS 动态创建的 img)
- 不实现 Critical CSS 内联或资源内联
- 不修改 @lark.js/docs 框架内部行为

## Decisions

### 1. 使用 node-html-parser 替代正则

当前正则替换脆弱且不可扩展 -- 属性顺序变化、新增属性都会导致匹配失败.

方案对比:
- 正则替换: 零依赖, 但每新增一种资源类型就需要新正则, 维护成本线性增长
- cheerio: 功能完整但体积大 (jQuery 语义), 对构建插件过重
- node-html-parser: 轻量 DOM 解析, 支持 querySelector, 适合构建时 HTML 转换

选择 node-html-parser. 它提供 parse() + querySelectorAll() + setAttribute(), 足以覆盖所有标签处理需求, 且包体积小 (< 50KB).

### 2. 插件保持内联在 vite.config.ts

当前项目只有一个 Vite 配置, 插件逻辑不超过 100 行. 提取为独立包会增加 monorepo 复杂度而无实际收益.

保持 priorityHintsPlugin 在 vite.config.ts 中, 但重构内部实现为配置驱动.

### 3. 配置接口设计

```typescript
interface PriorityHintsOptions {
  priorities?: Partial<Record<ResourceType, "high" | "low" | "auto">>;
  preconnect?: string[];
  dnsPrefetch?: string[];
}

type ResourceType =
  | "script"
  | "stylesheet"
  | "font"
  | "image"
  | "preload"
  | "modulepreload";
```

默认值与当前行为一致: script=high, stylesheet=high, modulepreload=low, font=high. image 默认按位置判断 (当前无图片, 预留逻辑).

### 4. 字体处理策略

当前字体通过 CSS font-family 声明引用, 实际加载由浏览器 CSS 解析触发. 两种路径:

- 在 HTML head 中注入 link[rel=preload][as=font]: 需要提前知道字体文件 URL, 但当前字体可能是系统字体或 CDN 字体, 文件路径不确定
- 对已有的 link[rel=preload][as=font] 标签添加 fetchpriority: 仅当框架或手动添加了 preload 标签时生效

选择后者 -- 对已存在的 font preload 标签标注 fetchpriority. 如果未来引入自托管字体文件, 再在 index.html 中手动添加 preload 标签, 插件自动标注优先级.

### 5. 图片处理策略

当前文档无图片. 预留 transformIndexHtml 中的 img 处理逻辑:
- 对前 N 个 img (默认 1) 标注 fetchpriority="high" + loading="eager"
- 其余标注 fetchpriority="low" + loading="lazy"

N 通过配置项 firstImageCount 控制.

## Risks / Trade-offs

- [node-html-parser 解析开销] 构建时一次性处理, 对构建时间影响 < 50ms, 可接受
- [正则到 DOM 解析的行为差异] 现有 3 条正则的匹配结果需验证与新实现一致 → 构建后 diff HTML 产物确认
- [图片位置判断不精确] transformIndexHtml 无法知道实际渲染位置, 用文档顺序近似 → 对纯文本站影响为零, 有图片时按顺序取前 N 个是合理启发式
- [字体 preload 标签可能不存在] 当前无 font preload 标签, 该逻辑暂时不生效 → 无副作用, 未来添加时自动生效
