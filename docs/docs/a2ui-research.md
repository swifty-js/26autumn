# A2UI 调研: 协议、shadcn 组件库与 swifty-agent 应用

调研日期: 2026-08-20
调研来源:
- swifty-mcp 本地知识库中的 A2UI 官方文档( a2ui/ 目录, 含 introduction、concepts、reference、guides、ecosystem)
- /Users/hangtiancheng/github/a2ui/packages/shadcn( @swifty.js/a2ui-shadcn 包源码)
- /Users/hangtiancheng/github/swifty-cli/apps/swifty-agent( A2UI 应用源码)

---

## 摘要

A2UI( Agent to UI) 是一个面向 agent 驱动界面的声明式 UI 协议: AI agent 不返回纯文本, 也不向客户端注入 HTML/JS, 而是发送一组 JSON 消息来描述界面, 客户端用本地组件库把消息渲染成原生 UI. 协议由 Google 发起、CopilotKit 与开源社区共建, Apache 2.0 许可, 当前版本 v0.9.1( v1.0 候选中) .

本次调研的三个部分构成一条完整链路: 协议本身回答"agent 和 UI 之间说什么"; a2ui/packages/shadcn 回答"客户端怎么把协议消息渲染成 shadcn 风格的界面", 它是一个包含 65 个组件的 catalog 加渲染器加 prompt 生成器的三合一库; swifty-cli/apps/swifty-agent 回答"一个真实应用怎么把整条链路跑起来", 它是一个 AI OnCall 运维助手, 不依赖 CopilotKit, 自研了从 prompt 注入、流式提取、校验纠错到交互回传的全套管线.

核心结论: A2UI 的关键设计( 扁平邻接表组件、结构与状态分离、catalog 契约化) 都是围绕"让 LLM 可靠地生成 UI"这个目标做的取舍; 而 shadcn 包与 swifty-agent 的实践则补齐了协议落地中最难的工程环节——catalog 与 prompt 的单一事实源、流式输出的有状态过滤、以及 surface 交互的原地更新闭环.

---

## 一、A2UI 协议( 基于 swifty-mcp 知识库)

### 1.1 定位与要解决的问题

A2UI 的定义: 一个声明式 UI 协议, 让 AI agent 生成富交互 UI, 并在 web、移动端、桌面端原生渲染, 全程不执行任意代码.

它针对两个痛点:

第一, 纯文本交互低效. 典型例子是订位: 用户说"帮我订明天晚上 7 点两个人的位子", agent 如果只能文本追问"哪一天? 几点? 几位?", 就要来回多轮; 更好的做法是 agent 直接生成一个带日期选择器、时间选择器和提交按钮的表单, 用户用 UI 而不是文本来交互.

第二, 多 agent 系统中的信任边界问题. agent 往往运行在远端( 不同服务器、不同组织) , 不能直接操作用户的 UI, 只能发消息. 传统做法是发 HTML/JavaScript 塞进 iframe, 代价是体积重、视觉割裂、安全复杂、无法匹配宿主应用样式. A2UI 的目标是: 传输一种"像数据一样安全、像代码一样有表现力"的 UI 描述.

一句话概括官方表述: A2UI 解决的是"AI agent 如何跨信任边界安全地发送富 UI". agent 发送的是声明式组件描述, 客户端用自己的原生控件渲染, 相当于让 agent 说一种通用的 UI 语言.

### 1.2 三个核心设计思想

协议围绕三个核心概念构建:

1. 流式消息( Streaming Messages) : UI 更新以 JSON 消息序列的形式从 agent 流向客户端, 任何消息都可能处于"未完成"( 部分送达) 状态, 天然适配 LLM 的流式输出, 支持渐进式渲染——用户看着 UI 一块块长出来, 而不是盯着转圈.
2. 声明式组件( Declarative Components) : UI 被描述为数据, 而不是被编程为代码.
3. 数据绑定( Data Binding) : UI 结构与应用状态分离, 状态变化驱动响应式更新.

### 1.3 消息类型与格式

所有 A2UI 消息都是 JSON 对象, 以 JSON Lines( JSONL) 传输, 每行恰好一条消息.

v0.8( Legacy) 消息类型:
- beginRendering: 通知客户端渲染一个 surface
- surfaceUpdate: 新增或更新组件
- dataModelUpdate: 更新应用状态
- deleteSurface: 删除 surface

v0.9( 当前) 消息类型, 所有消息都带 "version": "v0.9" 字段:
- createSurface: 创建 surface 并指定其 catalog
- updateComponents: 新增或更新组件
- updateDataModel: 更新应用状态
- deleteSurface: 删除 surface

一个 v0.8 风格的简化示例( 订位表单) :

```json
{"surfaceUpdate": {"surfaceId": "main", "components": [
  {"id": "header", "component": {"Text": {"text": {"literalString": "Book Your Table"}, "usageHint": "h1"}}},
  {"id": "date-picker", "component": {"DateTimeInput": {"label": {"literalString": "Select Date"}, "value": {"path": "/reservation/date"}, "enableDate": true}}},
  {"id": "submit-btn", "component": {"Button": {"child": "submit-text", "action": {"name": "confirm_booking"}}}}
]}}
```

