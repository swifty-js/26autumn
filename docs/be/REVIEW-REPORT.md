# docs/be 全面 Review 报告

审查日期: 2026-08-23
审查范围: docs/be/ 下全部 9 篇文档
审查方法: 对引用本地仓库路径的 4 篇文档 (swiftx.md, swifty-http.md, swifty-rpc.md, swifty-cache.md) 结合实际项目代码逐条校验; 对 5 篇通用知识文档 (go.md, middleware.md, mysql.md, redis.md, clickhouse-kafka.md) 进行技术准确性和内容完整性审查.

---

## 总览

| 文档                | 对照代码                          | 错误 | 警告 | 建议 | 整体评价                       |
| ------------------- | --------------------------------- | ---- | ---- | ---- | ------------------------------ |
| swifty-http.md      | ~/github/swifty.go/swifty_http    | 0    | 5    | 7    | 极高, 25 处行号全部精确        |
| swifty-rpc.md       | ~/github/swifty.go/swifty_rpc     | 3    | 7    | 8    | 很高, 路径/名称/协议全部通过   |
| swifty-cache.md     | ~/github/swifty.js/packages/cache | 1    | 5    | 8    | 很高, 代码片段几乎逐字匹配     |
| swiftx.md           | ~/github/swifty.go/swiftx         | 3    | 7    | 7    | 高, 架构描述准确, 行号全面偏移 |
| go.md               | 通用知识 + swifty.go 示例         | 2    | 4    | 4    | 极高, 深度匹配高级定位         |
| middleware.md       | 通用知识                          | 1    | 3    | 4    | 高, 广度足够                   |
| mysql.md            | 通用知识                          | 0    | 3    | 4    | 极高, 未发现事实性错误         |
| redis.md            | 通用知识                          | 0    | 4    | 4    | 很高, 分布式锁部分是亮点       |
| clickhouse-kafka.md | 通用知识                          | 1    | 4    | 3    | 高, 个别数字需标注前提         |

合计: 8 处错误, 38 处警告, 44 处建议.

---

## 一、swiftx.md (对照 ~/github/swifty.go/swiftx)

### 校验通过项

- 所有 internal/ 目录路径均真实存在: agent, llm, tool_result, compact, session, permissions, sandbox, hooks, tools, mcp, skills, subagent, teams, worktree, tui, remote
- 七块架构分层描述与代码结构完全吻合
- 四种运行模式 (Teammate/Print/Remote/TUI) 描述准确
- Client 接口定义与文档描述完全一致
- StreamingExecutor, conversation.Manager 等核心类型均存在
- 依赖库名称 (anthropic-sdk-go, openai-go, MCP go-sdk, charmbracelet 系, swifty_http) 全部与 go.mod 一致
- 配置项名称 (context_window, permission_mode, mcp_servers, hooks, sandbox, enable_coordinator_mode) 与代码一致

### 错误 (事实性错误)

1. Q28 中 `ParentReplacementState.Clone()` 不存在: 全项目搜索无任何结果. 实际 fork 继承机制通过 `cloneRegistryForFork` (subagent/agent_tool.go:539) 实现, 仅复制注册表并标记 QuerySource. 属于凭空捏造或记忆混淆, 应替换为实际描述.

2. Q14 中 `MCPToolWrapper.ShouldDefer() = true` 描述不准确: 实际代码 (mcp/mcp.go:288) 为 `return !w.noDefer`, 存在 `SetDeferLoading(on bool)` 方法可关闭延迟加载, 并非始终返回 true. 应改为 "默认延迟加载, 可通过 SetDeferLoading 关闭".

3. Q40 称 "67 个测试文件", 实际为 73 个.

### 警告 (行号偏移)

agent.go 整体偏移约 +100 行, anthropic.go 偏移约 +50 行, tool.go 偏移约 +40~93 行. 说明文件在文档撰写后新增了大量代码.

