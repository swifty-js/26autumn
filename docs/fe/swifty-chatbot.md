# Swifty-Chatbot 高级全栈工程师面试 QA

> 本机器路径 `$HOME/github/swifty-chatbot`

## 一、项目概述与架构设计

### Q1: 请介绍 swifty-chatbot 项目的整体架构

答:

swifty-chatbot 是一个基于 pnpm workspace 的全栈 LLM 聊天应用, 采用前后端分离架构:

| 层级     | 技术选型                                                     |
| -------- | ------------------------------------------------------------ |
| 前端     | React 19 + TypeScript 5.9 + Vite 8                           |
| 状态管理 | Jotai (客户端状态) + TanStack React Query v5 (服务端状态)    |
| UI       | Base UI (@base-ui/react) + Tailwind CSS 4 + shadcn/ui 模式   |
| 后端     | Koa 3 + @koa/router                                          |
| LLM      | LangChain + Ollama (OpenAI 兼容接口, 默认 qwen3)             |
| 数据库   | MySQL (Knex 查询构建器)                                      |
| 缓存     | Redis (ioredis) + LRU 降级                                   |
| RAG      | LangChain MemoryVectorStore + OpenAIEmbeddings (对接 Ollama) |

项目结构为 monorepo, 包含 `client/` 和 `server/` 两个 package. 后端采用 Router -> Controller -> Service -> DAO -> DB 的经典分层架构. AI 能力通过工厂模式封装, 支持普通对话和 RAG 增强两种模型类型.

### Q2: 为什么选择 pnpm monorepo 而非独立仓库?

答:

选择 pnpm monorepo 的核心原因:

1. 类型同仓: 前后端代码同仓管理. 注意项目并没有共享类型 package (`pnpm-workspace.yaml` 只声明了 `client` 和 `server` 两个包), `Message`、`Session`、`ModelType` 等类型由前后端各自复制定义, 靠约定保持一致; monorepo 的价值在于让接口变更可以在同一仓库内原子化完成
2. 统一依赖管理: pnpm 的硬链接机制避免重复安装, 磁盘效率高
3. 原子化变更: 一次 PR 可以同时修改前后端代码, 保证接口变更的原子性
4. 开发体验: 根目录 `package.json` 通过 `concurrently` 一条命令同时启动前后端开发服务器

`pnpm-workspace.yaml` 声明了 `client` 和 `server` 两个 workspace package, 根目录脚本统一编排开发、构建流程.

### Q3: 前后端如何通信? 开发环境和生产环境有何区别?

答:

开发环境: Vite dev server 配置了代理, 将 `/api/*` 请求转发到 `http://localhost:8088/api/v1/*`, 通过 path rewrite 去掉 `/api` 前缀并添加 `/api/v1` 版本前缀. 前端代码中统一使用 `/api/` 开头的相对路径.

生产环境: 前端构建为静态资源, 由 Nginx 或类似反向代理统一分发: 静态资源直接返回, `/api/` 请求转发到 Koa 服务.

通信协议:

- 普通请求: JSON over HTTP (POST/GET)
- 流式响应: Server-Sent Events (SSE), Content-Type 为 `text/event-stream`
- 认证: Bearer Token (Authorization header) 或 query param `?token=`

---

## 二、前端架构与状态管理

### Q4: 前端状态管理方案是如何设计的?

答:

前端采用三层状态管理策略:

1. Jotai atoms (客户端状态): 管理 auth token、主题偏好、语言选择、模型类型等纯客户端状态. 其中 token 用普通 `atom` 创建, 初值取 `localStorage.getItem("token")`, 由写入 action atom 手动调用 `localStorage.setItem/removeItem` 持久化 (stores/auth.ts); 主题、语言、模型类型则通过 `atomWithStorage` 持久化到 localStorage (stores/settings.ts), 刷新后自动恢复.

2. TanStack React Query (服务端状态): 管理 sessions 列表、聊天历史等需要与后端同步的数据. 利用其缓存失效、后台重新获取、乐观更新等能力.

