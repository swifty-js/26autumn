# A2UI

## 背景与动机

生成式 AI 擅长产出文本和代码, 但 Agent 要向用户呈现富交互界面时很困难, 尤其是远程 Agent、或跨越信任边界的 Agent (例如编排器把任务委托给第三方的订票 Agent, 后者要往主聊天窗口里渲染一块 UI).

传统方式: 通过 iframe 传输 html/js -- Agent 直接生成一段 HTML/CSS/JS, 客户端用 iframe 加载渲染.

缺陷:

- 重: iframe 是独立的浏览上下文, 有独立的 DOM 树、样式表、JS 执行环境, 创建和通信开销大; 对话流里每插入一块 UI 就多一个 iframe, 页面迅速膨胀
- 结构乱: iframe 内外是两套 DOM, 布局嵌套、滚动联动、高度自适应都要跨框架手工协调
- 样式乱: iframe 内样式与宿主页面完全隔离, 无法继承宿主的设计系统 (主题、字体、间距), 视觉割裂
- 不安全: 这是最根本的问题. LLM 生成的 HTML/JS 属于不可信代码, 直接执行意味着 XSS、任意脚本执行等风险; 只能依赖 sandbox 属性做粗粒度隔离, 且隔离策略与业务组件体系脱节

此外, 直接让 LLM 输出目标框架代码 (如直接生成 React 组件源码) 也不可行: 代码无法在运行时安全执行, 且与客户端技术栈强耦合, 无法跨端复用.

## A2UI 的解法

A2UI (Agent-to-User Interface) 是 Google 开源的开放标准: 让 Agent "说 UI 语言". Agent 不产出代码, 而是产出一段声明式 JSON, 描述 UI 的意图 (组件结构 + 数据模型); 客户端用自身原生的组件库 (React / Lit / Angular / Flutter / SwiftUI) 渲染这段描述. 一句话概括: safe like data, but expressive like code -- 像数据一样安全, 像代码一样有表现力.

三大设计哲学:

- 安全 (Security first): LLM 输出结构化 JSON 数据而非可执行代码. 客户端维护一份 catalog (受信组件目录, 例如 Card / Button / TextField), Agent 只能请求渲染 catalog 内的组件; 组件如何渲染、事件如何执行完全由客户端掌控, 从根上消除 UI 注入风险
- LLM 友好、可增量更新 (LLM-friendly and incrementally updatable): UI 被抽象为扁平的组件列表 (邻接表, 靠 ID 引用建立父子关系), 而非深层嵌套树. 这种形态对 LLM 生成友好: 可以乱序输出、可以边生成边渲染 (流式 JSON + 渐进渲染, 首屏延迟低); 对话推进时 Agent 只需增量发送变更消息 (更新几个组件或几条数据), 不必重发整棵 UI
- 框架无关、可移植 (Framework-agnostic and portable): A2UI 将 UI 结构 (抽象组件树 + 数据模型) 和 UI 实现 (具体框架组件) 彻底分离. Agent 发送的 JSON 与框架无关, 同一份 payload 可以被 React、Lit、Angular、Flutter 等不同客户端各自映射到原生组件渲染; 客户端通过开放的注册机制把服务端组件类型映射到自定义实现 (smart wrapper), 甚至可以包装 iframe 等遗留内容, 并把沙箱策略掌握在自己手里

相比 iframe 方案的优势:

- 安全: 数据白名单机制 (catalog) 取代代码执行, 安全边界清晰且可由业务方自主加固
- 没有 iframe: A2UI 组件直接渲染在宿主组件树中, 无独立浏览上下文的开销, 性能更好; 样式走宿主设计系统, 主题、暗色模式、字体天然统一
- 可移植: 一份结构化 JSON 同时适用于 vanilla js / lit / react / mobile 等多端渲染器, Agent 侧零改动
- 可增量: 结构与数据分离, 改数据 (updateDataModel) 不必重发结构 (updateComponents), 传输和解析成本低
- 可校验: JSON 有完整 schema, 服务端可在下发前校验并让 LLM 自纠, iframe 方案里坏 HTML 只能直接渲染出来

Keywords: 流式传输 JSON、声明式 UI (抽象组件树/邻接表)、数据绑定 (JSON Pointer)、catalog 白名单、传输无关 (A2A / AG-UI / MCP / SSE)

本文以 React 渲染器 (@a2ui/react) + v0.9 协议为主线, 参考实现为 fork/a2ui/samples/client/react/shell (餐厅预订 demo), 并在末尾与 Lit 实现做对比. 在此之上补充两部分实践内容: @swifty.js/a2ui-shadcn 组件库 (用 shadcn/ui 重实现并扩展 catalog 的三合一包) 与 swifty-agent (一个不依赖 CopilotKit 的生产级 A2UI 应用案例).

## 概念

- Surface: 一块独立的 UI 区域 (页面/卡片), 由 surfaceId 标识, 拥有独立的组件树和数据模型
- Component: 组件, 扁平列表 + ID 引用 (邻接表), 必须存在 id 为 root 的根组件
- Data Model: 每个 Surface 一份 JSON 数据模型, 组件通过 JSON Pointer 路径绑定其中的数据
- Catalog: 客户端可信组件/函数目录, 由 catalogId 标识, Agent 只能使用 Catalog 内的组件
- Message: 一条 JSON 对象, 恰好包含四种信封键之一

## v0.9 消息类型

服务端 -> 客户端 (server_to_client):

- createSurface: 创建 Surface, 绑定 surfaceId + catalogId, 可携带 theme 和 sendDataModel
- updateComponents: 新增或更新 Surface 内的组件 (扁平列表)
- updateDataModel: 按 JSON Pointer 路径 upsert 数据模型, 省略 value 表示删除该路径
- deleteSurface: 删除 Surface 及其全部组件和数据

客户端 -> 服务端 (client_to_server):

- action: 用户交互事件 (点击按钮等), 携带 name / surfaceId / sourceComponentId / timestamp / context

v0.9 消息示例 (注意与 v0.8 的字段差异, 见文末对照表):

```json
{
  "version": "v0.9",
  "createSurface": {
    "surfaceId": "default",
    "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
    "theme": { "primaryColor": "#FF0000", "font": "Roboto" }
  }
}
```

## A2A 协议详解

A2A (Agent2Agent, a2a-protocol.org) 是 Agent 间以及 Agent 与前端应用间标准化通信的开放协议, 提供安全、认证、消息格式和传输的完整绑定. A2UI 本身传输无关, 但 A2A 是其最主流的传输层 (其余可选: AG-UI / MCP / SSE / WebSocket / REST). 在 A2UI 场景中, A2A 承担以下职责.

### AgentCard: 能力发现

每个 A2A Server 在固定路径暴露 AgentCard, 声明自身能力:

- 端点: `GET /.well-known/agent-card.json`
- 内容: 名称、描述、支持的扩展列表 (capabilities.extensions)、认证要求等

Agent 鼓励在 AgentCard 中声明 A2UI 扩展 (非强制), params 对象对应 server_capabilities.json schema:

```json
{
  "name": "Dashboard Agent",
  "description": "Agent capable of generating dynamic UI dashboards.",
  "capabilities": {
    "extensions": [
      {
        "uri": "https://a2ui.org/a2a-extension/a2ui/v0.9.1",
        "description": "Ability to render A2UI v0.9.1",
        "required": false,
        "params": {
          "supportedCatalogIds": [
            "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
            "https://my-company.com/a2ui/v0.9/my_custom_catalog.json"
          ],
          "acceptsInlineCatalogs": true
        }
      }
    ]
  }
}
```

- params.supportedCatalogIds: Agent 能生成哪些 catalog 的 UI
- params.acceptsInlineCatalogs: 是否接受客户端内联 catalog (默认 false)

Client 通过 `A2AClient.fromCardUrl(url)` 读取 AgentCard 完成初始化 (见 react shell 的 middleware 与 lit shell 的 client.ts).

### 消息模型: Message 与 Part

A2A 消息 (Message) 由 role (user/agent) 和 parts 数组组成, Part 有三种 kind:

- TextPart: 纯文本 (用户的自然语言查询、Agent 的对话回复)
- DataPart: 结构化 JSON 数据, 通过 mimeType 区分用途. A2UI 消息固定使用 `mimeType: "application/a2ui+json"`, data 字段必须是 A2UI 消息数组
- FilePart: 文件内容

A2UI 消息编码为 DataPart 的示例 (服务端下发):

```json
{
  "kind": "data",
  "data": [
    { "version": "v0.9", "createSurface": { "surfaceId": "default", "catalogId": "..." } },
    { "version": "v0.9", "updateComponents": { "surfaceId": "default", "components": [...] } }
  ],
  "metadata": { "mimeType": "application/a2ui+json" }
}
```

处理规则 (来自 A2A 扩展规范):

- data 中的消息列表不是事务单元, 接收方必须按序逐条处理
- 单条消息校验/应用失败时, 记录错误并继续处理后续消息, 原子性只在单条消息级别保证
- 渲染器建议等列表内所有消息处理完再重绘, 避免中间状态闪烁

### JSON-RPC 方法与会话

A2A 基于 JSON-RPC, 核心方法:

- message/send: 同步发送消息, 返回完整 Task/Message 结果 (lit shell 使用)
- message/stream: 流式发送, 服务端通过 SSE 逐步返回 status-update / message 事件 (react shell 的中间件使用 sendMessageStream)

会话相关概念:

- Task: 一次请求的处理结果对象, 含 state (working / completed 等) 和 status.message.parts
- contextId: 会话标识, 同一 contextId 下的消息共享对话历史, A2UI 的一组相关 Surface 应共享同一 contextId
- messageId: 单条消息的唯一标识

status-update 事件的 parts 是累积语义 (每次事件携带截至当前的全部 parts), 这也是 react shell 需要对 createSurface 去重的原因.

### 扩展机制与 A2UI 激活

A2A 支持通过扩展 URI 协商可选能力. A2UI 扩展的 URI 显式编码版本号:

- v0.9: `https://a2ui.org/a2a-extension/a2ui/v0.9`
- v0.9.1: `https://a2ui.org/a2a-extension/a2ui/v0.9.1`

激活方式按传输层区分:

- JSON-RPC over HTTP: 请求头 `X-A2A-Extensions: <扩展 URI>` (本仓库两个 shell 都采用此方式)
- gRPC: `sendMessageParams.metadata["X-A2A-Extensions"]`

Server 端解析逻辑见 agent_sdks/python/a2ui_agent/src/a2ui/a2a/extension.py: 读取客户端请求的版本与自身支持版本取交集, 匹配则激活 A2UI 扩展 (system prompt 注入 A2UI schema), 不匹配则按普通文本对话处理.

补充两个规范细节:

- 显式激活并非必需: 客户端也可以只在每条消息的 metadata 中携带 a2uiClientCapabilities, Agent 据此判断是否下发 UI; Agent 返回的 DataPart 带 application/a2ui+json 时客户端即知是 A2UI 消息
- 不应使用 `accepted_output_modes: ['a2ui']` 触发 A2UI, 这不是标准做法

### metadata 承载的 A2UI 状态

客户端发给 Agent 的每条 A2A 消息, 可在 message.metadata 中携带两类 A2UI 数据:

(1) a2uiClientCapabilities -- 客户端能力声明 (按版本分组):

```json
{
  "metadata": {
    "a2uiClientCapabilities": {
      "v0.9.1": {
        "supportedCatalogIds": ["https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"],
        "inlineCatalogs": [ ... ]
      }
    }
  }
}
```

(2) a2uiClientDataModel -- 当 Surface 开启 sendDataModel 时, 客户端在每次触发消息 (action / 用户查询) 时附带该 Surface 的完整数据模型, 让 Agent 拿到 UI 当前状态:

```json
{
  "metadata": {
    "a2uiClientDataModel": {
      "version": "v0.9.1",
      "surfaces": {
        "main_surface_id": { "user_id": "12345", "email": "user@example.com" }
      }
    }
  }
}
```

数据模型只发给创建该 Surface 的 Server, 不会泄漏给其他 Agent.

## A2UI 协议详解

A2UI 是 JSON 流式 UI 协议: 服务端 (Agent) 向客户端 (Renderer) 发送 JSON 对象流, 客户端逐条解析并增量构建/更新 UI. 核心设计是 UI 结构 (Components) 与应用数据 (Data Model) 的彻底分离. 以下以 v0.9.1 规范 (specification/v0_9_1/docs/a2ui_protocol.md) 为准.

### 版本家族

- v0.8: 面向支持 structured output 的 LLM, legacy, 新 SDK 不再支持
- v0.9: prompt-first 协议族首个稳定版, SDK 已实现
- v0.9.1: 当前生产版本, 与 v0.9 差异极小 (见 evolution_guide), 多语言 SDK/渲染器/示例均以此为准
- v1.0: 候选规范 (草案期名为 v0.10), 待足够多渲染器移植后转稳定

v0.9 的 prompt-first 取向: schema 直接嵌入 LLM prompt 让其仿写, 不受 structured output 的表达能力限制, catalog 可以更复杂可读; 代价是生成后必须做校验和修复 (validate + retry).

### Schema 组成

v0.9.1 由三类 JSON Schema 构成 (specification/v0_9_1/json/):

- common_types.json: 可复用基础类型
  - DynamicString / DynamicNumber / DynamicBoolean / DynamicStringList: 数据绑定核心, 接受字面量、`{path}` (JSON Pointer) 或 `{call, args}` (FunctionCall) 三种形态
  - ComponentId: 组件引用
  - ChildList: 容器子节点, 数组形态 (静态 ID 列表) 或对象形态 (模板 componentId + 数据 path)
- server_to_client.json: 服务端消息信封 (顶层入口), 负责消息分发
- client_to_server.json: 客户端消息 (action / error)
- 能力与状态: server_capabilities.json / client_capabilities.json / client_data_model.json

信封 schema 是 catalog 无关的: 它通过占位文件名 `$ref: "catalog.json#/$defs/anyComponent"` 引用组件定义. 校验时把 catalog.json 映射到具体 catalog 文件即可:

- 用 basic catalog: 映射到 catalogs/basic/catalog.json
- 用自定义 catalog: 映射到自己的 catalog 文件

自定义 catalog 的强制规则 (否则校验器无法检查父子引用完整性):

- 单个子组件引用属性必须用 `$ref: common_types.json#/$defs/ComponentId`, 不能用裸 string
- 子列表/模板属性必须用 `$ref: common_types.json#/$defs/ChildList`

### 传输契约

A2UI 传输无关, 但任何传输层必须满足:

1. 可靠有序投递: A2UI 是有状态更新 (先 createSurface 才能 update), 乱序会破坏 UI 状态
2. 消息分帧: 清晰分界 (JSONL 换行、WebSocket 帧、SSE 事件)
3. metadata 支持: 用于携带 a2uiClientDataModel 和能力交换 (AgentCard / 初始化握手)
4. 双向通道 (可选): 渲染流是单向的, 交互应用需要 action 回程通道

### Surface 生命周期规则

- createSurface 必须先于该 Surface 的任何 updateComponents / updateDataModel
- surfaceId + catalogId 创建后不可变, 要换配置必须删除重建; 对已存在的 surfaceId 重复 createSurface 是错误
- 组件列表中必须恰好有一个 id 为 root 的组件作为树根; root 未到达前, 其他组件更新被缓冲, 不产生可见效果
- deleteSurface 移除 Surface 及其全部组件和数据

### 组件模型: 邻接表

组件是扁平列表, 树结构靠 ID 引用隐式构建:

- 客户端把所有组件存入 Map<ComponentId, Component>, 渲染时重建树
- 组件可以任意顺序到达, 可以引用尚不存在的子组件或数据路径, 客户端渲染占位并等待补齐 (渐进渲染)
- root 定义后即可开始渲染, 跳过无效引用

Action 机制: 交互组件 (Button 等) 通过 action 属性声明行为, 二选一:

- `{ event: { name, context } }`: 触发发往服务端的事件, context 中的 Dynamic 值在触发时解析
- `{ functionCall: { call, args } }`: 执行客户端本地注册函数 (如 openUrl)

### 数据模型: 绑定与作用域

数据绑定基于 JSON Pointer (RFC 6901), 并扩展支持相对路径:

- 绝对路径 (/ 开头): 始终从 DataModel 根解析, 与组件在树中的位置无关
- 相对路径 (不以 / 开头): 仅在 ChildList 模板创建的子作用域内有效, 解析到当前迭代项 (例如 /users/0/firstName); 数组段使用非数字索引是错误
- 模板内部可混用绝对路径访问根作用域
- 渐进渲染期间路径可能解析为 undefined, 渲染器应优雅处理 (空串或 loading)

类型转换规则 (非字符串值插值时): 数字/布尔转标准字符串表示, null/undefined 转空串, 对象/数组转 JSON 字符串.

updateDataModel 的 upsert 语义:

- 路径存在则更新, 不存在则创建
- 省略 value 则删除该键; 数组场景下对应索引置为 undefined 以保持长度
- 省略 path (或为 /) 则替换整个数据模型

双向绑定 (TextField / CheckBox / Slider / ChoicePicker / DateTimeInput):

- 输入立即写回本地 DataModel, 绑定同路径的其他组件实时联动
- 本地 DataModel 是唯一数据源; 键入等被动变化不触发网络请求
- 状态只在 action 触发时回传: 通过 action.context 引用数据路径, 或开启 sendDataModel 随 metadata 附带完整模型

### 客户端函数与校验

v0.9 把客户端逻辑统一抽象为函数 (Function), 按名字引用, 绝不传输可执行代码:

- 函数与组件一起定义在 catalog 中, 客户端运行时从 catalog 读取执行边界配置
- checks: 输入组件和 Button 都可声明校验列表, 每项是 FunctionCall + 失败文案; 输入组件展示错误信息, Button 校验失败自动禁用
- basic catalog 内置 14 个函数: required / regex / length / numeric / email (校验类), formatString / formatNumber / formatCurrency / formatDate / pluralize (格式化类), openUrl (行为类), and / or / not (逻辑类)

formatString 插值语法:

- `${/user/name}` 绝对路径, `${firstName}` 相对路径
- `${formatDate(value:${/currentDate}, format:'yyyy-MM-dd')}` 函数调用, 参数支持字面量和嵌套表达式
- `\${` 转义为字面量

### Basic Catalog

basic catalog 提供 18 个组件:

- 展示: Text (支持简单 Markdown) / Image / Icon / Video / AudioPlayer
- 布局: Row / Column / List / Card / Tabs / Divider / Modal
- 交互: Button / CheckBox / TextField / DateTimeInput / ChoicePicker / Slider