| 文档引用                                | 文档行号 | 实际行号 | 偏移 | 严重程度 |
| --------------------------------------- | -------- | -------- | ---- | -------- |
| Agent.Run (agent.go)                    | 182      | 256      | +74  | 显著     |
| MemoryRecallCh 消费 (agent.go)          | 444-454  | 553-560  | +109 | 显著     |
| handleStreamError (agent.go)            | 500      | 610      | +110 | 显著     |
| PermissionRequestEvent (agent.go)       | 585-591  | 700-703  | +115 | 显著     |
| Cache Breakpoint (anthropic.go)         | 160-190  | 214-233  | +50  | 显著     |
| markLastUserTailForCache (anthropic.go) | 342      | 392      | +50  | 显著     |
| GetAllSchemas (tool.go)                 | 124      | 182      | +58  | 显著     |
| CreateDefaultToolsWithWorkDir (tool.go) | 228      | 321      | +93  | 显著     |
| Tool 接口 (tool.go)                     | 53       | 93       | +40  | 显著     |
| Checker.Check (permissions.go)          | 515      | 524      | +9   | 可接受   |
| WebSocket handler (server.go)           | 154      | 158      | +4   | 可接受   |
| computeCompactThreshold (compact.go)    | 90       | 92       | +2   | 可接受   |
| StreamingExecutor.ExecuteAll            | 78       | 78       | 0    | 精确     |
| interpretExitCode (bash.go)             | 50       | 50       | 0    | 精确     |
| buildSpillPreview (budget.go)           | 139      | 139      | 0    | 精确     |

### 建议

1. 对 agent.go、anthropic.go、tool.go 等高频变动文件, 删除具体行号, 仅保留函数/结构体名称定位. 对 compact.go、permissions.go 等稳定文件行号仍可保留.
2. 删除不存在的 `ParentReplacementState` 描述, 替换为 `cloneRegistryForFork` 的实际机制.
3. Q18 与 Q37 内容重复 (流式工具提交的实现与性能收益), 建议合并或明确区分侧重.
4. 补充 go.mod 中四条 replace 指令的说明 (swifty_http 等是本地 monorepo 兄弟模块, 非远程依赖).
5. 非测试代码行数 "约 2.7 万" 实际为 28771 行 (约 2.88 万), 偏差 6%, 建议注明统计口径.
6. Q34 标题 "为什么不用 errors.Is/As" 与正文矛盾 (正文展示了 errors.As 的使用), 标题应改为 "为什么不用 sentinel errors".
7. 可考虑将行号引用统一改为 "函数名 + 文件名" 的形式, 彻底避免行号过时问题.

---

## 二、swifty-http.md (对照 ~/github/swifty.go/swifty_http)

### 校验通过项

- 文件路径: swifty.go, router.go, trie.go, context.go, response.go, group.go, sse.go, websocket.go, recovery.go 全部存在
- 函数/结构体: compose, Middleware, Context, Application, ServeHTTP, respond, promoteStatus, node, router, Router, SSEWriter, WSConn 等全部与源码一致
- 行号: 25 处引用全部精确对应, 无偏差
- 代码片段: 所有嵌入的 Go 代码与源码逻辑完全一致, 差异仅限省略注释和格式化压缩
- 洋葱模型、延迟响应、Trie 路由、SSE、WebSocket 架构描述均与实现吻合

### 错误

无.

### 警告

1. Q5 规范化 bug 解释措辞有歧义: "查找时用 GET-/users 找不到 handler" 有误导性. 实际是第一个注册的 handler (key 为 GET-/users/) 永远无法被路由到, 而非 "找不到". 建议改为 "导致先注册的路由静默不可达".

2. Q16 "代码量约 600 行" 略有低估: websocket.go 590 行 + sse.go 172 行 = 762 行. 建议改为 "约 700 行".

3. Q1 架构图中 "Router/Group (group.go)" 的命名: 实际类型名只有 Router, 没有 Group 类型. 建议统一为 "Router (group.go)".

4. Q3 未提及 respond() 中的防御性状态提升逻辑 (response.go:98-100), 即直接赋值 ctx.Body 而未调用 JSON/String 时的兜底.