3. 组件本地 state (高频瞬态状态): 主聊天页面中的 messages 数组、streaming 状态等使用 `useState`, 避免高频更新穿透到全局 store.

这种分层设计确保了: 低频全局状态用 atom 共享, 服务端数据用 Query 自动同步, 高频渲染状态局部隔离.

### Q5: 为什么同时使用 Jotai 和 TanStack React Query?

答:

两者解决的是不同维度的问题:

| 维度     | Jotai                           | TanStack React Query           |
| -------- | ------------------------------- | ------------------------------ |
| 数据类型 | 客户端状态 (token, theme, lang) | 服务端状态 (sessions, history) |
| 同步需求 | 无需同步, 本地即真相            | 需要缓存失效、重新获取         |
| 持久化   | localStorage                    | 内存缓存 + 后端                |
| 更新频率 | 低 (用户主动切换)               | 中 (路由切换时获取)            |

如果只用 Jotai, 需要手动实现缓存失效、loading/error 状态管理、请求去重等逻辑. 如果只用 React Query, 纯客户端状态 (如主题) 没有合适的缓存键和失效策略. 两者互补, 各取所长.

### Q6: 路由和权限控制是如何实现的?

答:

使用 react-router-dom v7 的 `createBrowserRouter` + `RouterProvider`, 定义了 5 条路由: `/` (loader 中 `redirect("/login")`)、`/login`、`/register`、`/menu`、`/ai-chat`. 页面组件均通过 `lazy` + `withLazy` 懒加载, `/menu` 和 `/ai-chat` 额外包裹 `withAuth`.

权限控制通过 `withAuth` HOC 实现:

```tsx
// hoc/with-auth.tsx
function withAuth<P extends object>(WrappedComponent: ComponentType<P>) {
  return function (props: P) {
    const isAuthenticated = useAtomValue(isAuthenticatedAtom);
    const navigate = useNavigate();
    useEffect(() => {
      if (!isAuthenticated) {
        navigate("/login", { replace: true });
      }
    }, [isAuthenticated, navigate]);

    if (!isAuthenticated) {
      return null;
    }
    return <WrappedComponent {...props} />;
  };
}
```

`isAuthenticatedAtom` 是一个派生 atom, 基于 token atom 是否存在来计算. token 用普通 `atom(localStorage.getItem("token"))` 创建, 登录/登出时通过 action atom (`setTokenAtom`) 手动调用 `localStorage.setItem("token", ...)` / `localStorage.removeItem("token")` 持久化, 刷新页面后由 atom 初值恢复登录态.

---

## 三、SSE 流式渲染与性能优化

### Q7: 流式响应的完整数据链路是怎样的?

答:

完整链路如下:

```
用户输入 -> useStreamMessage hook (Fetch API POST)
         -> Koa Controller (res.writeHead SSE headers)
         -> SessionService -> AiAgent.responseStream()
         -> ChatOpenAI.stream() (async iterator, 对接 Ollama OpenAI 兼容端点)
         -> 逐 token 回调 -> res.write(`data: ${JSON.stringify(token)}\n\n`)
         -> 客户端 ReadableStream reader.read() 循环
         -> 逐行解析 SSE data 协议
         -> fullContent 累加写入 useRef (零 React 渲染)
         -> StreamingMarkdown 通过 rAF 轮询拉取最新文本
         -> Streamdown 增量解析 -> DOM 更新
         -> 收到 data: [DONE] -> onDone 回调 -> 流结束
```

关键设计: 服务端每产生一个 token 就立即 `res.write()`, 客户端通过 `ReadableStream` 逐块读取, 解析后写入 ref 而非 state, 由独立的 rAF 循环节流渲染.

### Q8: 为什么使用 Fetch API 而非 EventSource 消费 SSE?

答:

三个核心原因:

1. HTTP 方法限制: `EventSource` 只支持 GET 请求, 而本项目的流式接口需要 POST 发送 `{question, model_type, session_id}` 请求体.

2. 自定义 Header: `EventSource` 不支持设置 `Authorization` header. 虽然可以通过 query param 传递 token, 但 Fetch API 可以直接在 header 中携带 Bearer Token, 更安全规范.