### 1.4 组件结构: 邻接表模型

A2UI 用邻接表( adjacency list) 而非嵌套树来表达组件层级: 组件是一个扁平列表, 父子关系靠 ID 引用.

```json
{
  "surfaceUpdate": {
    "surfaceId": "main",
    "components": [
      {"id": "root", "component": {"Column": {"children": {"explicitList": ["header", "body"]}}}},
      {"id": "header", "component": {"Text": {"text": {"literalString": "Welcome"}}}},
      {"id": "body", "component": {"Card": {"child": "content"}}},
      {"id": "content", "component": {"Text": {"text": {"path": "/message"}}}}
    ]
  }
}
```

为什么不用嵌套树:
- 嵌套树要求 LLM 一次性生成完美嵌套, 容错差; 扁平列表对 LLM 友好.
- 扁平结构可以增量流式发送组件.
- 任何组件都能按 ID 单独更新, 不必重发整棵树.
- 结构与数据清晰分离.

### 1.5 数据绑定: 结构与状态分离

数据绑定用 JSON Pointer 路径( RFC 6901) 把组件连接到应用状态. 每个 surface 持有一个分层的 JSON 数据模型( Data Model) , 它是可观察的、由 renderer 与 agent 共享、双方都可更新:

```json
{
  "user": {"name": "Alice", "email": "alice@example.com"},
  "cart": {
    "items": [{"name": "Widget", "price": 9.99, "quantity": 2}],
    "total": 19.98
  }
}
```

这个设计带来的能力: 响应式更新、数据驱动 UI、可复用模板、双向绑定. 组件绑定到数据模型节点后, 值变化时自动更新; 用户交互被捕获进状态对象回传 agent, agent 也可以反向推送数据更新. 由于结构与状态分离, 大数组数据的布局可以高效定义, 内容更新不必从头重新生成.

### 1.6 用户动作: Function 与 Event

组件通过 action 属性触发两类行为:
- Function: 在 renderer 本地执行的函数, 保证交互的即时响应.
- Event: 派发给 agent 的事件, 携带上下文数据.

客户端处理用户动作的标准流程: 捕获组件的动作事件 → 解析动作所需的数据上下文 → 发送给 agent → 处理 agent 返回的消息.

此外还有数据模型同步机制, 保证 agent 始终能拿到完整 UI 状态, 从而支持语音指令等多模态交互.

### 1.7 Catalog: agent 与 renderer 的契约

Catalog( 组件目录) 是 A2UI 的关键抽象: renderer 向 agent 提供"我支持哪些组件和函数"的清单及使用说明, agent 据此生成 UI. 交互循环是:

1. Renderer 把 catalog 与使用说明交给 agent.
2. Agent 循环: 依据 catalog 生成 UI 与函数调用 → 接收 renderer 回传的用户输入 → 更新要展示的数据.

Catalog 的 JSON Schema 结构: 一个对象包含 catalogId( 唯一标识) 、components( 组件定义, 值为 JSON Schema) 、functions( 函数定义数组) 、theme( 主题属性 schema) .

官方维护一个 Basic Catalog( 位于规范目录 specification/v0_9/catalogs/basic/catalog.json) , 包含 Button、Input、Card 等通用组件. 它不是什么特殊类型, 只是一个官方写好 schema 且有开源 renderer 的现成目录, 刻意保持精简以便各 renderer 实现. 官方明确: 不追求跨客户端的标准化 catalog——因为 UI 由 LLM 生成, LLM 可以针对每个前端解释各自的 catalog, 所以"你的设计系统才是重点", 任何组件集合都能注册, catalog 就是 agent 与 renderer 之间的契约.

### 1.8 安全模型

安全是协议的一等原则:

- 沙箱化执行: 禁止 agent 注入任意代码( 如原始 JavaScript) , agent 只能触发预先注册的行为. functionCall 机制是 agent 与 renderer 环境交互的唯一安全通道.
- 对不受信的第三方代码, A2UI 采用双 iframe 隔离模式运行 MCP Apps: 内层 iframe 严格排除 allow-same-origin, 防止"allow-scripts + allow-same-origin"组合导致的沙箱逃逸, 同时维持结构化 JSON-RPC 通道.

### 1.9 传输层与生态

A2UI 与传输层解耦, 任何能送 JSON 的通道都行: A2A 协议、AG-UI、REST/SSE、WebSocket、gRPC、消息队列等.

生态定位上的两个关键对照:
- AG-UI 是传输协议( 连接 agent 后端与前端、实时状态同步) , A2UI 是 UI 格式( 描述渲染什么的有效载荷) . 二者互补: AG-UI 是管道, A2UI 是内容. AG-UI 由 CopilotKit 团队发起, 对 A2UI 有 day-zero 兼容.
- 对比 OpenAI ChatKit: 设计哲学相近( 基础组件 + 可配置声明式抽象层) , 但 A2UI 是平台无关的, 面向跨 web/移动/桌面自建 agentic 界面, 以及需要跨信任边界渲染的多 agent 系统.