5. Q10 与 Q13 术语不一致: "线程安全" vs "并发安全", Go 社区更常用后者, 建议统一.

### 建议

1. 补充 go.mod 中 go 1.26.0 版本信息, 以及 strings.SplitSeq 需要 Go 1.24+ 的说明.
2. Q12 可补充 readFrame 中 maskKey 用 [4]byte 值类型避免堆分配的细节.
3. Q14 可补充当前框架未暴露 TLS 配置接口的说明.
4. Q15 对比表可补充 "路由冲突检测" 维度 (Gin 会 panic, swifty_http 不会).
5. 补充 main.go (示例入口) 的存在.
6. Q9 中 statusRecorder 还拦截了 Write 方法 (group.go:178-183), 值得展开.
7. 括号内加空格的排版风格 ( 如 `( 包括路由 handler)` ) 全文统一, 不算错误, 但可考虑统一处理.

---

## 三、swifty-rpc.md (对照 ~/github/swifty.go/swifty_rpc)

### 校验通过项

- 11 个包路径 (pkg/rpc, internal/client, internal/server, internal/transport, internal/protocol, internal/codec, internal/breaker, internal/limiter, internal/load_balance, internal/registry, internal/stream) 全部存在
- 所有关键类型和函数 (ClientConn, Invoke, TCPClient, SendAsyncWithCodec, Future, CodecType, Dial, NewServer 等) 均真实存在
- 调用链 (limiter.Allow -> registry.Discover -> lb.Select -> breaker.Allow -> pool.Acquire -> codec.Marshal -> TCPClient.SendAsyncWithCodec) 与代码逻辑完全一致
- 协议描述: Magic 0x1234, 大端序, 10 字节前缀, Header JSON, StreamFlag omitempty 均与代码吻合
- 代码片段与源码高度一致, 仅有变量名和格式差异

### 错误

1. Q36 Watch PUT 事件触发条件: 文档写 "PUT 事件: 新实例上线或 Lease 续约 -> 更新缓存". 实际 etcd 的 KeepAlive (Lease 续约) 不会产生 Watch PUT 事件, PUT 仅在显式 client.Put 时产生. 应删除 "或 Lease 续约".

2. Q8 RegisterCompressor 可扩展性: 文档暗示外部用户可通过 RegisterCompressor 扩展压缩器. 实际 compressor 接口未导出 (小写), 外部包无法实现该接口, 也就无法注册自定义压缩器.

3. Q13 连接池 maxActive 描述: "Acquire 时发现 conn.closed==1, 从切片中 splice 删除, 然后重新拨号" 省略了删除后如果切片不为空会继续检查下一个连接的细节. 严重程度较低 (maxActive 始终为 1 时行为一致).

### 警告

1. Q2 type alias 列表暗示所有别名在同一文件中, 实际 ServerStream/ClientStream 在 pkg/rpc/stream.go.
2. Q13 Push 阻塞描述不完整: 未提及 ctx.Done() 和 termCh 两个逃逸条件.
3. Q32 RoundRobin 代码片段缺少 len(list)==0 的空列表保护.
4. Q34 Discover 热路径存在嵌套 RLock (copyInstances 内部再次 RLock), 有理论死锁风险.
5. Q17 标题暗示 InvokeAsync 仅在 internal/client 中, 实际 pkg/rpc/client.go 静态模式也有 invokeAsyncStatic.
6. Q18 签名匹配优先级: 代码中是 stream 优先判断, 文档描述的顺序与之不完全一致.
7. Q29 断路器状态图未明确说明 mutex 保证了严格串行.

### 建议

1. 补充 Go 版本要求 (go 1.26.0, 使用了 sync.WaitGroup.Go 和 reflect.TypeFor).
2. Q1 调用链可标注关键方法所在文件.
3. Q28 表格补充服务端始终启用 TokenBucket(10000) 限流的说明.
4. Q33 可提供 WeightedRR 排序修复的代码示例.
5. Q39 "NewServer panic" 补充具体位置说明 (pkg/rpc vs internal/server).
6. 补充 pkg/api 包 (示例服务定义) 的说明.
7. Q4 帧格式图可标注字节偏移.
8. 整体质量良好, 40 个 QA 覆盖所有核心模块.