theme 支持三个属性: primaryColor (主色), iconUrl 和 agentDisplayName (Agent 身份归属). 多 Agent 场景下, 编排者负责设置或覆写这两个身份字段并校验其与真实 Agent 服务一致, 防止恶意 Agent 冒充可信服务.

### prompt-generate-validate 循环

标准使用模式是三步循环:

1. Prompt: 向 LLM 提供期望 UI 的描述 + A2UI JSON Schema (含 catalog) + 合法示例
2. Generate: LLM 输出 JSON
3. Validate: 对照 schema 校验; 通过则下发渲染, 失败则把错误回喂 LLM 自纠

校验失败的标准错误格式 (让 LLM 能理解并修复):

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "surfaceId": "user_profile_card",
    "path": "/components/0/text",
    "message": "Expected stringOrPath, got integer"
  }
}
```

### 安全模型小结

- 声明式数据格式而非代码: Agent 只能请求渲染 catalog 内组件, 客户端永远不执行 Agent 下发的代码
- catalog 白名单: 生产应用通常自定义 catalog, 把 Agent 限制在自己的设计系统内
- sendDataModel 定向投递: UI 状态只回传给创建该 Surface 的 Server
- 身份归属防伪: 编排者校验/覆写 iconUrl 与 agentDisplayName
- 自定义组件的 smart wrapper 模式: 接入第三方内容 (如 iframe) 时由组件自身实施沙箱与信任策略
- 双 iframe 隔离: 对需要运行不受信第三方代码的场景 (MCP Apps), 内层 iframe 严格排除 allow-same-origin, 防止 allow-scripts + allow-same-origin 组合导致沙箱逃逸, 同时维持结构化 JSON-RPC 通道

## 生态与定位

协议出处: A2UI 由 Google 发起, CopilotKit 与开源社区共建, Apache 2.0 许可, 仓库 a2ui-project/a2ui, 包含规范 (v0.9.1 当前, v1.0 候选) 、多端渲染器实现与 A2A 等传输绑定.

与周边项目的关系:

- AG-UI 是传输协议 (连接 Agent 后端与前端, 负责实时状态同步) , A2UI 是 UI 格式 (描述渲染什么的有效载荷) . 二者互补: AG-UI 是管道, A2UI 是内容. AG-UI 由 CopilotKit 团队发起, 对 A2UI 有 day-zero 兼容
- CopilotKit 是基于 AG-UI 的全栈 agentic 框架, 提供 A2UI 渲染的开箱集成 (CopilotKitProvider 传 a2ui catalog 即可) . 但 A2UI 不依赖 CopilotKit, 完全可以自建链路 (见文末 swifty-agent 案例)
- 对比 OpenAI ChatKit: 设计哲学相近 (基础组件 + 可配置声明式抽象层) , 但 A2UI 平台无关, 面向跨 web/移动/桌面自建 agentic 界面, 以及需要跨信任边界渲染的多 Agent 系统
- 采用案例: Google 内部团队、AG2 多 Agent 框架 (A2UIAgent, 可经 A2A 服务 Flutter GenUI 客户端) 、CopilotKit 生态应用等

渲染器生态: 官方实现覆盖 React、Lit、Angular、Flutter (GenUI SDK) 、Markdown; 社区有基于 shadcn 的 React 渲染器 (如 @xpert-ai/a2ui-react、本文的 @swifty.js/a2ui-shadcn) 及实验性 3D 渲染器. 配套工具: A2UI Composer (可视化编辑器, 无需安装即可生成 A2UI JSON) 、A2UI Theater (预置流式场景的演示场) .

## 完整流程 (React + v0.9)

整体链路:

```
React Shell (浏览器)
  -> fetch POST /a2a (纯文本查询 或 action JSON)
  -> Vite Dev Middleware (协议转换, 注入 X-A2A-Extensions 头)
  -> A2A Server (AgentCard + JSON-RPC, ADK Agent + LLM)
  -> LLM 生成 <a2ui-json> -> Server 校验
  -> SSE (text/event-stream) 流式回传 A2UI 消息
  -> React Shell 增量解析 -> MessageProcessor -> SurfaceModel -> A2uiSurface 渲染
```

### 阶段 1: Server 启动

Server 使用 A2A 协议暴露 HTTP 端点 (restaurant_finder 示例, Python ADK):

```js
// 伪代码, 对应 samples/agent/adk/restaurant_finder
const agent = new RestaurantAgent(); // Agent, 包含 systemPromptBuilder + tools
const executor = new AgentExecutor(agent); // 封装 Agent Loop 的执行器
const handler = new DefaultRequestHandler(executor); // A2A JSON-RPC 请求处理器
const app = new A2AHttpApplication(handler); // HTTP 应用

app.listen(10002, "0.0.0.0");
```

Server 启动后提供两个端点:

- `GET http://localhost:10002/.well-known/agent-card.json` AgentCard, 声明 Server 能力 (支持的 A2A 扩展、MIME 类型等)
- `POST http://localhost:10002/a2a` A2A JSON-RPC 端点, 处理 `message/send` / `message/stream` 请求

AgentCard 中声明支持的 A2UI 扩展 (例如 `https://a2ui.org/a2a-extension/a2ui/v0.9`), Client 通过读取 AgentCard 得知 Server 支持 A2UI.

### 阶段 2: React Client 启动

入口是 samples/client/react/shell/src/App.tsx, 启动时做四件事:

(1) 创建 MessageProcessor (核心处理器), 传入 catalog 和全局 action 处理器:

```tsx
// App.tsx
import { A2uiSurface, basicCatalog } from "@a2ui/react/v0_9";
import { MessageProcessor } from "@a2ui/web_core/v0_9";

const processor = useMemo(() => {
  return new MessageProcessor([basicCatalog], (action) => {
    // 全局 action 处理器: 所有 Surface 的用户交互都会汇聚到这里
    sendAndProcessRef.current?.({ version: "v0.9", action });
  });
}, []);
```

MessageProcessor 内部持有:

- SurfaceGroupModel: 所有 Surface 的容器 (surfacesMap)
- 全局 action 订阅: `this.model.onAction.subscribe(actionHandler)`

```ts
// MessageProcessor 伪代码 (web_core/v0_9/processing/message-processor.ts)
class MessageProcessor<T extends ComponentApi> {
  readonly model: SurfaceGroupModel<T>;

  constructor(catalogs: Catalog<T>[], actionHandler?: ActionListener) {
    this.model = new SurfaceGroupModel<T>();
    if (actionHandler) {
      this.model.onAction.subscribe(actionHandler);
    }
  }

  // 生成 Client 能力声明 (supportedCatalogIds, 可选 inlineCatalogs)
  getClientCapabilities(options?: CapabilitiesOptions): A2uiClientCapabilities {
    return {
      "v0.9": {
        supportedCatalogIds: this.catalogs.map((c) => c.id),
        // => ["https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"]
      },
    };
  }

  // 消息分发
  processMessages(messages: A2uiMessage[]): void {
    for (const msg of messages) {
      if (msg.createSurface) this.processCreateSurface(msg);
      if (msg.updateComponents) this.processUpdateComponents(msg);
      if (msg.updateDataModel) this.processUpdateDataModel(msg);
      if (msg.deleteSurface) this.processDeleteSurface(msg);
    }
  }
}
```

(2) 订阅 Surface 生命周期, 同步到 React state:

```tsx
// App.tsx -- ShellContent
const [surfaces, setSurfaces] = useState<SurfaceModel[]>(() =>
  Array.from(processor.model.surfacesMap.values()),
);

useEffect(() => {
  const sub1 = processor.onSurfaceCreated((surface) => {
    setSurfaces((prev) => [...prev, surface]);
  });
  const sub2 = processor.onSurfaceDeleted((id) => {
    setSurfaces((prev) => prev.filter((s) => s.id !== id));
  });
  return () => {
    sub1.unsubscribe();
    sub2.unsubscribe();
  };
}, [processor]);
```

注意分层: Surface 的增删由 React state 驱动 (粗粒度), Surface 内部组件和数据的变化由 web_core 的信号/订阅机制驱动 (细粒度), 不需要手动触发 React 重渲染.

(3) 提供 Markdown 渲染器 (Text 组件支持简单 Markdown):

```tsx
// App.tsx
import {MarkdownContext} from "@a2ui/react/v0_9";
import {renderMarkdown} from "@a2ui/markdown-it";

<MarkdownContext.Provider value={renderMarkdown}>
  <ShellContent ... />
</MarkdownContext.Provider>;
```

(4) 渲染所有 Surface:

```tsx
// App.tsx
{
  surfaces.map((surface) => <A2uiSurface key={surface.id} surface={surface} />);
}
```

A2uiSurface 内部从 id 为 root、basePath 为 "/" 的组件开始递归渲染 (见阶段 12).

### 阶段 3: 用户输入

用户在搜索框输入查询 (例如 "Top 5 Chinese restaurants in New York"), 提交表单:

```tsx
// App.tsx
const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const body = new FormData(e.currentTarget).get("body") as string;
  sendAndProcess(body); // 字符串 => 自然语言查询
};
```

sendAndProcess 在发送前会先清空旧 Surface, 再发起请求:

```tsx
// App.tsx
const sendAndProcess = async (message: A2uiClientMessage | string) => {
  // 清空上一轮的 Surface
  Array.from(processor.model.surfacesMap.keys()).forEach((id) => {
    processor.model.deleteSurface(id);
  });

  // 流式发送, 每收到一个 chunk 立即交给 processor 处理 (渐进渲染)
  const response = await client.send(message, (chunkMessages) => {
    processor.processMessages(chunkMessages);
  });
};
```