3. 错误处理粒度: Fetch API 可以检查 `response.ok`、读取 HTTP 状态码, 而 EventSource 的错误事件不暴露 HTTP 状态码, 难以区分 401 (鉴权失败) 和 500 (服务错误).

实现上使用 `body.getReader()` 获取 `ReadableStreamDefaultReader`, 配合 `TextDecoder` 逐块解码, 手动按行分割解析 SSE 协议.

### Q9: StreamingMarkdown 组件如何实现零渲染热路径?

答:

核心思想是将数据写入与 React 渲染解耦:

```typescript
function StreamingMarkdown({ sourceRef }: Props) {
  const [text, setText] = useState("");
  const lastLengthRef = useRef(0);

  useEffect(() => {
    let rafId = 0;
    const flush = () => {
      const latest = sourceRef.current ?? "";
      if (latest.length !== lastLengthRef.current) {
        lastLengthRef.current = latest.length;
        setText(latest);
      }
      rafId = requestAnimationFrame(flush);
    };
    rafId = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(rafId);
  }, [sourceRef]);

  return <Markdown mode="streaming" isAnimating>{text}</Markdown>;
}
```

设计要点:

1. SSE 回调只写 ref: `onChunk` 回调将 fullContent 写入 `sourceRef.current`, 这是一个 mutable ref, 不触发任何 React 重渲染. 即使每秒收到数百个 chunk, React 调度器完全无感知.

2. rAF 节流拉取: 独立的 `requestAnimationFrame` 循环以最多 60fps 的频率检查 ref 是否有新内容, 有变化才调用 `setText` 触发渲染. 将数百次/秒的 chunk 折叠为最多 60 次/秒的渲染.

3. 长度比较去重: 通过 `lastLengthRef` 记录上次渲染的文本长度, 长度未变则跳过 setState, 避免无意义的 reconciliation.

### Q10: 消息列表的虚拟化和自动滚动是如何实现的?

答:

使用 `@tanstack/react-virtual` 实现窗口化渲染:

```typescript
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 120,
  overscan: 5,
});
```

自动滚动策略 (尊重用户控制权):

1. 近底检测: 通过 `onScroll` 事件计算 `scrollHeight - scrollTop - clientHeight < 80px`, 记录在 `isNearBottomRef` 中.

2. 新消息滚动: 当 `messages.length` 变化时, 如果是用户自己发的消息 (role === "user") 则强制滚到底部; 如果是 AI 消息, 仅在用户已处于底部附近时才滚动.

3. 流式增长跟踪: 使用 `ResizeObserver` 监听消息容器高度变化 (流式输出导致气泡增高), 仅在 `isNearBottomRef.current === true` 时执行 `scrollToIndex(last, {align: "end"})`.

4. 用户阅读保护: 如果用户正在翻阅历史消息 (不在底部), 自动滚动完全停止, 不会打断用户.

性能保障: `MessageItem` 使用 `React.memo` 包裹, 流式输出期间只有最后一条消息在渲染, 已定型的消息不会因父组件更新而重渲染.

### Q11: Streamdown 的增量 Markdown 解析原理是什么?

答:

Streamdown (Vercel 出品的流式 Markdown 渲染器) 的核心优化:

1. 块级分割: 将 Markdown 文本按语义块分割 (段落、代码围栏、标题、列表等), 每个块独立解析为 React 元素.

