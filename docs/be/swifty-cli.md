---
protected: true
---

# Swiftx — 高级后端工程师面试 QA

> 基于 `github.com/hangtiancheng/swifty.go/swiftx` 项目源码分析（Go 1.26，约 2.7 万行非测试代码）
> 技术栈：Go 1.26 / Anthropic SDK / OpenAI SDK / MCP / Bubble Tea TUI
> 该项目是一个终端 CLI Coding Agent，具备多模型接入、流式工具执行、双层上下文管理、五层权限体系、OS 级沙箱、长期记忆、多智能体协作（子代理 / 团队 / git worktree 隔离）、技能系统与 MCP 集成等能力。

## 目录

- [一、系统架构设计（Q1–Q4）](#一-系统架构设计)
- [二、LLM 集成与流式处理（Q5–Q7）](#二-llm-集成与流式处理)
- [三、上下文窗口管理（Q8–Q13）](#三-上下文窗口管理)
- [四、工具系统与执行引擎（Q14–Q18）](#四-工具系统与执行引擎)
- [五、权限与安全（Q19–Q21）](#五-权限与安全)
- [六、记忆体系与会话持久化（Q22–Q25）](#六-记忆体系与会话持久化)
- [七、并发与状态管理（Q26–Q27）](#七-并发与状态管理)
- [八、多 Agent 协作与扩展（Q28–Q32）](#八-多-agent-协作与扩展)
- [九、错误处理与容错（Q33–Q34）](#九-错误处理与容错)
- [十、配置与部署（Q35）](#十-配置与部署)
- [十一、性能优化（Q36–Q37）](#十一-性能优化)
- [十二、设计模式与工程实践（Q38–Q41）](#十二-设计模式与工程实践)
- [十三、Go 语言特定问题（Q42–Q43）](#十三-go-语言特定问题)
- [十四、系统设计开放题（Q44–Q46）](#十四-系统设计开放题)

---

## 一、系统架构设计

### Q1: 请描述 Swiftx 的整体架构分层和核心模块职责

A:

项目是单二进制 Go 程序（`cmd/swiftx`），核心按职责分为七块：

1. Agent 核心（`internal/agent`）：`Agent.Run` 主循环 + `StreamingExecutor` 工具批处理器 + `conversation.Manager` 消息历史。
2. LLM 抽象层（`internal/llm`）：`Client` 接口统一 anthropic / openai / openai-compat 三种协议，统一为一套 `StreamEvent` 流式事件模型。
3. 上下文管理：Layer 1 工具结果预算（`internal/tool_result`）+ Layer 2 LLM 摘要压缩（`internal/compact`），配合 `internal/session` 的 JSONL 持久化。
4. 安全层：五层权限决策（`internal/permissions`）、OS 级沙箱（`internal/sandbox`，seatbelt/bwrap）、事件钩子（`internal/hooks`）。
5. 工具系统（`internal/tools`）：ReadFile/WriteFile/EditFile/Bash/Glob/Grep 内置工具 + MCP 外部工具（`internal/mcp`）+ 技能（`internal/skills`）。
6. 多智能体：子代理（`internal/subagent`）、团队（`internal/teams`）、git worktree 隔离（`internal/worktree`）。
7. 交互层：bubbletea TUI（`internal/tui`）、`-p` 非交互模式、基于自研 `swifty_http` 的 `--remote` WebSocket 服务（`internal/remote`）。

核心设计原则：

- 事件驱动解耦：Agent Loop 通过 `chan AgentEvent` 与 TUI 通信，执行与渲染完全分离
- 协议无关 LLM 抽象：单一 `Client` 接口适配 Anthropic / OpenAI / OpenAI-Compatible 三种协议
- 插件化扩展：Skills (Markdown SOP)、Hooks (生命周期事件)、MCP Servers、Agent Definitions 四种扩展机制

依赖上，仅引入 anthropic-sdk-go、openai-go、MCP go-sdk、charmbracelet 系（TUI）等少量库，Agent 循环、权限、压缩、记忆等核心逻辑全部自研。

---

### Q2: 程序入口有哪几种运行模式？各自如何工作？

A:

`cmd/swiftx/main.go:35` 按 flag 分发四种模式：

1. Teammate 工作进程（`--teammate`）：被团队 Lead 通过 tmux/iTerm 拉起的无头工作进程，任务从文件邮箱读取，事件流打到 stderr 供终端面板展示（`cmd/swiftx/teammate.go`）。
2. Print 模式（`-p/--print`）：非交互一次性执行，prompt 可来自参数或 stdin，支持指定输出格式，适合脚本/CI。
3. Remote 模式（`--remote [addr]`）：默认 `:18888`，用同仓库的 `swifty_http` 框架起 HTTP 服务，`GET /` 提供 Web UI、`GET /ws` 升级 WebSocket 双向转发 Agent 事件（`internal/remote/server.go:154`）。
4. 默认 TUI 模式：`tea.NewProgram` 启动 bubbletea 终端界面。

四种模式共享同一套 `config.LoadConfig` 配置（providers、permission_mode、mcp_servers、hooks、sandbox、enable_coordinator_mode），hooks 配置启动时统一 `hooks.Validate` 校验，非法则降级为无钩子启动而不是崩溃。

---

### Q3: Agent Loop 的核心循环是如何设计的？为什么选择这种模式？

A:

Agent Loop 采用 goroutine + buffered channel 的事件驱动模式：

```go
func (a *Agent) Run(ctx context.Context, conv *conversation.Manager) <-chan AgentEvent {
    ch := make(chan AgentEvent, 32)
    go func() {
        defer close(ch)
        for iteration := 1; ; iteration++ {
            // 1. 终止检查 (MaxIterations / ctx.Done)
            // 2. 计算工具 Schema (尊重 ToolNameFilter)
            // 3. 注入各类 system-reminder：Plan 模式工作流提醒、通知、延迟工具清单
            // 4. L1: tool_result.Apply() — 裁剪超大工具结果
            // 5. L2: compact.ManageContext() — 接近上下文限制时 LLM 摘要
            // 6. Client.Stream() → 流式获取 LLM 响应
            // 7. 处理流事件 (text / thinking / tool_call)
            // 8. 错误恢复 (rate-limit / context-too-long / max_tokens)
            // 9. 无 tool_call → LoopComplete, return
            // 10. StreamingExecutor 批量执行工具
            // 11. 结果追加到 conversation, 注入 memory recall
        }
    }()
    return ch
}
```

`Agent.Run`（`internal/agent/agent.go:182`）返回一个带 32 缓冲的 `<-chan AgentEvent`，在独立 goroutine 中跑 for 循环。值得强调的两个细节：长期记忆通过 `MemoryRecallCh` 与首次 LLM 调用并行预取，在工具执行完成后非阻塞注入且只消费一次（agent.go:444-454）；权限 Ask 决策通过 `PermissionRequestEvent{ResponseCh}` 把一个应答 channel 递给 UI，实现 HITL 阻塞等待（agent.go:585-591）。

设计选择的原因：

1. 背压控制：buffered channel (cap=32) 允许 Agent 在 TUI 渲染慢时继续推进，避免死锁
2. 可取消性：`context.Context` 贯穿所有 IO 操作，支持优雅中断
3. 可观测性：所有状态变化通过类型化事件 (`StreamText`, `ToolUseEvent`, `CompactEvent` 等) 暴露
4. 可组合性：子 Agent 复用同一个 `Run()` 逻辑，仅通过 `ToolNameFilter` 和 `Registry` 差异化

---

### Q4: 为什么 Agent 和 TUI 之间用 channel 而不是回调/observer 模式？

A:

| 维度     | Channel                           | Callback/Observer |
| -------- | --------------------------------- | ----------------- |
| 背压     | 天然支持 (buffered)               | 需手动实现队列    |
| 取消     | `select` + `ctx.Done()` 一行      | 需额外标志位      |
| 多消费者 | `fan-out` 即可                    | 需维护监听器列表  |
| 类型安全 | sealed interface (`agentEvent()`) | 同                |
| 调试     | 可拦截/日志/重放                  | 分散在各回调中    |
| 并发安全 | channel 本身保证                  | 需 mutex          |

关键实现细节：

- 主 `AgentEvent` 通道（cap=32）上的所有事件均为阻塞发送，缓冲用于吸收 UI 渲染抖动；`PermissionRequestEvent` 携带应答 channel 阻塞等待用户决策（保证语义正确性）
- 非阻塞丢弃模式用在子 Agent 进度通道上：`subagent.emitProgress()`（agent_tool.go:507）用 `select + default` 发送 `SubAgentProgress`，消费者慢时丢弃进度事件——阻塞发送曾导致 ProgressCh 缓冲填满时子 Agent 循环死锁

---

## 二、LLM 集成与流式处理

### Q5: 如何设计一个支持多 Provider 的 LLM 抽象层？

A:

```go
type Client interface {
    Stream(ctx context.Context, conv *conversation.Manager, tools []map[string]any) (<-chan StreamEvent, <-chan error)
    SetSystemPrompt(prompt string)
}
```

三种实现：

- Anthropic (`anthropic-sdk-go`)：Messages API + Extended Thinking + Prompt Cache
- OpenAI (`openai-go`)：Responses API + Reasoning Summary
- OpenAI-Compatible：Chat Completions API（适配 DeepSeek 等第三方）

关键设计决策：

1. Stream 返回双 channel `(<-chan StreamEvent, <-chan error)`：
   - 事件和错误分离，避免在事件 channel 中混入 error 类型
   - error channel 在流正常结束时关闭，非 nil 错误触发重试逻辑

2. 协议适配在 Client 内部完成：
   - Anthropic: `input_json_delta` → `ToolCallDelta`
   - OpenAI: `function_call.arguments` delta → `ToolCallDelta`
   - 上层 Agent 只处理统一的 `StreamEvent` 接口
   - 差异被压到两个边界上：输入侧，`Registry.GetAllSchemas(protocol)` 把 Anthropic 风格的 `input_schema` 转成 OpenAI 的 `{type:function, parameters}`（`internal/tools/tool.go:124`）；输出侧，各实现把私有 SSE 事件归一成 7 种 `StreamEvent`（TextDelta、ThinkingDelta、ThinkingComplete、ToolCallStart/Delta/Complete、StreamEnd）

3. 可选能力用小接口探测：`MaxTokensSetter`（动态调 max_tokens）、`contextWindowFetcher`（仅 Anthropic 实现，拉取模型窗口），体现了 Go 的"隐式小接口 + 类型断言探测可选能力"惯用法，新增 Provider 只需实现 Stream，Agent 循环零改动。

4. Model Resolver 模式：
   ```go
   type ModelResolver func(alias string) (llm.Client, error)
   // "haiku" → claude-haiku-4-5, "sonnet" → claude-sonnet-4-6
   ```
   子 Agent 可以指定不同模型，通过 resolver 延迟创建 Client 实例

---

### Q6: SSE 流式读取中的 idle timeout 机制是如何实现的？解决了什么问题？

A:

问题：HTTP/2 连接可能静默断开（NAT 超时、代理断连），`stream.Next()` 会永久阻塞。

解决方案：goroutine-per-read + idle timer

```go
nextCh := make(chan sseResult, 1)
readNext := func() { nextCh <- sseResult{hasNext: stream.Next()} }
idle := time.NewTimer(5 * time.Minute)

go readNext()
for {
    select {
    case <-ctx.Done():
        return // 用户取消
    case <-idle.C:
        return // 5 分钟无数据 → 判定连接死亡
    case res := <-nextCh:
        if !res.hasNext { return } // 流正常结束
        // 处理事件...
    }
    idle.Reset(5 * time.Minute)
    go readNext() // 启动下一次读取
}
```

设计要点：

- 每次 `stream.Next()` 在独立 goroutine 中执行，主 goroutine 始终可被 timer/ctx 唤醒
- `nextCh` 容量为 1：即使主 goroutine 已退出，读取 goroutine 也不会泄漏（写入后立即退出）
- 5 分钟是经验值：覆盖 LLM 长时间思考（thinking）场景，同时不至于让用户等太久
- 计时器重置用了标准的 `if !t.Stop() { drain }` 防泄漏写法
- 兼容性细节：某些 OpenAI 兼容网关（如 MiniMax）把 InputTokens/缓存字段放在 message_delta 里，而 SDK 的 `Accumulate` 只拷贝 OutputTokens，所以手动补丁回填（anthropic.go:243-255）

---

### Q7: Prompt Cache 优化策略是什么？如何保证缓存命中率？

A:

Anthropic Prompt Cache 要求前缀字节完全一致才能命中。Swiftx 的策略：

三个 Cache Breakpoint（`internal/llm/anthropic.go:160-190`）：

1. System Prompt 末尾 — 跨 turn 稳定（最长期稳定的前缀）
2. Tool Schema 列表最后一个 — 跨 turn 稳定
3. 最后一条 User Message 的最后一个 content block — tail anchor（`markLastUserTailForCache`，anthropic.go:342）

保证字节稳定性的关键机制 — spill preview 的确定性生成：

- Layer 1 预算裁剪时，对超过阈值的 tool_result 做 spill（存磁盘，留 preview）
- preview 由 `buildSpillPreview` 一次性生成：相同输入必然产出字节完全一致的输出（`internal/tool_result/budget.go:139-156`），且替换文本一旦写入 conversation 历史就绝不再被改写——历史消息不可变，格式变更只影响新产生的结果
- 因为 preview 在进入历史的那一刻就是最终形态，后续每轮请求中该前缀逐字节相同，天然命中 prompt cache；不存在"重新计算 preview 导致字节漂移"的问题

Fork 子 Agent 的缓存复用：

- Fork 继承父 Agent 的完整 conversation + tool pool
- 因为 tool schema 列表相同（`cloneRegistryForFork` 逐字复制注册表，只把 Agent 工具的 QuerySource 换成 fork 标记），system prompt 相同，conversation 前缀相同 → 首次请求即可命中父 Agent 已建立的缓存
- 共享历史的父子双方看到的请求前缀字节一致，缓存前缀在两边都命中，无需传递任何替换决策

---

## 三、上下文窗口管理

### Q8: 两层上下文管理机制的设计思路和触发条件是什么？

A:

- Layer 1（工具结果预算）：结果进入历史的那一刻执行，细粒度、无 LLM 参与。把超预算的工具结果外溢到 `.swiftx/sessions/<session-id>/tool-results/` 并替换为带 2KB 预览的存根；进历史即最终形态，保证缓存前缀稳定。解决"单个工具结果撑爆上下文"。
- Layer 2（`compact.ManageContext`）：按 token 阈值触发，调用 LLM 把旧前缀总结为结构化摘要，最近尾部原样保留，压缩后附加恢复块。解决"长会话累计增长"。

两层解耦的原因写在注释里（compact.go:27）：Layer 1 在结果进入历史时就地处理，消息一旦进历史就是最终形态；Layer 2 是对话级的整体重写，看到的消息尺寸已是最终尺寸。此外还有兜底路径：真实请求返回 `ContextTooLongError` 时直接 `ForceCompact`。

Layer 1 细节：

- 单条 tool_result > 50K chars（`tools.MaxOutputChars`）→ spill 到 `.swiftx/sessions/<session-id>/tool-results/{tool_use_id}.txt`，conversation 中只留 2K preview
- 单条 message 聚合 > 200K chars → 从最大的 result 开始 spill
- 回读防环：ReadFile 读回 spill 文件的结果不再二次 spill（防止"存根的存根"链）

Layer 2 细节：

- Token 估算：Usage Anchor 机制（首次 API 调用后记录真实 token 数，后续增量估算）
- 保留策略：最近 10K tokens / 5 条消息（取大），上限 40K
- 摘要请求本身也可能超长 → PTL Retry（逐步丢弃最旧的 API-round 组，最多 3 次）
- 熔断器：连续 3 次 compact 失败后停止尝试（避免无限循环）

---

### Q9: Layer 1 工具结果预算的两趟算法是什么？

A:

`internal/tool_result/budget.go` 实现了两趟预算控制：

- Pass 1（单条限制）：单个 tool_result 超过 `tools.MaxOutputChars = 50000` 字符即外溢到 `.swiftx/sessions/<session-id>/tool-results/<tool_use_id>.txt`，替换为 `<persisted-output>` 存根（含大小、路径、前 2000 字符预览）。该阈值刻意设得较大，让模型一次能看到足够内容，避免频繁回读。
- Pass 2（消息聚合限制）：同一条消息内所有 tool_result 总量超过 `MessageAggregateLimit = 200000` 时，按内容长度降序依次外溢，直到总量达标。

三个防御细节：

1. 回读环路防护 `IsSpillReadback`——模型 ReadFile 读回外溢文件时不再外溢，否则会产生"存根的存根"链
2. 外溢失败时保留原文，不中断整轮
3. 写文件用 `O_CREATE|O_EXCL`，已存在直接复用，天然幂等（budget.go:166）

---

### Q10: Layer 2 压缩何时触发？保留什么？

A:

阈值公式（compact.go:90）：

- `effectiveWindow = contextWindow - min(maxOutput, 20000)`
- 软触发线：`effectiveWindow - 13000`（自动压缩，受熔断器保护）
- 硬阻断线：`effectiveWindow - 3000`（强制压缩，绕过熔断器）

保留策略 `computeKeepStartIndex`（compact.go:392）：

从尾部向前累计 token，满足"≥ 10000 token 或 ≥ 5 条消息"其一即停，但上限 40000 token；边界若落在带 tool_results 的消息上，向前吸附跨过配对的 assistant tool_use 消息，绝不拆散 tool_use/tool_result 对（否则 API 直接拒绝孤儿 tool_result）。

摘要格式：

前缀交给 LLM 生成九段式结构化摘要（用户意图、技术概念、文件与代码、错误与修复、全部用户消息、待办、当前工作、下一步等），采用 `<analysis>` 草稿 + `<summary>` 两段输出，仅保留 summary 段。

---

### Q11: Token 估算的 Usage Anchor 机制是如何工作的？为什么不直接用 tokenizer？

A:

真实用量锚点 + 增量估算（compact.go:217-248）：

```go
type UsageAnchor struct {
    BaselineTokens int  // 上次 API 返回的真实 input_tokens
    AnchorCount    int  // 当时 conversation 的消息数
}

func ComputeUsedTokens(conv, anchor) int {
    if anchor.hasUsage {
        // 增量估算：真实基线 + 新增消息的粗略估算
        return anchor.BaselineTokens + EstimateTokens(conv.Messages()[anchor.AnchorCount:])
    }
    // 冷启动：全量粗略估算 (3.5 chars/token)
    return EstimateTokens(conv.Messages())
}
```

每轮 API 返回后 `RecordUsageAnchor` 记录 `baseline = input + cache_read + cache_creation + output`（Anthropic 的 cache 命中不计入 input_tokens，必须四项相加才是真实 prompt 大小）和当时的消息数 `anchorCount`。压缩后锚点失效必须 `ClearUsageAnchor`，且带防御性 clamp（anchorCount 越界则回退全量估算）。

这个方案的好处是：越接近阈值（决策越关键）时，估算里真实值的占比越大，误差只来自最近一小段增量。

不用 tokenizer 的原因：

1. 性能：Go 没有高效的 Claude/GPT tokenizer 库，tiktoken 是 Python 的
2. 精度 vs 成本：只需要判断"是否接近上限"，不需要精确值；3.5 chars/token 在英文代码场景误差 <15%
3. 自校正：每次 API 调用后 anchor 更新为真实值，误差不会累积
4. 多 Provider：不同模型 tokenizer 不同，统一用 chars 估算更简单

---

### Q12: 压缩请求本身超出上下文怎么办？（PTL 重试机制）

A:

PTL（prompt-too-long）重试（compact.go:586-642）：

捕获 `ContextTooLongError` 后，`groupMessagesByAPIRound` 按 API 轮次边界分组（每个组内 tool_use/tool_result 完整配对），从最老的组开始丢弃，目标丢掉约 1/5 的估算 token，最多重试 `maxPTLRetries = 3` 次。

丢弃后如首条不是 user 角色，插入 `[earlier conversation truncated...]` 标记消息保证请求以 user 开头。按轮次分组丢弃而不是按消息丢弃，同样是为了不产生孤儿 tool_result。

---

### Q13: 压缩后如何恢复工作状态？如何支持会话恢复？

A:

两个机制：

1. 内存内恢复块：`RecoveryState` 并发安全地记录最近的文件读取快照（每次 ReadFile 成功后重读磁盘存一份，agent.go:654-660）和已激活技能 SOP；压缩后 `BuildRecoveryAttachment` 把这些快照 + 当前工具清单拼在摘要消息后面，模型不用重新 Read 一遍刚看过的文件。

2. 磁盘断点：`session.SaveCompactBoundary` 向会话 JSONL 追加一条 `type=compact_boundary` 记录，Content 是 `{summary, keep[]}` JSON（`internal/session/session.go:163`）。恢复时 `FindLastCompactBoundary` 找最后一个断点（session.go:181），重建为"摘要消息 + 保留尾部 + 断点后的普通消息"，避免重放全量历史；断点损坏时回退全量重放，旧会话无断点也天然兼容。

摘要消息里还附上完整会话日志路径，模型需要压缩前细节时可以自己 ReadFile 翻旧账。

---

## 四、工具系统与执行引擎

### Q14: Tool 接口如何设计？为什么需要延迟加载工具？

A:

核心接口 5 个方法：`Name/Description/Category/Schema/Execute`（`internal/tools/tool.go:53`），`Category` 返回 read/write/command 三类，同时服务于并发批处理和权限矩阵。一个可选小接口：

- `DeferrableTool.ShouldDefer()`：延迟工具不进默认 schema 列表，只在 system-reminder 里列名字，模型需要时用 `ToolSearch` 按 `select:<name>` 加载 schema（agent.go:250-253）。仅 MCP 工具实现该接口（`MCPToolWrapper.ShouldDefer() = true`），内置工具集固定可控，隐藏它们只会迫使模型多走一趟 ToolSearch，故永不延迟。

延迟加载解决的问题：

MCP Server 可能注册数十个工具，每个工具的 JSON Schema 占 200-500 tokens。全部注入 prompt 会：

1. 浪费上下文窗口（10 个 MCP Server x 5 个工具 x 300 tokens = 15K tokens）
2. 增加首次响应延迟（更多 input tokens）
3. 降低模型选择正确工具的准确率（选项过多）
4. 破坏缓存前缀稳定性

ToolSearch 的两种模式：

- `select:Name1,Name2` — 精确加载（LLM 已知工具名）
- 关键词搜索 — 模糊匹配 description（LLM 描述需求）

---

### Q15: 工具的安全分级执行（Safety-Based Batching）是如何实现的？

A:

```go
func partitionToolCalls(calls []ToolCall) []toolBatch {
    // 连续 read-only 工具 → 一个并发 batch
    // write/command 工具 → 各自独立的串行 batch
}

// 执行：
for _, batch := range batches {
    if batch.concurrent {
        var wg sync.WaitGroup
        for _, call := range batch.calls {
            wg.Add(1)
            go func(c ToolCall) {
                defer wg.Done()
                result := executeSingleTool(ctx, c)
                mu.Lock()
                results[c.index] = result
                mu.Unlock()
            }(call)
        }
        wg.Wait()
    } else {
        results[batch.calls[0].index] = executeSingleTool(ctx, batch.calls[0])
    }
}
```

`StreamingExecutor.ExecuteAll`（`internal/agent/streaming_executor.go:78`）按安全类别分批：`partitionToolCalls` 把相邻的只读工具（`Category() == CategoryRead`）合并成一个并发批次，用 WaitGroup 并行执行；写/命令类工具各自独占串行批次。

设计考量：

- Read 工具并发安全：Glob、Grep、ReadFile 无副作用，可安全并行
- Write 工具必须串行：Edit A.js 和 Edit B.js 可能通过 import 关系相互影响；LLM 的意图是按序执行
- Index 追踪：结果按原始提交顺序放回，保证 conversation 中 tool_result 顺序与 tool_use 对应
- 流式提交：工具在 LLM 还在输出时就开始提交（`StreamingExecutor`），不必等所有 tool_call 解析完

这是一个典型的"读并发、写串行"策略：读操作天然幂等可并行提速，写和命令有副作用必须保序，且实现上只用一个 mutex + index 回填，避免了复杂的依赖图分析。

---

### Q16: FileStateCache 的 "Read-before-Edit" 机制是如何工作的？

A:

```go
type FileStateCache struct {
    mu      sync.Mutex
    entries map[string]int64 // path → mtime (UnixMilli)，仅比较修改时间，无内容 hash
}

// ReadFile 执行后：
cache.Record(path, modTime)

// EditFile/WriteFile 执行前：
if ok, errMsg := cache.Check(path); !ok {
    return ToolResult{Output: errMsg, IsError: true}
}

// EditFile 执行后：
cache.Update(path) // 内部 stat 取新 mtime，无需外部传入
```

`FileStateCache`（`internal/tools/file_state_cache.go`）以绝对路径为 key 记录每次成功 Read 的 mtime（UnixMilli），Edit/Write 前 `Check(path) (bool, string)`：

- 从未读过 → 拒绝："先读再改"
- 磁盘 mtime 比缓存新（被外部修改）→ 拒绝："文件已变化，请重新读取"
- 文件已被删除时 stat 失败 → 放行，交给调用方处理

ReadFile/WriteFile/EditFile 共享同一个 cache 实例（`CreateDefaultToolsWithWorkDir`，tool.go:228），写成功后 `Update` 自行 stat 刷新 mtime。互斥锁保护 map，因为只读批次里多个 Read 可能并发。

解决的问题：

1. 防止盲写：LLM 可能基于幻觉编辑文件，强制先读确保 LLM 看到了真实内容
2. 检测外部修改：用户在 IDE 中修改了文件 → mtime 变化 → 拒绝编辑 → LLM 重新读取
3. Prompt Cache 友好：确保 conversation 中的文件内容是最新的，减少基于过时信息的错误编辑

这是对 LLM "凭记忆改文件" 幻觉的工程级防御。

---

### Q17: Bash 工具为什么不把非零退出码一律当错误？

A:

`interpretExitCode`（`internal/tools/bash.go:50`）内置常见命令的退出码语义表：

- grep/rg 的 1 表示"无匹配"
- diff 的 1 表示"文件有差异"
- find 的 1 表示"部分目录不可访问"
- test 的 1 表示"条件为假"

这些都不是错误，阈值 ≥2 才算真错。管道命令取最后一段的 base 命令判断（bash 默认行为）。最终 `IsError` 只在超时/中断时为 true，普通非零退出码把 `Exit code N (语义提示)` 拼进输出让模型自己判断。

这避免了模型把 "grep 没搜到" 误读为工具故障而反复重试。

其余要点：

- 默认 120s、上限 600s 超时（context.WithTimeout）
- stdout/stderr 合并为单流
- 沙箱可用时命令先经 `Sandbox.Wrap` 包装

---

### Q18: 流式工具提交（Streaming Tool Execution）的实现原理？

A:

传统方式：等 LLM 输出完所有 tool_call → 解析 → 执行。
Swifty 方式：LLM 输出过程中，每个 `ToolCallComplete` 事件立即提交给 Executor。

```go
// 在 stream 事件处理循环中：
case ToolCallComplete:
    executor.Submit(event.ToolCall)  // 立即提交

// 流结束后：
results := executor.ExecuteAll(ctx, agent)  // 批量执行
```

好处：

- 如果 LLM 输出了 3 个 ReadFile 调用，第 1 个解析完时就可以开始执行
- 实际上由于 LLM 输出速度 < 工具执行速度，收益有限
- 但对 Bash 命令（可能耗时数秒），提前提交可以 overlap LLM 输出时间和工具执行时间

StreamingExecutor 内部状态：

```go
type StreamingExecutor struct {
    registry *tools.Registry
    eventCh  chan AgentEvent

    mu      sync.Mutex
    calls   []toolCallInfo   // 按提交顺序
    results []toolExecResult // 按 index 放置
}
```

---

## 五、权限与安全

### Q19: 五层权限系统的架构设计及各层职责是什么？

A:

`Checker.Check`（`internal/permissions/permissions.go:515`）自上而下短路：

```
请求 → Layer 0: Plan Mode 例外
     → Layer 1: 安全命令白名单 (auto-allow)
     → Layer 2: 危险命令黑名单 (auto-deny)
     → Layer 2b: OS 沙箱 (auto-allow if sandboxed)
     → Layer 3: 路径沙箱 (project root + temp)
     → Layer 4: YAML 规则引擎 (glob matching)
     → Layer 4b: Permission Mode 矩阵
     → Layer 5: ASK (Human-in-the-Loop)
```

各层详解：

| 层  | 机制                                                                                                                                                    | 示例                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| L0  | Plan 模式下允许写 plan file                                                                                                                             | `Write(.swiftx/plans/<slug>.md)`                                                                                  |
| L1  | 64 个安全命令前缀白名单（且不含重定向、管道、`;`、`&&`、`$()`、反引号等逃逸符）                                                                         | `git status`, `ls`, `cat`, `go version`                                                                           |
| L2  | 正则黑名单（不可绕过，注释明确"黑名单是硬防线，沙箱开着也要查"）                                                                                        | `rm -rf /`, `mkfs`, fork bomb, `curl\|sh`, `git push --force`, `git reset --hard`                                 |
| L2b | macOS seatbelt / Linux bwrap 内 → 跳过确认（但显式 deny/ask 规则仍生效，复合命令拆分逐段检查）                                                          | 沙箱限制了实际破坏范围                                                                                            |
| L3  | 文件操作限制在项目根 + /tmp，且 `.swiftx/config.yaml`、`permissions.local.yaml`、`.swiftx/skills` 是 denyWrite 保护路径，任何权限模式下都拒写           | 拒绝写 `~/.ssh/authorized_keys`，防止 Agent 改写自己的权限配置实现提权                                            |
| L4  | user/project/local 三个 YAML 合并为一个规则集求值，匹配规则中取最严效果：deny > ask > allow，单层 allow 无法覆盖另一层的 deny，`ToolName(pattern)` 语法 | 自研 glob 里 `*` 匹配含 `/` 的任意字符（标准 filepath.Match 的 `*` 不跨 `/`，会让带路径的命令 allow-always 失效） |
| L4b | Permission Mode 矩阵                                                                                                                                    | default 读放行写/命令询问；acceptEdits 写也放行；bypass 全放行                                                    |
| L5  | 兜底 Ask → HITL 弹窗                                                                                                                                    | 用户选"总是允许"时调用 `AppendLocalRule` 把规则持久化写入 local 规则文件，下一轮求值即生效（agent.go:617-630）    |

防绕过设计：

- `splitCompoundCommand()` 拆分 `&&`, `||`, `;`, `|`，每段独立检查
- 例：`ls && rm -rf /` → `ls` (allow) + `rm -rf /` (deny) → 整体 deny

---

### Q20: OS 级沙箱（macOS seatbelt / Linux bubblewrap）是如何集成的？

A:

```go
type Sandbox interface {
    Wrap(command string, config Config) string  // 返回包装后的命令
    Available() bool
}
```

macOS (seatbelt)（`internal/sandbox/sandbox_darwin.go`）：

动态生成 profile：

```scheme
(version 1)
(deny default)                          ; 默认拒绝所有
(allow process-exec)                    ; 允许执行
(allow file-read*)                      ; 允许读
(allow file-write* (subpath "/project")) ; 只允许写项目目录
(allow file-write* (subpath "/tmp"))    ; 允许写 tmp
(deny file-write* (subpath "/project/.swiftx/config.yaml")) ; 保护配置
(deny network*)                         ; 可选：禁止网络
```

- 按 AllowWrite 逐路径放行写 → 按 DenyWrite 逐路径拒写（seatbelt 后写规则优先，文件用 literal、目录用 subpath）
- 使用硬编码路径 `/usr/bin/sandbox-exec` 防止 PATH 注入

Linux (bubblewrap)（`internal/sandbox/sandbox_linux.go`）：

```bash
bwrap --unshare-user --unshare-pid \
  --ro-bind / / \                       # 只读根
  --bind /project /project \            # 项目可写
  --bind /tmp /tmp \                    # tmp 可写
  --unshare-net \                       # 网络隔离
  -- /bin/bash -c "original_command"
```

AllowWrite 路径 `--bind` 可写，DenyWrite `--ro-bind` 覆盖回只读，挂 `/proc`。

其他平台返回不可用实现，`Available()` 为 false 时命令原样执行、退回权限询问路径。

与权限系统的协作：

- 沙箱管"进程能碰什么"，权限层管"要不要问人"，黑名单则独立于两者始终生效
- 沙箱启用时，Layer 2b 自动放行大部分命令（因为实际破坏力已被沙箱限制）
- 但 Layer 2 危险命令黑名单仍然生效（defense in depth）
- 用户显式 deny 规则仍然生效

---

### Q21: Hook 系统的条件引擎是如何设计的？支持哪些表达式？

A:

```yaml
hooks:
  - event: pre_tool_use
    if: 'tool == "EditFile" && file_path =* "/*.go"'
    action:
      type: command
      command: "gofmt -w ${SWIFTX_FILE_PATH}"
    on_error: ignore
```

9 个事件：session_start/end、turn_start/end、pre_send、post_receive、pre_tool_use、post_tool_use、shutdown

条件表达式语法：

| 运算符 | 含义      | 示例                                                      |
| ------ | --------- | --------------------------------------------------------- |
| `==`   | 精确匹配  | `tool == "Bash"`                                          |
| `!=`   | 不等于    | `tool != "ReadFile"`                                      |
| `=~`   | 正则匹配  | `file_path =~ "\\.go$"`                                   |
| `=*`   | Glob 匹配 | `file_path =* "/*.ts"`                                    |
| `&&`   | 逻辑与    | 复合条件（与 `\|\|` 同优先级，从左到右求值）              |
| `\|\|` | 逻辑或    | 复合条件                                                  |
| `!`    | 一元取非  | `!tool == "ReadFile"`（须紧接叶子条件，不能跨运算符拆分） |

可用变量： `tool`, `event`, `file_path`, `message`, `args.*`（工具参数）

四种 Action 类型：

1. `command`：执行 shell 命令（注入 `SWIFTX_EVENT`, `SWIFTX_TOOL`, `SWIFTX_FILE_PATH` 环境变量）
2. `prompt`：向 conversation 注入一条 system-reminder 消息
3. `http`：发送 webhook（10s 超时）
4. `agent`：调用一个 LLM one-shot agent 做判断

执行模式：

- 同步（默认）：阻塞工具执行直到 hook 完成，默认超时 10 分钟
- `async: true`：fire-and-forget
- `once: true`：session 内只触发一次（通过 `fired` map 去重）
- `reject: true`：hook 失败/返回非零 → 拒绝工具执行
- `on_error`（fail/ignore/reject）三种失败策略

配置在启动时集中 `Validate`，用 `errors.Join` 聚合全部问题一次性报出。钩子失败不阻塞主循环，结果进通知队列在下一轮作为 system-reminder 排出（agent.go:231-235）。

---

## 六、记忆体系与会话持久化

### Q22: 长期记忆如何组织、提取与召回？

A:

`internal/memory` 实现了完整的长期记忆体系：

组织：

双目录——用户级 `~/.swiftx/memory/`（user/feedback 类型）与项目级 `<root>/.swiftx/memory/`（project/reference 类型），入口文件 `MEMORY.md`，每条记忆是带 frontmatter（描述、类型）的 markdown 文件。四种类型见 `memory_types.go:31`。

提取：

主循环 `LoopComplete` 后 `OnLoopComplete` 回调在后台 goroutine 里触发 extractor，用 LLM 从对话中提炼值得保存的记忆，失败静默、不阻塞主流程（agent.go:94-98）。

召回（两条路）：

1. 启动时 `InjectLongTermMemory` 把指令（SWIFTX.md）+ 记忆内容以 system-reminder 形式一次性前插到对话头部（conversation.go:127）
2. 会话中 `FindRelevantMemories` 用 LLM 按 query 从记忆清单里挑相关项，通过 `MemoryRecallCh` 与首次主 LLM 调用并行预取、工具执行后注入

保鲜：

`MemoryAge/MemoryFreshnessNote` 给记忆标注年龄，prompt 内置 drift 警示——"记忆可能过期，回答前先核对当前文件状态，冲突时相信现场并更新记忆"。

---

### Q23: 后台整合进程如何用文件锁防止并发？

A:

记忆整合（consolidation）可能被多个 Swiftx 进程同时触发，用 PID 文件锁互斥（`internal/memory/consolidation/lock.go:62`）：

1. stat 锁文件拿 mtime，读内容拿持有者 PID
2. 锁存在、mtime 在 1 小时内（`holderStaleMs`）、且 PID 进程仍存活（unix 用 `kill(pid, 0)` 探测，Windows 有独立实现）→ 放弃
3. 否则写入自己的 PID，读回校验——若读回不是自己的 PID 说明竞态输了，放弃
4. 成功时返回原 mtime 供失败回滚（`RollbackLock`），锁文件 mtime 兼作"上次整合完成时间"，一次 stat 就能查（`ReadLastConsolidatedAt`）

1 小时过期 + 存活探测的组合同时防了两个问题：进程崩溃锁泄漏（过期回收）与 PID 复用误判（即使 PID 活着，超 1 小时也视为过期）。这是无守护进程场景下典型的"穷人版分布式锁"。

teams 的文件邮箱用的是另一套：`O_CREATE|O_EXCL` 原子创建 + 指数退避（5ms 起步、上限 maxLockBackoff=80ms）+ 随机 jitter + 总时限 lockAcquireTimeout=5s，超龄 10 秒（staleLockAge）的锁文件视为崩溃残留直接抢占；超时返回错误而非静默丢消息（file_mailbox.go:33-43,139-163）。

---

### Q24: Session 持久化为什么选择 JSONL 格式？Compact Boundary 的作用是什么？

A:

JSONL 的优势：

追加式 JSONL（`internal/session/session.go`）：每条消息一行 `{role, type, tool_use_id, content, ts}`，存于 `.swiftx/sessions/<id>.jsonl`；ID 格式为 `时间戳-4位随机hex`，crypto/rand 失败时退化到纳秒时间戳低 16 位。

1. Append-only：每次写一行，无需读取/重写整个文件（O(1) 写入）
2. 崩溃安全：最多丢失最后一行（未 flush 的），不会损坏整个文件
3. 增量解析：resume 时可以从任意行开始读取
4. 可 grep：`grep "tool_use" session.jsonl` 快速定位
5. 历史永不被改写：压缩也只是追加断点记录，旧消息仍留在文件里可供模型 ReadFile 查阅

Compact Boundary 的作用：

```jsonl
{"role":"user","content":"fix the bug","ts":1700000001}
{"role":"assistant","content":"I'll look into...","ts":1700000002}
... (200 条消息)
{"type":"compact_boundary","summary":"User asked to fix auth bug. We identified...","keep":[...最近5条...]}
{"role":"user","content":"now add tests","ts":1700000500}
...
```

- Resume 优化：不需要重放全部 200 条消息，从最后一个 boundary 恢复即可
- 语义连续：summary 保留了关键上下文（做了什么、为什么、当前状态）
- Keep 数组：最近的消息原文保留（避免摘要丢失细节）

恢复流程：

读全部记录 → `FindLastCompactBoundary` 定位最后压缩断点 → 有断点则按"摘要 + keep 尾部 + 断点后消息"重建（避免重放巨量旧历史），无断点或断点 JSON 损坏则全量重放。

---

### Q25: 模型上下文窗口大小是如何确定的？

A:

三层解析，优先级从高到低：

1. 显式配置：`ProviderConfig.ContextWindow`（YAML `context_window`）直接生效
2. API 拉取：`ResolveContextWindow`（client.go:70）仅对 anthropic 协议，启动时调 `/v1/models/{model}` 取 `max_input_tokens`，一次拉取缓存在 cfg 上。全程 best-effort：禁用 SDK 重试、带超时、`recover()` 兜底 panic，任何失败都静默落到下一层（anthropic.go:104-123）
3. 内置映射表/默认值：按模型名子串匹配（`1m`/`gpt-4.1` 族 1M，`gpt-4o`/`gpt-4-turbo` 128K，`o1/o3/o4` 与 `claude` 200K，config.go:78-86），都未命中时保守兜底：claude 系 200000、其余 128000（config.go:118-132）

设计要点是"启动路径上的网络调用永远不能阻塞或搞挂进程"。

---

## 七、并发与状态管理

### Q26: 项目中使用了哪些并发模式？如何避免数据竞争？

A:

| 模式                  | 使用场景                             | 同步机制                                                                         |
| --------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Goroutine + Channel   | Agent Loop → TUI 事件流              | buffered chan (cap=32)                                                           |
| Goroutine + WaitGroup | 并发执行 read-only 工具              | `sync.WaitGroup` + `sync.Mutex`                                                  |
| Goroutine-per-read    | SSE 流读取 + idle timeout            | chan (cap=1)                                                                     |
| Non-blocking send     | 进度事件 (可丢弃)                    | `select` + `default`                                                             |
| Background goroutine  | 异步子 Agent / Memory extraction     | `TaskManager` + notification chan                                                |
| File locking          | Memory consolidation                 | PID 锁文件（写入-读回校验 + 1h 过期 + kill(pid,0) 存活探测），非 flock           |
| 并行预取              | 记忆召回与主 LLM 调用并行            | channel 非阻塞 select 消费一次后置 nil（nil channel 永远阻塞，天然表达"已消费"） |
| fire-and-forget       | 记忆提取 `go a.OnLoopComplete(conv)` | 失败静默                                                                         |
| 文件级互斥（两套）    | consolidation / mailbox              | PID+过期+读回校验 / O_EXCL+指数退避+jitter+超龄抢占，按场景选型                  |

避免数据竞争的关键设计：

1. StreamingExecutor 的 index 模式：

   ```go
   results := make([]toolExecResult, len(calls)) // 预分配
   // 每个 goroutine 只写自己的 index：
   results[entry.index] = execute(...)
   // 写入仍加 mutex：goroutine 之间通过 se.mu 串行化结果回填
   ```

2. RecoveryState 的 mutex 保护：
   - 多个并发工具 goroutine 可能同时记录文件快照
   - `mu.Lock()` 保护 `fileSnapshots` map

3. Conversation Manager 非并发安全（by design）：
   - 只在 Agent Loop goroutine 中修改
   - TUI 通过事件 channel 获取只读快照
   - 避免了对 conversation 加锁的性能开销

4. 互斥锁保护共享 map：FileStateCache、Team.Members、RecoveryState 等均为细粒度 mutex，无全局锁。

---

### Q27: 项目中有哪些关键的性能优化手段？

A:

| 优化                        | 位置                        | 效果                                        |
| --------------------------- | --------------------------- | ------------------------------------------- |
| Prompt Cache (3 breakpoint) | llm/anthropic.go            | 减少 90%+ input token 计费                  |
| spill preview 字节稳定      | tool_result/                | preview 一次生成不再改写，保证 cache 命中率 |
| Deferred Tool Loading       | tools/tool_search.go        | 减少初始 prompt 3-15K tokens                |
| 并发 Read 工具执行          | agent/streaming_executor.go | 多文件读取延迟从串行 O(n) 降为 O(1)         |
| Usage Anchor 增量估算       | compact/                    | 避免每轮全量 token 计算                     |
| JSONL append-only 写入      | session/                    | O(1) 持久化，无锁竞争                       |
| 流式工具提交                | agent/streaming_executor.go | LLM 还在输出时就开始执行先完成的工具        |
| Non-blocking progress emit  | agent/                      | TUI 慢时不阻塞 Agent                        |
| FileStateCache mtime 检查   | tools/                      | O(1) stat 代替全文 hash                     |
| Glob 跳过 SkipDirs          | tools/glob.go               | 避免遍历 node_modules/.git                  |
| 记忆并行预取                | agent/agent.go              | MemoryRecallCh 与首次 LLM 调用并行          |

---

## 八、多 Agent 协作与扩展

### Q28: 子 Agent 的三种 spawn 模式（Sync/Async/Fork）的设计考量？

A:

`AgentTool`（`internal/subagent/agent_tool.go`）是单个工具多角色：

| 模式               | 触发条件                  | 上下文                               | 阻塞                         | 适用场景                                                      |
| ------------------ | ------------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| Sync（角色子代理） | `subagent_type` 指定      | 新 conversation + 按角色过滤的工具集 | 是                           | 快速查询（Explore agent），"研究后只带结论回来"，保护主上下文 |
| Async              | `run_in_background: true` | 新 conversation                      | 否                           | 耗时任务（测试、构建）                                        |
| Fork               | 无 `subagent_type`        | 复制父 conversation                  | 是（除非 run_in_background） | 需要完整上下文的分支任务                                      |

Fork 的独特设计：

- 继承父 Agent 的完整 conversation → prompt cache 复用
- 继承父 Agent 的 tool pool → schema 一致 → cache 命中
- 关键工程点是 `ParentReplacementState.Clone()`——子代理继承父的工具结果冻结决策但不回写（agent.go:87-91 注释），使父子共享的历史前缀字节一致，Prompt Cache 前缀在两边都命中
- 嵌套 Fork 防护：
  - `QuerySource = "agent:builtin:fork"` 标记检测
  - 该信号存在于 Agent 结构而非对话文本里，压缩也冲不掉
  - 防止 Fork 中再 Fork 导致指数级资源消耗

参数支持：

- `model` 覆盖（sonnet/opus/haiku，经 ModelResolver）
- `run_in_background`
- `isolation: worktree`（见 Q30）
- `team_name`（转为长驻队友）
- `mode` 权限模式覆盖——子代理复用父 Checker 的 Sandbox 与 RuleEngine，只覆盖 Mode，保证权限边界不因派生而放松

Async 的 Notification 机制：

```go
type TaskManager struct {
    tasks map[string]*Task
    mu    sync.Mutex
}
// 完成后通过 NotificationFn 注入 system-reminder：
// "<task-notification>Agent 'explore-auth' completed: ...</task-notification>"
```

---

### Q29: Teams 多 Agent 协作系统的架构？Agent 之间如何通信？

A:

```
TeamManager
  └── Team
       ├── Member (coordinator) — ToolNameFilter 限制为协调工具
       ├── Member (worker-1) — 完整工具集
       └── Member (worker-2) — 完整工具集
```

通信机制：

1. FileMailBox（基于文件的邮箱，`file_mailbox.go`）：

   ```
   ~/.swiftx/teams/{team}/inboxes/
     ├── worker-1.json       // [{from, text, timestamp, read, color, type, requestId, approve}, ...]
     └── worker-1.json.lock  // O_CREATE|O_EXCL 原子锁，>10s（staleLockAge）视为被崩溃进程遗留，强删接管
   ```

   - 邮箱目录在用户家目录 `~/.swiftx/teams/{team}/inboxes/` 而非项目目录：pane 队友是独立进程，工作目录可能被 worktree 改变，用家目录保证队友进程和 Lead 找到同一份团队配置（teams.go:55,93）
   - 每个成员一个聚合 JSON 收件箱文件（消息数组），不是每条消息一个文件；消息结构为 `FileMailMessage`：from/text/timestamp/read/color，以及结构化消息字段 type/requestId/approve（approve 用指针区分"未回复"和"明确拒绝"）
   - `SendMessageTool` 经 `withLock`（加锁 → 重读 → 追加 → 写回）投递；进程内用 `sync.Mutex` 串行化，文件锁只隔离跨进程队友。拿锁失败按指数退避（5ms 起、上限 maxLockBackoff=80ms，sleep = backoff + [0,backoff) 随机抖动防同时唤醒碰撞），总时限 lockAcquireTimeout=5s，超时返回错误而非静默丢消息
   - 成员轮询 `ReadUnread` 读未读消息，处理后 `MarkAllRead`
   - 文件邮箱的好处：跨进程天然可用、可观测（就是 JSON 文件）、无需守护进程或消息队列

2. SharedTaskStore（共享任务板，`shared_task.go`）：

   ```json
   // ~/.swiftx/teams/{team}/tasks.json
   {
     "tasks": [
       {
         "id": "1",
         "title": "...",
         "assignee": "worker-1",
         "status": "in_progress"
       }
     ]
   }
   ```

   - `TaskCreate/Get/List/Update` 工具操作
   - 进程内 `sync.Mutex` 串行化读写（`SharedTaskStore.mu`），持久化为单个 tasks.json

运行后端：

- `in-process`：goroutine（开发/测试）
- `tmux`：每个 member 一个 tmux pane（可视化调试）
- `iTerm`：每个 member 一个 iTerm tab（macOS）

后两者用 `swiftx --teammate` 拉起独立进程各占一个终端面板，进程崩溃互不影响且用户可直接观察每个队友。

Coordinator 模式：

```go
// teams/coordinator.go
var CoordinatorAllowedTools = map[string]bool{
    "Agent":           true,
    "SendMessage":     true,
    "TaskStop":        true,
    "SyntheticOutput": true,
    "TeamDelete":      true,
}

func IsCoordinatorTool(name string) bool {
    return CoordinatorAllowedTools[name]
}

// TUI/print/remote 启动路径统一：
agent.ToolNameFilter = teams.CoordinatorToolFilter(cfg.EnableCoordinatorMode)
```

`EnableCoordinatorMode` 时通过 `CoordinatorToolFilter` 把 Lead 的工具裁剪成仅协调类（Agent 派发、SendMessage、TaskStop、SyntheticOutput、TeamDelete）；划分标准不是读/写而是"是否会把大量内容灌进 Lead 的上下文"，因此 ReadFile/Glob/Grep/Bash 被排除，逼迫 Lead 委派而不是自己动手——TaskCreate 等共享任务板工具也不给 Lead，任务经 Agent prompt 传达，进度靠队友完成时的 task-notification 追踪。过滤器每轮迭代重新求值，团队建立/解散无需重启 Agent（agent.go:86-89）。

---

### Q30: 为什么用 git worktree 做并行隔离？如何实现？

A:

多个 Agent 并行改同一仓库会互相踩文件，worktree 让每个 Agent 有独立工作目录但共享对象库，磁盘开销小、合并回主干走标准 git 流程。

实现要点（`internal/worktree`）：

- 创建：`git worktree add -B worktree-<slug> <path> <base>`，大写 -B 而非 -b——目录被删后残留的孤儿分支直接复位，省掉每次创建前的 `git branch -D` 探测（create.go:64）
- 基分支解析：优先直接读 `.git` 文件（HEAD、refs、packed-refs、origin/HEAD symref）而不起 git 子进程，`IsSafeRefName` 白名单校验 ref 名防路径拼接注入（filesystem.go:42-49）
- 安全校验：slug 校验（≤64 字符、字符白名单）与 `FlattenSlug` 防目录穿越
- 配置继承：支持把 `.env` 等被 gitignore 的配置文件按规则拷贝进 worktree（`CopyWorktreeIncludeFiles`）
- 生命周期：会话级 worktree 状态持久化（EnterWorktree/ExitWorktree 工具），退出时 `HasWorktreeChanges` 检测有无实际变更，无变更自动清理，有变更要求显式 keep/remove；后台 `StartCleanupLoop` 按 cutoff 时长回收陈旧 agent worktree

---

### Q31: 技能系统如何做渐进式披露？

A:

`internal/skills` 中技能是带 YAML frontmatter 的 SKILL.md：

```yaml
# .swiftx/skills/my-skill/SKILL.md
---
name: my-skill
description: "..."
when_to_use: "..."
mode: inline # or fork
model: sonnet
fork_context: recent
---
# Skill Body (Markdown SOP)
...
```

两级懒加载：

Phase-1 只读 frontmatter 建目录（catalog），正文 `BodyLoaded=false`，`GetFull` 时才读盘——上百个技能的完整正文不会常驻上下文。

执行分两种模式：

| 维度       | Inline                       | Fork                   |
| ---------- | ---------------------------- | ---------------------- |
| 执行方式   | Body 注入当前 conversation   | 委托给子 Agent         |
| 上下文     | 共享父 Agent 全部上下文      | 可选 full/recent/none  |
| 模型       | 使用父 Agent 的模型          | 可指定不同模型         |
| 工具       | 使用父 Agent 的工具          | 可限制工具子集         |
| 适用场景   | 需要访问当前对话上下文的 SOP | 独立任务、保护主上下文 |
| 上下文污染 | 会占用主 conversation 空间   | 不影响主 conversation  |

- inline：正文经 `$ARGUMENTS` 替换后注入当前对话，且只注入一次（`activeSkills` 记录名字与正文，仅用于 /skills 列表和压缩恢复，不逐轮重复注入，agent.go:107-110）
- fork：`Render` 返回技能正文，`RunFork` 在隔离子代理中执行并把最终 assistant 文本作为字符串返回给调用方插入主聊天历史——正文始终不进主上下文，这就是注释里说的"渐进式披露"。`fork_context` 还可配置携带父上下文的程度：full（原样全量复制父消息切片，当前不做 LLM 摘要）/recent（最近 5 条）/none（默认，隔离如新会话）（skills/executor.go:89-100）

$ARGUMENTS 替换：Skill body 中的 `$ARGUMENTS` 被替换为用户调用时传入的参数。

热重载：`/skills reload` 重新扫描 `.swiftx/skills/` 目录，无需重启。

---

### Q32: MCP 如何集成？为什么 MCP 工具默认延迟加载？

A:

```go
type Manager struct {
    clients map[string]*mcp.Client  // server name → client
}

type MCPToolWrapper struct {
    serverName string
    toolDef    *mcp.Tool
    client     *Client
}

func (w *MCPToolWrapper) Name() string {
    return "mcp__" + SanitizeName(w.serverName) + "__" + SanitizeName(w.toolDef.Name)
}
```

基于官方 go-sdk，三种传输协议：

| 传输            | 配置                                                                    | 实现                                                                      |
| --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Stdio           | `command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"]` | `exec.Command` + stdin/stdout pipe，子进程 stderr 与父 tty 分离防污染终端 |
| Streamable HTTP | `url: "http://localhost:3000/mcp", transport: "streamable-http"`        | HTTP POST + SSE response（2025-03-26 规范）                               |
| SSE (legacy)    | `url: "http://localhost:3000/sse", transport: "sse"`                    | GET /sse + POST /messages                                                 |

关键设计决策：

1. 所有 MCP 工具默认 Deferred：MCP 服务器动辄暴露几十个工具，全量 schema 会挤占上下文并破坏缓存前缀稳定性，延迟到 ToolSearch 按需装载
2. 命名空间隔离：`mcp__<server>__<tool>` 防止工具名冲突，`SanitizeName` 规范化避免非法字符
3. Header 注入：`headerRoundTripper` 支持 `Authorization: Bearer ${API_TOKEN}`（env 展开）
4. Category 一律记为 command：外部副作用未知，从严
5. Stderr 丢弃：防止子进程的 OSC color query 污染 TUI 输入缓冲
6. `Manager.ConnectAll` 并发连接：全部服务器并行初始化

---

## 九、错误处理与容错

### Q33: Agent Loop 中的错误恢复策略有哪些？

A:

`handleStreamError`（agent.go:500）用 `errors.As` 分类：

| 错误类型              | 恢复策略                                                                                                 | 最大重试              |
| --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| `RateLimitError`      | 解析 `Retry-After` header（缺省 5s）→ `select { time.After / ctx.Done }` 等待重试                        | 无限（用户可 ctrl-c） |
| `ContextTooLongError` | 说明估算低估了真实 token，立即 `ForceCompact` 强制压缩后重试本轮，并通知调用方清除已失效的 usage 锚点    | 压缩失败即报错        |
| `max_tokens` stop     | 1) 提升 output limit 到 64K; 2) 多轮恢复 "Continue"                                                      | 1 + 3 次              |
| Stream idle timeout   | 返回 `NetworkError` 上抛为 ErrorEvent（Agent 层不自动重试）                                              | 0（终止本轮）         |
| Auto-compact 失败     | 熔断器：连续 3 次失败后停止（`MaxConsecutiveAutoCompactFailures = 3`，compact.go:106）                   | 3 次                  |
| 未知工具调用          | 返回错误结果（`Error: unknown tool '%s'`）让模型自我纠正、继续循环（agent.go:577-582，无连续计数硬停止） | 0（不中断循环）       |
| PTL (summary 超长)    | 逐步丢弃最旧 API-round 组                                                                                | 3 次                  |

max_tokens 多轮恢复（agent.go:337-365）：

```
Turn 1: LLM 输出到一半被截断 (stop_reason: max_tokens)
→ 静默把 MaxOutputTokens 升到 maxTokensCeiling (64000，通过 llm.MaxTokensSetter 接口)
→ 已生成文本入会话，追加用户消息"从中断处直接续写，不要道歉不要重复"
Turn 2: 仍然截断
→ 进入多轮恢复，最多 maxOutputTokensRecoveries = 3 次，提示模型"把剩余工作拆小"
Turn 3-4: 耗尽后按正常完成处理。成功一轮后计数器归零。
```

这套设计避免了"半截输出直接丢弃重来"的浪费——已生成内容保留在历史中，模型接着写。

---

### Q34: 类型化错误层次结构的设计？为什么不用 errors.Is/As？

A:

```go
type LLMError struct{ Message string }
type AuthenticationError struct{ Message string }
type RateLimitError struct{ Message string; RetryAfter string }
type NetworkError struct{ Message string }
type ContextTooLongError struct{ Message string }
```

实际上项目确实使用了类型断言（等效于 errors.As）：

```go
var rateLimitErr *llm.RateLimitError
if errors.As(err, &rateLimitErr) {
    // 解析 RetryAfter, sleep, retry
}
var ctxErr *llm.ContextTooLongError
if errors.As(err, &ctxErr) {
    // force compact, retry
}
```

为什么不用 sentinel errors (errors.Is)：

- 错误需要携带上下文数据（`RetryAfter` 时间、原始消息）
- 不同错误类型需要不同的恢复逻辑
- 类型层次让 switch/if 分支更清晰

---

## 十、配置与部署

### Q35: 分层配置系统的合并策略？如何处理冲突？

A:

```
优先级（低 → 高）：
~/.swiftx/config.yaml           (用户全局)
<project>/.swiftx/config.yaml   (项目级, git tracked)
<project>/.swiftx/config.local.yaml (项目本地, gitignored)
环境变量                         (API Keys)
```

合并规则（config.go:194 mergeConfig）：

- 标量字段：后者覆盖前者（permission_mode 非空即覆盖）
- `providers` 数组：整体替换——override 中只要非 nil 就完全取代 base，不做按 name 的逐项合并
- `mcp_servers` 数组：按 server name 匹配，同名覆盖，不同名追加
- `hooks` 数组：追加（不覆盖）
- 权限规则不走 config 合并：RuleEngine 独立加载 user/project/local 三个规则文件，后加载的规则优先

API Key 解析链：

```
config.yaml 中的 api_key 字段
→ 环境变量 ANTHROPIC_API_KEY / OPENAI_API_KEY
→ 报错 "no API key found"
```

---

## 十一、性能优化

### Q36: Prompt Cache 与上下文预算如何协同优化？

A:

Prompt Cache 和上下文预算存在天然张力：预算裁剪要改写历史消息，而缓存要求前缀字节不变。Swifty 的协同策略：

1. Layer 1 spill 决策入库即冻结：`ApplyBudget` 只在结果批次写入 conversation 历史时做一次外溢，替换文本（`buildSpillPreview`）是确定性输出——相同输入永远产生逐字节相同的结果，进入历史后绝不再改写，保证缓存前缀不因预算变化而失效（tool_result/budget.go:135-138）
2. Layer 2 压缩后清除锚点：压缩改写了整个 conversation，此时 `ClearUsageAnchor` 并重新建立缓存（压缩后的首次请求是 cache miss，后续恢复）
3. Fork 子代理复制父消息历史：历史中的替换文本逐字节相同，缓存前缀在两边都命中
4. Deferred Tool Loading 保护 schema 前缀：工具 schema 列表跨轮稳定，不因按需加载而改变已有 schema 的顺序

---

### Q37: 流式工具提交（Streaming Tool Execution）的性能收益分析？

A:

传统方式：等 LLM 输出完所有 tool_call → 解析 → 执行。
Swifty 方式：LLM 输出过程中，每个 `ToolCallComplete` 事件立即提交给 Executor。

```go
// 在 stream 事件处理循环中：
case ToolCallComplete:
    executor.Submit(event.ToolCall)  // 立即提交

// 流结束后：
results := executor.ExecuteAll(ctx, agent)  // 批量执行
```

收益分析：

- 如果 LLM 输出了 3 个 ReadFile 调用，第 1 个解析完时就可以开始执行
- 实际上由于 LLM 输出速度 < 工具执行速度，对 Read 类工具收益有限
- 但对 Bash 命令（可能耗时数秒），提前提交可以 overlap LLM 输出时间和工具执行时间
- 对多工具批次（如 5 个并发 Read），所有工具在 LLM 输出完毕时已全部提交，立即并发执行

---

## 十二、设计模式与工程实践

### Q38: 项目中用到了哪些设计模式？

A:

| 模式                    | 应用                                  | 文件                       |
| ----------------------- | ------------------------------------- | -------------------------- |
| Strategy                | LLM Client 多协议实现                 | llm/client.go              |
| Observer/Event Bus      | AgentEvent channel                    | agent/events.go            |
| Registry                | Tool 注册表                           | tools/tool.go              |
| Decorator               | MCPToolWrapper 包装远程工具           | mcp/mcp.go                 |
| Chain of Responsibility | 5 层权限检查                          | permissions/permissions.go |
| Template Method         | Tool 接口 (Name/Schema/Execute)       | tools/tool.go              |
| Factory                 | NewClient() 根据 protocol 创建        | llm/client.go              |
| Builder                 | prompt.Builder 分段构建 system prompt | prompt/builder.go          |
| Adapter                 | MCPToolWrapper 适配 Tool 接口         | mcp/mcp.go                 |
| Circuit Breaker         | compact 连续失败熔断                  | agent/agent.go             |
| State                   | TUI 状态机 (select/chat/resume)       | tui/tui.go                 |
| Mediator                | TeamManager 协调多 Agent              | teams/teams.go             |
| Memento                 | FileHistory 文件快照/回滚             | file_history/              |
| Proxy                   | headerRoundTripper 注入 HTTP headers  | mcp/mcp.go                 |

---

### Q39: 如何保证 "Read-before-Edit" 这类不变量（invariant）？还有哪些类似的防御性设计？

A:

Read-before-Edit：

- `FileStateCache` 在 ReadFile 时记录 mtime
- EditFile/WriteFile 前检查 cache，未读或外部修改 → 拒绝
- 这是一种 capability-based security 思想：必须先获得"读过"的 capability 才能写

其他防御性设计：

1. 嵌套 Fork 防护：
   - `QuerySource` 字段 + conversation 标签扫描
   - 防止 Fork → Fork → Fork 指数爆炸

2. 未知工具软处理：
   - LLM 调用不存在的工具 → 返回错误结果并继续循环（agent.go:577-582）
   - 注释明确不设硬停止，让模型看到错误后自我纠正

3. Compact 熔断器：
   - 连续 3 次 compact 失败 → 放弃
   - 防止 context 不可恢复时的无限重试

4. 危险命令不可绕过：
   - Layer 2 黑名单在 sandbox auto-allow 之前检查
   - 即使沙箱启用，`rm -rf /` 仍被拒绝

5. 复合命令拆分：
   - `safe_cmd && dangerous_cmd` 不能绕过检查
   - 每段独立过权限系统

6. "always allow" 持久化到本地规则文件：
   - PermAllowAlways 调用 `AppendLocalRule` 把规则（工具名 + 内容前缀截断 60 字符 + 通配）写入 local 规则文件（agent.go:617-630）
   - 规则引擎每次评估时读取匹配，当轮之后立即生效；无 session 内存 allow 集合

7. 权限配置自我保护：
   - `.swiftx/config.yaml`、`permissions.local.yaml`、`.swiftx/skills` 列入 denyWrite
   - 防止 Agent 改写自己的权限配置实现提权

---

### Q40: 项目的测试策略是什么？如何测试一个 LLM Agent 系统？

A:

测试层次：

| 层次      | 方法                     | 示例                                        |
| --------- | ------------------------ | ------------------------------------------- |
| 单元测试  | 纯函数/逻辑测试          | permissions, hooks condition, compact, glob |
| 集成测试  | httptest.Server mock LLM | llm/usage_cache_test.go                     |
| E2E 测试  | 完整流程                 | memory/consolidation/e2e_test.go            |
| Live 测试 | 真实 API (env gate)      | agent/agent_live_test.go                    |
| Benchmark | 性能回归                 | tools/deferred_benchmark_test.go            |

测试 LLM Agent 的挑战与应对：

1. 非确定性输出：
   - 不测试 LLM 输出内容，测试 行为逻辑（收到 tool_call → 执行 → 结果追加）
   - Mock LLM 返回预定义的 SSE 事件序列

2. httptest.Server 模拟 SSE：

   ```go
   server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
       w.Header().Set("Content-Type", "text/event-stream")
       // 写入预定义的 SSE 事件
   }))
   ```

3. Table-driven tests：权限系统、条件引擎等用大量 case 覆盖边界

4. 无第三方测试框架：纯 `testing` 包（减少依赖，Go 标准库足够）

5. 67 个测试文件覆盖所有核心模块

---

### Q41: 盘点项目中的可靠性兜底设计

A:

这是该项目工程质量的核心亮点，可归纳为：

- 熔断：自动压缩连续失败 3 次停止重试（compact.go:106）。
- 降级：hooks 配置非法→无钩子启动；上下文窗口拉取失败→映射表→默认值；压缩摘要缺 `<summary>` 标签→退回原文；会话断点损坏→全量重放；外溢写盘失败→冻结原文继续。
- 重试：限流按 Retry-After 等待；PTL 按轮次组丢头重试 ≤3 次；max_tokens 两级恢复（升限 + 3 次续写）。
- 防环路：截断结果不再外溢（50K > 10K + 后缀）；外溢文件回读不再外溢；缓存决策冻结防止历史抖动。
- 防注入/提权：sandbox-exec 硬编码路径；复合命令拆分逐段鉴权；`.swiftx` 权限配置列入 denyWrite；git ref 名白名单校验。
- 幂等与原子性：外溢文件 O_EXCL 已存在即复用；会话 JSONL 追加式永不改写；worktree `-B` 自愈孤儿分支。
- panic 隔离：启动路径的模型信息拉取带 `recover()`，SDK 异常不影响进程。

这些设计的共同哲学是"Agent 是不可信执行者、LLM 是不可靠组件、网络是会静默失败的"——所有关键路径都假设失败会发生，并给出确定性的降级序列，而不是让错误向上传播炸掉整个会话。

---

## 十三、Go 语言特定问题

### Q42: 项目中 `context.Context` 的使用模式？如何做到优雅取消？

A:

传播链：

```
main (signal.NotifyContext)
  → Agent.Run(ctx)
    → Client.Stream(ctx, ...)
      → http.NewRequestWithContext(ctx, ...)
    → executeSingleTool(ctx, ...)
      → exec.CommandContext(ctx, "bash", "-c", cmd)
    → subagent.Run(ctx, ...)
```

关键模式：

1. BashTool 进程级取消：

   ```go
   cmd := exec.CommandContext(ctx, "bash", "-c", command)
   // ctx 取消 → 发送 SIGKILL 给进程组
   ```

2. SSE 流的协作取消：

   ```go
   select {
   case <-ctx.Done():
       stream.Close() // 关闭 HTTP 连接
       return
   case event := <-nextCh:
       // 处理
   }
   ```

3. 子 Agent 的级联取消：
   - 父 ctx 取消 → 所有子 Agent 的 ctx 也取消
   - `context.WithCancel` 创建子 ctx，defer cancel()

4. 非阻塞操作不需要 ctx：
   - `MemoryRecallCh` 的 `select` + `default` 不需要 ctx（立即返回）

---

### Q43: 为什么选择 Bubble Tea 作为 TUI 框架？Elm Architecture 在 Go CLI 中的优劣？

A:

Bubble Tea (Elm Architecture)：

```
Model → Update(msg) → (Model, Cmd) → View(Model) → string
```

优势：

1. 单向数据流：所有状态变化通过 `Msg` → `Update`，可追踪、可调试
2. 纯函数 View：`View(Model) string`，无副作用，易测试
3. 组合性：子组件（bubbles）独立 Update/View，嵌套组合
4. 生态：lipgloss (样式)、glamour (markdown)、bubbles (组件)

劣势：

1. 性能：每帧全量渲染（vs ncurses 的增量更新），复杂 UI 可能闪烁
2. 学习曲线：Msg 类型爆炸（每个事件一个 struct）
3. 异步复杂：Cmd 是 fire-and-forget，结果通过 Msg 回来，调试困难
4. 状态机复杂：多状态（select/chat/resume/permission）需要手动管理

Swifty 的适配：

- Agent 事件通过 `tea.Cmd` 桥接到 Bubble Tea 的 Msg 系统
- 权限请求阻塞 Agent（通过 channel 等待 TUI 回复）
- Markdown 渲染用 glamour（代码高亮 + 表格）

---

## 十四、系统设计开放题

### Q44: 如果要为 Swifty 添加 "Undo/Redo" 功能（撤销 Agent 的文件修改），你会如何设计？

A:

现有基础：

- `internal/file_history/` 已有文件快照机制
- `FileStateCache` 记录了每次读写的 mtime

设计方案：

```go
type ChangeSet struct {
    ID        string
    TurnID    int
    Changes   []FileChange  // {path, before, after}
    Timestamp time.Time
}

type UndoManager struct {
    history []ChangeSet
    pointer int  // 当前位置
}
```

1. 记录时机：每次 WriteFile/EditFile 执行前，snapshot 原文件内容
2. 粒度：一个 turn 中的所有文件修改为一个 ChangeSet（原子 undo）
3. Undo：恢复 ChangeSet 中所有文件的 before 内容
4. Redo：重新应用 after 内容
5. 与 Git 的关系：
   - 如果用户已 commit，undo 需要创建新 commit（而非 reset）
   - 如果未 commit，直接恢复文件即可
6. Bash 命令的 undo：
   - 不可自动 undo（副作用不可逆）
   - 只能记录命令，提示用户手动回滚

---

### Q45: 如何设计一个分布式 Agent 系统（多机协作）？Swifty 的 Teams 系统如何扩展到分布式场景？

A:

当前 Teams 的局限：

- FileMailBox 依赖共享文件系统
- SharedTaskStore 是单文件 JSON（无并发安全保证 beyond flock）
- in-process/tmux/iTerm 后端都是单机

分布式扩展方案：

1. 通信层替换：
   - FileMailBox → NATS/Redis Pub-Sub
   - SharedTaskStore → etcd/PostgreSQL
   - 保持 `MailBox` / `TaskStore` 接口不变

2. Agent 调度：
   - Coordinator 通过 gRPC 分发任务
   - Worker 注册 capability（工具集、文件系统访问范围）
   - 心跳 + 故障转移

3. 一致性挑战：
   - 多 Agent 编辑同一文件 → 需要分布式锁或 CRDT
   - Worktree 隔离（当前方案）在分布式下变为 branch 隔离
   - 最终一致性：每个 Agent 在自己的 branch 工作，coordinator 负责 merge

4. 安全边界：
   - 每个 Worker 有独立的 sandbox + permission 配置
   - Coordinator 不能直接执行命令（只能调度）
   - 审计日志集中收集

---

### Q46: Swifty 的 Prompt 构建系统如何保证可维护性和可扩展性？

A:

当前设计 — Priority-Sorted Section Builder：

```go
type Section struct {
    Name     string
    Priority int
    Content  string
}

// 按 priority 升序排序后拼接（prompt/builder.go Build）
sections := []Section{
    {"Identity", 0, "You are Swiftx..."},
    {"System", 10, "Tool rules..."},
    {"DoingTasks", 20, "Best practices..."},
    {"ExecutingActions", 30, "Caution with destructive actions..."},
    {"UsingTools", 40, "Prefer dedicated tools..."},
    {"ToneStyle", 50, "Tone and style..."},
    {"TextOutput", 60, "User-facing text guidance..."},
    {"Environment", 70, envInfo},
}
```

注意 custom_instructions（SWIFTX.md）、skills 清单、memory 不是 system prompt section：它们是项目级的，放进 system prompt 会让缓存前缀随项目变化，因此由 `conversation.InjectLongTermMemory` 作为会话首条 system-reminder 消息注入，且整个会话只注入一次（conversation.go:127）。

设计优势：

1. 关注点分离：每个 section 独立维护，修改一个不影响其他
2. 优先级控制输出顺序：8 个 section 的 Priority 从 0 到 70，Environment 殿后提供运行时上下文
3. 可插拔：新增 section 只需指定 priority，无需修改其他代码
4. 可测试：每个 section 的内容可以独立单元测试

可改进方向：

- Section 之间的依赖关系（如 skills 依赖 environment 中的 OS 信息）
- 动态 section（根据当前任务类型选择性包含）
- A/B testing 不同 section 顺序对效果的影响
- Token 预算分配（每个 section 有最大 token 限制）