官方 renderer 覆盖 Angular、Flutter、Lit、Markdown、React 等; 社区有基于 ShadCN 的 React renderer( 如 @xpert-ai/a2ui-react) . 实际采用案例包括 Google 内部团队、AG2 多 agent 框架( A2UIAgent) 、CopilotKit 全栈框架等. 配套工具有 A2UI Composer( 可视化编辑器, 无需安装即可生成 A2UI JSON) 和 A2UI Theater( 预置流式场景的演示场) .

---

## 二、@swifty.js/a2ui-shadcn: shadcn 组件库 catalog

路径: /Users/hangtiancheng/github/a2ui/packages/shadcn
所在 monorepo: /Users/hangtiancheng/github/a2ui( pnpm workspace, 含 packages/{lit, react, server, shadcn}) , 是官方 restaurant-finder 示例的全栈 TypeScript 移植, 协议固定 A2UI v0.9.

### 2.1 定位: 渲染端 + 生成端三合一

包名 @swifty.js/a2ui-shadcn, version 0.0.1, ESM, 库构建产物在 dist/. 定位是"用 shadcn/ui 重新实现官方 basic catalog 并大幅扩展"的 React 客户端库. 它有三个导出入口, 对应三个职责:

- "." → src/index.ts: 渲染器( A2uiView) + catalog 再导出
- "./catalog" → src/catalog/index.ts: 组件 catalog 注册表
- "./prompt" → src/prompt/index.ts: LLM 系统提示词生成器

也就是说这个包同时覆盖"渲染端"( 把 A2UI 消息画出来) 和"生成端"( 教 LLM 怎么产出 A2UI 消息) 两侧.

关键依赖:
- 协议栈: @a2ui/react ^0.10.2、@a2ui/web_core ^0.10.6、@a2ui/markdown-it ^0.1.1
- UI 底座: @base-ui/react( 注意是 Base UI 原语而非 Radix) 、class-variance-authority、clsx、tailwind-merge、lucide-react、cmdk、recharts、react-day-picker、embla-carousel-react、react-resizable-panels、input-otp
- peer: react ^18||^19、zod ^3

构建( vite.config.ts) 双模式: lib 模式三入口输出 ES + CJS + d.ts, 所有依赖外部化; 默认 app 模式跑 demo( 端口 5005) , 并注册 middleware/a2a.ts 的 Vite 插件把浏览器请求包装成 A2A 协议代理到后端 server 包.

### 2.2 Catalog 注册机制

注册表在 src/catalog/index.ts:

```ts
export const SHADCN_CATALOG_ID =
  "https://raw.githubusercontent.com/hangtiancheng/a2ui/main/packages/shadcn/catalog.json";

const components: ReactComponentImplementation[] = [
  Text, Image, Icon, Video, AudioPlayer, Row, Column, List, Card, Tabs,
  Divider, Modal, Button, TextField, CheckBox, ChoicePicker, Slider, DateTimeInput,
  ...shadcnExtensionComponents,
];

export const shadcnCatalog = new Catalog<ReactComponentImplementation>(
  SHADCN_CATALOG_ID, components, BASIC_FUNCTIONS,
);
```

要点:
- Catalog 类来自 @a2ui/web_core/v0_9, 本质是"catalogId + 组件实现表 + 函数表( BASIC_FUNCTIONS) "的注册表.
- 18 个 basic 组件( src/catalog/components/) 直接复用官方 basic_catalog 的 zod Api schema( ButtonApi、TextApi、TextFieldApi、ListApi 等) , 只替换视觉层为 shadcn 实现.
- 47 个扩展组件( src/catalog/shadcn/) 按家族分组: display( Alert/Avatar/Badge/Progress/Skeleton/Spinner 等) 、structure( Accordion/Carousel/Table/Resizable 等) 、overlays( AlertDialog/Drawer/Sheet/Tooltip/Popover 等) 、navigation( Breadcrumb/Menubar/Pagination 等) 、forms( Calendar/Combobox/Command/Select/Switch/InputOtp 等) 、chat( Bubble/Message/MessageScroller/Questionnaire/Attachment/Marker) 、data( Chart) . 源码注释明确排除了 sidebar( 属于应用骨架) 、toast( 命令式 API) 、direction( provider 性质) .
- 合计 65 个组件, 已与生成的 catalog.json 核对一致.

组件声明方式: 每个组件是 createComponentImplementation( Api, renderFn) ( 来自 @a2ui/react/v0_9) . 扩展组件自定义 Api = { name, schema: z.object({...}).strict() }. 例如 Alert:

```tsx
export const AlertApi = {
  name: "Alert",
  schema: z.object({
    ...COMMON,
    title: DynamicStringSchema.describe("The alert title."),
    description: DynamicStringSchema.describe("The alert description.").optional(),
    variant: z.enum(["default", "destructive"]).default("default"),
    icon: ICON_NAME.optional(),
  }).strict(),
};
export const Alert = createComponentImplementation(AlertApi, ({ props }) => (...));
```