2. 已定型块缓存: 一旦某个块被完整接收 (例如代码围栏的 ``` 闭合), 该块的解析结果被 memoize, 后续渲染直接复用, 不再重新解析.

3. 仅解析尾部块: 每次文本更新时, 只有最后一个未完成的块需要重新解析. 例如一段 2000 字的回复, 当第 1900 字到达时, 前 1800 字对应的块全部命中缓存, 只解析最后 200 字.

4. 代码高亮: 通过 `@streamdown/code` 集成 Shiki, 代码块在流式过程中也能实时高亮, 且围栏闭合后高亮结果被缓存.

这使得渲染成本与消息总长度解耦, 只与当前增量成正比, 长消息的流式渲染不会越来越卡.

---

## 四、后端分层架构

### Q12: 后端的分层架构是怎样的? 各层职责是什么?

答:

```
Router (@koa/router)
  -> Controller (参数校验 + 响应格式化)
    -> Service (业务编排)
      -> DAO (数据访问, Knex 查询)
        -> MySQL / Redis
```

| 层级       | 目录              | 职责                                     |
| ---------- | ----------------- | ---------------------------------------- |
| Router     | `src/router/`     | URL 到 Controller 的映射, 中间件挂载     |
| Controller | `src/controller/` | Zod 参数校验, 调用 Service, 格式化响应体 |
| Service    | `src/service/`    | 业务逻辑编排, 协调 DAO 和 AI Agent       |
| DAO        | `src/dao/`        | 纯数据访问, 封装 Knex 查询               |
| Model      | `src/model/`      | TypeScript 类型定义                      |
| Middleware | `src/middleware/` | JWT 鉴权等横切关注点                     |
| AI         | `src/ai/`         | Agent 系统 (独立于业务分层)              |
| RAG        | `src/rag/`        | 检索增强生成管线                         |

响应格式统一: 所有接口返回 `{code: number, message: string, ...data}` 结构, 通过 `success()` 和 `codeOf()` 工具函数生成.

### Q13: SSE 流式接口在服务端是如何实现的?

答:

以 `createStreamSessionAndSendMessageStream` 为例:

```typescript
export async function createStreamSessionAndSendMessageStream(ctx: Context) {
  // 1. 参数校验
  const parsed = questionModelSchema.safeParse(ctx.request.body);

  // 2. 直接操作 Node.js 原生 res, 绕过 Koa
  const res = ctx.res;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // 禁止 Nginx 缓冲
  });
  res.flushHeaders();

  // 3. 先发送 session_id 元数据
  res.write(`data: ${JSON.stringify({ session_id: sessionId })}\n\n`);

  // 4. 流式生成, 逐 token 写入
  await sessionService.sendMessageStream2session(
    username,
    question,
    model_type,
    sessionId,
    res,
  );

  // 5. 结束连接
  res.end();
}
```

Service 层内部调用 `AiAgent.responseStream()`, 该方法接收一个 `StreamCallback`, 每产生一个 token 就执行 `res.write(`data: ${JSON.stringify(chunk)}\n\n`)`, 即 token 以 JSON 字符串编码写入 (客户端 `JSON.parse` 还原, 避免特殊字符破坏 SSE 帧). 全部完成后发送 `data: [DONE]\n\n` 作为结束哨兵.

### Q14: 为什么 SSE 要绕过 Koa 的响应处理直接操作 res?

答:

1. Koa 的响应模型是一次性的: Koa 在中间件链执行完毕后, 将 `ctx.body` 一次性序列化发送. SSE 需要在请求生命周期内持续写入数据, 与 Koa 的 "设置 body -> 自动响应" 模型根本冲突.

2. 流式写入需求: SSE 要求 `res.write()` 后立即 flush 到客户端, 不能等所有数据就绪. 直接操作 `ctx.res` (Node.js 原生 `ServerResponse`) 可以逐块写入.

3. Header 控制: 需要设置 `X-Accel-Buffering: no` 等非标准 header 来禁止反向代理缓冲, 通过 `res.writeHead()` 更直接.

4. 连接生命周期: SSE 连接的关闭时机由业务逻辑决定 (收到 `[DONE]` 或出错), 而非 Koa 中间件链的结束.

---

## 五、AI Agent 系统设计

### Q15: AiAgent、AiAgentManager、AiModelFactory 三者的关系和职责?

答:

```
AiModelFactory (工厂 + 注册表)
  |-- 注册模型创建器: registerModel(type, creator)
  |-- 创建模型实例: createAiModel(type, config)
  |-- 创建 Agent: createAiAgent(type, sessionId, config)
  |
AiAgentManager (单例, 生命周期管理)
  |-- Map<username, Map<sessionId, AiAgent>>
  |-- getOrCreateAiAgent(): 获取或创建 Agent
  |-- 模型热切换: 检测 modelType 变化时调用 agent.setModel()
  |