---

## 四、swifty-cache.md (对照 ~/github/swifty.js/packages/cache)

### 校验通过项

- 所有文件路径 (group.ts, lru.ts, single-flight.ts, consistent-hash.ts, crc32.ts, register.ts, server.ts, client.ts, client-picker.ts, byte-view.ts, peers.ts, proto/swifty.proto) 均存在
- 所有类/接口名 (Group, Cache, LruStore, InternalCache, ClientPicker, ConHashMap, Server, Client, SingleFlightGroup, ByteView, PeerPicker, Peer, ServiceDiscovery) 均准确
- 四层架构描述与代码模块划分吻合
- 依赖包 (@grpc/grpc-js, @grpc/proto-loader, etcd3) 与 package.json 一致
- 一致性哈希参数: defaultReplicas=50, IEEE 多项式 0xEDB88320, loadBalanceThreshold=0.25, minReplicas=10, maxReplicas=200 全部确认
- LRU 参数: BKDR Hash 乘数 131, maxBytes=8MiB, bucketCount=16 全部确认
- SingleFlight 代码片段与源码完全一致
- gRPC 细节: createInsecure, deadline 3000ms, x-peer-request metadata, maxMsgSize 4<<20 全部确认
- etcd 细节: lease TTL 10s, key 格式 /services/{svcName}/{addr}, lost 后 1s 重注册 全部确认

### 错误

1. 第 7 节 auto-rebalance 小结句方向写反: 文档写 "本质是 '让热节点拥有更多虚拟节点', 把请求压力摊匀". 实际代码是过载节点减少副本 (currentReplicas / loadRatio), 欠载节点增加副本 (currentReplicas * (2 - loadRatio)). 应改为 "让冷节点拥有更多虚拟节点 (或等价地, 让热节点减少虚拟节点), 使请求分布趋匀".

### 警告

1. 第 4 节 LruStore 默认值: 文档说 capPerBucket=512, level2Cap=256, 这是 Cache 层面的默认值. LruStore 构造函数自身的 fallback 是 1024/1024. 建议注明层次.
2. 第 2 节时序图将 Cache 画为独立管道层, 实际是 Group.get 内的前置判断, 非线性串联.
3. 第 9 节 "运行时动态加载 .proto" 措辞: 实际是模块初始化时 loadSync 同步加载, 非按需动态加载.
4. 第 4 节 InternalCache.get 的过期判据 (expireAt > 0) 在第 5 节才提到, 信息分布可优化.
5. 第 8 节 "etcd3 库内部自动续租" 与 "lost 后重注册" 的关系可更明确串联.

### 建议

1. 补充文件路径基准说明 (相对于 packages/cache/src/).
2. 补充 store.ts 和 config.ts 的存在.
3. 第 4 节明确 L1/L2 与数组下标 caches[i][0]/caches[i][1] 的映射.
4. 第 6 节对比表 "panic 传播给所有等待者" 改为 "recover 后包装为 error 传播".
5. 第 12 节点明 cloneBytes 与 byteSlice 的实现差异.
6. 补充 index.ts 公开 API 信息.
7. 第 7 节展开 "不迁移已缓存数据" 的后果 (部分 key 环归属变了但数据仍在旧节点).
8. CRC32 多项式大小写统一 (文档 0xEDB88320 vs 代码 0xedb88320).

---

## 五、go.md (通用知识 + swifty.go 示例)

### 错误

1. 第 10.5 节 swifty_cache Group.Close: 文档写 atomic.CompareAndSwapInt32(&g.closed, 0, 1), 实际代码使用 Go 1.19+ 类型化 API c.closed.CompareAndSwap(0, 1) (字段类型 atomic.Int32). 语义等价但函数名不同.

2. 第 10.3 节 "Go 1.25+ 新增 wg.Go(func())": sync.WaitGroup.Go 确实进入 Go 1.25, 但文档未标注版本可用性, 使用 1.22-1.24 工具链的读者会编译失败.

