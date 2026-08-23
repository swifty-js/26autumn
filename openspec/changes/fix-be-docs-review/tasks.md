# Tasks: fix-be-docs-review

基于 docs/be/REVIEW-REPORT.md 中确认的 8 处事实性错误进行修复.

- [x] 1. swifty-cache.md: 修正第 7 节 auto-rebalance 小结句方向 (热节点获得更多虚拟节点 → 热节点减少虚拟节点)
- [x] 2. swifty-rpc.md Q36: 删除 "或 Lease 续约" (KeepAlive 不产生 Watch PUT 事件)
- [x] 3. swifty-rpc.md Q8: 修正 RegisterCompressor 可扩展性描述 (compressor 接口未导出, 外部无法扩展)
- [x] 4. swifty-rpc.md Q13: 补充连接池 splice 后继续检查下一个连接的细节
- [x] 5. swiftx.md Q28: 删除不存在的 ParentReplacementState.Clone(), 替换为 cloneRegistryForFork 的实际描述
- [x] 6. swiftx.md Q14: 修正 ShouldDefer 描述 (并非恒返回 true, 可通过 SetDeferLoading 关闭)
- [x] 7. swiftx.md Q40: 修正测试文件数量 67 → 73
- [x] 8. clickhouse-kafka.md Q13: 修正 MySQL 并行度描述, 去掉 "(8.0 前)" 版本暗示