AiAgent (单个会话实例)
  |-- messages: Message[] (内存中的对话历史)
  |-- model: AiModel (当前使用的模型)
  |-- response(): 非流式对话
  |-- responseStream(): 流式对话
  |-- addMessage(): 追加消息 + 异步持久化到 MySQL
```

设计原则: Factory 负责 "如何创建", Manager 负责 "在哪里、给谁", Agent 负责 "如何对话". 三者职责单一, 通过组合协作.

### Q16: 对话上下文是如何管理的? 为什么选择内存存储?

答:

每个 `AiAgent` 实例在内存中维护一个 `messages: Message[]` 数组, 记录完整对话历史. 每次调用 LLM 时, 通过 `toAiMessages()` 将历史转换为 LangChain 的消息格式传入.

选择内存存储的原因:

1. 延迟: LLM 调用需要完整上下文, 从内存读取是 O(1), 从 MySQL 读取需要网络 I/O
2. 简化实现: 无需序列化/反序列化, 无需处理数据库连接池竞争
3. 写后读一致性: 消息写入内存后立即可用于下一次 LLM 调用, 无需等待 MySQL 写入完成

持久化策略: 采用 write-behind 模式, `addMessage()` 先写入内存, 然后异步 (fire-and-forget) 调用 `saveMessage()` 写入 MySQL, 失败只记日志不阻塞主流程.

代价: 服务重启后内存丢失, 需要从 MySQL 重建 (见 Q18).

### Q17: 模型热切换是如何实现的?

答:

在 `AiAgentManager.getOrCreateAiAgent()` 中:

```typescript
let agent = sessionId2agent.get(sessionId);
if (agent) {
  if (agent.getModelType() !== modelType) {
    agent.setModel(factory.createAiModel(modelType, config));
  }
  return agent;
}
```

当用户在前端切换模型类型 (如从 OpenAI 切换到 OpenAI with RAG) 时:

1. 请求携带新的 `model_type` 参数
2. Manager 发现已有 Agent 的 modelType 与请求不匹配
3. 通过 Factory 创建新模型实例
4. 调用 `agent.setModel()` 替换模型引用
5. 对话历史 (messages) 保持不变, 新模型继承完整上下文

这实现了无缝切换: 用户切换模型后, 对话不中断, 历史上下文完整保留.

### Q18: 服务重启后如何恢复对话上下文?

答:

服务启动时 `main.ts` 中的 `loadDataFromDb()` 执行上下文重建:

1. 调用 `getAllMessages()` 从 MySQL `messages` 表按 `created_at` 升序加载全部历史消息 (不查询 `sessions` 表, session 按消息中携带的字段隐式恢复)
2. 逐条消息调用 `AiAgentManager.getOrCreateAiAgent(username, session_id, ...)` 获取或创建对应 session 的 `AiAgent` 实例
3. 通过 `agent.addMessage(..., false)` 将消息注入 `messages` 数组, 第 4 个参数传 `false` 表示仅恢复内存状态, 不再重复写回数据库

这确保了即使服务崩溃重启, 用户再次进入对话时, AI 仍然 "记得" 之前的对话内容. 代价是启动时间随历史消息量线性增长. 另外, 恢复时统一使用 `ModelType.OPENAI_MODEL` 创建 Agent, 若用户上次使用的是 RAG 模型, 需等下一次请求携带新 `model_type` 时通过热切换纠正.

---

## 六、RAG 检索增强生成

### Q19: RAG 管线的完整流程是怎样的?

答:

```
用户上传文件 (.md/.txt/.json)
  -> multer 接收, CRC32 命名去重, 存入 uploads/{username}/

用户发送消息 (model_type = "openai-rag")
  -> DocumentLoader.loadFromDirectory() 读取用户目录下所有文件
  -> RecursiveCharacterTextSplitter 分块 (chunkSize=1000, overlap=200)
  -> OpenAIEmbeddings (nomic-embed-text, 对接 Ollama) 向量化
  -> MemoryVectorStore.fromDocuments() 构建内存向量索引
  -> similaritySearchWithScore(query, k=5) 检索 Top-5 相关文档
  -> buildRagPrompt() 将检索结果注入 Prompt
  -> ChatOpenAI 基于增强 Prompt 生成回答
