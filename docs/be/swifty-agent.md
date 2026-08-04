---
protected: true
---

# Swifty Agent (OnCall Agent) 高级后端工程师面试 QA

> 项目路径: `github.com/hangtiancheng/swifty.go/swifty_agent`
> 定位: 基于 Eino 框架的 AIOps 智能运维助手, 提供 RAG 增强对话、Plan-Execute-Replan 告警分析、知识库索引与检索能力

---

## 目录

- [一、项目架构总览](#一-项目架构总览)
  - [Q1: 请介绍 swifty_agent 的整体架构和核心能力](#q1-请介绍-swifty-agent-的整体架构和核心能力)
  - [Q2: 为什么选择 Eino 作为 AI 编排框架? 它解决了什么问题?](#q2-为什么选择-eino-作为-ai-编排框架-它解决了什么问题)
  - [Q3: 项目的双模型架构 (Think/Quick) 是如何设计的?](#q3-项目的双模型架构-think-quick-是如何设计的)
- [二、Chat Pipeline (RAG + ReAct)](#二-chat-pipeline-rag-react)
  - [Q4: Chat Pipeline 的 DAG 计算图是如何编排的?](#q4-chat-pipeline-的-dag-计算图是如何编排的)
  - [Q5: AllPredecessor 触发模式解决了什么问题?](#q5-allpredecessor-触发模式解决了什么问题)
  - [Q6: ReAct Agent 的工具调用循环是如何工作的?](#q6-react-agent-的工具调用循环是如何工作的)
- [三、Plan-Execute-Replan 告警分析](#三-plan-execute-replan-告警分析)
  - [Q7: Plan-Execute-Replan 模式与 ReAct 模式的区别和适用场景?](#q7-plan-execute-replan-模式与-react-模式的区别和适用场景)
  - [Q8: Planner 如何实现结构化输出? 为什么不用 tool_choice: forced?](#q8-planner-如何实现结构化输出-为什么不用-tool-choice-forced)
  - [Q9: Replanner 的异步迭代器模式是如何实现的?](#q9-replanner-的异步迭代器模式是如何实现的)
  - [Q10: extractJSONObject 如何处理 LLM 输出的不确定性?](#q10-extractjsonobject-如何处理-llm-输出的不确定性)
- [四、RAG 与知识库](#四-rag-与知识库)
  - [Q11: 向量检索为什么选择 Redis Stack (RediSearch) 而非 Milvus/Pinecone?](#q11-向量检索为什么选择-redis-stack-redisearch-而非-milvus-pinecone)
  - [Q12: 知识库索引的去重与分布式锁是如何实现的?](#q12-知识库索引的去重与分布式锁是如何实现的)
  - [Q13: 向量索引维度不匹配时如何处理?](#q13-向量索引维度不匹配时如何处理)
- [五、工具系统设计](#五-工具系统设计)
  - [Q14: 工具返回 JSON 错误而非 Go error 的设计考量?](#q14-工具返回-json-错误而非-go-error-的设计考量)
  - [Q15: TolerateEmptyArguments 泛型解决了什么兼容性问题?](#q15-tolerateemptyarguments-泛型解决了什么兼容性问题)
  - [Q16: MCP 工具集的优雅降级是如何实现的?](#q16-mcp-工具集的优雅降级是如何实现的)
- [六、会话记忆管理](#六-会话记忆管理)
  - [Q17: 内存中的 LRU + 滑动窗口方案相比 Redis 存储记忆有何取舍?](#q17-内存中的-lru-滑动窗口方案相比-redis-存储记忆有何取舍)
  - [Q18: 滑动窗口为什么按对 (pair) 淘汰消息?](#q18-滑动窗口为什么按对-pair-淘汰消息)
- [七、LLM Provider 抽象与适配](#七-llm-provider-抽象与适配)
  - [Q19: signaturePatchingTransport 解决了什么问题?](#q19-signaturepatchingtransport-解决了什么问题)
  - [Q20: Anthropic Extended Thinking 的 BudgetTokens 为什么是 MaxTokens-1?](#q20-anthropic-extended-thinking-的-budgettokens-为什么是-maxtokens-1)
- [八、SSE 流式响应](#八-sse-流式响应)
  - [Q21: SSE 流式聊天的完整生命周期是怎样的?](#q21-sse-流式聊天的完整生命周期是怎样的)
- [九、生产化设计](#九-生产化设计)
  - [Q22: 项目中有哪些面向生产环境的防御性设计?](#q22-项目中有哪些面向生产环境的防御性设计)
  - [Q23: Redis 客户端为什么强制使用 RESP2 协议?](#q23-redis-客户端为什么强制使用-resp2-协议)
- [十、设计权衡与演进](#十-设计权衡与演进)
  - [Q24: 从 Next.js 迁移到 Go 的动机和技术收益?](#q24-从-next-js-迁移到-go-的动机和技术收益)
  - [Q25: 如果让你重新设计, 有哪些改进方向?](#q25-如果让你重新设计-有哪些改进方向)

---

## 一、项目架构总览

### Q1: 请介绍 swifty_agent 的整体架构和核心能力

答:

swifty_agent 是一个 Go 实现的 AIOps 智能运维助手, 从 Next.js 项目迁移而来, 核心提供三大能力:

1. RAG 增强对话 (`POST /api/chat`, `/api/chat_stream`): 基于 Redis 向量检索 + ReAct Agent 的多轮对话, 支持 SSE 流式输出
2. Plan-Execute-Replan 告警分析 (`POST /api/ai_ops`): 自动化多步骤告警根因分析, 生成结构化运维报告
3. 知识库管理 (`POST /api/upload`): Markdown 文档的切片、向量化、索引到 Redis Stack

技术栈:

- HTTP 框架: swifty_http (自研 Koa 风格框架)
- AI 编排: CloudWeGo Eino (DAG 计算图 + ADK Agent 框架)
- 向量存储: Redis Stack (RediSearch HNSW 索引)
- LLM: OpenAI 兼容 / Anthropic Claude (双 Provider)
- 工具集成: MCP (日志查询)、Prometheus (告警)、MySQL (数据查询)

分层结构:

```
main.go                     -- 入口, 加载配置, 启动 HTTP 服务
internal/
  app/                      -- HTTP Handler 层 (路由、SSE、错误格式化)
  config/                   -- JSON 配置加载与默认值
  consts/                   -- Redis Schema 常量
  ai/
    agent/
      chat_pipeline/        -- RAG + ReAct DAG 图
      plan_execute_replan/  -- Plan-Execute-Replan 三阶段 Agent
      knowledge_index_pipeline/ -- 文档索引流水线
    models/                 -- LLM 工厂 (Think/Quick 双模型)
    embedder/               -- Embedding 工厂 (DashScope/Ollama)
    retriever/              -- Redis KNN 向量检索
    indexer/                -- Redis 向量写入
    tools/                  -- Agent 工具集 (MCP/Prometheus/MySQL/Docs/Time)
  utility/
    redis/                  -- Redis 客户端工厂 + 索引管理
    mem/                    -- 内存会话记忆 (LRU + 滑动窗口)
    log_callback/           -- Eino 管道日志回调
    logger/                 -- slog 统一日志
cmd/                        -- CLI 调试命令 (chat/ai_ops/knowledge/recall/llm_tool)
```

---

### Q2: 为什么选择 Eino 作为 AI 编排框架? 它解决了什么问题?

答:

Eino 是 CloudWeGo 开源的 Go AI 编排框架, 选择它的核心原因:

1. DAG 计算图编排: Chat Pipeline 需要并行分支 (RAG 检索 + 会话变量构造) 汇聚后进入 ReAct Agent, Eino 的 `compose.NewGraph` 原生支持 DAG 拓扑和 `AllPredecessor` 汇聚语义, 无需手写 goroutine 同步
2. 组件化抽象: Retriever、Indexer、ChatModel、Tool 均为接口, 可替换实现 (Redis/Milvus, OpenAI/Claude) 而不改编排逻辑
3. ADK Agent 框架: `planexecute.New` 封装了 Plan-Execute-Replan 循环的状态机, 包括 Session 值传递、AsyncIterator 事件流、BreakLoopAction 终止语义
4. 流式原生: `compose.Runnable` 同时暴露 `Invoke` (同步) 和 `Stream` (流式) 两种调用方式, 一套图定义服务两个 endpoint
5. Go 生态: 相比 LangChain (Python) 或 Vercel AI SDK (TypeScript), Eino 与项目的 Go 技术栈一致, 避免跨语言调用开销

对比原 Next.js 方案: 原先用 Vercel AI SDK 的 `generateText` + `streamText` + 手写 pipeline 串联, 迁移到 Eino 后编排逻辑声明式定义, 可观测性通过 Callback 统一注入。

---

### Q3: 项目的双模型架构 (Think/Quick) 是如何设计的?

答:

项目将 LLM 调用分为两个层级:

| 模型           | 用途                 | 特点                                              |
| -------------- | -------------------- | ------------------------------------------------- |
| ThinkChatModel | Planner、Replanner   | 深度推理, 开启 Extended Thinking, 输出结构化 JSON |
| QuickChatModel | Chat Agent、Executor | 快速响应, 工具调用, 低延迟                        |

设计动机:

- 成本与延迟平衡: 规划/重规划是低频高价值决策, 值得用大模型深度思考; 工具执行是高频操作, 用轻量模型降低延迟和 token 消耗
- 能力匹配: Planner 需要长链推理和结构化输出能力 (Claude 3.5 Sonnet + Thinking); Executor 需要准确的工具调用能力 (可用更小的模型)

实现上, 两者共享 `newChatModel` 工厂函数, 通过 `config.ChatModelConfig` 区分 API Key、Base URL、Model Name、MaxTokens、Thinking 开关:

```go
func NewThinkChatModel(ctx context.Context, cfg *config.Config) (model.ToolCallingChatModel, error) {
    return newChatModel(ctx, cfg, cfg.ThinkChatModel)
}
func NewQuickChatModel(ctx context.Context, cfg *config.Config) (model.ToolCallingChatModel, error) {
    return newChatModel(ctx, cfg, cfg.QuickChatModel)
}
```

---

## 二、Chat Pipeline (RAG + ReAct)

### Q4: Chat Pipeline 的 DAG 计算图是如何编排的?

答:

Chat Pipeline 使用 Eino 的 `compose.NewGraph` 构建了一个 5 节点的 DAG:

```
START ──┬──> [InputToRag] ──> [RedisRetriever] ──┐
        │                                         ├──> [ChatTemplate] ──> [ReactAgent] ──> END
        └──> [InputToChat] ──────────────────────┘
```

各节点职责:

- InputToRag (Lambda): 从 `UserMessage` 提取 `Query` 字段作为检索关键词
- InputToChat (Lambda): 构造模板变量 `{content, history, date}`, 其中 history 来自内存会话记忆
- RedisRetriever (Retriever): 执行 HNSW KNN 向量搜索, 输出 key 为 `documents`
- ChatTemplate (ChatTemplate): 将系统提示词 + RAG 文档 + 用户消息 + 历史渲染为 `[]*schema.Message`
- ReactAgent (Lambda): 包装 `react.Agent` 的 Generate/Stream, 执行最多 25 步工具调用循环

关键设计:

- `InputToRag` 和 `InputToChat` 从 START 并行分叉, 减少串行等待
- `RedisRetriever` 的输出通过 `compose.WithOutputKey("documents")` 映射到模板的 `{documents}` 占位符
- 编译时指定 `compose.WithNodeTriggerMode(compose.AllPredecessor)`, 确保 ChatTemplate 等待两个前驱都完成

---

### Q5: AllPredecessor 触发模式解决了什么问题?

答:

Eino 的 DAG 图默认使用 `AnyPredecessor` 触发模式——节点在任一前驱完成时即执行。这对 ChatTemplate 节点是错误的, 因为它需要同时接收:

1. RedisRetriever 输出的 `documents` (RAG 文档)
2. InputToChat 输出的模板变量 (content, history, date)

如果使用 `AnyPredecessor`, ChatTemplate 可能在 Retriever 还未返回时就执行, 导致 `{documents}` 为空。

`AllPredecessor` 模式确保节点等待所有入边前驱完成后才触发, 语义上等价于一个 barrier/join。这是 DAG 编排中 fork-join 模式的标准实现。

---

### Q6: ReAct Agent 的工具调用循环是如何工作的?

答:

ReAct (Reasoning + Acting) Agent 的核心循环:

1. LLM 接收系统提示 + 用户消息 + 工具定义, 决定是调用工具还是直接回答
2. 若调用工具: 执行工具 -> 将结果作为 observation 追加到消息历史 -> 回到步骤 1
3. 若直接回答: 输出最终 response, 循环结束
4. 安全阀: `MaxStep: 25` 防止无限循环

工具注册:

```go
agentCfg.ToolsConfig.Tools = mcpTools           // MCP 日志查询 (动态)
agentCfg.ToolsConfig.Tools = append(..., promTool)   // Prometheus 告警
agentCfg.ToolsConfig.Tools = append(..., mysqlTool)  // MySQL CRUD
agentCfg.ToolsConfig.Tools = append(..., timeTool)   // 当前时间
agentCfg.ToolsConfig.Tools = append(..., docsTool)   // 内部文档 RAG
```

最终通过 `compose.AnyLambda(agent.Generate, agent.Stream, nil, nil)` 包装为统一的 Lambda 节点, 同时支持同步和流式调用。

---

## 三、Plan-Execute-Replan 告警分析

### Q7: Plan-Execute-Replan 模式与 ReAct 模式的区别和适用场景?

答:

| 维度     | ReAct                    | Plan-Execute-Replan                           |
| -------- | ------------------------ | --------------------------------------------- |
| 决策粒度 | 逐步决策, 每步独立推理   | 先全局规划, 再逐步执行, 执行后重评估          |
| 适用场景 | 开放式对话、简单工具调用 | 复杂多步骤任务 (告警分析需要 6+ 步)           |
| 模型使用 | 单一模型                 | Planner 用 Think 模型, Executor 用 Quick 模型 |
| 可控性   | 低, LLM 自由决定下一步   | 高, 计划可审计, 步骤可追踪                    |
| 容错     | 单步失败即中断           | Replanner 可调整计划绕过失败步骤              |

在 swifty_agent 中:

- Chat 用 ReAct: 用户问题不确定, 可能只需 1-2 步工具调用
- AIOps 用 Plan-Execute-Replan: 告警分析是固定流程 (查告警 -> 查文档 -> 查日志 -> 生成报告), 需要全局视角和进度追踪

`MaxIterations: 20` 限制总循环次数, Executor 内部 `MaxIterations: 10` 限制单步工具调用次数, 双层防护防止失控。

---

### Q8: Planner 如何实现结构化输出? 为什么不用 tool_choice: forced?

答:

Planner 使用 prompt-based structured output 而非 `tool_choice: forced`:

```go
prompt := fmt.Sprintf(`Break down the following task into concrete steps.
Task: %s
Respond with ONLY a JSON object in this exact format:
{"steps": ["step 1 description", ...]}
Do not include any other text...`, query)
```

原因:

1. Provider 兼容性: 部分模型 (如 Qwen3.7) 不完整支持 Anthropic 的 `tool_choice: forced` 语义, 会忽略强制工具调用指令
2. 网关兼容: 非官方 Anthropic 网关可能不转发 `tool_choice` 参数
3. 统一性: 结构化输出和工具调用是两种不同的 LLM 交互模式, 混用增加复杂度

为应对 LLM 输出不确定性, 使用 `structuredOutputModel` 包装器对输出做后处理:

```go
type structuredOutputModel struct {
    model.ToolCallingChatModel
}
func (m *structuredOutputModel) Generate(...) (*schema.Message, error) {
    resp, err := m.ToolCallingChatModel.Generate(ctx, input, opts...)
    clean, extractErr := extractJSONObject(resp.Content)  // 剥离 fences/reasoning
    return schema.AssistantMessage(clean, resp.ToolCalls), nil
}
```

---

### Q9: Replanner 的异步迭代器模式是如何实现的?

答:

Replanner 实现了 Eino ADK 的 `adk.Agent` 接口, 核心是 `Run` 方法返回一个 `AsyncIterator`:

```go
func (r *customReplanner) Run(ctx context.Context, input *adk.AgentInput, ...) *adk.AsyncIterator[*adk.AgentEvent] {
    iterator, generator := adk.NewAsyncIteratorPair[*adk.AgentEvent]()
    go func() {
        defer func() {
            panicErr := recover()
            if panicErr != nil {
                generator.Send(&adk.AgentEvent{Err: ...})
            }
            generator.Close()
        }()
        // 1. 从 Session 读取已执行步骤、当前计划、用户输入
        // 2. 构造 replan prompt
        // 3. 调用 Think 模型
        // 4. 解析 JSON: done=true -> 发送 BreakLoopAction; done=false -> 更新 Plan Session
    }()
    return iterator
}
```

设计要点:

- goroutine + channel: `NewAsyncIteratorPair` 创建一对 (iterator, generator), generator 在 goroutine 中生产事件, iterator 在调用方消费, 实现非阻塞事件流
- panic recovery: `defer recover()` 捕获 panic 转为 error 事件, 防止单个 replan 失败导致整个进程崩溃
- Session 状态传递: 通过 `adk.GetSessionValue` / `adk.AddSessionValue` 在 Planner/Executor/Replanner 间共享计划和执行历史
- BreakLoopAction: 当 `done=true` 时发送 `adk.NewBreakLoopAction`, 通知 planexecute 框架终止循环

---

### Q10: extractJSONObject 如何处理 LLM 输出的不确定性?

答:

LLM 即使被指示 "只输出 JSON", 实际输出可能是:

- ` ```json\n{...}\n``` ` (markdown fence 包裹)
- `让我分析一下...\n{...}` (前置推理文本)
- `{...}\n希望这对你有帮助` (后置解释)

`extractJSONObject` 的处理策略:

1. 剥离 fence: 检测 ` ``` ` 前缀, 去掉首行和尾部的 fence 标记
2. 定位起始: 找到第一个 `{`, 跳过所有前置文本
3. 括号匹配: 从 `{` 开始追踪 depth, 正确处理:
   - 字符串内的 `{`/`}` 不影响深度 (通过 `inString` 状态)
   - 转义字符 `\"` 不终止字符串 (通过 `escaped` 状态)
4. 平衡检测: depth 归零时返回完整 JSON 子串; 若遍历完仍未归零, 返回错误和原始内容供调试

这是一个 O(n) 的有限状态机, 不依赖正则表达式, 能正确处理嵌套 JSON 和字符串中的特殊字符。

---

## 四、RAG 与知识库

### Q11: 向量检索为什么选择 Redis Stack (RediSearch) 而非 Milvus/Pinecone?

答:

选择 Redis Stack 的考量:

1. 运维复杂度: 项目已依赖 Redis 做缓存/锁, Redis Stack 是同一进程加载 RediSearch 模块, 无需额外部署向量数据库
2. 数据规模: 知识库是内部运维文档 (Markdown), 数据量在千级 chunk, HNSW 在 Redis 中性能足够
3. 事务一致性: 去重删除 (FT.SEARCH + DEL) 和索引写入在同一 Redis 实例, 避免跨系统一致性问题
4. 开发效率: 单一存储引擎减少 SDK 依赖和连接管理

索引配置:

```
FT.CREATE idx:biz ON HASH PREFIX 1 biz: SCHEMA
  content TEXT
  _source TAG
  vector VECTOR HNSW 6 TYPE FLOAT32 DIM 2048 DISTANCE_METRIC COSINE
```

- HNSW 算法: 近似最近邻, 适合中小规模高维向量
- COSINE 距离: 对文本 embedding 的归一化特性友好
- `_source` TAG 字段: 支持按文件来源精确过滤和去重删除

局限: 如果数据量增长到百万级, 需要考虑迁移到 Milvus/Qdrant 等专用向量数据库。

---

### Q12: 知识库索引的去重与分布式锁是如何实现的?

答:

重新索引同一文件时, 需要先删除旧 chunk 再写入新 chunk, 避免重复。实现:

```go
func deleteBySource(ctx context.Context, client *redis.Client, source string) error {
    escaped := escapeTag(source)
    lockKey := consts.RedisKeyPrefix + "lock:delete:" + escaped

    // 1. SETNX 分布式锁, 30s TTL 防死锁
    acquired, err := client.Do(ctx, "SET", lockKey, "1", "NX", "EX", "30").Result()
    if acquired == nil {
        return fmt.Errorf("another deletion is in progress")
    }
    defer client.Del(ctx, lockKey)

    // 2. 分批删除, 每批 1000 条
    for {
        res := FT.SEARCH idx:biz "@_source:{escaped}" NOCONTENT LIMIT 0 1000
        keys := extractKeys(res)
        client.Del(ctx, keys...)
        if len(keys) < 1000 { break }
    }
}
```

设计要点:

- SETNX + TTL: 防止并发上传同一文件导致重复删除/索引; 30s TTL 是死锁安全网 (持锁进程崩溃后自动释放)
- 分批删除: 避免单次 DEL 过多 key 阻塞 Redis (大文件可能切出数百个 chunk)
- escapeTag: 对文件路径中的 RediSearch TAG 特殊字符 (`.`, `/`, `-`, 空格等) 进行反斜杠转义, 确保精确匹配
- `_source` 使用 basename: 与 Next.js 版本保持一致, 同一文件不同路径上传视为同一来源

---

### Q13: 向量索引维度不匹配时如何处理?

答:

切换 Embedding Provider (如从 DashScope 2048d 切换到 Ollama 768d) 后, 已有索引的向量维度与新配置不一致, FT.SEARCH 会静默返回空结果。

处理策略 (`ensureIndex`):

```go
func ensureIndex(ctx context.Context, client *redis.Client, cfg *config.Config) error {
    wantDim := cfg.EmbeddingModel.Dimensions
    if info, err := client.Do(ctx, "FT.INFO", idxName).Result(); err == nil {
        if storedDim, ok := parseVectorDim(info); ok && storedDim != wantDim {
            // 维度不匹配: 删除旧索引, 重建
            client.Do(ctx, "FT.DROPINDEX", idxName)
        } else {
            return nil  // 维度匹配, 复用
        }
    }
    // 创建新索引
    client.Do(ctx, "FT.CREATE", ...)
}
```

- 启动时自动检测, 无需人工干预
- `parseVectorDim` 解析 FT.INFO 的 RESP2 扁平数组响应, 定位 VECTOR 类型属性的 DIM 值
- 删除索引后需要重新索引所有文档 (通过 `cmd/knowledge` CLI 批量执行)

---

## 五、工具系统设计

### Q14: 工具返回 JSON 错误而非 Go error 的设计考量?

答:

以 Prometheus 告警工具为例:

```go
result, err := queryPrometheusAlerts(prometheusURL)
if err != nil {
    out := PrometheusAlertsOutput{
        Success: false,
        Error:   err.Error(),
        Message: "Failed to query Prometheus alerts",
    }
    b, _ := json.MarshalIndent(out, "", "  ")
    return string(b), nil  // 返回 nil error
}
```

设计原因:

1. Agent 可推理: 如果返回 Go error, Eino 框架会中断工具调用循环, Agent 无法得知失败原因。返回 JSON 错误让 LLM 看到 "Prometheus 不可达", 可以决定跳过告警查询、告知用户、或尝试替代方案
2. 优雅降级: 运维场景中部分数据源不可用是常态, Agent 应能基于可用信息给出部分结论
3. 对齐 Next.js 行为: 原 Vercel AI SDK 的 tool 执行器将异常序列化为 tool result 返回给模型

---

### Q15: TolerateEmptyArguments 泛型解决了什么兼容性问题?

答:

问题: 部分模型 (如 Qwen3.7) 对无参数工具调用返回空字符串 `""` 而非规范的 `"{}"`:

```json
{
  "tool_calls": [
    { "function": { "name": "get_current_time", "arguments": "" } }
  ]
}
```

Eino 默认的 `sonic.UnmarshalString("")` 会报 "input json is empty" 错误, 中断整个 Agent 循环。

解决方案——泛型包装器:

```go
func TolerateEmptyArguments[T any]() utils.UnmarshalArguments {
    return func(ctx context.Context, arguments string) (any, error) {
        if strings.TrimSpace(arguments) == "" {
            arguments = "{}"
        }
        var input T
        json.Unmarshal([]byte(arguments), &input)
        return input, nil
    }
}
```

- 将空/纯空白参数规范化为 `"{}"`, 反序列化得到 T 的零值
- 通过 `utils.WithUnmarshalArguments(TolerateEmptyArguments[*Input]())` 注入到工具定义
- 泛型设计使其适用于任何无参数工具, 无需为每个工具单独处理

---

### Q16: MCP 工具集的优雅降级是如何实现的?

答:

MCP (Model Context Protocol) 服务器提供日志查询能力, 但它是非核心依赖:

```go
func GetLogMcpTool(ctx context.Context, mcpURL string) ([]tool.BaseTool, error) {
    mcpMu.Lock()
    defer mcpMu.Unlock()

    if mcpConnected && cachedURL == mcpURL && cachedTools != nil {
        return cachedTools, nil  // 缓存命中
    }

    tools, err := buildMcpTools(ctx, mcpURL)
    if err != nil {
        logger.L().Warn("mcp connect failed, skipping log tools", ...)
        return []tool.BaseTool{}, nil  // 降级: 返回空工具集, nil error
    }

    cachedTools = tools
    cachedURL = mcpURL
    mcpConnected = true
    return tools, nil
}
```

设计要点:

- 失败不缓存: 连接失败时不设置 `mcpConnected`, 下次请求会重试, MCP 服务恢复后自动重连
- 成功缓存: 避免每次请求都建立 SSE 连接 (MCP 使用 SSE 传输)
- 互斥锁保护: `sync.Mutex` 防止并发请求同时建立多个 SSE 连接
- 返回空切片而非 nil: 下游 `append(toolList, ...)` 安全, 不会 panic

---

## 六、会话记忆管理

### Q17: 内存中的 LRU + 滑动窗口方案相比 Redis 存储记忆有何取舍?

答:

当前方案: 进程内 `map[string]*ConversationMemory` + `container/list` LRU

| 维度     | 内存方案 (当前)                   | Redis 方案               |
| -------- | --------------------------------- | ------------------------ |
| 延迟     | 纳秒级, 无网络 IO                 | 毫秒级, 每次读写一次 RTT |
| 持久化   | 进程重启丢失                      | 持久化, 重启不丢         |
| 多实例   | 不共享, 需 sticky session         | 天然共享                 |
| 复杂度   | 极低, 无序列化                    | 需要序列化/反序列化      |
| 内存控制 | LRU 100 session \* 6 msg 上界明确 | 需要额外 TTL/淘汰策略    |

选择内存方案的原因:

1. 项目当前是单实例部署 (Docker 单容器)
2. 运维对话是短会话, 丢失历史可接受 (用户重新描述问题即可)
3. 避免引入额外 Redis 依赖路径 (Redis 已用于向量存储, 职责分离)

LRU 实现: `container/list` 双向链表 + map, O(1) 访问和淘汰。全局 `sync.Mutex` 保护 map 和链表操作, 每个 session 内部有独立 `sync.Mutex` 保护消息切片。

---

### Q18: 滑动窗口为什么按对 (pair) 淘汰消息?

答:

```go
func (m *ConversationMemory) Append(msg *schema.Message) {
    m.Messages = append(m.Messages, msg)
    if len(m.Messages) > m.MaxWindowSize {
        excess := len(m.Messages) - m.MaxWindowSize
        if excess%2 != 0 {
            excess++  // 确保淘汰偶数条
        }
        m.Messages = m.Messages[excess:]
    }
}
```

原因: LLM 的多轮对话要求消息序列以 user 消息开始、assistant 消息结束, 且 user/assistant 严格交替。如果淘汰奇数条消息, 可能导致:

- 序列以 assistant 消息开头 (LLM 困惑: "我在回复谁?")
- 出现连续的 user 或 assistant 消息 (破坏对话结构)

按对淘汰保证窗口内始终是完整的 user-assistant 对话轮次, 维护消息序列的结构不变量。

---

## 七、LLM Provider 抽象与适配

### Q19: signaturePatchingTransport 解决了什么问题?

答:

问题: Anthropic 官方 API 在 non-streaming 响应的 thinking content block 中包含 `signature` 字段, 但部分第三方网关/代理 (如 OpenRouter、自建代理) 会省略该字段。Anthropic SDK 校验时发现 `signature` 缺失会拒绝整个响应: "Invalid JSON response"。

解决方案——HTTP Transport 中间件:

```go
type signaturePatchingTransport struct {
    base http.RoundTripper
}

func (t *signaturePatchingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
    resp, err := t.base.RoundTrip(req)
    // 仅处理 application/json (跳过 SSE 流)
    body, _ := io.ReadAll(resp.Body)
    patched, changed := patchThinkingSignature(body)
    if changed {
        resp.Body = io.NopCloser(bytes.NewReader(patched))
        resp.ContentLength = int64(len(patched))
    }
    return resp, nil
}
```

`patchThinkingSignature` 遍历 `content` 数组, 对 `type: "thinking"` 且缺少 `signature` 的 block 补充 `"signature": ""`。

设计考量:

- 在 Transport 层而非业务层处理, 对所有 Claude 调用透明生效
- 仅处理 `application/json` 响应, SSE 流 (streaming) 直接透传
- 从 Next.js 的 `createAnthropicFetch` workaround 对齐迁移

---

### Q20: Anthropic Extended Thinking 的 BudgetTokens 为什么是 MaxTokens-1?

答:

```go
if mc.Thinking && mc.MaxTokens > 1 {
    claudeCfg.Thinking = &claude.Thinking{
        Enable:       true,
        BudgetTokens: mc.MaxTokens - 1,
    }
}
```

Anthropic API 约束: `budget_tokens` 必须严格小于 `max_tokens`。`max_tokens` 是响应总 token 上限 (thinking + output), `budget_tokens` 是 thinking 部分的 token 预算。设为 `MaxTokens - 1` 是在满足约束的前提下最大化思考预算, 留 1 token 给实际输出内容的最低保证。

这与 Next.js 版本的 `ANTHROPIC_THINKING` 配置对齐, 确保迁移后行为一致。

---

## 八、SSE 流式响应

### Q21: SSE 流式聊天的完整生命周期是怎样的?

答:

```
Client                          Server
  |                               |
  |--- POST /api/chat_stream --->|
  |                               |-- BindJSON, 校验 id/question
  |                               |-- ctx.SSE() 建立 SSE 连接
  |<-- event: connected ---------|-- 发送连接确认 (JSON payload)
  |                               |-- BuildChatAgent (构建 DAG)
  |                               |-- runner.Stream() 启动流式推理
  |<-- event: message ------------|-- chunk.Content (逐 token)
  |<-- event: message ------------|-- chunk.Content
  |<-- event: message ------------|-- ...
  |                               |-- io.EOF (流结束)
  |<-- event: done --------------|-- "Stream completed"
  |                               |-- defer: 存入会话记忆
```

实现细节:

- 事件类型: `connected` (连接建立), `message` (内容 chunk), `done` (正常结束), `error` (异常)
- 记忆存储: 通过 `defer` 在流结束后将完整响应 (所有 chunk 拼接) 写入内存, 即使中途出错也能保存已生成的部分
- 错误处理: 构建失败或流中断时发送 `error` 事件, 客户端可据此展示错误提示
- 对齐 Next.js: 事件格式与 Vercel AI SDK 的 SSE 协议一致, 前端无需修改

---

## 九、生产化设计

### Q22: 项目中有哪些面向生产环境的防御性设计?

答:

1. Replanner panic recovery: goroutine 内 `defer recover()` 将 panic 转为 error 事件, 防止进程崩溃
2. MCP 优雅降级: 连接失败返回空工具集, Agent 继续工作 (只是没有日志查询能力)
3. Prometheus 空 URL 禁用: `baseURL == ""` 时直接返回空结果, 未配置时不报错
4. Redis 指数退避重连: `MinRetryBackoff: 100ms`, `MaxRetryBackoff: 5s`, `MaxRetries: 3`
5. 分布式锁防并发删除: SETNX + 30s TTL, 防止多实例同时删除同一 source 的文档
6. 工具错误 JSON 化: 外部服务失败不中断 Agent 循环, LLM 可推理并调整策略
7. MaxStep/MaxIterations 双层限制: ReAct 25 步 + PlanExecute 20 轮 \* 10 步/轮, 防止 token 爆炸
8. 结构化错误提取: `structuredErrorMessage` 通过反射从 LLM SDK 错误中提取 HTTP 状态码和响应体, 返回可诊断的错误信息
9. 向量维度自动检测: 启动时校验索引维度, 不匹配自动重建, 避免静默搜索失败
10. Docker 多阶段构建: golang:1.25-alpine 编译 -> alpine 运行, 最小化镜像体积

---

### Q23: Redis 客户端为什么强制使用 RESP2 协议?

答:

```go
client := redis.NewClient(&redis.Options{
    Protocol: 2, // Required: FT.SEARCH needs RESP2
})
```

原因: RediSearch 的 `FT.SEARCH` 命令在 RESP3 协议下返回的数据格式与 RESP2 不同——RESP3 使用 map 类型, 而 go-redis 的 `Do().Slice()` 期望 RESP2 的扁平数组格式。如果使用 RESP3, `FT.SEARCH` 的结果解析会失败或返回原始未解析数据。

同时设置 `UnstableResp3 = true` 是因为 go-redis 在 Protocol=2 时默认禁用某些 RESP3 特性标记, 而向量搜索的某些内部命令需要该标记。

这是 go-redis + RediSearch 组合的已知兼容性约束。

---

## 十、设计权衡与演进

### Q24: 从 Next.js 迁移到 Go 的动机和技术收益?

答:

迁移动机:

1. 部署简化: Next.js 需要 Node.js 运行时 + 前端构建产物, Go 是单一静态二进制
2. 资源占用: Node.js 进程常驻内存 200MB+, Go 服务 20-30MB
3. 并发模型: Agent 的 Plan-Execute-Replan 涉及大量并发工具调用, Go 的 goroutine + channel 比 Node.js 的 Promise 链更直观
4. 类型安全: Go 的强类型 + 编译检查减少运行时错误 (LLM 工具调用的参数校验)
5. 统一技术栈: 团队后端均为 Go, 避免维护 TypeScript + Go 两套代码

技术收益:

- Docker 镜像从 ~500MB (node:alpine + next) 降到 ~20MB (alpine + static binary)
- 冷启动从 2-3s (Next.js server ready) 降到 <100ms
- 内存泄漏风险降低 (无 GC 压力下的 V8 heap 碎片)

保留的设计:

- Redis Schema 常量完全对齐 (`biz:` 前缀, `idx:biz` 索引名)
- SSE 事件格式对齐 (connected/message/done/error)
- 会话记忆策略对齐 (100 session LRU, 6 消息窗口)
- 错误格式对齐 (structuredErrorMessage 模拟 Next.js 错误结构)

---

### Q25: 如果让你重新设计, 有哪些改进方向?

答:

1. 会话记忆持久化: 当前内存方案在多实例/重启场景丢失历史, 可引入 Redis 存储会话 (与向量存储复用实例, 不同 DB)
2. 工具调用可观测性: 接入 OpenTelemetry, 对每次 LLM 调用和工具执行记录 span, 支持延迟分析和 token 用量追踪
3. 知识库增量索引: 当前全量删除+重建, 大文件场景可改为基于内容 hash 的增量更新
4. 流式 Plan-Execute: 当前 AIOps 是同步等待全部完成, 可改为 SSE 流式推送每步进度
5. 工具权限控制: MySQL CRUD 工具当前接受任意 DSN+SQL, 生产环境应限制为只读 + 白名单表
6. Embedding 缓存: 对相同文本 chunk 缓存 embedding 结果, 减少重复向量化调用
7. 多租户隔离: 知识库按团队/项目隔离, Redis key 加入 tenant 前缀
8. Plan 持久化与恢复: 长时间运行的 Plan-Execute 任务支持断点续执行 (当前进程重启则丢失)
