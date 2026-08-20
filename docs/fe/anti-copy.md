# @swifty.js/anti-copy 核心技术文档

> 本机器路径 `$HOME/github/swifty.js/packages/anti-copy`
> 本文档基于 `swifty.js/packages/anti-copy` 仓库 `src/core` 目录的源码事实撰写, 只覆盖框架无关的核心防护逻辑, 不涉及 vitepress / rspress / lark-docs / lark-mvc / swifty-docs 等接入层实现.

## 1. 定位与设计目标

anti-copy 是一个浏览器端防复制 SDK. 它通过拦截 DOM 事件、注入样式表、轮询窗口尺寸等手段, 阻止或干扰用户对页面内容的复制、剪切、拖拽、选择、右键菜单、打印保存以及开发者工具访问.

核心设计原则( 源码注释中明确声明) :

- 客户端防复制只是威慑手段( deterrent) , 不是安全边界. 内容仍然可以通过查看源码、禁用 JavaScript 或直接 HTTP 请求获取.
- 框架无关: 只依赖标准 DOM API, 不绑定任何前端框架.
- SSR 安全: 在非浏览器环境( 无 window/document) 导入不会报错, `createAntiCopy` 返回一个所有方法均为空操作的实例.
- 可测试性: `target` 选项允许注入任意 Document, 测试中可用 jsdom 替换真实 document.

## 2. 目录结构与模块划分

```
src/core/
├── index.ts        入口: createAntiCopy 控制器、Feature 组装、生命周期管理
├── types.ts        全部公共与内部类型定义
├── options.ts      配置归一化 resolveOptions 与默认值
├── utils.ts        共享工具: 元素解析、排除判定、可编辑判定、HTML 转义
├── clipboard.ts    copy / cut / dragstart 拦截
├── keyboard.ts     复制、导出、DevTools 快捷键拦截
├── contextmenu.ts  右键菜单禁用
├── style.ts        user-select 样式注入与 selectstart 拦截
├── print.ts        打印内容隐藏与 beforeprint 上报
└── devtools.ts     DevTools 打开状态启发式检测
```

架构上采用「控制器 + 特性模块」模式: `createAntiCopy` 是唯一入口, 每个防护能力是一个实现 `Feature` 接口的独立模块, 由控制器统一装配、启用、停用与销毁.

```ts
// types.ts
export interface Feature {
  attach(): void;
  detach(): void;
}
```

## 3. 配置系统

### 3.1 AntiCopyOptions

用户可见的完整配置项( types.ts) :

| 选项             | 类型                            | 默认值                                  | 说明                                                |
| ---------------- | ------------------------------- | --------------------------------------- | --------------------------------------------------- |
| mode             | "block" \| "replace"            | "block"                                 | 复制策略: 整体取消复制, 或放行但替换剪贴板内容      |
| replaceText      | string \| (selection) => string | "Copying is not allowed on this page."  | replace 模式下的替换文案, 函数形式接收当前选中文本  |
| excludeSelectors | string[]                        | []                                      | 豁免区域选择器, 事件目标通过 `Element.closest` 匹配 |
| copy             | boolean                         | true                                    | 拦截 copy / cut 事件与文本、图片拖出                |
| keyboard         | boolean                         | true                                    | 拦截复制相关与 DevTools 快捷键                      |
| contextmenu      | boolean                         | true                                    | 禁用右键菜单                                        |
| selectStyle      | boolean                         | block 模式为 true, replace 模式为 false | 注入 user-select: none 样式并拦截 selectstart       |
| print            | boolean                         | true                                    | 打印输出隐藏内容并拦截 Ctrl/Cmd+P、Ctrl/Cmd+S       |
| devtools         | boolean \| DevtoolsOptions      | false                                   | DevTools 打开检测器( 窗口尺寸差启发式)              |
| onViolation      | (event: ViolationEvent) => void | 无                                      | 每次防护规则触发时的回调                            |
| target           | Document                        | document                                | 监听器挂载的文档, 可注入以便测试                    |

selectStyle 的默认值依赖 mode 是一个关键设计: replace 模式需要存在活的选区才能触发 copy 事件并替换内容, 如果默认禁选则替换永远无法发生, 因此 replace 模式下默认关闭选择禁用.

DevtoolsOptions 子配置:

| 选项       | 默认值 | 说明                                                     |
| ---------- | ------ | -------------------------------------------------------- |
| intervalMs | 1000   | 轮询间隔毫秒数                                           |
| threshold  | 170    | 窗口 outer 与 inner 尺寸差超过该值视为 DevTools 停靠打开 |

### 3.2 resolveOptions 归一化

options.ts 的 `resolveOptions` 将用户配置与默认值合并为 `ResolvedOptions`, 所有特性模块消费的均是归一化后的对象, 不再处理 undefined. 要点:

- devtools 三态归一: `true` 展开为默认参数对象, 对象形式逐项补默认值, 其余( false/undefined) 归一为 `false`.
- `DEFAULT_REPLACE_TEXT` 常量从 index.ts 对外导出.

### 3.3 违规事件

```ts
export type ViolationType =
  | "copy"
  | "cut"
  | "drag"
  | "selection"
  | "keyboard"
  | "contextmenu"
  | "print"
  | "devtools";

export interface ViolationEvent {
  type: ViolationType;
  originalEvent?: Event; // devtools 检测没有原始事件
  key?: string; // keyboard 违规时的快捷键描述, 如 "Ctrl+Shift+I"
}
```

## 4. 控制器与生命周期( index.ts)

### 4.1 特性组装

`buildFeatures` 按固定顺序根据开关构建特性数组:

```
style → clipboard → keyboard → contextmenu → print → devtools
```

### 4.2 实例状态机

`createAntiCopy(options)` 返回 `AntiCopyInstance`, 内部维护 `enabled` 与 `destroyed` 两个布尔状态:

- enable: 幂等. 逐个调用 feature.attach(). 关键细节是失败回滚: 每个 feature 在 attach 之前先压入 attached 数组, 若某个 attach 抛错, 则对已压入的全部 feature 执行 detach( detach 实现均为幂等) , 再向上抛出错误. 这样保证部分失败时不会泄漏无法移除的监听器.
- disable: 幂等. 即使某个 feature.detach() 抛错也继续 detach 其余 feature, 记录第一个错误并在全部完成后抛出.
- destroy: 先 disable, 再置 destroyed 并清空 features 数组, 此后所有方法( 含 update) 均为空操作.
- update(patch): disable → 合并配置 → 重建 features → 若原先处于启用状态则重新 enable. 合并时 devtools 对象做一层深合并( mergeOptions) , 避免补丁只写 intervalMs 时丢失 threshold.

### 4.3 SSR 空实例

非浏览器环境返回共享的 `NOOP_INSTANCE`: enable/disable/destroy/update 均为空函数, isEnabled 恒为 false.

## 5. 共享工具层( utils.ts)

utils.ts 承载了所有跨特性复用的判定逻辑, 是核心逻辑中细节最密集的部分.

### 5.1 isBrowser

```ts
typeof window !== "undefined" && typeof document !== "undefined";
```

### 5.2 事件目标到元素的解析

`toElement` 使用鸭子类型( 检查 nodeType 是否为数字) 而非 `instanceof` 判定节点, 原因是来自其他 realm( iframe、注入文档) 的节点无法通过当前 realm 的 `instanceof` 检查. 文本节点回退到 parentElement; 直接挂在 ShadowRoot 下的文本节点没有 parentElement, 则取 parentNode 的 host.

`eventElement(event)` 优先使用 `event.composedPath()[0]` 而非 `event.target`, 因为 composedPath 能穿透 open shadow root, 而 event.target 在 shadow 边界处会被重定向为宿主元素.

### 5.3 isExcluded: 豁免区域判定

沿祖先链对每个选择器执行 `el.closest(selector)`. 三个关键点:

- closest 在 shadow root 边界停止, 因此循环中通过 `getRootNode().host` 跨越 shadow 边界继续向上查找, 直到没有宿主为止.
- 无效选择器导致的异常被静默吞掉, 保证一个坏选择器不影响其余选择器的判定.
- window、document 等非节点目标永不视为豁免.

### 5.4 isEditable: 可编辑控件豁免

所有特性对可编辑控件统一放行, 保证输入框内的复制粘贴等原生行为不受影响. 判定规则:

- 标签为 INPUT 或 TEXTAREA.
- contenteditable 属性值为 ""、"true"、"plaintext-only" 之一( HTML 规范中该值 ASCII 大小写不敏感, 故先 toLowerCase) .
- 沿 parentElement 向上查找, 跨 shadow 边界时经 shadowHost 继续.

### 5.5 isSelectionExcluded: 基于选区的判定

copy 事件的载荷是选区本身, 而 copy 事件触发在选区起始节点上. 如果只按 event.target 判定, 一个从豁免区域起始、延伸到受保护区域的选区会整体漏过防护. 因此 clipboard 特性优先使用选区判定:

- 遍历 selection 的每个 Range, 要求所有 Range 的 commonAncestorContainer 都在豁免区域内才返回 true.
- 无选区或选区折叠( isCollapsed) 时返回 null, 调用方回退到基于目标的判定.
- excludeSelectors 为空时直接返回 null 短路.

### 5.6 escapeHtml