共享 props 在 src/catalog/shadcn/common.ts: COMMON = { weight, accessibility }、ICON_NAME( 由 ICON_MAP 派生的枚举, 映射到 lucide-react 图标) 、MENU_ENTRY.

basic 组件的渲染示例( button.tsx) 展示了协议 prop 到 shadcn 的映射:

```tsx
export const Button = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const variant = (props.variant && VARIANT_MAP[props.variant]) || "outline"; // primary→default, borderless→ghost
  return (
    <UIButton variant={variant} onClick={props.action} disabled={props.isValid === false}>
      {props.child ? buildChild(props.child) : null}
    </UIButton>
  );
});
```

### 2.3 catalog.json 的生成: 单一事实源

scripts/catalog.ts( pnpm catalog) 负责生成 catalog.json( 约 118KB, 65 个组件的 JSON Schema) :

1. 合并官方 basic catalog( 仓库根 catalog.json, postinstall 时从 A2UI v0.9 规范下载) 与 47 个扩展组件.
2. 用 zod-to-json-schema 把扩展组件的 zod schema 转成 JSON Schema.
3. 协议公共类型( DynamicString、Action、DataBinding 等) 通过"形状签名"匹配后改写成 $ref 指向 https://a2ui.org/specification/v0_9/common_types.json, 以缩小体积.
4. 以 SHADCN_CATALOG_ID 重新发布, 并同步拷贝到 src/prompt/schemas/catalog.json.

这份 catalog.json 会被服务端嵌入 LLM 系统提示词, 因此 schema 变更后必须重新生成并提交. 这构成了"组件实现 → zod schema → catalog.json → LLM prompt"的单一事实源链路: 改组件 props, prompt 契约自动跟着变.

monorepo 根 AGENTS.md 还记录了一条重要约定: 服务端不得 import 本包的 Catalog 实例( Map 序列化会丢组件契约) , 只能读 catalog.json 文件.

### 2.4 渲染器 A2uiView 与 MessageProcessor

核心渲染组件 src/a2ui-view.tsx 的流程:

```tsx
export function A2uiView({ messages, onAction, onRawAction }: A2uiViewProps) {
  // 1. zod 校验: A2uiMessageSchema.safeParse, 非法消息丢弃并 console.error
  // 2. 创建处理器
  const processor = useMemo(() => new MessageProcessor<ReactComponentImplementation>(
      [shadcnCatalog],
      (action) => {
        if (onRawActionRef.current) onRawActionRef.current(action);
        else onActionRef.current?.(buildQueryFromAction(action));
      }), []);
  // 3. 增量处理新消息 + 订阅 surface 生命周期
  processor.onSurfaceCreated(...); processor.onSurfaceDeleted(...);
  processor.processMessages(pending);
  // 4. 渲染所有 surface
  return (
    <MarkdownContext.Provider value={renderMarkdown}>
      {surfaces.map((s) => <A2uiSurface key={s.id} surface={s} />)}
    </MarkdownContext.Provider>
  );
}
```

- MessageProcessor( @a2ui/web_core/v0_9) 是协议中枢: 接收 Catalog 数组与全局 actionHandler, 维护 SurfaceGroupModel, 提供 processMessages、onSurfaceCreated/Deleted、getClientCapabilities. 它是有状态的外部存储( 这一点在 swifty-agent 里导致了关闭 React StrictMode 的配置, 见 3.2) .
- 支持的消息类型即 A2uiMessageSchema 联合: createSurface / updateComponents / updateDataModel / deleteSurface.
- A2uiSurface( @a2ui/react/v0_9) 从 surface 的根组件( root) 开始按组件 ID 引用递归渲染, 子组件通过渲染上下文的 buildChild( id, basePath) 构建.
- Markdown 渲染: MarkdownContext 注入 @a2ui/markdown-it 的 renderMarkdown, Text 组件默认 variant 走 use-markdown.ts 异步渲染为 HTML.

标准消息三段式( app/mock/restaurant-messages.ts 示例) : createSurface( 声明 surfaceId + catalogId + theme) → updateComponents( 扁平组件树, children 用 ID 引用) → updateDataModel( 写入数据) . 列表模板通过 children: { componentId: "item-card-template", path: "/items" } 把模板组件与数据数组绑定, 模板内部用相对路径( { path: "name" }) 取每项字段.

### 2.5 数据绑定与双向同步

Dynamic 类型( DynamicStringSchema 等) 是三态联合:
- 字面量: "Book Now"
- 数据绑定: { path: "/title" }( 绝对路径) 或 { path: "name" }( 列表模板内相对 basePath)
- 函数调用: { call, args, returnType }( 使用 BASIC_FUNCTIONS)

ActionSchema 的 wire 形态为 { event: { name, context? } }( context 值可再嵌 {path} 绑定) 或 functionCall.