### 警告

1. 第 3.3 节 Swiss Table "负载因子上限 7/8": 官方 blog 和 release notes 未明确给出此数字, 建议标注出处或改为 "约 0.875".
2. 第 7.7 节 GOMAXPROCS: "Go 1.24 及以前默认 GOMAXPROCS=64" 表述可能误导, 建议改为 "默认取宿主机全部逻辑 CPU 数 (如 64)".
3. 第 2.2 节 append 扩容: "Go 1.17 及以前阈值是 1024 且是硬切换" 措辞可更精确, 建议补充 ">= 1024 时固定 1.25 倍".
4. 第 7.3 节抢占机制: 确认 Go 1.14 引入信号抢占, 10ms 阈值正确, 无误.

### 建议

1. 整体质量极高, GMP、GC、channel、sync 各节有源码级细节, 深度匹配高级定位.
2. 第 21.4 题 (两协程交替打印奇偶) 题意与代码行为有微妙偏差, 建议明确.
3. swifty.go 项目引用经核实基本准确: PacketBuffer.Read, lruStore 结构体, TCPClient 的 pending sync.Map 等均与代码一致.
4. 第 3.3 节 Swiss Table 可补充面试应对建议: 控制字具体位布局随版本可能调整, 核心思想是每槽 1 字节元数据做并行比对.

---

## 六、middleware.md (通用知识)

### 错误

1. Q1 选举触发条件排版: "默认即 [1000ms, 2000ms))" 末尾多一个右括号, 应为 [1000ms, 2000ms).

### 警告

1. Q12 Kafka 零拷贝: "2 次 DMA 拷贝, 2 次切换" 假设网卡支持 SG-DMA, 建议加注前提.
2. Q5 BoltDB 页大小: 默认 4096 正确, 但 etcd 使用的 bbolt fork 在某些平台可能更大.
3. Q48 Redis Stack 向量搜索: "Redis 7.4+ 支持 FLOAT16" 具体版本号需确认, 建议标注 "RediSearch 2.10+ / Redis Stack 7.4+".

### 建议

1. etcd 部分可补充 lease 续约在 Leader 切换时的行为、etcd 3.5 backend 分离等生产级细节.
2. groupcache 部分 (Q17-Q22) 相对较浅, 可引用 go.md 相关章节避免重复.
3. Q22 提到 "swifty_cache 的做法" 但无具体代码路径, 建议改为通用描述或加脚注.
4. 整体格式统一, 表格对齐良好.

---

## 七、mysql.md (通用知识)

### 错误

未发现明确事实性错误. 技术准确性非常高.

### 警告

1. Q14 范围查询停止匹配: "存在 a = 1 的等值边界" 的解释概念上有道理, 但实际 MySQL 优化器行为更复杂 (涉及 ICP), 建议注明 "简化理解, 实际由优化器 cost 决定".
2. Q42 Buffer Pool LRU: "新读入的页先插入 old 区头部" 可能误解为 LRU 链表最前端, 实际是 young/old 分界处.
3. Q51 半同步复制: 使用了旧参数名 rpl_semi_sync_master__, MySQL 8.0.26+ 已改为 rpl_semi_sync_source__, 建议加注.

### 建议

1. 64 个问题覆盖九大板块, 深度广度非常好.
2. 可考虑补充: MySQL 8.0 Hash Join、AHI 争议、innodb_redo_log_capacity (8.0.30+).
3. Q37 加锁规则中 performance_schema.data_locks 是 8.0 视图, 5.7 对应 information_schema.innodb_locks, 建议标注版本.
4. 格式统一, 无 markdown 错误.

---

## 八、redis.md (通用知识)

### 错误

未发现明确事实性错误.

### 警告

