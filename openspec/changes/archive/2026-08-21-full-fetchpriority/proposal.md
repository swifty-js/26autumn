## Why

当前 vite.config.ts 中的 priorityHintsPlugin 仅通过正则替换处理构建产物中的 script/stylesheet/modulepreload 三种标签, 覆盖面有限且不可配置. 文档站使用自定义字体 (Geist Mono, Swifty, Maple Mono), 但缺少 font 资源的 fetchpriority 提示; 也没有 preconnect/dns-prefetch 等连接层优化. 随着文档内容增长 (可能引入图片、外部资源), 需要一个完整的资源优先级策略来保证首屏渲染性能.

## What Changes

- 将 priorityHintsPlugin 重构为可配置的 Vite 插件, 支持按资源类型声明优先级
- 新增字体资源 fetchpriority 处理: 对 @font-face 加载的 woff2/woff 文件注入 fetchpriority="high"
- 新增 preconnect/dns-prefetch 注入能力, 为外部域名添加连接提示
- 新增图片资源处理: 对文档内容中的 img 标签, 首屏图片 high, 非首屏图片 low
- 新增 link[rel=preload] 资源的 fetchpriority 处理
- 提供默认配置覆盖当前硬编码行为, 保持向后兼容

## Capabilities

### New Capabilities

- `resource-priority`: 资源加载优先级管理, 覆盖 HTML 中所有可标注 fetchpriority 的资源类型 (script, stylesheet, font, image, preload, modulepreload), 以及连接层提示 (preconnect, dns-prefetch)

### Modified Capabilities

(无)

## Impact

- vite.config.ts: priorityHintsPlugin 重构为独立模块或内联增强
- app/index.html: 可能新增 preconnect link 标签
- app/main.css: 字体加载策略可能需要配合调整
- 构建产物 HTML: 所有资源标签将携带 fetchpriority 属性
- 无运行时依赖变更, 纯构建时处理