### 阶段 4: Client 发送请求

React shell 的 A2UIClient 非常薄, 只做一件事: 把消息 POST 给同源的 /a2a 端点:

```ts
// src/client.ts
export class A2UIClient {
  async send(
    message: A2uiClientMessage | string,
    onChunk?: (messages: A2uiMessage[]) => void,
  ): Promise<A2uiMessage[]> {
    // 字符串 => 自然语言查询; 对象 => action 等 UI 事件 (JSON.stringify)
    const body =
      typeof message === "string" ? message : JSON.stringify(message);

    const response = await fetch("/a2a", { method: "POST", body });
    // ... SSE 流式解析, 见阶段 9
  }
}
```

action 消息的结构 (v0.9 client_to_server):

```json
{
  "version": "v0.9",
  "action": {
    "name": "book_restaurant",
    "surfaceId": "default",
    "sourceComponentId": "template-book-button",
    "timestamp": "2026-08-11T08:00:00.000Z",
    "context": {
      "restaurantName": "Hwa Yuan Szechuan",
      "address": "40 E Broadway, New York, NY 10002"
    }
  }
}
```

catalog 协商有两种模式:

- pre-shared catalog: Client 只通过 supportedCatalogIds 声明支持哪些 catalog (catalogId 字符串), Server 预先已知其内容. Restaurant Finder 示例使用此模式
- inlineCatalogs: Client 通过 `processor.getClientCapabilities({ includeInlineCatalogs: true })` 导出本地注册组件的完整 JSON Schema, 放入消息 metadata 的 a2uiClientCapabilities 中发送给 Server, Server 注入 system prompt. 适合自定义组件场景

### 阶段 5: Vite 中间件代理 (HTTP -> A2A, SSE 流式)

浏览器直接 fetch('/a2a'), 但 Agent Server 要求 A2A JSON-RPC 协议. React shell 用 Vite 插件做协议转换 (samples/client/react/shell/middleware/a2a.ts):

```ts
// middleware/a2a.ts
const A2UI_MIME_TYPE = "application/a2ui+json";

// 自定义 fetch: 注入 X-A2A-Extensions 头, 声明 Client 支持的 A2UI 版本
const fetchWithCustomHeader: typeof fetch = async (url, init) => {
  const headers = new Headers(init?.headers);
  headers.set("X-A2A-Extensions", "https://a2ui.org/a2a-extension/a2ui/v0.9");
  return fetch(url, { ...init, headers });
};

export const plugin = (): Plugin => ({
  name: "a2a-handler",
  configureServer(server: ViteDevServer) {
    server.middlewares.use("/a2a", async (req, res) => {
      const body = await readBody(req); // 带 1MB 上限保护

      // 判断请求类型: JSON 对象 (UI 事件) 或 纯文本 (用户查询)
      let sendParams: MessageSendParams;
      if (isJson(body)) {
        // JSON 请求 (action): 包装为 A2A DataPart, 携带 a2ui MIME 类型
        sendParams = {
          message: {
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [
              {
                kind: "data",
                data: JSON.parse(body),
                mimeType: A2UI_MIME_TYPE,
              },
            ],
            kind: "message",
          },
        };
      } else {
        // 纯文本请求: 包装为 A2A TextPart
        sendParams = {
          message: {
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text: body }],
            kind: "message",
          },
        };
      }

      // 懒初始化 A2A Client (读取 Server 的 AgentCard)
      const client = await A2AClient.fromCardUrl(
        "http://localhost:10002/.well-known/agent-card.json",
        { fetchImpl: fetchWithCustomHeader },
      );

      // 流式转发: A2A stream -> SSE
      const stream = await client.sendMessageStream(sendParams);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      for await (const chunk of stream) {
        if (res.destroyed) break; // 浏览器断开则停止拉取
        if (chunk.kind === "status-update" && chunk.status.message?.parts) {
          res.write(`data: ${JSON.stringify(chunk.status.message.parts)}\n\n`);
        } else if (chunk.kind === "message" && chunk.parts) {
          res.write(`data: ${JSON.stringify(chunk.parts)}\n\n`);
        }
      }
      res.end();
    });
  },
});
```

X-A2A-Extensions 的作用: A2A 协议的扩展协商机制. Server 读取此头, 与自身支持的版本取交集, 选择匹配的 A2UI 版本激活. 如果版本不匹配, A2UI 功能不会被激活, LLM 不会生成 A2UI JSON.

协议转换总结:

- Client 发送: `POST /a2a` 简单 JSON (action) 或纯文本 (查询)
- 中间件转换为: A2A JSON-RPC `message/stream` 请求, 包含 TextPart 或 DataPart (mimeType: application/a2ui+json)
- 附加: `X-A2A-Extensions` 头声明 A2UI v0.9
- Server 流式返回: status-update / message 事件, 中间件逐块转写为 SSE `data:` 帧

### 阶段 6: Server 接收请求, 组装 Prompt

Server 收到 A2A 请求后:

(1) A2UI 扩展激活

```js
// 伪代码
function tryActivateA2uiExtension(clientRequested, serverSupported) {
  // 取交集, 选择最新版本
  const activated = intersect(clientRequested, serverSupported);
  // => 例如激活 v0.9, 返回 AgentExtension 对象
  return getA2uiAgentExtension(activatedVersion);
}
```

(2) 读取 Client 能力

```js
// 伪代码
const a2uiCapabilities = message.metadata?.a2uiClientCapabilities ?? {};
const inlineCatalogs = a2uiCapabilities["v0.9"]?.inlineCatalogs ?? [];
// 若有 inlineCatalogs, 解析后注入 system prompt 的 Catalog Schema 部分
```

(3) 组装 System Prompt

```md
<!-- Role Description -->

You are a helpful assistant. Your final output MUST be a a2ui UI JSON response.

## Workflow Description

- The response can contain one or more A2UI JSON blocks.
- Each A2UI JSON block MUST be wrapped in `<a2ui-json>` and `</a2ui-json>` tags.
- The JSON MUST validate against the provided A2UI JSON SCHEMA.

---BEGIN A2UI JSON SCHEMA---

### Server To Client Schema:

(createSurface / updateComponents / updateDataModel / deleteSurface 的完整 JSON Schema)

### Common Types Schema:

(ComponentId, ChildList, DynamicString, ActionEvent 等公共类型定义)

### Catalog Schema:

(从 inlineCatalogs 或 pre-shared catalog 注入的组件类型定义)
---END A2UI JSON SCHEMA---

### Examples:

(完整的 A2UI JSON 示例, 包含数据绑定的用法)
```

v0.9 是 prompt-first 设计: schema 直接嵌入 prompt 让 LLM 仿写, 不依赖 structured output, 代价是生成后必须做校验和修复.

### 阶段 7: LLM ReAct 推理循环

ADK Agent 内部执行 ReAct (Reason + Act) 循环:

```
LLM 第 1 轮:
  思考: 用户想查找纽约的中餐馆, 我需要调用 get_restaurants 工具
  行动: tool_use("get_restaurants", { cuisine: "chinese", location: "new york" })

Server 执行工具:
  get_restaurants() 读取 restaurant_data.json, 返回 5 家餐厅的 JSON 数据

LLM 第 2 轮:
  思考: 拿到了餐厅数据, 现在生成 A2UI JSON 响应
  行动: 输出包含 <a2ui-json> 标签的 A2UI 消息列表
```

LLM 最终输出的文本示例:

```
根据查询结果, 为您找到纽约排名前 5 的中餐厅:

<a2ui-json>
[
  { "version": "v0.9", "createSurface": { "surfaceId": "default", "catalogId": "..." } },
  { "version": "v0.9", "updateComponents": { "surfaceId": "default", "components": [...] } },
  { "version": "v0.9", "updateDataModel": { "surfaceId": "default", "path": "/", "value": {...} } }
]
</a2ui-json>
```

### 阶段 8: Server 校验 A2UI JSON

Server 从 LLM 输出中提取 `<a2ui-json>` 标签内的 JSON, 进行 Schema 校验:

```js
// 伪代码 (对应 agent_sdks/python 的 parser + schema/validator)
function extractAndValidate(llmOutput) {
  // 1. 正则提取 <a2ui-json>...</a2ui-json> 内容
  const jsonStr = llmOutput.match(/<a2ui-json>([\s\S]*?)<\/a2ui-json>/)[1];

  // 2. 解析 JSON (流式场景下有 payload_fixer 自动修复常见 LLM 输出问题)
  const messages = JSON.parse(jsonStr);

  // 3. 对照 A2UI JSON Schema 校验:
  //    消息类型是否合法、组件类型是否在 catalog 中、
  //    ComponentId 引用是否存在、数据绑定格式是否正确
  const result = validate(messages, a2uiSchema);

  // 4. 校验失败时, 将 VALIDATION_FAILED 错误回喂 LLM 重试
  if (!result.valid && retryCount < 1) {
    return retryWithErrorFeedback(messages, result.errors);
  }
  return messages;
}
```

校验通过后, A2UI 消息列表被包装为 A2A 响应的 parts (kind: data), 通过流式 status-update 事件逐步下发.

### 阶段 9: Client 流式解析 SSE, 增量渲染

A2UIClient.send 内部按 SSE 帧增量解析, 每个 chunk 立即回调 onChunk:

```ts
// src/client.ts
const contentType = response.headers.get("Content-Type");
if (contentType?.includes("text/event-stream")) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // A2A status-update 事件携带的是累积 parts, createSurface 会在每个 chunk
  // 中重复下发. 用 Set 记录已转发的 surfaceId, 避免 processMessages 抛
  // "Surface already exists"
  const seenSurfaceIds = new Set<string>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按 SSE 空行切帧, 最后一段不完整的留在 buffer
    const lines = buffer.split(/\r?\n\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const parts = JSON.parse(line.slice(6)) as Part[];
      const chunkMessages: A2uiMessage[] = [];
      for (const part of parts) {
        if (part.kind === "error") throw new Error(part.text);
        if (part.kind === "data" && part.data) {
          const msg = part.data as A2uiMessage;
          if (msg.createSurface) {
            if (seenSurfaceIds.has(msg.createSurface.surfaceId)) continue;
            seenSurfaceIds.add(msg.createSurface.surfaceId);
          }
          chunkMessages.push(msg);
        }
      }
      onChunk?.(chunkMessages); // => processor.processMessages(chunkMessages)
    }
  }
}
```

要点:

- 渐进渲染: chunk 到达即处理, createSurface 先到就先挂载占位, 组件和数据随后补齐
- 累积 parts 去重: A2A 的 status-update 是累积语义, 客户端必须自行对 createSurface 去重
- 非流式降级: Content-Type 为 application/json 时, 一次性读取 parts 数组

### 阶段 10: MessageProcessor 处理三类消息

以餐厅列表为例, 一个完整响应包含三条消息.

消息 1 -- createSurface (挂载 Surface):

```json
{
  "version": "v0.9",
  "createSurface": {
    "surfaceId": "default",
    "catalogId": "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json",
    "theme": { "primaryColor": "#FF0000", "font": "Roboto" }
  }
}
```

处理: 校验 catalogId 在本地 catalogs 中存在, 创建 SurfaceModel (含空 DataModel 和 ComponentsModel), 触发 onSurfaceCreated, React 侧 setSurfaces 追加, A2uiSurface 挂载.

消息 2 -- updateComponents (扁平组件列表, 邻接表):

```json
{
  "version": "v0.9",
  "updateComponents": {
    "surfaceId": "default",
    "components": [
      {
        "id": "root",
        "component": "Column",
        "children": ["title-heading", "item-list"]
      },
      {
        "id": "title-heading",
        "component": "Text",
        "variant": "h1",
        "text": { "path": "/title" }
      },
      {
        "id": "item-list",
        "component": "List",
        "direction": "vertical",
        "children": { "componentId": "item-card-template", "path": "/items" }
      },
      {
        "id": "item-card-template",
        "component": "Card",
        "child": "card-layout"
      },
      {
        "id": "card-layout",
        "component": "Row",
        "children": ["template-image", "card-details"]
      },
      {
        "id": "template-image",
        "component": "Image",
        "url": { "path": "imageUrl" },
        "weight": 1
      },
      {
        "id": "template-name",
        "component": "Text",
        "variant": "h3",
        "text": { "path": "name" }
      },
      {
        "id": "template-book-button",
        "component": "Button",
        "child": "book-now-text",
        "variant": "primary",
        "action": {
          "event": {
            "name": "book_restaurant",
            "context": {
              "restaurantName": { "path": "name" },
              "imageUrl": { "path": "imageUrl" },
              "address": { "path": "address" }
            }
          }
        }
      },
      { "id": "book-now-text", "component": "Text", "text": "Book Now" }
    ]
  }
}
```

v0.9 组件对象的结构要点:

- id + component 为必填字段, 其余属性 (text / children / action / variant...) 直接平铺在组件对象上, 没有 v0.8 的 params 包裹
- children 两种形态 (ChildList):
  - 数组: 静态 ComponentId 引用列表, 如 `["a", "b"]`
  - 对象: 列表模板 `{ componentId, path }`, 监听 path 指向的数组, 为每个元素实例化模板组件
- child: 单个 ComponentId 引用 (如 Card 的 child、Button 的 child)
- 组件可以乱序到达、可以引用尚不存在的子组件或数据路径, 客户端渲染占位 (React 中是 `[Loading {id}...]`), 这就是渐进渲染

消息 3 -- updateDataModel (填充数据):

```json
{
  "version": "v0.9",
  "updateDataModel": {
    "surfaceId": "default",
    "path": "/",
    "value": {
      "title": "Top 5 Chinese Restaurants in New York",
      "items": [
        {
          "name": "Xi'an Famous Foods",
          "rating": "★★★★☆",
          "imageUrl": "https://...",
          "address": "81 St Marks Pl..."
        },
        {
          "name": "Han Dynasty",
          "rating": "★★★★☆",
          "imageUrl": "https://...",
          "address": "90 3rd Ave..."
        }
      ]
    }
  }
}
```

处理: 按 JSON Pointer (RFC 6901) 路径做 upsert 写入 DataModel: 路径存在则更新, 不存在则创建, 省略 value 则删除该键. DataModel 变化自动触发绑定了该路径的组件更新.

### 阶段 11: 数据绑定与双向绑定

数据绑定是 A2UI 的核心设计, 将组件属性与 DataModel 中的数据关联. v0.9 中任何 Dynamic* 属性都接受三种取值: 字面量、`{ path }` 绑定、`{ call, args }` 函数调用.

(1) 绝对路径绑定 -- 以 "/" 开头, 从 DataModel 根节点解析

```json
{ "id": "title-heading", "component": "Text", "text": { "path": "/title" } }
```

(2) 相对路径绑定 -- 不以 "/" 开头, 在列表模板作用域内解析

```json
{ "id": "template-name", "component": "Text", "text": { "path": "name" } }
```

当 template-name 位于 item-list 的模板中时, 每个列表项有独立的作用域 (例如第 0 项的 DataContext.path 是 `/items/0`), 相对路径 `name` 解析为 `/items/0/name`. 模板内部仍可用绝对路径访问根作用域.

(3) 列表模板绑定 -- ChildList 对象形态

```json
{
  "id": "item-list",
  "component": "List",
  "children": { "componentId": "item-card-template", "path": "/items" }
}
```

内部处理流程:

```
DataModel 中 /items = [{ name: "A" }, { name: "B" }]
  => GenericBinder 订阅 /items 路径
  => 数组变化时, 为每个元素实例化模板, basePath 分别为 "/items/0"、"/items/1"
  => 模板内 "name" 相对路径解析为 "/items/0/name"
  => 渲染 Card, 文本为 "A"
```

(4) 双向绑定 -- 输入组件直接写本地 DataModel

预订表单 (booking-form Surface) 中的输入组件:

```json
{ "id": "party-size-field", "component": "TextField", "label": "Party Size", "value": { "path": "/partySize" }, "variant": "number" },
{ "id": "datetime-field", "component": "DateTimeInput", "label": "Date & Time", "value": { "path": "/reservationTime" }, "enableDate": true, "enableTime": true },
{ "id": "dietary-field", "component": "TextField", "label": "Dietary Requirements", "value": { "path": "/dietary" } }
```

读写契约:

- Read (Model -> View): 渲染时从绑定路径读值; 服务端 updateDataModel 更新后组件自动重渲染
- Write (View -> Model): 用户输入时立即写回本地 DataModel 对应路径, 不发网络请求
- 反应式: 本地 DataModel 是唯一数据源, 绑定同一路径的其他组件实时联动

GenericBinder 的 Schema 驱动机制:

GenericBinder 绑定属性时读取组件的 Zod schema, 将属性分类处理:

- DYNAMIC: 需要数据绑定的属性 (text / url / value) -> 创建订阅, 值变化时更新 snapshot
- ACTION: 事件属性 (action) -> 创建闭包, 触发时解析 context 中的绑定并派发事件
- STRUCTURAL: 结构属性 (children / child) -> 构建子组件列表, 订阅数组路径
- CHECKABLE: 可校验属性 (checks) -> 执行 catalog 注册的校验函数 (required / regex / email...)
- STATIC: 静态属性 (variant / label) -> 直接赋值

### 阶段 12: React 渲染器内部机制

@a2ui/react/v0_9 把 web_core 的模型层桥接到 React, 核心是 A2uiSurface / DeferredChild / ResolvedChild 三层组件 (renderers/react/src/v0_9/A2uiSurface.tsx):

```tsx
// A2uiSurface: 入口, 从 root 组件开始渲染
export const A2uiSurface = ({ surface }) => {
  return <DeferredChild surface={surface} id="root" basePath="/" />;
};
```

(1) DeferredChild -- 订阅单个组件的存在性

```tsx
// 每个 DeferredChild 只订阅 "自己这个 id 的组件" 的创建/删除事件
const store = useMemo(
  () => ({
    subscribe: (cb) => {
      const unsub1 = surface.componentsModel.onCreated.subscribe((comp) => {
        if (comp.id === id) cb();
      });
      const unsub2 = surface.componentsModel.onDeleted.subscribe((delId) => {
        if (delId === id) cb();
      });
      return () => {
        unsub1.unsubscribe();
        unsub2.unsubscribe();
      };
    },
    // snapshot = 组件类型 + 版本号, 保证类型替换 (Button -> Text) 也能触发重渲染
    getSnapshot: () => {
      const comp = surface.componentsModel.get(id);
      return comp ? `${comp.type}-${version}` : `missing-${version}`;
    },
  }),
  [surface, id],
);

useSyncExternalStore(store.subscribe, store.getSnapshot);

const componentModel = surface.componentsModel.get(id);
if (!componentModel) return <div>[Loading {id}...]</div>; // 渐进渲染占位

// 按组件类型从 catalog 查找 React 实现
const compImpl = surface.catalog.components.get(componentModel.type);
if (!compImpl) return <div>Unknown component: {componentModel.type}</div>;
```