求值由 web_core 的 generic binder 按 zod schema 结构化完成, 规则是:
- DynamicString/Number/Boolean/ValueSchema 标注的 prop 解析为实际值, 并自动生成 setX 回写函数( 写回 {path} 绑定的数据模型) ;
- ActionSchema 标注的 prop 变成可调用函数;
- ComponentIdSchema/ChildListSchema 变成 buildChild 能力;
- z.any() 保持静态, 不参与绑定.

双向绑定示例( text-field.tsx) : value={props.value || ""} onChange={(e) => props.setValue(e.target.value)}. 由于 schema 都是 .strict() 的, MessageProcessor 运行时会拒绝未知 prop.

### 2.6 事件回传 agent 的完整链路( demo 的 A2A 路径)

1. 组件触发: Button 的 onClick={props.action} → binder 产出 A2uiClientAction( strict schema: {name, surfaceId, sourceComponentId, timestamp, context}) .
2. MessageProcessor 的 actionHandler → A2uiView: 要么调 onRawAction( action) 交给宿主应用, 要么用 buildQueryFromAction 转成文本: "[a2ui_action] {name}\ncontext: {JSON}".
3. demo( app/App.tsx) 中 onRawAction 把 { version: "v0.9", action } 交给 A2UIClient.send( src/client.ts) , POST 到相对路径 /a2a.
4. middleware/a2a.ts( Vite dev 插件) 把裸文本/裸 action JSON 包装成 A2A 信封 {message:{messageId, contextId?, role:"user", parts, kind}}: JSON 事件变 {kind:"data", mimeType:"application/a2ui+json"} part, 文本变 {kind:"text"} part; 附带 X-A2A-Extensions: https://a2ui.org/a2ui-extension/a2ui/v0.9 头, 代理到 A2A_SERVER_URL( 默认 http://localhost:10002, 即 packages/server) .
5. 响应为 SSE 或一次性 JSON; A2UIClient 解析 parts: status-update 捕获 contextId( 后续用 X-A2A-Context-Id 头回传实现多轮会话) , data part 经 A2uiMessageSchema.safeParse 后成为新的 A2UI 消息, 支持 onChunk 流式增量渲染, 并对重复 createSurface 去重.

### 2.7 prompt 生成端

src/prompt/( ./prompt 导出) 把 A2UI Python agent SDK 的四种推理格式提示词生成器移植为 TypeScript: DirectJsonPromptGenerator / ElementalPromptGenerator / AtomPromptGenerator / ExpressPromptGenerator, 内嵌 schemas/{catalog,common_types,server_to_client}.json, 对外提供 generateSystemPrompt( format, options) . swifty-agent 服务端正是用它把协议契约注入系统提示词( 见 3.3) .

### 2.8 与 @a2ui 其他包的关系

- @a2ui/web_core( v0.10.6, 框架无关协议核心) : 全部 zod 协议 schema、Catalog、MessageProcessor、SurfaceModel/SurfaceGroupModel, 以及 basic_catalog( 18 个组件 Api 契约 + BASIC_FUNCTIONS) . shadcn 包完全依赖它做协议校验与状态管理.
- @a2ui/react( v0.10.2, React 适配器) : createComponentImplementation( 自动完成 Dynamic prop 解析、setValue 生成、action 可调用化) 、A2uiSurface/DeferredChild 渲染入口、useMarkdownRenderer/MarkdownContext.
- @a2ui/markdown-it: Markdown 渲染实现.
- monorepo 兄弟包: packages/server( 端口 10002 的 A2A agent 服务; A2UI_MODE=shadcn 时把本包 catalog.json 嵌入 LLM 系统提示词) ; packages/react、packages/lit 是同一示例的另外两个前端实现.

值得注意的两处文档漂移: 根 AGENTS.md 描述早期版本"注册在官方 basic catalog URI 下", 当前代码已改为独立的 SHADCN_CATALOG_ID( GitHub raw URL) , mock 消息与 createSurface 均引用该 id——以代码为准; swifty-agent 侧的 AGENTS.md 也有两处过时描述( 见 3.6) .

---

## 三、swifty-agent: 一个完整的 A2UI 应用

路径: /Users/hangtiancheng/github/swifty-cli/apps/swifty-agent

### 3.1 定位与技术栈

定位: AI 智能 OnCall 运维助手( README 首行 "AI intelligent OnCall assistant") , 核心场景是告警分析、日志查询、Prometheus 运维问答, 并通过 A2UI 让 LLM 直接生成交互式 UI( 告警列表卡片、指标图表、静默表单等) .