转义 `&`、`<`、`>`、`"` 四个字符, 用于把替换文案安全地写入 text/html 剪贴板风味.

## 6. 特性模块详解

### 6.1 clipboard.ts: 复制、剪切与拖拽拦截

监听目标为 `doc.defaultView`( 即 window) , 且全部使用捕获阶段( addEventListener 第三参数为 true) . 选择 window 捕获阶段的原因: 它是最外层的捕获目标, 页面脚本注册在 document 上的处理器无法抢先执行并阻止防护.

copy / cut 处理器流程:

1. 解析事件元素, 可编辑控件直接放行.
2. 豁免判定优先走选区( isSelectionExcluded) , 选区不可用时回退到目标元素( isExcluded) .
3. replace 模式且存在 clipboardData: 读取当前选中文本, 计算替换文案( 函数或字符串) , 同时写入 `text/plain` 和 `text/html` 两种风味. 写 HTML 风味是为了防止富文本粘贴绕过纯文本替换.
4. 无论哪种模式都调用 `preventDefault()`. replace 模式下这是强制要求: 若不阻止默认行为, 浏览器会在处理器返回后用真实选区覆盖剪贴板载荷.
5. 上报 onViolation, type 按事件类型区分 cut / copy.

dragstart 处理器: 把选区或图片拖出窗口不会触发 copy 事件, 必须单独拦截. 与 copy 不同, 拖拽只按拖动目标判定豁免, 不做选区判定: 拖拽载荷就是被拖动的节点本身, 豁免区域内的残留选区不应豁免对受保护内容的拖动.

### 6.2 keyboard.ts: 快捷键拦截

同样挂载在 window 捕获阶段, 监听 keydown. 拦截三类快捷键:

复制类( COPY_KEYS: c / x / a) : Ctrl/Cmd+C、Ctrl/Cmd+X、Ctrl/Cmd+A, 以及 Ctrl+Insert.

导出类( EXPORT_KEYS: s / p) : Ctrl/Cmd+S 保存页面与 Ctrl/Cmd+P 打印会泄漏整页内容, 因此即使在可编辑控件或豁免区域内也强制拦截( 这是 ctrl/meta 组合键分支中唯一不做 editable/excluded 豁免的分支, DevTools 类快捷键同样无条件拦截) , 且仅在 print 选项开启时生效.

DevTools 类( devtoolsShortcut) : F12; Windows/Linux 的 Ctrl+Shift+I/J/C; macOS 的 Cmd+Opt+I/J/C; 查看源码的 Ctrl+U( Windows/Linux) 与 Cmd+Opt+U( macOS) . 这类快捷键无条件拦截并上报, key 字段携带如 "Ctrl+Shift+I" 的可读描述.

matchKey 的双通道匹配是一个重要的反绕过设计: 同时匹配布局字符( e.key) 与物理键( e.code, 取 "Key" 前缀后的字母) . 单独用 e.key 会漏掉非拉丁布局( 如西里尔字母的 "с") 和 macOS Option 死键; 单独用 e.code 会漏掉重映射的拉丁布局( AZERTY/Dvorak, 浏览器按 e.key 执行动作) . 两者取并集可能过度拦截( 例如 AZERTY 上物理 KeyA 对应 Ctrl+Q) , 但对防复制而言过度拦截是安全方向.

replace 模式的特殊放行: Ctrl/Cmd+C 与 Ctrl+Insert 被刻意放行, 让按键继续触发 copy 事件, 由 clipboard 特性完成载荷替换. Ctrl+X、Ctrl+A 则仍然拦截.

### 6.3 contextmenu.ts: 右键菜单禁用

最简单的特性: window 捕获阶段监听 contextmenu, 可编辑控件与豁免区域放行, 其余 preventDefault 并上报 type 为 contextmenu.

### 6.4 style.ts: 选择禁用样式与 selectstart 拦截

注入带 `swifty-anti-copy` 标记属性的 style 元素到 document.head, 内容为两条规则:

```css
body {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none;
}
:is(豁免选择器),
:is(豁免选择器) * {
  -webkit-user-select: text !important;
  user-select: text !important;
}
```

设计要点:

- `-webkit-touch-callout: none` 抑制 iOS 长按菜单. iOS 长按不会触发 contextmenu 事件, 若不处理将完全绕过右键防护.
- user-select 不会穿透显式的 none 向下继承, 因此豁免区域必须同时用 `:is(s), :is(s) *` 显式覆盖自身与所有后代.
- 用 `:is()` 包裹保证含逗号的复合选择器( 如 ".a, .b") 在选择器列表中分组正确.
- `!important` 抵抗页面级样式覆盖.
- validSelectors 先过滤掉文档无法解析的选择器: 按 CSS 规范, 分组规则中一个无效选择器会使整条规则失效, 会连带杀死可编辑控件的豁免规则.
- 可编辑控件豁免选择器固定包含 input、textarea 及三种 contenteditable 取值.

