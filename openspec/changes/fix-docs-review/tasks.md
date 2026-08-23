# Tasks: fix-docs-review

## anti-copy.md (关键)

- [x] 修正第 2 节目录结构: index.ts 位于 src/index.ts 而非 src/core/index.ts
- [x] 更新第 3.1 节 DevtoolsOptions 表格: 补充 freeze (默认 true) 和 redirectUrl (默认 "about:blank")
- [x] 更新第 3.2 节 resolveOptions: 补充 freeze/redirectUrl 的归一化默认值
- [x] 重写第 6.6 节 devtools.ts: 描述双通道检测 + 反制机制 (debugger 探针、freeze 循环、redirect 兜底)
- [x] 更新第 7 节行为矩阵 devtools 行
- [x] 更新第 8 节设计决策: 新增反制分层条目
- [x] 更新第 9 节已知局限: 修正"独立窗口不可检测"、新增误报导致 redirect 的局限

## swifty-sentry.md

- [x] 修正插件名: Exposure → ExposurePlugin
- [x] 修正 decorate-route.ts 职责: 仅 History, Hash 在 decorates.ts
- [x] 补充公共 API 列表 (17+ 导出)

## swifty-agent.md

- [x] 修正工具三层命名: "wrapper" → "composition (index.ts 注册层)"