技术栈( package.json) :
- 框架: Next.js 16.2.9( App Router) + React 19.2.4 + TypeScript 6; 入口 app/layout.tsx、app/page.tsx( 主聊天界面) 、app/gallery/page.tsx( A2UI 组件画廊)
- AI SDK: Vercel AI SDK v7( ai ^7.0.43) , streamText/generateText + tools + stopWhen: isStepCount( n) ; provider 为 @ai-sdk/openai 与 @ai-sdk/anthropic, lib/ai/models.ts 按 LLM_PROVIDER 切换, 区分 thinkModel/quickModel
- A2UI 依赖: @a2ui/web_core ^0.10.6、@a2ui/react ^0.10.2、@a2ui/markdown-it, 以及 "@swifty.js/a2ui-shadcn": "file:../../../a2ui/packages/shadcn" ——本地 file 链接到上文调研的 shadcn 包, 两个仓库由此耦合
- 其他: Redis Stack 向量检索( RAG) 、knex+mysql2、MCP SDK( 日志工具) 、prom-client、Tailwind v4、streamdown

目录约定( AGENTS.md) : app/( 路由+API) 、lib/( 服务端: lib/ai/{a2ui,pipelines,tools}、lib/redis) 、components/、hooks/.

### 3.2 集成方式: 自研链路, 不用 CopilotKit

这是本应用最重要的架构选择: 没有使用 CopilotKit, 而是服务端用 @swifty.js/a2ui-shadcn/prompt 生成提示词, 客户端用该包的 A2uiView 渲染.

一个配套的关键配置( next.config.ts) :

```ts
// The A2UI MessageProcessor is a stateful external store; StrictMode's dev
// double-effect replays already-created surfaces on re-subscription.
reactStrictMode: false,
```

即 MessageProcessor 是有状态外部存储, StrictMode 的开发态双执行会重放已创建的 surface, 所以关闭 StrictMode.

客户端渲染入口( components/msg-list.tsx) : 每条带 a2ui 数据的助手消息渲染一个 A2uiView:

```tsx
import { A2uiView } from "@swifty.js/a2ui-shadcn";

{message.a2ui && message.a2ui.length > 0 && (
  <A2uiView
    messages={message.a2ui}
    onRawAction={(action) => onA2uiAction(index, action)}
  />
)}
```

A2uiView 内部( 见 2.4) 用 processedCount ref 记录已处理条数, 只把新增消息交给 processor.processMessages——这个增量处理机制正是支持"原地更新"( action 回传后追加 update 消息) 的基础.

Catalog 一致性: 服务端 lib/ai/a2ui/prompt.ts 从 SHADCN_PROMPT_CATALOG.catalogSchema.catalogId 取出与客户端 shadcnCatalog 相同的 catalogId, 保证 createSurface.catalogId 与客户端注册一致( 源码注释明确: 不一致时 renderer 会抛 "Catalog not found") .

### 3.3 生成侧: LLM 如何产出 A2UI 消息

Prompt 构造( lib/ai/a2ui/prompt.ts) :

