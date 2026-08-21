## Purpose

管理文档站构建产物中所有资源的加载优先级, 通过 fetchpriority 属性和连接层提示 (preconnect/dns-prefetch) 优化首屏渲染性能.

## Requirements

### Requirement: Script 资源优先级标注

构建产物中的 script[type=module] 标签 SHALL 携带 fetchpriority="high" 属性.

#### Scenario: 入口脚本标注

- **WHEN** Vite 构建生成包含 script[type=module] 的 HTML
- **THEN** 该 script 标签 MUST 包含 fetchpriority="high"

### Requirement: 样式表资源优先级标注

构建产物中的 link[rel=stylesheet] 标签 SHALL 携带 fetchpriority="high" 属性.

#### Scenario: 主样式表标注

- **WHEN** Vite 构建生成包含 link[rel=stylesheet] 的 HTML
- **THEN** 该 link 标签 MUST 包含 fetchpriority="high"

### Requirement: Modulepreload 资源优先级标注

构建产物中的 link[rel=modulepreload] 标签 SHALL 携带 fetchpriority="low" 属性, 避免预加载模块与关键资源竞争带宽.

#### Scenario: 预加载模块降级

- **WHEN** Vite 构建生成包含 link[rel=modulepreload] 的 HTML
- **THEN** 该 link 标签 MUST 包含 fetchpriority="low"

### Requirement: 字体资源优先级标注

构建产物中通过 link[rel=preload][as=font] 加载的字体文件 SHALL 携带 fetchpriority="high" 属性.

#### Scenario: 预加载字体标注

- **WHEN** HTML 中存在 link[rel=preload][as=font] 标签
- **THEN** 该标签 MUST 包含 fetchpriority="high"

### Requirement: 图片资源优先级标注

构建产物中的 img 标签 SHALL 根据位置携带 fetchpriority 属性: 首屏关键图片为 high, 其余为 low.

#### Scenario: 首屏图片高优先级

- **WHEN** img 标签位于文档首屏可视区域内 (above-the-fold)
- **THEN** 该 img 标签 MUST 包含 fetchpriority="high" 和 loading="eager"

#### Scenario: 非首屏图片低优先级

- **WHEN** img 标签不在首屏可视区域内
- **THEN** 该 img 标签 MUST 包含 fetchpriority="low" 和 loading="lazy"

### Requirement: 连接层提示注入

系统 SHALL 支持为外部域名注入 preconnect 和 dns-prefetch link 标签, 减少连接建立延迟.

#### Scenario: 外部域名 preconnect

- **WHEN** 配置中声明了需要 preconnect 的外部域名列表
- **THEN** 构建产物 HTML 的 head 中 MUST 包含对应的 link[rel=preconnect] 标签, 且携带 crossorigin 属性 (适用于跨域资源)

#### Scenario: 无外部域名配置

- **WHEN** 配置中未声明任何外部域名
- **THEN** 不注入任何 preconnect/dns-prefetch 标签

### Requirement: 可配置优先级规则

系统 SHALL 提供配置接口, 允许按资源类型 (script, stylesheet, font, image, preload, modulepreload) 声明 fetchpriority 值 (high, low, auto).

#### Scenario: 默认配置

- **WHEN** 未提供自定义配置
- **THEN** 系统 MUST 使用默认规则: script=high, stylesheet=high, font=high, modulepreload=low, image 按位置判断

#### Scenario: 自定义覆盖

- **WHEN** 配置中将 modulepreload 设为 auto
- **THEN** modulepreload 标签 MUST 携带 fetchpriority="auto" 而非默认的 low