```

Prompt 模板:

```
Answer the user's question based on the following reference document.
If the document does not contain the relevant information, please state
that the information could not be found.

Reference Document:
[Document 1]: ...
[Document 2]: ...

User Question: {原始问题}

Please provide an accurate and complete answer:
```

### Q20: 为什么选择 MemoryVectorStore 而非持久化向量数据库?

答:

当前选择的合理性:

1. 项目规模: 单用户文档量有限 (几个 .md/.txt 文件), 向量数量在百到千级别, 内存完全可以承载
2. 部署简化: 无需额外部署 Chroma/Pinecone/Weaviate 等向量数据库, 降低运维复杂度
3. 数据隔离: 每个用户的向量索引独立构建, 天然隔离, 无需在向量库中做 namespace 管理

已知局限:

1. 每次请求都重建向量索引, 存在重复计算 (Embedding 调用有延迟)
2. 无法跨请求复用, 文档未变时也会重新向量化
3. 文档量大时 (数万页) 内存和延迟都不可接受

改进方向: 引入持久化向量库 + 增量索引, 仅在文档变更时重新向量化, 查询时直接检索.

### Q21: 文档分块策略的参数选择依据是什么?

答:

使用 `RecursiveCharacterTextSplitter`, 参数为 `chunkSize=1000, chunkOverlap=200`:

- chunkSize=1000: 平衡检索精度和上下文完整性. 过小 (如 200) 会丢失段落语义; 过大 (如 5000) 会引入噪声, 降低相似度匹配的准确性. 1000 字符约覆盖一个完整段落或代码块.

- chunkOverlap=200: 20% 的重叠率确保跨块边界的信息不丢失. 如果一个关键概念恰好在第 1000 字符处被截断, 重叠部分保证下一个块仍包含完整语境.

- Recursive 分割: 按 `\n\n` -> `\n` -> `. ` -> ` ` 的优先级递归分割, 尽量在自然语义边界切分, 而非硬截断.

---

## 七、认证与安全

### Q22: JWT 认证流程是怎样的? SSE 场景下如何处理鉴权?

答:

标准流程:

1. 用户登录/注册 -> 服务端验证凭据 -> 签发 JWT (payload: `{id, username}`, 有效期 8760h)
2. 前端将 token 存入 localStorage (Jotai atom 的写入 action 手动调用 `localStorage.setItem`)
3. 后续请求在 `Authorization: Bearer <token>` header 中携带
4. 服务端 `auth` 中间件解析验证 token, 将 `username` 注入 `ctx.state`

SSE 场景的特殊处理:

```typescript
// middleware/auth.ts
let token = "";
const authHeader = ctx.get("Authorization");
if (authHeader?.startsWith("Bearer ")) {
  token = authHeader.slice(7);
} else {
  token = ctx.request.query.token ?? "";
}
```

SSE 使用 Fetch API (非 EventSource), 因此可以直接设置 Authorization header. 但中间件同时支持 `?token=` query param 作为后备方案, 兼容 EventSource 等无法自定义 header 的场景.

### Q23: 当前安全方案有哪些已知弱点和改进方向?

答:

| 弱点              | 风险                       | 改进方向                             |
| ----------------- | -------------------------- | ------------------------------------ |
| MD5 哈希密码      | 彩虹表攻击, 无盐值         | 改用 bcrypt/argon2 + 随机盐          |
| JWT 有效期 1 年   | token 泄露后长期有效       | 缩短有效期 + refresh token 机制      |
| JWT secret 默认值 | 未配置时使用应用名作为密钥 | 启动时强制要求配置, 否则拒绝启动     |
| 无速率限制        | 暴力破解、资源耗尽         | 引入 rate limiter (如 koa-ratelimit) |
| CORS 全开         | 跨域攻击面                 | 配置白名单域名                       |
| body 限制 100MB   | 大 payload DoS             | 按接口设置合理限制                   |

---

## 八、数据层设计

### Q24: 数据库 Schema 是如何设计的?

答:

三张核心表, 服务启动时通过 Knex 自动建表 (hasTable 检查):

users 表:

- `id` BIGINT 主键
- `name`, `email` (索引), `username` (唯一约束), `password`
- `created_at`, `updated_at`, `deleted_at` (软删除)

sessions 表:

- `id` VARCHAR 主键 (UUID)
- `username` (索引, 关联用户)
- `title` (会话标题)
- `created_at`, `updated_at`, `deleted_at` (软删除)

messages 表:

- `id` INT 自增主键
- `session_id` (索引, 关联会话)
- `username`, `content` (TEXT), `is_user` (BOOLEAN)
- `created_at`

设计要点:

- sessions 使用 UUID 作为主键, 便于前端在创建会话时乐观生成 ID
- messages 使用自增 INT, 保证插入顺序和查询性能
- 软删除 (deleted_at) 而非物理删除, 支持数据恢复和审计
- username 冗余存储在 messages 中, 避免跨表 JOIN

### Q25: 缓存层的抽象设计是怎样的? Redis 不可用时如何降级?

答:

`db/cache.ts` 提供统一的缓存抽象层. 实现上没有抽象类/接口, 而是导出模块级函数 `cacheGet` / `cacheSet` / `cacheDelete`, 内部通过 `isRedisEnabled()` 布尔分发:

```
db/cache.ts
  ├── cacheGet / cacheSet / cacheDelete (模块级函数, 统一入口)
  ├── isRedisEnabled() ? Redis (db/redis.ts 的独立函数) : LRU (lru-cache 实例)