要点: 通过 useSyncExternalStore 把 web_core 的事件系统接入 React 18 的外部存储模型; 每个节点只订阅自己的 id, 更新范围被限制在单个组件粒度, 避免整棵树重渲染.

(2) ResolvedChild -- 创建 ComponentContext 并递归构建子节点

```tsx
const ResolvedChild = memo(
  ({ surface, id, basePath, componentModel, compImpl }) => {
    // ComponentContext = surface + componentId + basePath(数据作用域)
    const context = useMemo(
      () => new ComponentContext(surface, id, basePath),
      [surface, id, basePath, componentModel],
    );

    // buildChild 供具体组件渲染子节点; 列表模板在这里传入每项的 specificPath
    const buildChild = useCallback(
      (childId: string, specificPath?: string) => (
        <DeferredChild
          key={`${childId}-${specificPath || context.dataContext.path}`}
          surface={surface}
          id={childId}
          basePath={specificPath || context.dataContext.path}
        />
      ),
      [surface, context.dataContext.path],
    );

    const ComponentToRender = compImpl.render;
    return <ComponentToRender context={context} buildChild={buildChild} />;
  },
);
```

(3) createComponentImplementation -- GenericBinder 接入 useSyncExternalStore

basic catalog 中的每个组件 (Text / Button / TextField...) 都通过此工厂包装 (renderers/react/src/v0_9/adapter.tsx):

```tsx
const ReactWrapper = ({ context, buildChild }) => {
  const bindingRef = useRef<GenericBinder | null>(null);
  if (!bindingRef.current) {
    // 按组件的 Zod schema 创建绑定器
    bindingRef.current = new GenericBinder(context, api.schema);
  }
  const binding = bindingRef.current;

  // binder 内部订阅 DataModel, 任何绑定值变化都会 bump snapshot
  const subscribe = useCallback(
    (callback: () => void) => {
      const sub = binding.subscribe(callback);
      return () => sub.unsubscribe();
    },
    [binding],
  );
  const getSnapshot = useCallback(() => binding.snapshot, [binding]);
  // snapshot 是已解析好的 props: 字面量/绑定值/函数结果/action 闭包
  const props = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => () => binding.dispose(), [binding]); // 卸载时释放 DataModel 订阅

  return (
    <MemoizedRender props={props} buildChild={buildChild} context={context} />
  );
};
```

整体数据流:

```
A2UI 消息流
  -> MessageProcessor.processMessages
  -> SurfaceModel (DataModel + ComponentsModel, 信号/事件驱动)
  -> DeferredChild: useSyncExternalStore 订阅组件增删
  -> GenericBinder: 按 schema 解析属性, 订阅 DataModel 路径
  -> useSyncExternalStore 拿到解析后的 props snapshot
  -> 具体 React 组件 (memo) 渲染
```

细粒度更新的本质: React 只负责组件实例的挂载/卸载决策, 属性级别的响应式更新由 web_core 的订阅机制 + useSyncExternalStore 完成, 不依赖 React 的自顶向下 diff.

### 阶段 13: 用户交互 (Action 事件)

用户点击 "Book Now" 按钮, 触发完整链路:

(1) Button 组件的 action 闭包被触发, GenericBinder 先解析 context 中的数据绑定 (相对路径在当前列表项作用域内解析), 得到:

```json
{
  "name": "book_restaurant",
  "context": {
    "restaurantName": "Hwa Yuan Szechuan",
    "imageUrl": "https://...",
    "address": "40 E Broadway, New York, NY 10002"
  }
}
```

(2) 事件冒泡到 SurfaceGroupModel.onAction, 进入 App.tsx 的全局 actionHandler, 封装为 v0.9 action 消息并发送:

```tsx
// App.tsx
const processor = new MessageProcessor([basicCatalog], (action) => {
  sendAndProcessRef.current?.({ version: "v0.9", action });
});
```

(3) 中间件检测到 body 是 JSON 对象, 包装为 A2A DataPart (mimeType: application/a2ui+json) 转发给 Server.

(4) Server 将 UI 事件翻译为 LLM 可理解的自然语言, 注入下一轮对话:

```
USER_WANTS_TO_BOOK: The user clicked "Book" on restaurant "Hwa Yuan Szechuan"
at address "40 E Broadway, New York, NY 10002". They want to make a reservation.
```

(5) LLM 生成预订表单的 A2UI JSON (新的 booking-form Surface, 含 TextField / DateTimeInput / 提交按钮), 走相同的消息流返回渲染.

(6) 用户填写表单 (双向绑定只更新本地 DataModel), 点击 Submit Reservation, 提交按钮的 context 直接引用表单数据路径:

```json
{
  "id": "submit-button",
  "component": "Button",
  "action": {
    "event": {
      "name": "submit_booking",
      "context": {
        "restaurantName": { "path": "/restaurantName" },
        "partySize": { "path": "/partySize" },
        "reservationTime": { "path": "/reservationTime" },
        "dietary": { "path": "/dietary" }
      }
    }
  }
}
```

点击时客户端解析这些路径 (拿到用户刚输入的值), 随 action 发回 Server, LLM 再生成确认卡片 (confirmation Surface). 这就是 列表 -> 表单 -> 确认 的三轮闭环.

### 阶段 14: Session 管理

多轮对话通过 A2A 协议的 contextId 管理:

```ts
sendParams = {
  message: { messageId: crypto.randomUUID(), role: "user", parts: [...] },
  configuration: {
    contextId: sessionId, // 同一 contextId 下的消息共享对话历史
  },
};
```

Server 端的 ADK Session 通过 contextId 关联, 确保 LLM 在后续轮次中能看到之前的对话上下文 (包括之前生成的 A2UI 消息和工具调用结果).

## Lit 实现对比

Lit shell (samples/client/lit/shell) 与 React shell 跑同一个协议, 差异集中在三处:

| 维度         | React shell                                            | Lit shell                                                                    |
| :----------- | :----------------------------------------------------- | :--------------------------------------------------------------------------- |
| 传输层       | 浏览器 fetch /a2a, Vite 中间件做协议转换 + SSE 流式    | 浏览器内直接用 @a2a-js/sdk 的 A2AClient 连 Server, 非流式 sendMessage        |
| 响应式       | useSyncExternalStore 订阅 web_core 事件/快照           | SignalWatcher(LitElement) 混入 @lit-labs/signals, 信号驱动细粒度更新         |
| Surface 渲染 | A2uiSurface + DeferredChild 递归, React state 同步增删 | `<a2ui-surface .surface=${surface}>` 自定义元素, repeat 指令遍历 surfacesMap |

Lit 侧关键代码:

```ts
// app.ts
import * as v0_9 from "@a2ui/web_core/v0_9";
import { basicCatalog } from "@a2ui/lit/v0_9";

@customElement("a2ui-shell")
export class A2UILayoutEditor extends SignalWatcher(LitElement) {
  private _processor = new v0_9.MessageProcessor(
    [basicCatalog],
    async (action: v0_9.A2uiClientAction) => {
      // action -> userAction 消息 -> sendAndProcessMessage
      await this.#sendAndProcessMessage({
        userAction: {
          name: action.name,
          surfaceId: action.surfaceId,
          sourceComponentId: action.sourceComponentId,
          timestamp: new Date().toISOString(),
          context: { ...action.context },
        },
      });
    },
  );

  #maybeRenderData() {
    const surfaces = Array.from(this._processor.model.surfacesMap.entries());
    return html`<section id="surfaces">
      ${repeat(
        surfaces,
        ([id]) => id,
        ([, surface]) =>
          html`<a2ui-surface .surface=${surface}></a2ui-surface>`,
      )}
    </section>`;
  }
}
```

```ts
// client.ts -- 浏览器直连 A2A Server
this.#client = await A2AClient.fromCardUrl(
  `${baseUrl}/.well-known/agent-card.json`,
  {
    fetchImpl: async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set(
        "X-A2A-Extensions",
        "https://a2ui.org/a2a-extension/a2ui/v0.9",
      );
      return fetch(url, { ...init, headers });
    },
  },
);
```

结论: MessageProcessor / SurfaceModel / GenericBinder 全部来自框架无关的 @a2ui/web_core, React 和 Lit 只是两种适配层. 业务接入时选择与自身技术栈一致的渲染器即可, 协议层代码完全复用.

## 真实前端业务接入示例

以一个真实场景为例: 电商 App 的智能客服对话流中, Agent 需要动态下发 "退款申请表单" 和 "订单卡片", 前端是 React 18 + Vite 技术栈.

### 接入清单 (5 步)

第 1 步: 安装依赖

```bash
yarn add @a2ui/react @a2ui/web_core @a2ui/markdown-it
```

第 2 步: 创建全局 MessageProcessor (单例, 挂在对话页顶层)

```tsx
// a2ui/processor.ts
import { basicCatalog } from "@a2ui/react/v0_9";
import { MessageProcessor } from "@a2ui/web_core/v0_9";
import { refundCatalog } from "./refund-catalog"; // 业务自定义 catalog (可选)

export const processor = new MessageProcessor(
  [basicCatalog, refundCatalog],
  (action) => {
    // 统一出口: 把 A2UI action 翻译成业务请求
    if (action.name === "submit_refund") {
      api.submitRefund(action.context).then(showSuccessToast);
      return;
    }
    // 其余 action 回传给 Agent 继续对话
    chatStore.sendToAgent({ version: "v0.9", action });
  },
);
```