1. Q7 渐进式 rehash: 描述基本正确, "有子进程时阈值提高到 >= 5" 的表述已足够清晰.
2. Q17 定期删除: hz=10 即每 100ms 一次 serverCron, 正确. activeExpireCycle 有 CPU 时间限制, 文档后文已描述.
3. Q21 集群 16384 槽: "Redis 官方建议主节点不超过 1000 个" 来自 antirez 博文, 建议标注 "经验建议" 而非 "官方建议".
4. Q16 RDB 加载: "从节点全部加载" 在 Redis 4.0+ 有细微变化 (从节点也会检查过期键), 但核心点正确.

### 建议

1. 分布式锁部分 (Q26-Q31) 是亮点, 两种实现对比清晰, 代码完整可运行.
2. 可补充: Redis 7.0 Function、Multi-part AOF、Cluster 跨槽事务改进.
3. Q28 Redis + etcd 混合锁: Unlock 先删 Redis 再 PUT etcd, 如果 PUT 失败只能靠 TTL 兜底, 建议补充此故障场景.
4. 格式统一, 无 markdown 错误.

---

## 九、clickhouse-kafka.md (通用知识)

### 错误

1. Q13 对比表: "MySQL (InnoDB) 并行度: 单线程执行 (8.0 前)" 括号暗示 8.0 改变了局面, 但 MySQL 8.0 的 SELECT 仍以单线程执行为主 (仅 innodb_parallel_read_threads 用于 COUNT(*) 全表扫描). 建议改为 "单线程执行 (per query)" 去掉版本暗示.

### 警告

1. Q3 稀疏索引: "10 亿行也只有约 12 万个条目, 几 MB" 对单列主键偏大 (约 1MB), 建议改为 "约 1~几 MB (取决于键宽度)".
2. Q15 Kafka 高吞吐: "顺序写 600MB/s vs 随机写 100KB/s" 是 HDD 数据, SSD/NVMe 差异巨大, 建议标注 "机械硬盘" 前提.
3. Q18 事务 Producer: "吞吐下降约 30~~50%" 高度依赖配置, 建议改为 "社区报告约 30~~50%, 视配置而异".
4. Q24 KRaft: "2.8+ 引入, 3.3 生产就绪" 正确, 但可补充 4.0 已完全移除 ZooKeeper 依赖.

### 建议

1. ClickHouse 部分可补充: 物化视图的增量计算机制、Projection 与物化视图的选择.
2. Kafka 部分可补充: Tiered Storage (KIP-405, 3.6+)、Share Group (KIP-932).
3. 整体结构清晰, ClickHouse 和 Kafka 各占一半, 覆盖面合理.

---

## 跨文档一致性检查

1. go.md 和 middleware.md 对 groupcache/swifty_cache 的描述无矛盾, 但存在内容重叠 (singleflight、一致性哈希). 建议在 middleware.md 中标注 "详见 go.md 第 X 节" 减少重复.

2. go.md 和 swifty-rpc.md 对 TCPClient 的描述一致 (pending sync.Map, seq atomic.Uint64, readLoop goroutine).

3. swifty-cache.md 和 go.md 对 LRU 分桶的描述一致 (BKDR Hash, 位掩码, maskOfNextPowOf2).

4. 各文档的 markdown 格式风格统一 (标题层级、代码块标注、表格格式), 无格式错误.

---

## 优先修复建议 (按影响排序)

1. swifty-cache.md 第 7 节 auto-rebalance 方向写反 -- 面试中如果被追问会暴露理解错误
2. swifty-rpc.md Q36 Lease 续约不产生 PUT 事件 -- etcd 核心机制的事实性错误
3. swifty-rpc.md Q8 RegisterCompressor 外部不可用 -- 误导读者认为框架支持自定义压缩
4. clickhouse-kafka.md Q13 MySQL 8.0 并行度暗示 -- 可能误导面试回答
5. go.md 第 10.5 节 atomic API 名称 -- 与实际代码不符, 面试对照源码时会发现
6. swiftx.md 三处行号偏移超 50 行 -- 建议更新或改为纯函数名引用
7. middleware.md Q1 多余右括号 -- 排版问题, 影响阅读
8. swifty-http.md Q5 措辞歧义 -- 可能误导对 bug 机制的理解
