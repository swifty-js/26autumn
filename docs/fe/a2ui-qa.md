---
protected: true
---

# A2UI

传统方式: 通过 iframe 传输 html/js

缺陷: 重、结构乱、样式乱

- 安全: LLM 输出结构化 JSON 数据, 客户端维护 catalog 组件库, LLM 只请求渲染 catalog 的组件, 降低 UI 注入等安全风险
- LLM 友好: UI 被抽象为扁平的组件列表 (邻接表), 流式传输 JSON 以实现渐进式渲染
- 框架无关、可移植: A2UI 将 UI 结构和具体实现方式 (vanilla js/lit/react/mobile...) 分离, agent 发送抽象组件树和数据模型, 客户端使用自身的组件库进行渲染

优势

- 安全
- 没有 iframe, 性能好、样式统一
- 可移植: 一份结构化 JSON 数据同时适用于 vanilla js/lit/react/mobile...

Keywords: 流式传输 JSON、声明式 UI (抽象组件树)、数据绑定

## 目录

- [概念](#概念)
- [消息类型](#消息类型)
- [完整流程](#完整流程)

## 概念

- Surface: 页面
- Component: 组件
- Data Model: 数据模型
- Message: JSON 对象

## 消息类型

- createSurface: 创建新的页面 (mount 挂载)
- updateComponents: 更新页面中的组件
- updateDataModel: 更新数据模型 (更新 state)
- deleteSurface: 删除页面 (unmount 卸载)
- actionResponse: 响应客户端事件 (handleClick)

## 完整流程

### Server 启动

Server 使用 A2A 协议暴露 HTTP 端点

```js
// server.js
const agent = new RestaurantAgent(); // Agent, 包含 systemPromptBuilder + tools
const executor = new AgentExecutor(agent); // 封装 Agent Loop 的执行器
const handler = new DefaultRequestHandler(executor); // A2A JSON-RPC 请求处理器
const app = new A2AHttpApplication(handler); // HTTP 应用

app.use(cors({ origin: "*" })); // 允许跨域
app.use("/static", express.static("public")); // 静态资源服务

app.listen(8000, "0.0.0.0");
```

Server 启动后, 提供两个端点:

- `GET http://localhost:8000/.well-known/agent-card.json` AgentCard, 声明 Server 能力 (支持的 A2A 扩展、MIME 类型等)
- `POST http://localhost:8000/a2a` A2A JSON-RPC 端点, 处理 `message/send` 请求

AgentCard 中声明支持的 A2UI 版本 (例如 `https://a2ui.org/a2a-extension/a2ui/v0.9`), Client 通过读取 AgentCard 以知道 Server 支持 A2UI.

### Client 启动

Client 是一个 Lit Web 应用, 启动时做三件事:

(1) 注册 catalog 组件库

```ts
// register-components.ts
import { componentRegistry } from "@a2ui/lit/ui";

// 注册自定义组件, 提供组件的 JSON Schema
componentRegistry.register(
  "McpApp", // 组件类型 ID
  McpApp, // Lit 组件类
  "a2ui-mcp-apps-component", // 自定义元素 tag name
  {
    type: "object",
    properties: {
      resourceUri: { type: "string" },
      htmlContent: { type: "string" },
      height: { type: "number" },
      allowedTools: { type: "array", items: { type: "string" } },
    },
  },
);

// 基础组件 (Heading, Text, Button, Card, Column, Image 等 18 个), 由 @a2ui/lit/ui 库内置注册, 无需手动调用
```

componentRegistry 的作用: 维护组件类型 ID 到 Lit 组件类 + JSON Schema 的映射关系. 后续 MessageProcessor 在渲染时, 根据 A2UI JSON 中的 componentType 查找对应的 Lit 组件类

(2) 创建 MessageProcessor

```ts
// mcp-app.ts
const processor = createSignalA2uiMessageProcessor();
```

MessageProcessor 是 Client 端的核心处理器, 内部持有:

- SurfaceGroupModel: 所有 Surface (页面) 的容器
- 全局 action 事件订阅器: 统一监听用户交互事件

```ts
// MessageProcessor 伪代码
class MessageProcessor {
  readonly model: SurfaceGroupModel;

  constructor(catalogs, actionHandler) {
    this.model = new SurfaceGroupModel();
    if (actionHandler) {
      this.model.onAction.subscribe(actionHandler);
    }
  }

  // 生成 Client 能力声明
  getClientCapabilities(): A2uiClientCapabilities {
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

(3) Lit 根组件挂载

```ts
// mcp-app.ts -- Lit 根组件
@customElement("a2ui-mcp-sample")
export class A2UIMcpSample extends SignalWatcher(LitElement) {
  @state() #processor = createSignalA2uiMessageProcessor();
  #a2uiClient = new A2UIClient();

  connectedCallback() {
    super.connectedCallback();
    // 页面加载时发送初始请求
    this.#sendAndProcessMessage({ request: "Load MCP App" });
  }

  render() {
    const surfaces = Array.from(this.#processor.getSurfaces().values());
    return html`
      <div id="surfaces">
        ${surfaces.map(
          (surface) => html`
            <a2ui-surface
              .surface=${surface}
              @a2uiaction=${this.#handleAction}
            />
          `,
        )}
      </div>
    `;
  }
}
```

SignalWatcher 混入了 Preact Signals 响应式系统, 当 DataModel 中的值变化时, 只有绑定了该值的 Lit 组件会重新渲染 (细粒度更新).

### 阶段 3: 用户输入

用户在页面中输入查询内容 (例如 "Top 5 Chinese restaurants in New York"), 点击发送.

Client 将用户输入封装为 A2UIClientEventMessage:

```ts
const message = { request: "Top 5 Chinese restaurants in New York" };
```

### 阶段 4: Client 发送请求 (inlineCatalogs)

A2UIClient 在发送请求时, 将本地注册的 catalog 内联到消息的 metadata 中:

```ts
// client.ts
class A2UIClient {
  async send(message: A2UIClientEventMessage) {
    // 从 componentRegistry 导出当前所有已注册组件的 Schema
    const catalog = componentRegistry.getInlineCatalog();
    // => 返回完整的 Catalog JSON Schema (包含所有组件类型定义、函数签名、主题定义)

    const finalMessage = {
      ...message,
      metadata: {
        a2uiClientCapabilities: {
          inlineCatalogs: [catalog], // 将整个 catalog 内联发送
        },
      },
    };

    // 发送简单 HTTP POST 到本地 Vite 中间件代理
    const response = await fetch("/a2a", {
      body: JSON.stringify(finalMessage),
      method: "POST",
    });

    return await response.json();
  }
}
```

inlineCatalogs 的意义: Server 端的 LLM 需要知道 Client 支持哪些组件, 才能生成合法的 A2UI JSON. 通过 inlineCatalogs, Client 在每次请求时把本地组件库的完整 Schema 发送给 Server, Server 将其注入 system prompt 的 "Catalog Schema" 部分.

另一种模式是 pre-shared catalog: Client 只发送 catalogId (URL), Server 预先已知该 catalog 的内容. Restaurant Finder 官方示例使用此模式.

### 阶段 5: Vite 中间件代理 (HTTP -> A2A)

Client 使用简单的 fetch('/a2a') 发送请求, 但 Server 要求 A2A JSON-RPC 协议. Vite 中间件负责协议转换:

```ts
// middleware/a2a.ts
export const plugin = (): Plugin => ({
  name: "a2a-handler",
  configureServer(server: ViteDevServer) {
    server.middlewares.use("/a2a", async (req, res) => {
      const body = await readBody(req);

      // 判断请求类型: JSON (UI 事件) 或 纯文本 (用户查询)
      let sendParams: MessageSendParams;
      if (isJson(body)) {
        // JSON 请求: 包装为 A2A DataPart, 携带 mimeType
        sendParams = {
          message: {
            messageId: uuidv4(),
            role: "user",
            parts: [
              {
                kind: "data",
                data: JSON.parse(body),
                metadata: { mimeType: "application/a2ui+json" },
              },
            ],
            kind: "message",
          },
        };
      } else {
        // 纯文本请求: 包装为 A2A TextPart
        sendParams = {
          message: {
            messageId: uuidv4(),
            role: "user",
            parts: [{ kind: "text", text: body }],
            kind: "message",
          },
        };
      }

      // 创建 A2A Client (懒初始化, 读取 Server 的 AgentCard)
      const client = await A2AClient.fromCardUrl(
        "http://localhost:8000/.well-known/agent-card.json",
        { fetchImpl: fetchWithCustomHeader }, // 自定义 fetch, 注入 A2UI 扩展头
      );

      const response = await client.sendMessage(sendParams);
      res.end(JSON.stringify(response.result.status.message.parts));
    });
  },
});
```

关键的自定义 fetch -- 注入 X-A2A-Extensions 请求头:

```ts
const fetchWithCustomHeader = async (url, init) => {
  const headers = new Headers(init?.headers);
  headers.set(
    "X-A2A-Extensions",
    "https://a2ui.org/a2a-extension/a2ui/v0.8", // 声明 Client 支持的 A2UI 版本
  );
  return fetch(url, { ...init, headers });
};
```

X-A2A-Extensions 的作用: A2A 协议的扩展协商机制. Server 读取此头, 与自身支持的版本取交集, 选择最新的 A2UI 版本激活. 如果 Client 和 Server 版本不匹配, A2UI 功能不会被激活, LLM 不会生成 A2UI JSON.

协议转换总结:

- Client 发送: `POST /a2a` 简单 JSON (用户查询或 UI 事件)
- 中间件转换为: A2A JSON-RPC `message/send` 请求, 包含 TextPart 或 DataPart
- 附加: `X-A2A-Extensions` 头声明 A2UI 版本
- Server 返回: A2A Task 对象, 中间件提取 `task.status.message.parts` 返回给 Client

### 阶段 6: Server 接收请求, 组装 Prompt

Server 收到 A2A 请求后, 执行以下步骤:

(1) A2UI 扩展激活

```js
// extension.js (伪代码)
function tryActivateA2uiExtension(clientRequested, serverSupported) {
  // 取交集, 选择最新版本
  const activated = intersect(clientRequested, serverSupported);
  // => 例如激活 v0.9, 返回 AgentExtension 对象
  return getA2uiAgentExtension(activatedVersion);
}
```

Server 从请求头 `X-A2A-Extensions` 中读取 Client 请求的版本, 与自身声明的版本取交集. 如果匹配成功, 激活 A2UI 扩展, 后续 LLM 的 system prompt 中会包含 A2UI 的 Schema 和指令.

(2) 读取 Client 能力 (inlineCatalogs)

```js
// agentExecutor.js (伪代码)
const metadata = message.metadata;
const a2uiCapabilities = metadata.a2uiClientCapabilities ?? {};
const inlineCatalogs = a2uiCapabilities.inlineCatalogs ?? [];
// inlineCatalogs 包含 Client 端注册的完整组件 Schema
```

如果 Client 发送了 inlineCatalogs, Server 将其解析并注入到 system prompt 的 Catalog Schema 部分, 替代 Server 内置的 catalog.

(3) 组装 System Prompt

```md
<!-- Role Description -->

You are a helpful assistant. Your final output MUST be a a2ui UI JSON response.

## Workflow Description

- The response can contain one or more A2UI JSON blocks.
- Each A2UI JSON block MUST be wrapped in `<a2ui-json>` and `</a2ui-json>` tags.
- Between or around these blocks, you can provide conversational text.
- The JSON MUST validate against the provided A2UI JSON SCHEMA.
- Top-Down Component Ordering:
  - The 'root' component MUST be the FIRST element.
  - Parent components MUST appear before their child components.

## UI Description

(模板选择规则: 列表用 SINGLE_COLUMN_LIST, 表单用 BOOKING_FORM 等)

---BEGIN A2UI JSON SCHEMA---

### Server To Client Schema:

(createSurface / updateComponents / updateDataModel / deleteSurface 的完整 JSON Schema)

### Common Types Schema:

(ComponentId, DataBinding, ActionEvent 等公共类型定义)

### Catalog Schema:

(从 inlineCatalogs 或 pre-shared catalog 注入的组件类型定义)
---END A2UI JSON SCHEMA---

### Examples:

(完整的 A2UI JSON 示例, 包含数据绑定的用法)
```

Prompt 的关键组成部分:

- Role: 指示 LLM 必须输出 A2UI JSON
- Workflow: 指定 `<a2ui-json>` 标签包裹、组件排序规则
- UI Description: 模板选择指南 (何时用列表、何时用表单)
- Schema: 完整的 JSON Schema, 确保 LLM 输出可校验
- Catalog Schema: Client 支持的组件列表 (来自 inlineCatalogs 或 pre-shared)
- Examples: 包含数据绑定用法的完整示例

### 阶段 7: LLM ReAct 推理循环

ADK Agent 内部执行 ReAct (Reason + Act) 循环, 整个循环封装在单次 `runner.runAsync()` 调用中:

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
  { "createSurface": { "surfaceId": "main", "dataModel": {} } },
  { "updateComponents": { "surfaceId": "main", "components": [...] } },
  { "updateDataModel": { "surfaceId": "main", "updates": [...] } }
]
</a2ui-json>
```

### 阶段 8: Server 校验 A2UI JSON

Server 从 LLM 输出中提取 `<a2ui-json>` 标签内的 JSON, 进行 Schema 校验:

```js
// validator.js (伪代码)
function extractAndValidate(llmOutput) {
  // 1. 正则提取 <a2ui-json>...</a2ui-json> 内容
  const match = llmOutput.match(/<a2ui-json>([\s\S]*?)<\/a2ui-json>/);
  const jsonStr = match[1];

  // 2. 解析 JSON
  const messages = JSON.parse(jsonStr);

  // 3. 对照 A2UI JSON Schema 校验
  //    检查: 消息类型是否合法、组件类型是否在 catalog 中、数据绑定格式是否正确
  const result = validate(messages, a2uiSchema);

  // 4. 校验失败时, 最多重试 1 次 (将错误信息反馈给 LLM 重新生成)
  if (!result.valid && retryCount < 1) {
    return retryWithErrorFeedback(messages, result.errors);
  }
  return messages;
}
```

校验通过后, Server 将 A2UI 消息列表包装为 A2A Task 响应:

```js
// 包装为 A2A Task 响应
const task = {
  status: { state: "completed" },
  artifacts: [
    {
      parts: a2uiMessages.map((msg) => ({ kind: "data", data: msg })),
    },
  ],
};
```

### 阶段 9: Client 接收响应, 渲染 UI

中间件将 A2A Task 的 parts 提取后返回给 Client:

```ts
// 中间件返回
res.end(JSON.stringify(task.status.message.parts));
// => [{ kind: 'data', data: { createSurface: {...} } }, { kind: 'data', data: { updateComponents: {...} } }, ...]

// Client 提取 data 类型的 payload
const messages = response
  .filter((item) => item.kind === "data")
  .map((item) => item.data);

// 交给 MessageProcessor 处理
this.#processor.processMessages(messages);
```

MessageProcessor 按顺序处理每条消息:

消息 1 -- createSurface (挂载页面):

```json
{
  "createSurface": {
    "surfaceId": "main",
    "dataModel": {}
  }
}
```

处理: 创建一个新的 SurfaceModel, 绑定空的 DataModel, 挂载到 DOM 中.

消息 2 -- updateComponents (更新组件树):

```json
{
  "updateComponents": {
    "surfaceId": "main",
    "components": [
      { "id": "root", "componentType": "Column", "params": { "gap": 16 } },
      {
        "id": "title",
        "componentType": "Heading",
        "params": { "text": { "path": "/title" } }
      },
      {
        "id": "list",
        "componentType": "Column",
        "params": {
          "items": { "componentId": "card_template", "path": "/items" }
        }
      },
      {
        "id": "card_template",
        "componentType": "Card",
        "params": {
          "title": { "path": "name" },
          "subtitle": { "path": "address" }
        }
      }
    ]
  }
}
```

处理: 按顺序将组件添加到 Surface 的组件树中. 注意组件排序规则 -- 父组件必须在子组件之前, 这使得流式解析可以增量渲染.

消息 3 -- updateDataModel (填充数据):

```json
{
  "updateDataModel": {
    "surfaceId": "main",
    "updates": [
      {
        "op": "add",
        "path": "/title",
        "value": "Top 5 Chinese Restaurants in New York"
      },
      {
        "op": "add",
        "path": "/items",
        "value": [
          { "name": "Hwa Yuan", "address": "40 E Broadway, New York" },
          { "name": "Nom Wah Tea Parlor", "address": "13 Doyers St, New York" }
        ]
      }
    ]
  }
}
```

处理: 使用 JSON Pointer (RFC 6901) 路径, 将数据写入 DataModel. DataModel 内部使用 Preact Signals 响应式系统, 数据变化会自动触发绑定了该路径的组件重新渲染.

### 阶段 10: 数据绑定机制

数据绑定是 A2UI 的核心设计, 它将组件的 params 与 DataModel 中的数据关联起来. 有三种绑定方式:

(1) 绝对路径绑定 -- 以 "/" 开头, 从 DataModel 根节点解析

```json
{
  "id": "title",
  "componentType": "Heading",
  "params": { "text": { "path": "/title" } }
}
```

`{ "path": "/title" }` 表示: 从 DataModel 根节点读取 `/title` 路径的值. 当 updateDataModel 写入 `{ "op": "add", "path": "/title", "value": "Top 5..." }` 后, 该 Heading 的 text 属性自动更新为 "Top 5...".

(2) 相对路径绑定 -- 不以 "/" 开头, 从当前 DataContext 路径解析

```json
{
  "id": "card_template",
  "componentType": "Card",
  "params": { "title": { "path": "name" } }
}
```

`{ "path": "name" }` 是相对路径. 当 card_template 被用于列表渲染时, DataContext 会指向当前列表项 (例如 `/items/0`), 此时 `"name"` 解析为 `/items/0/name`.

(3) 列表模板绑定 -- 使用 `{ componentId, path }` 结构

```json
{
  "id": "list",
  "componentType": "Column",
  "params": {
    "items": { "componentId": "card_template", "path": "/items" }
  }
}
```

含义: 监听 DataModel 中 `/items` 路径的数组, 为数组中每个元素创建一个 card_template 实例. 每个实例的 DataContext 指向对应的数组元素.

内部处理流程:

```
DataModel 中 /items = [{ name: "A" }, { name: "B" }]
  => GenericBinder 订阅 /items 路径
  => 数组变化时, 为每个元素生成 { id: "card_template_0", basePath: "/items/0" }
  => card_template_0 的 DataContext.path = "/items/0"
  => card_template_0 中 "name" 相对路径解析为 "/items/0/name"
  => 渲染 Card, title = "A"
```

GenericBinder 的 Schema 驱动机制:

GenericBinder 在绑定属性时, 会读取组件注册时提供的 JSON Schema, 通过 Zod 内省将属性分类:

- DYNAMIC: 需要数据绑定的属性 (如 text, title) -> 创建 subscribeDynamicValue 订阅
- ACTION: 事件处理属性 (如 onClick) -> 创建闭包, 触发时发送 UI 事件
- STRUCTURAL: 结构属性 (如 items) -> 创建子列表, 订阅数组路径
- CHECKABLE: 可勾选属性 -> 创建双向绑定 (组件修改 -> 写回 DataModel)
- STATIC: 静态属性 -> 直接赋值

### 阶段 11: 用户交互 (Action 事件)

用户点击 "Book" 按钮, 触发以下链路:

(1) Lit 组件触发 a2ui action 事件

```ts
// mcp-app.ts
#handleAction(evt: StateEvent<'a2ui.action'>) {
  // 从事件中提取 action 信息
  const context = {};
  for (const item of evt.detail.action.context) {
    context[item.key] = item.value.literalString ?? item.value.literalNumber;
  }
  // context 示例: { restaurantName: "Hwa Yuan", address: "40 E Broadway" }

  // 封装为 A2UIClientEventMessage
  const message = {
    userAction: {
      surfaceId: evt.detail.sourceComponentId,
      name: evt.detail.action.name,        // 例如 "bookRestaurant"
      sourceComponentId: target.id,        // 触发事件的组件 ID
      timestamp: new Date().toISOString(),
      context,                              // 事件上下文数据 (从数据绑定中解析)
    },
  };

  // 发送给 Server
  await this.#sendAndProcessMessage(message);
}
```

(2) 中间件将 userAction 包装为 A2A DataPart

```ts
// middleware/a2a.ts
// 检测到 body 是 JSON, 包装为 DataPart
sendParams = {
  message: {
    parts: [
      {
        kind: "data",
        data: clientEvent, // { userAction: { name: "bookRestaurant", context: {...} } }
        metadata: { mimeType: "application/a2ui+json" },
      },
    ],
  },
};
```

(3) Server 将 UI 事件翻译为自然语言

Server 收到 userAction 后, 将其翻译为 LLM 可理解的自然语言描述, 注入到下一轮对话中:

```
USER_WANTS_TO_BOOK: The user clicked "Book" on restaurant "Hwa Yuan"
at address "40 E Broadway, New York". They want to make a reservation.
```

(4) LLM 根据事件生成新的 A2UI JSON

LLM 理解用户意图后, 生成预订表单的 A2UI JSON (例如 bookingForm 模板), 通过相同的 createSurface / updateComponents / updateDataModel 消息返回给 Client 渲染.

### 阶段 12: Session 管理

多轮对话通过 A2A 协议的 contextId 管理:

```ts
// 中间件维护 contextId
sendParams = {
  message: { messageId: uuidv4(), role: 'user', parts: [...] },
  configuration: {
    contextId: sessionId,   // 同一 contextId 下的消息共享对话历史
  },
};
```

Server 端的 ADK Session 通过 contextId 关联, 确保 LLM 在后续轮次中能看到之前的对话上下文 (包括之前生成的 A2UI 消息和工具调用结果).