第 3 步: 在消息流中渲染 Surface

```tsx
// ChatMessage.tsx -- 对话气泡内嵌 A2UI 区域
function useSurfaces() {
  const [surfaces, setSurfaces] = useState<SurfaceModel[]>([]);
  useEffect(() => {
    const sub1 = processor.onSurfaceCreated((s) =>
      setSurfaces((p) => [...p, s]),
    );
    const sub2 = processor.onSurfaceDeleted((id) =>
      setSurfaces((p) => p.filter((s) => s.id !== id)),
    );
    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, []);
  return surfaces;
}

// 渲染
{
  surfaces.map((surface) => <A2uiSurface key={surface.id} surface={surface} />);
}
```

第 4 步: 打通传输层. 生产环境通常已有 SSE/WebSocket 网关, 只需保证:

- Agent 下发的每条 A2UI 消息 (JSON 对象) 按序、完整地交给 `processor.processMessages`
- 用户 action 通过 `{version: "v0.9", action}` 结构发回 Agent
- 若走 A2A 传输, 参考 react shell 的 middleware: 注入 X-A2A-Extensions 头, 处理累积 parts 的 createSurface 去重

第 5 步: 与 Agent 约定 catalog. 两种方式任选:

- pre-shared: 双方约定 catalogId, Agent 的 system prompt 内置该 catalog schema
- inline: 请求时携带 `processor.getClientCapabilities({includeInlineCatalogs: true})`, Agent 动态注入

### 自定义组件注册

业务往往需要超出 basic catalog 的组件 (例如订单卡片). 用 createComponentImplementation 把现有 React 组件包装为 A2UI 组件:

```tsx
// a2ui/components/OrderCard.tsx
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { z } from "zod";

// schema 即该组件对 Agent 暴露的属性契约 (Zod 定义, 自动转 JSON Schema)
const orderCardApi = {
  name: "OrderCard",
  schema: z.object({
    orderId: z.string(), // 静态属性
    amount: z.custom<{ path?: string }>(), // 动态属性: 支持 {path} 绑定
    status: z.enum(["paid", "shipped", "refunding"]),
  }),
};

export const OrderCardImpl = createComponentImplementation(
  orderCardApi,
  ({ props }) => {
    // props 已被 GenericBinder 解析: 绑定路径替换为 DataModel 中的实际值
    return (
      <div className="order-card">
        <span>订单号: {props.orderId}</span>
        <span>金额: {props.amount}</span>
        <StatusTag status={props.status} />
      </div>
    );
  },
);
```

注册进自定义 catalog 后, Agent 即可在 JSON 中引用:

```json
{
  "id": "order-1",
  "component": "OrderCard",
  "orderId": "2026081100001",
  "amount": { "path": "/order/amount" },
  "status": "refunding"
}
```

安全边界提醒:

- Agent 只能渲染已注册组件, 永远不执行 Agent 下发的代码; 自定义组件内部如需加载第三方内容 (如 iframe), 由组件自己实施沙箱策略 (smart wrapper 模式)
- 对 Agent 下发的 url / html 类属性, 在自定义组件内做白名单校验
- 校验类逻辑用 catalog 函数 (checks) 声明, 在客户端本地执行, 不依赖 Agent 自觉

## @swifty.js/a2ui-shadcn: 三合一组件库

上文示例都基于官方 basic catalog (18 个组件) . 真实业务需要更丰富的组件与自己的设计系统, @swifty.js/a2ui-shadcn (位于 a2ui monorepo 的 packages/shadcn) 给出了一个完整答案: 用 shadcn/ui 重实现 basic catalog 并大幅扩展, 把渲染端与生成端封装进一个包. 该 monorepo 是官方 restaurant-finder 示例的全栈 TypeScript 移植, 协议固定 v0.9.

### 包结构: 三个导出入口

- "." -> src/index.ts: 渲染器 A2uiView + catalog 再导出
- "./catalog" -> src/catalog/index.ts: 组件 catalog 注册表
- "./prompt" -> src/prompt/index.ts: LLM 系统提示词生成器

即一个包同时覆盖渲染端 (把 A2UI 消息画出来) 和生成端 (教 LLM 怎么产出 A2UI 消息) .

关键依赖:

- 协议栈: @a2ui/react ^0.10.2、@a2ui/web_core ^0.10.6、@a2ui/markdown-it
- UI 底座: @base-ui/react (Base UI 原语而非 Radix) 、class-variance-authority、tailwind-merge、lucide-react、cmdk、recharts、react-day-picker、embla-carousel-react 等
- peer: react ^18||^19、zod ^3

构建双模式 (Vite) : lib 模式三入口输出 ES + CJS + d.ts; app 模式跑 demo (端口 5005) , 并注册 middleware/a2a.ts 插件把浏览器请求包装成 A2A 协议代理到 packages/server.

### Catalog: 65 个组件

注册表 src/catalog/index.ts:

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

- 18 个 basic 组件直接复用官方 basic_catalog 的 zod Api schema (ButtonApi / TextApi / ListApi 等) , 只替换视觉层为 shadcn 实现. 例如 Button 把协议的 variant 映射到 shadcn variant (primary -> default, borderless -> ghost) , action prop 直接作为 onClick
- 47 个扩展组件按家族分组: display (Alert / Avatar / Badge / Progress / Skeleton / Spinner 等) 、structure (Accordion / Carousel / Table / Resizable 等) 、overlays (AlertDialog / Drawer / Sheet / Tooltip / Popover 等) 、navigation (Breadcrumb / Menubar / Pagination 等) 、forms (Calendar / Combobox / Command / Select / Switch / InputOtp 等) 、chat (Bubble / Message / MessageScroller / Questionnaire / Attachment / Marker) 、data (Chart) . 源码注释明确排除了 sidebar (属于应用骨架) 、toast (命令式 API) 、direction (provider 性质)
- 扩展组件自定义 Api = { name, schema: z.object({...}).strict() }, 属性用 DynamicStringSchema 等结构化类型声明, 自动获得数据绑定能力:

```tsx
export const AlertApi = {
  name: "Alert",
  schema: z.object({
    ...COMMON, // weight, accessibility
    title: DynamicStringSchema.describe("The alert title."),
    description: DynamicStringSchema.describe("The alert description.").optional(),
    variant: z.enum(["default", "destructive"]).default("default"),
    icon: ICON_NAME.optional(), // 由 ICON_MAP 派生的枚举, 映射到 lucide-react
  }).strict(),
};
export const Alert = createComponentImplementation(AlertApi, ({ props }) => (...));
```

### catalog.json 生成: 单一事实源

scripts/catalog.ts (pnpm catalog) 生成约 118KB 的 catalog.json:

1. 合并官方 basic catalog (postinstall 从 A2UI v0.9 规范下载) 与 47 个扩展组件
2. 用 zod-to-json-schema 把扩展组件的 zod schema 转成 JSON Schema
3. 协议公共类型 (DynamicString / Action / DataBinding) 通过形状签名匹配后改写成 $ref 指向规范的 common_types.json, 压缩体积
4. 以 SHADCN_CATALOG_ID 发布, 并同步拷贝到 src/prompt/schemas/catalog.json

这份 catalog.json 会被服务端嵌入 LLM 系统提示词, 构成"组件实现 -> zod schema -> catalog.json -> LLM prompt"的单一事实源链路: 改组件 props, prompt 契约自动跟着变. 两条硬约定: schema 变更后必须重新生成并提交; 服务端不得 import 包内的 Catalog 实例 (Map 序列化会丢组件契约) , 只能读 catalog.json 文件.

### 渲染器 A2uiView

宿主应用只需一个组件:

```tsx
import { A2uiView } from "@swifty.js/a2ui-shadcn";

<A2uiView
  messages={messages} // A2uiMessage[], 来自任意消息源
  onRawAction={(action) => /* 事件回传 Agent */}
/>;
```

内部流程:

1. A2uiMessageSchema.safeParse 逐条校验, 非法消息丢弃并打日志
2. new MessageProcessor([shadcnCatalog], actionHandler), actionHandler 优先走 onRawAction, 否则用 buildQueryFromAction 转成文本 "[a2ui_action] {name}\ncontext: {JSON}"
3. processedCount ref 记录已处理条数, 只把新增消息交给 processor.processMessages —— 增量处理是支持"原地更新"(action 回传后追加 update 消息) 的基础
4. 订阅 onSurfaceCreated/onSurfaceDeleted 维护 surfaces 状态, MarkdownContext 注入 renderMarkdown, 逐个渲染 A2uiSurface

求值由 web_core 的 generic binder 按 zod schema 结构化完成: Dynamic* 标注的 prop 解析为实际值并自动生成 setX 回写函数 (双向绑定) ; ActionSchema 标注的 prop 变成可调用函数; ComponentId/ChildList 变成 buildChild 能力; z.any() 保持静态不参与绑定. .strict() schema 使 MessageProcessor 运行时拒绝未知 prop.

### prompt 生成端

src/prompt/ 把 A2UI Python agent SDK 的四种推理格式提示词生成器移植为 TypeScript (DirectJson / Elemental / Atom / Express) , 内嵌 schemas/{catalog,common_types,server_to_client}.json, 对外提供 generateSystemPrompt(format, options) 与 applySchemaModifiers 等工具. 服务端用它把协议 schema + catalog 契约 + few-shot 示例注入系统提示词, 具体用法见下一节的 swifty-agent.