```ts
import { A2UI_CLOSE_TAG, A2UI_OPEN_TAG, applySchemaModifiers, generateSystemPrompt,
  removeStrictValidation, SHADCN_PROMPT_CATALOG } from "@swifty.js/a2ui-shadcn/prompt";

const PROMPT_CATALOG = applySchemaModifiers(SHADCN_PROMPT_CATALOG, [removeStrictValidation]);

export const A2UI_PROMPT_SECTION = generateSystemPrompt("direct-json", {
  roleDescription: `## Interactive UI (A2UI v0.9) ...`,
  workflowDescription: `- WHEN: only when the answer presents structured data ...`,
  includeSchema: true,
  examples: [renderExample("ALERT_LIST_EXAMPLE", buildAlertListExample()), ...].join("\n"),
}, PROMPT_CATALOG);
```

要点:
- 采用 "direct-json" 生成模式: LLM 在 markdown 回复之后追加一个 <a2ui-json>[...]</a2ui-json> 标签块( JSON 消息数组) , 与文本共用同一输出通道, 而非独立通道.
- prompt 内嵌完整的 server-to-client schema + common types + shadcn catalog schema 契约, 外加 3 个由 builder 函数生成的 few-shot 示例( 告警列表、QPS 指标报告、静默表单) . builder 化的好处是: 改 UI 结构只需改 builder, prompt 自动同步.
- removeStrictValidation 去掉 closed-object 约束, 避免 LLM 因无害的额外字段被过度拒绝.
- 另有 A2UI_ACTION_SYSTEM_PROMPT: 通过 allowedMessages: ["UpdateComponentsMessage", "UpdateDataModelMessage"] 裁剪 schema, 使 action 场景下 createSurface/deleteSurface 根本无法通过校验.

两条生成管线:
- 非流式 POST /api/chat → lib/ai/pipelines/chat.ts: RAG 检索( lib/redis/retriever.ts) + 历史记忆 → generateText( tools + 25 步上限) → extractA2ui( raw) 从完整输出中切出 <a2ui-json> 块并用 @a2ui/web_core/v0_9 的 A2uiMessageListSchema.safeParse 校验 → 返回 { answer: cleanText, a2ui }.
- 流式 POST /api/chat_stream → chatStream() async generator, 其中 createA2uiStreamFilter()( lib/ai/a2ui/extract.ts) 是一个有状态流过滤器: 普通文本即时透传( 仅扣留可能是标签前缀的尾部) , <a2ui-json> 块内容静默缓冲直到闭合标签; 完整块经 parseA2uiBlock 校验后以 {type:"a2ui", messages} 事件一次性 yield; SSE 用 event: a2ui + data 发送( 共 message/a2ui/done/error 四种事件) . 注释细节: 部分标签跨 chunk 时扣留, 未闭合块在 flush 时还原为纯文本而非静默丢弃.

纠错重试: 块校验失败时调用 correctA2uiBlock( lib/ai/a2ui/correct.ts) ——关闭工具的一次重试, 把错误信息回灌给模型要求只输出修正块; 仍失败则降级为 notice( "> Failed to render the interactive view..." ) , 绝不伪造 UI 数据.

### 3.4 消费侧: 前端如何接收与渲染

hooks/use-chat.ts:
- ChatMessage.a2ui?: unknown[] 挂在助手消息上, 持久化到 localStorage 历史.
- SSE 解析器处理 event: a2ui: z.array( z.unknown()) .min( 1) .safeParse( JSON.parse( payload)) 后追加到最后一条助手消息的 a2ui 数组.
- 设计红线( AGENTS.md) : web_core 自带 zod v3, 不得与应用层 zod/v4 混用, 边界一律 unknown[], 渲染时才由 web_core schema 逐条校验.
- A2uiView 内部 MessageProcessor 消费 createSurface → updateComponents → updateDataModel, 生成 SurfaceModel 交给 A2uiSurface 渲染.

### 3.5 交互回传: out-of-band action 原地更新闭环

这是本应用最有特色的设计——surface 内的动作不走聊天消息流:

1. 用户点击 surface 内按钮 → MessageProcessor 回调 → A2uiView.onRawAction( action) ( A2uiClientAction: {name, surfaceId, sourceComponentId, context}) .
2. msg-list.tsx → use-chat.ts 的 sendA2uiAction( messageIndex, action) : POST /api/a2ui_action, body 为 { action, a2ui: 该消息当前的完整 a2ui 消息列表 }( 即 surface 的权威状态) .
3. 服务端 app/api/a2ui_action/route.ts → lib/ai/a2ui/action.ts 的 runA2uiAction: buildA2uiActionPrompt 把 action payload + surface 全量消息作为 user prompt; generateText( A2UI_ACTION_SYSTEM_PROMPT + tools + 10 步) → extractA2ui + 纠错重试; filterInPlaceMessages 只保留针对同一 surfaceId 的 updateComponents/updateDataModel( 注释: 杂散的 createSurface 会让客户端 MessageProcessor 抛 "Surface already exists" 并丢弃整批) .
4. 客户端把返回的 patch 追加到原消息的 a2ui 数组, A2uiView 增量 processMessages 原地更新 surface( 例如表单提交后在原表单卡片内显示状态行) .

由此形成"生成 → 渲染 → 交互 → 原地更新"的完整闭环, 且更新不产生新的聊天气泡, 交互体验收敛在 surface 内部.

### 3.6 AI Ops 管线与其他后端

POST /api/ai_ops → lib/ai/pipelines/plan-execute-replan: Planner( think 模型结构化输出 steps) → Executor( quick 模型+工具逐步执行) → Replanner 循环( ≤20 轮) ; 完成后 uiifyReport() 用 think 模型做一次无工具的"UI 化"后处理, 把报告可选地渲染为 A2UI surface 随 data.a2ui 返回; 失败绝不影响报告本身.

其他 API: chat( 非流式) 、chat_stream( SSE) 、a2ui_action、ai_ops、upload( 知识库上传) 、log/metrics( sentry/Prometheus) ; 统一响应形状 { message, data } . 工具三层拆分( lib/ai/tools/) : schemas.ts( zod) → operations.ts( 纯函数) → index.ts( AI SDK tool) , 含 get_current_time、mysql_crud、query_internal_docs( RAG) 、query_prometheus_alerts, 另有经 MCP SDK 引入的 SSE 日志工具. instrumentation.ts 启动时把 data/docs/ 文档全部 embedding 入 Redis 向量库.

文档要点: README.md 逐字列出各条管线的 prompt 并给出架构图; AGENTS.md 的 "A2UI integration (v0.9)" 一节记录关键约定( 单 <a2ui-json> 块、safeParse 校验、zod v3/v4 红线、纠错只重试一次且失败诚实降级、Memory 保存带标签的原始文本) . 注意 AGENTS.md 有两处已过时: 它称 action 序列化为 [UI_ACTION] 走聊天通道、renderer 在 components/a2ui-view.tsx——现行代码已改为 onRawAction → /api/a2ui_action 带外链路, renderer 来自 @swifty.js/a2ui-shadcn 包.

验证手段: /gallery 页面无后端渲染全部 shadcn 扩展组件( Alert/Avatar/Badge/Table/Accordion/Drawer/Sheet/Popover/Calendar/Combobox/Command/Chart 等, 消息顺序 createSurface → updateDataModel → updateComponents) ; scripts/a2ui-smoke.ts 检查 prompt 示例、流过滤器分块与校验语义.

### 3.7 具体 A2UI 界面示例

prompt few-shot builder 覆盖三类运维界面:
- buildAlertListExample: Column/Text/List( 模板绑定 children:{componentId, path:"/alerts"} ) /Card/Row/Badge/Button( action ack_alert, context 用相对路径绑定) ——告警卡片列表.
- buildMetricsReportExample: Chart( variant:"line", series/xKey) + Table( columns/rows 绑定 /rows) ——QPS 指标报告.
- buildSilenceFormExample: Card + TextField×3( value 绑定数据模型) + Button( action create_silence, context 携带表单值) ——告警静默表单.
- buildSilenceActionUpdateExample: action 原地更新示例( upsert form-body 加入 status-text, updateDataModel {path:"/status"} ) .

---

## 四、调研结论

### 4.1 协议层面的关键取舍

1. A2UI 的所有核心设计都服务于"让 LLM 可靠生成 UI": 扁平邻接表降低一次性生成的结构难度并支持增量流式; JSON Pointer 数据绑定把"结构"与"状态"拆开, 更新数据不必重发 UI; catalog 契约化让 LLM 只在已知组件集合内发挥, 把开放式代码生成收敛为受约束的 schema 填充.
2. 安全模型是"白名单式"的: 没有任意代码执行通道, agent 能做的只有声明组件、绑定数据、触发预注册的 function 与 event. 这让跨组织、跨信任边界的多 agent UI 成为可能.
3. 协议与传输、与组件库都是解耦的: 传输可以是 SSE/WebSocket/A2A/AG-UI, 组件库可以是任何设计系统. 官方甚至明说不追求跨客户端的标准 catalog, 因为解释 catalog 的本来就是 LLM.

### 4.2 shadcn 包的工程价值

1. 三合一( 渲染器 + catalog + prompt 生成器) 把 A2UI 落地所需的两侧能力封装进一个包, 宿主应用只需要 A2uiView 组件加一个 catalogId 约定.
2. catalog.json 生成管线( zod schema → JSON Schema → $ref 压缩 → 嵌入 prompt) 建立了组件实现与 LLM 契约的单一事实源, 避免了"改了组件忘了改 prompt"这类漂移.
3. 65 个组件( 18 basic + 47 shadcn 扩展) 证明 catalog 可以远超官方 Basic Catalog 的规模, 且扩展组件通过 .strict() zod schema + Dynamic/Action 结构化类型就能无缝接入 binder 的自动绑定与回写.

### 4.3 swifty-agent 的实践价值

1. 它示范了不依赖 CopilotKit 的完整自建链路: prompt 注入( direct-json 模式) → 流式有状态过滤 → zod 校验 → 一次纠错重试 → 诚实降级, 每个环节都有明确失败语义.
2. out-of-band action 管线( /api/a2ui_action + filterInPlaceMessages + 增量 processMessages) 是协议文档里没有现成答案、但真实应用必须解决的问题——surface 交互如何原地更新而不污染聊天流. 其防御性细节( 只允许 updateComponents/updateDataModel、只保留同一 surfaceId、防 "Surface already exists") 都是踩过坑后的经验.
3. 通过 file: 链接直接依赖本地 a2ui/packages/shadcn, 说明这两个仓库是协同演进的: 协议库提供能力, 应用侧反哺真实场景需求.

### 4.4 需要注意的风险与坑

1. zod 版本红线: @a2ui/web_core 内置 zod v3, 应用层若用 zod v4 不得混用 schema, 边界必须用 unknown[] 隔离.
2. MessageProcessor 有状态: React StrictMode 双执行会重放 surface, 开发态需关闭或妥善处理.
3. catalogId 必须两端一致, 否则 renderer 抛 "Catalog not found"; 服务端只能消费 catalog.json 文件, 不能 import Catalog 实例( Map 序列化丢契约) .
4. 消息批次中杂散的 createSurface 会导致整批消息被丢弃( "Surface already exists") , 服务端回传 patch 前必须过滤.
5. 文档漂移: 两个仓库的 AGENTS.md 都存在与现行代码不一致的描述, 以代码为准.
6. LLM 生成的 A2UI 块天然存在格式错误概率, 必须有校验 + 有限次纠错重试 + 诚实降级的完整兜底, 不能假设模型永远输出合法 JSON.

### 4.5 一句话总结

A2UI 把"agent 发 UI"这件事从发代码变成了发数据, 用 catalog 契约 + 数据绑定 + 扁平组件树换取了 LLM 生成的可靠性与跨信任边界的安全性; @swifty.js/a2ui-shadcn 用 65 个 shadcn 组件和三合一封装证明了协议可以承载真实设计系统; swifty-agent 则用一个运维助手应用验证了从 prompt 生成、流式渲染到交互原地更新的完整工程闭环, 其自研管线( 而非 CopilotKit) 为自建 agentic 应用提供了可复用的参考实现.