selectstart 拦截器作为样式被覆盖时的兜底, 逻辑与 contextmenu 一致( editable/excluded 放行, 否则 preventDefault 并上报 selection) . 注意 replace 模式下不挂载 selectstart 监听( 需要保持可选) , 但样式仍会注入——样式是否注入由 selectStyle 开关单独控制, attach 内部再按 mode 决定是否加监听.

### 6.5 print.ts: 打印防护

双路径防护:

- 注入带 `swifty-anti-print` 标记的样式: `@media print { body { display: none !important; } }`. 键盘特性只能拦截 Ctrl/Cmd+P 快捷键, 浏览器菜单仍可打开打印对话框, 媒体查询覆盖这条路径, 使打印/另存为 PDF 输出为空白.
- 监听 window 的 beforeprint 事件上报 type 为 print 的违规( 无 originalEvent) .

### 6.6 devtools.ts: DevTools 打开检测

基于窗口 outer 与 inner 尺寸差的启发式检测: 停靠的 DevTools 会压缩 inner 视口, 使差值增大.

实现细节:

- 配置为 false 或无 defaultView 时返回 noop Feature.
- attach 启动 setInterval 轮询( 默认 1 秒) 并监听 resize 事件即时响应窗口变化.
- 每次检查先做环境过滤: outerWidth 小于 800 或 `(pointer: coarse)` 触摸设备直接跳过, 避免窄屏与移动端误报.
- 横向或纵向尺寸差超过 threshold( 默认 170px) 判定为打开.
- 边沿触发: 仅在关→开的跳变瞬间上报一次 onViolation( type 为 devtools, 无 originalEvent) , 持续打开期间不重复上报.
- 源码注释明确声明已知局限: 独立窗口的 DevTools 无法检测; 浏览器缩放或异常窗口装饰可能误报; 只作为威慑信号, 绝不执行任何破坏性动作.

## 7. 各特性行为矩阵

| 特性        | 监听目标 | 阶段 | 事件                            | 可编辑豁免          | excludeSelectors 豁免    | 注入样式 |
| ----------- | -------- | ---- | ------------------------------- | ------------------- | ------------------------ | -------- |
| clipboard   | window   | 捕获 | copy / cut / dragstart          | 是                  | 是( copy/cut 优先按选区) | 否       |
| keyboard    | window   | 捕获 | keydown                         | 部分( 导出键不豁免) | 部分( 导出键不豁免)      | 否       |
| contextmenu | window   | 捕获 | contextmenu                     | 是                  | 是                       | 否       |
| style       | window   | 捕获 | selectstart( 仅非 replace 模式) | 是                  | 是                       | 是       |
| print       | window   | —    | beforeprint                     | —                   | —                        | 是       |
| devtools    | window   | —    | resize + 定时轮询               | —                   | —                        | 否       |

## 8. 关键设计决策小结

1. 全部事件监听挂在 window 捕获阶段: 抢占页面脚本在 document 上注册的处理器, 防止其先执行并 stopPropagation 绕过防护.
2. 豁免判定双轨制: 目标判定( closest 向上 + shadow 穿透) 与选区判定( 所有 Range 的公共祖先都须豁免) 互补, 分别服务于拖拽与复制场景.
3. 可编辑控件全局豁免: 输入框、文本域、contenteditable 元素保持原生行为, 避免破坏正常表单交互.
4. replace 模式的联动约束: 选区必须存活, 故 selectStyle 默认关闭、Ctrl+C 快捷键放行、copy 事件必须 preventDefault 防止载荷被覆盖.
5. 快捷键双通道匹配( e.key 并集 e.code) 覆盖非拉丁布局与重映射布局两类绕过.
6. 生命周期事务性: enable 失败整体回滚, disable 逐个尽力卸载, 保证任何状态下都不残留无法移除的监听器或样式.
7. 防御性细节: 跨 realm 鸭子类型判定、无效选择器过滤、HTML 风味同步替换、iOS 长按菜单抑制, 均针对真实绕过路径.

## 9. 已知局限

- 客户端防护本质是威慑: 查看源码、禁用 JS、直接请求接口均可获取内容.
- DevTools 检测为尺寸差启发式, 独立窗口不可检测, 存在误报可能.
- 浏览器菜单触发的打印由 @media print 规则兜底, 但若页面自身样式以更高优先级覆盖 body 显示则可能失效( 注入规则已使用 !important 缓解) .
- 过度拦截方向是有意为之: AZERTY 等布局下可能误拦与受保护按键同物理位置的其他组合键.