```

降级策略: `initCache()` 在服务启动时按配置尝试连接 Redis (`initRedis` + `testRedisConnection`), 连接成功则置 `redisEnabled = true`; 连接失败则回退, 初始化进程内 LRU 缓存实例:

- 最大条目数: 10,000
- 最大内存: 256MB
- TTL: 10 分钟

设计意义: 开发环境无需安装 Redis 即可运行, 生产环境使用 Redis 实现跨进程/跨实例缓存共享. 缓存层对上层 Service 完全透明, 切换无需修改业务代码.

---

## 九、工程化与构建

### Q26: 前后端的构建方案分别是什么? 为什么服务端用 Rollup?

答:

| 端   | 构建工具                                          | 输出                   |
| ---- | ------------------------------------------------- | ---------------------- |
| 前端 | Vite 8 (@vitejs/plugin-react + @tailwindcss/vite) | 静态资源 (HTML/JS/CSS) |
| 后端 | Rollup (TypeScript plugin)                        | 单个 ESM bundle        |

服务端选择 Rollup 的原因:

1. Tree-shaking: 移除未使用的代码路径, 减小部署体积
2. 单文件输出: 将所有本地模块打包为一个 ESM 文件, 简化部署 (无需 node_modules 中的源码)
3. external 配置: 所有 node_modules 依赖标记为 external, 不打包进 bundle, 保持运行时 require
4. TypeScript 编译: 通过插件在构建时完成类型擦除, 产物为纯 JS

开发模式: 使用 `tsx watch` 直接运行 TypeScript, 无需构建步骤, 文件变更自动重启.

### Q27: 开发环境是如何组织的?

答:

根目录 `package.json` 使用 `concurrently` 并行启动:

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter client dev\" \"pnpm --filter server dev\""
  }
}
```

- client: `vite` (HMR, 端口 5173, 代理 /api -> localhost:8088)
- server: `tsx watch src/main.ts` (文件监听自动重启, 端口 8088)

代码规范:

- 前端: ESLint + Prettier
- 后端: Biome (更快的 lint + format 一体化工具)

---

## 十、设计模式与扩展性

### Q28: 项目中用到了哪些设计模式? 解决了什么问题?

答:

| 模式        | 应用位置                                    | 解决的问题                                         |
| ----------- | ------------------------------------------- | -------------------------------------------------- |
| 工厂模式    | AiModelFactory                              | 解耦模型创建与使用, 新增模型类型只需 registerModel |
| 单例模式    | AiAgentManager, AiModelFactory              | 全局唯一的 Agent 管理器和模型注册表                |
| 策略模式    | AiModel 接口 (OpenAIModel / OpenAIRagModel) | 同一 Agent 可切换不同推理策略                      |
| 观察者/回调 | StreamCallback                              | 解耦 token 生成与 SSE 写入                         |
| 中间件模式  | Koa auth middleware                         | 横切关注点 (鉴权) 与业务逻辑分离                   |
| 分层架构    | Router->Controller->Service->DAO            | 关注点分离, 各层可独立测试和替换                   |
| 适配器模式  | 缓存层模块级函数 (Redis/LRU 布尔分发)       | 统一入口, 底层实现可替换                           |

扩展新模型示例:

```typescript
// 注册新模型只需一行
factory.registerModel("openai", (config) => new OpenAIModel(config));
```

无需修改 Agent、Manager、Controller 的任何代码.

### Q29: 如果要支持水平扩展, 当前架构需要做哪些改造?

答:

当前架构的水平扩展瓶颈及解决方案:

| 瓶颈           | 原因                   | 解决方案                                     |
| -------------- | ---------------------- | -------------------------------------------- |
| Agent 内存状态 | 对话历史存在进程内存中 | 迁移到 Redis/共享存储, 或使用 sticky session |
| RAG 向量索引   | 每次请求重建, 无共享   | 引入独立向量数据库服务 (Milvus/Qdrant)       |
| 文件存储       | 本地磁盘 uploads/      | 迁移到对象存储 (S3/OSS)                      |
| SSE 长连接     | 连接绑定到特定进程     | 使用 Redis Pub/Sub 或消息队列广播            |

最小改造路径 (Sticky Session):

1. 负载均衡器按 username 做一致性哈希, 同一用户的请求始终路由到同一实例
2. 无需改造 Agent 内存模型, 但牺牲了故障转移能力

完整改造路径 (无状态服务):

1. Agent 对话历史存入 Redis (List 结构)
2. 每次请求从 Redis 加载上下文, 响应后写回
3. 服务完全无状态, 可任意扩缩容

---

## 十一、UI 与国际化

### Q30: UI 组件体系是如何构建的?

答:

采用 shadcn/ui 模式 (非 npm 依赖, 而是源码拷贝到项目中):

- 基础原语: Base UI (@base-ui/react, 无样式、可访问性优先的 headless 组件, Radix UI 的继任者)
- 样式层: Tailwind CSS 4 + CVA (class-variance-authority) 管理变体
- 工具函数: `tailwind-merge` 解决类名冲突, `clsx` 条件组合
- 组件目录: `components/ui/` 包含 button, card, input, select, textarea, dropdown-menu, skeleton, sonner (toast) 等

优势:

1. 组件源码在项目中, 可任意定制, 不受库版本约束
2. Base UI 保证 WAI-ARIA 可访问性
3. Tailwind 原子化样式避免 CSS 命名冲突
4. CVA 提供类型安全的变体管理

### Q31: 国际化方案是如何实现的?

答:

使用 i18next + react-i18next:

- 语言包: `src/i18n/locales/zh.json` 和 `en.json`
- 语言检测: 通过 `navigator.language` 自动检测浏览器语言
- 持久化: `SettingsBar` 切换语言时写入 `languageAtom` (`atomWithStorage`, key 为 `language`), 同时调用 `i18n.changeLanguage()` 即时生效. 刷新页面后 `i18n/index.ts` 的 `getSavedLanguage()` 从 `language` key 读取 (atomWithStorage 写入的是 JSON 编码字符串, 读取端用 `JSON.parse` 解析并校验 zh/en), 命中则恢复用户选择, 否则回落 `navigator.language` 浏览器语言检测
- 使用方式: 组件中 `const { t } = useTranslation()`, 模板中 `t("chat.empty_title")`
- 切换组件: `SettingsBar` 提供语言下拉选择器, 切换后全局即时生效, 无需刷新

支持中文和英文两种语言, 覆盖所有用户可见文本 (按钮、提示、空状态等).