## swifty-agent: 生产级 A2UI 应用案例

swifty-cli/apps/swifty-agent 是一个 AI OnCall 运维助手: 告警分析、日志查询、Prometheus 运维问答, 通过 A2UI 让 LLM 直接生成交互式 UI (告警列表卡片、指标图表、静默表单) . 它最重要的架构选择是不用 CopilotKit, 完全自建"生成 -> 渲染 -> 交互 -> 原地更新"闭环.

### 技术栈

- Next.js 16 (App Router) + React 19 + TypeScript; 页面: app/page.tsx (主聊天) 、app/gallery/page.tsx (组件画廊)
- Vercel AI SDK v7: streamText/generateText + tools + stopWhen, provider 为 @ai-sdk/openai 与 @ai-sdk/anthropic, 区分 thinkModel/quickModel
- A2UI: @a2ui/web_core、@a2ui/react、@a2ui/markdown-it, 以及 "@swifty.js/a2ui-shadcn": "file:../../../a2ui/packages/shadcn" —— 本地 file 链接, 两个仓库协同演进
- 其他: Redis Stack 向量检索 (RAG) 、knex + mysql2、MCP SDK (日志工具) 、prom-client、Tailwind v4

一个配套配置: reactStrictMode: false. 原因是 MessageProcessor 是有状态外部存储, StrictMode 的开发态双执行会重放已创建的 surface.

### 生成侧: direct-json 模式 + 内联标签

lib/ai/a2ui/prompt.ts 用 shadcn 包的 prompt 入口构造系统提示词:

```ts
import { applySchemaModifiers, generateSystemPrompt, removeStrictValidation,
  SHADCN_PROMPT_CATALOG } from "@swifty.js/a2ui-shadcn/prompt";

const PROMPT_CATALOG = applySchemaModifiers(SHADCN_PROMPT_CATALOG, [removeStrictValidation]);

export const A2UI_PROMPT_SECTION = generateSystemPrompt("direct-json", {
  roleDescription: `## Interactive UI (A2UI v0.9) ...`,
  workflowDescription: `- WHEN: only when the answer presents structured data ...`,
  includeSchema: true,
  examples: [renderExample("ALERT_LIST_EXAMPLE", buildAlertListExample()), ...].join("\n"),
}, PROMPT_CATALOG);
```

要点:

- direct-json 模式: LLM 在 markdown 回复后追加一个 <a2ui-json>[...]</a2ui-json> 标签块 (JSON 消息数组) , 与文本共用同一输出通道
- prompt 内嵌完整 schema 契约 + 3 个由 builder 函数生成的 few-shot 示例 (告警列表、QPS 指标报告、静默表单) . builder 化的好处: 改 UI 结构只需改 builder, prompt 自动同步
- removeStrictValidation 去掉 closed-object 约束, 避免 LLM 因无害的额外字段被过度拒绝
- 服务端从 SHADCN_PROMPT_CATALOG 取出的 catalogId 与客户端 shadcnCatalog 严格一致, 否则 renderer 抛 "Catalog not found"

两条生成管线:

- 非流式 POST /api/chat: RAG 检索 + 历史记忆 -> generateText (tools + 25 步上限) -> extractA2ui 切出标签块并用 A2uiMessageListSchema.safeParse 校验 -> 返回 { answer, a2ui }
- 流式 POST /api/chat_stream: createA2uiStreamFilter() 是一个有状态流过滤器 —— 普通文本即时透传 (仅扣留可能是标签前缀的尾部) , <a2ui-json> 块静默缓冲直到闭合标签; 跨 chunk 的部分标签扣留, 未闭合块在 flush 时还原为纯文本而非静默丢弃. 完整块校验后以 SSE event: a2ui 一次性下发

纠错重试: 块校验失败时调用 correctA2uiBlock —— 关闭工具的一次重试, 把错误信息回灌模型要求只输出修正块; 仍失败则降级为 notice 提示, 绝不伪造 UI 数据. 这正是 v0.9 prompt-first 取向 (schema 嵌入 prompt, 生成后校验修复) 在应用层的标准落地.

### 消费侧: unknown[] 边界 + 增量渲染

hooks/use-chat.ts 中 ChatMessage.a2ui?: unknown[] 挂在助手消息上 (持久化到 localStorage) . SSE 解析器处理 event: a2ui 事件后追加到最后一条助手消息的 a2ui 数组. 设计红线: web_core 自带 zod v3, 不得与应用层 zod v4 混用, 边界一律 unknown[], 渲染时才由 web_core schema 逐条校验.

components/msg-list.tsx 中每条带 a2ui 数据的助手消息渲染一个 A2uiView, onRawAction 接到动作后走独立的 action 管线.

### 交互回传: out-of-band 原地更新

这是本应用最有特色的设计 —— surface 内的动作不走聊天消息流:

1. 用户点击 surface 内按钮 -> MessageProcessor 回调 -> A2uiView.onRawAction(action), action 为 {name, surfaceId, sourceComponentId, context}
2. sendA2uiAction POST /api/a2ui_action, body 为 { action, a2ui: 该消息当前的完整 a2ui 消息列表 } (surface 的权威状态随请求带上)
3. 服务端 runA2uiAction: action payload + surface 全量消息组成 user prompt; generateText 使用 A2UI_ACTION_SYSTEM_PROMPT —— 通过 allowedMessages 裁剪 schema, 使 action 场景下 createSurface/deleteSurface 根本无法通过校验; 输出经 extractA2ui + 纠错重试
4. filterInPlaceMessages 只保留针对同一 surfaceId 的 updateComponents/updateDataModel —— 杂散的 createSurface 会让客户端抛 "Surface already exists" 并丢弃整批消息
5. 客户端把返回的 patch 追加到原消息的 a2ui 数组, A2uiView 增量 processMessages 原地更新 surface (如表单提交后在原卡片内显示状态行)

更新不产生新的聊天气泡, 交互体验收敛在 surface 内部.

### AI Ops 管线与其他

POST /api/ai_ops 走 plan-execute-replan: Planner (think 模型结构化输出 steps) -> Executor (quick 模型 + 工具逐步执行) -> Replanner 循环 (≤20 轮) ; 完成后 uiifyReport() 用 think 模型做一次无工具的"UI 化"后处理, 把报告可选地渲染为 A2UI surface, 失败绝不影响报告本身.

工具三层拆分 (lib/ai/tools/) : schemas.ts (zod) -> operations.ts (纯函数) -> index.ts (AI SDK tool) , 含 get_current_time、mysql_crud、query_internal_docs (RAG) 、query_prometheus_alerts, 另有经 MCP SDK 引入的 SSE 日志工具. instrumentation.ts 启动时把 data/docs/ 文档全部 embedding 入 Redis 向量库.

界面示例 (prompt few-shot builder) :

- 告警列表: Column/Text/List (模板绑定 children:{componentId, path:"/alerts"}) /Card/Row/Badge/Button (action ack_alert, context 用相对路径绑定)
- QPS 指标报告: Chart (variant:"line") + Table (rows 绑定 /rows)
- 告警静默表单: Card + TextField x3 (value 绑定数据模型) + Button (action create_silence, context 携带表单值)

验证手段: /gallery 页面无后端渲染全部 shadcn 扩展组件 (消息顺序 createSurface -> updateDataModel -> updateComponents) ; scripts/a2ui-smoke.ts 检查 prompt 示例、流过滤器分块与校验语义.

### 工程坑位清单

1. zod 版本红线: web_core 内置 zod v3, 应用层 zod v4 不得混用 schema, 边界用 unknown[] 隔离
2. MessageProcessor 有状态: React StrictMode 双执行会重放 surface, 需关闭或妥善处理
3. catalogId 两端必须一致, 否则 "Catalog not found"; 服务端只能消费 catalog.json 文件, 不能 import Catalog 实例
4. action 回传的 patch 中杂散 createSurface 会导致整批消息被丢弃, 服务端必须先过滤
5. LLM 生成的 A2UI 块天然存在格式错误概率, 必须有校验 + 有限次纠错重试 + 诚实降级的完整兜底
6. 两个仓库的 AGENTS.md 都存在与现行代码不一致的描述 (如 action 走聊天通道的旧设计) , 以代码为准

### 小结

A2UI 把"Agent 发 UI"从发代码变成发数据, 用 catalog 契约 + 数据绑定 + 扁平组件树换取 LLM 生成的可靠性与跨信任边界的安全性; @swifty.js/a2ui-shadcn 用 65 个组件和三合一封装证明协议可以承载真实设计系统; swifty-agent 则验证了从 prompt 生成、流式渲染到交互原地更新的完整工程闭环, 其自建链路 (而非 CopilotKit) 为自建 agentic 应用提供了可复用的参考实现.

## v0.8 与 v0.9 字段差异对照

阅读旧资料时注意以下差异 (本文全部采用 v0.9 形态):

| 维度            | v0.8                         | v0.9                                             |
| :-------------- | :--------------------------- | :----------------------------------------------- |
| 组件类型字段    | componentType                | component                                        |
| 组件属性        | 包裹在 params 对象内         | 直接平铺在组件对象上                             |
| createSurface   | 可携带 dataModel 初始值      | 必须携带 catalogId, 数据由 updateDataModel 下发  |
| updateDataModel | updates 数组 (op/path/value) | 单条 path + value, upsert 语义                   |
| 设计取向        | 面向 structured output       | prompt-first, schema 嵌入 prompt, 生成后校验修复 |
