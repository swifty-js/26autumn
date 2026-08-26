# swifty-eval 面试 QA

> 本机器路径 `$HOME/github/swifty.js/packages/swifty-eval`

> 项目: `@swifty.js/eval` —— LLM-as-Judge 对话模型评测框架, 用于评测"任务指令遵循型"对话模型. 它在内置用户画像与被测模型之间模拟多轮电话对话, 按 8 个加权维度打分, 并生成可解释的 Markdown + HTML 报告. 该包是 Python `ai-evaluate` 项目的 TypeScript 迁移版, 修复了原版一系列缺陷 (见 README.md 的 Migration notes).
>
> 本文档面向高级前端/全栈工程师面试场景, 所有结论均基于项目真实源码, 关键结论附 `文件:行号` 引用.

## 一、项目概述与架构

### Q1: 这个项目解决什么问题? 核心思路是什么?

答:

业务背景: 外呼型对话模型 (如骑手合同通知电话) 的质量无法用单轮 QA 评估 —— 它的能力体现在多轮任务推进、约束遵循、异常恢复等系统性行为上. swifty-eval 用一套自动化流水线替代人工抽检:

```
任务指令文档 (Markdown)
    │ LLM 结构化抽取 (TaskParser)
    ↓
TaskInstruction (role / task / openingLine / flow / faq / constraints)
    │
    │  对每个用户画像 (6 种)
    ↓
DialogueEngine: 被测模型 <-> UserSimulator 多轮对话 (上限 30 轮)
    │
    │  EvaluatorRegistry: 8 个维度评测器并发打分
    │  (Judge 模型独立于被测模型, 每维度采样 evalCount 次)
    ↓
Scorer: 加权聚合为 0-100 总分 + 低分维度改进建议
    │
    ↓
MarkdownGenerator + HtmlGenerator: 带时间戳的双格式报告
```

三个关键设计决策:

1. 被测模型与裁判模型分离: `runEvaluation` 用 `config.llm` 建被测客户端、`config.evaluatorLlm` 建裁判客户端 (src/pipeline/run-evaluation.ts:33-34), 避免自评偏差; 未配置裁判时回退到被测配置 (src/config.ts:122-129)
2. 概率化人格注入: 用户画像的 `refusalProbability` / `questionProbability` 不只是元数据, 会被换算成百分比写进模拟器 system prompt (src/simulator/user-simulator.ts:13-18)
3. 截尾均值抗裁判抖动: 每维度判 3 次, 3 个及以上有效样本时去掉最高最低再平均 (src/evaluator/base-evaluator.ts:104-106)

### Q2: 整体架构与模块划分是怎样的?

答:

```
src/
├── main.ts               CLI 入口: --task/--config/--profiles 参数解析与流程编排
├── index.ts              公共 API 汇总导出 (129 行导出清单)
├── config.ts             zod 校验的 YAML 配置装载
├── i18n/                 zh/en 双语消息目录 + 全局 locale
├── models/               领域类型: task / dialogue / evaluation
├── llm/                  ChatModel 传输接口 + OpenAI 适配器 + 重试客户端
├── parser/task-parser.ts LLM 抽取 -> zod 校验的 TaskInstruction
├── simulator/            用户画像 + LLM 用户模拟器
├── engine/               对话循环 + 状态机
├── evaluator/            基类 + 8 个维度评测器 + 注册表 + 加权打分器
├── report/               Markdown 生成器 + React SSR HTML 生成器
├── pipeline/             runEvaluation / generateReports 编排
└── utils/                并发映射 / JSON 提取 / 错误格式化
```

各模块职责与关键文件:

| 模块     | 文件                            | 职责                                                  |
| -------- | ------------------------------- | ----------------------------------------------------- |
| CLI      | src/main.ts                     | parseArgs 解析参数, 校验任务文件存在, 汇总输出平均分  |
| 配置     | src/config.ts                   | YAML 解析 + zod schema 校验 + 默认值填充              |
| 任务解析 | src/parser/task-parser.ts       | 用 LLM 把 Markdown 任务书抽取为结构化 TaskInstruction |
| 用户画像 | src/simulator/profiles.ts       | 6 种内置画像及数值化行为倾向                          |
| 用户模拟 | src/simulator/user-simulator.ts | 画像 prompt 组装 + 历史窗口管理                       |
| 对话引擎 | src/engine/dialogue-engine.ts   | 多轮循环、占位符替换、挂断/拒绝/关键词三重终止检测    |
| 状态机   | src/engine/state-machine.ts     | 7 状态有限状态机, 记录转移历史与步骤完成度            |
| 评测基类 | src/evaluator/base-evaluator.ts | 多采样、截尾均值、JSON 判决解析                       |
| 评测维度 | src/evaluator/*.ts              | 8 个维度评测器, 约束合规为规则+LLM 混合               |
| 调度     | src/evaluator/registry.ts       | 有界并发执行全部维度, 单维度崩溃降级为 0 分           |
| 聚合     | src/evaluator/scorer.ts         | 按权威顺序聚合、加权总分、生成改进建议                |
| 报告     | src/report/*.ts(x)              | Markdown 表格报告 + React SSR 自包含 HTML (雷达图)    |
| LLM 层   | src/llm/llm-client.ts           | 消息组装 + 限流指数退避重试                           |

依赖极简: 运行时仅 `openai`、`zod`、`js-yaml`、`dotenv`、`react`/`react-dom` (HTML 报告 SSR 用) 6 个直接依赖 (package.json), 无 CLI 框架 (用 Node 内置 `parseArgs`, src/main.ts:26-33).

### Q3: 一次完整评测的执行流程是怎样的?

答:

入口 src/main.ts:25-80:

1. `parseArgs` 解析 `--task` (默认 data/communicate.md)、`--config` (默认 config.yaml)、`--profiles` (可重复传, 默认全部画像)、`-h` (src/main.ts:26-33)
2. `access()` 校验任务文件存在, 不存在直接抛错 (src/main.ts:40-44)
3. `loadConfig` 装载并校验配置, `configureI18n` 设置全局语言 (src/main.ts:46-47)
4. `runEvaluation` 执行核心流水线 (src/main.ts:61-65)

`runEvaluation` 内部 (src/pipeline/run-evaluation.ts:25-83):

1. 分别用 `config.llm` 与 `config.evaluatorLlm` 构造两个 `LLMClient` (src/pipeline/run-evaluation.ts:33-34)
2. `TaskParser(modelClient).parseFromFile` 把任务文档抽取为 `TaskInstruction` (src/pipeline/run-evaluation.ts:36-37)
3. `selectProfiles` 按名字过滤画像, 全部不匹配则抛错 (src/pipeline/run-evaluation.ts:39-44)
4. 构造 `EvaluatorRegistry` (8 个维度评测器 + maxWorkers 并发上限) 与 `Scorer` (权重来自配置) (src/pipeline/run-evaluation.ts:46-50)
5. 逐个画像串行执行: `UserSimulator` + `DialogueEngine` 跑对话 (注意 `refusalJudge: evaluatorClient`, 拒绝检测用裁判模型, src/pipeline/run-evaluation.ts:57) -> `registry.evaluateAll` 并发评 8 维度 -> `scorer.createResult` 聚合 (src/pipeline/run-evaluation.ts:59-77)
6. 返回结果数组后, `generateReports` 写出带时间戳的 Markdown 与 HTML 报告 (src/main.ts:67, src/pipeline/generate-reports.ts:24-42)
7. CLI 末尾打印对话总数与平均分 (src/main.ts:72-79)

值得注意: 画像是串行跑的 (对话轮次间有依赖), 并发只发生在单次对话的 8 个维度评测内部.

---

## 二、用户模拟与对话引擎

### Q4: 六种用户画像分别是什么? 数值字段如何影响行为?

答:

内置画像定义在 src/simulator/profiles.ts:10-95, 每个画像含 `refusalProbability` 与 `questionProbability` 两个数值倾向:

| 画像               | 拒绝倾向 | 提问倾向 | 特征                           |
| ------------------ | -------- | -------- | ------------------------------ |
| Cooperative User   | 0.05     | 0.2      | 积极配合、回答简洁             |
| Adversarial User   | 0.6      | 0.5      | 质疑请求、频繁拒绝、编借口拖延 |
| Neutral User       | 0.2      | 0.3      | 冷静有距离感、只跟进感兴趣的事 |
| Suspicious User    | 0.15     | 0.7      | 频繁提问、要求反复确认         |
| Busy User          | 0.25     | 0.1      | 催促、要求简短 (每次只回 1 句) |
| Unpredictable User | 0.3      | 0.4      | 态度随对话与心情随机切换       |

所有画像共享同一段"接电话者"后缀提示 (不知道来电目的, 只根据对方说的反应) 和挂断指令 (src/simulator/profiles.ts:3-7): 模拟用户若决定结束对话, 需在回复末尾追加 `[HANGUP]` 标记.

数值生效机制 (Python 原版中这两个字段是死配置, 迁移时修复): `buildSimulatorSystemPrompt` 把两个概率换算为百分比拼进 system prompt (src/simulator/user-simulator.ts:13-18):

```
Behavioral tendency reference: you have roughly a 60% tendency to refuse or
deflect requests and a 50% tendency to proactively ask for details; ...
```

`selectProfiles(names)` 按名字过滤, 名字不匹配的忽略, 空数组或 undefined 返回全部画像 (src/simulator/profiles.ts:101-108).

### Q5: UserSimulator 如何维护对话历史?

答:

src/simulator/user-simulator.ts:28-75:

1. 视角转换: 在模拟器眼里, 被测模型的发言是 `assistant`、模拟用户自己的回复是 `user` (src/simulator/user-simulator.ts:59-60), 与被测模型侧的视角正好相反
2. 滑动窗口: 历史最多保留 `maxHistoryRounds * 2` 条消息, 默认 10 轮 20 条 (DEFAULT_MAX_HISTORY_ROUNDS, src/simulator/user-simulator.ts:6, 68-74), 防止长对话撑爆上下文
3. 首轮注入背景: `generateResponse` 第二参 `additionalContext` 只在第一轮传入, 以 `[Context: ...]` 前缀拼进 user message, 让模拟用户知道"你是被叫方, 来电人是某角色" (src/simulator/user-simulator.ts:48-51; 调用点 src/engine/dialogue-engine.ts:120-123)
4. system prompt 在构造时由 `buildSimulatorSystemPrompt` 一次性生成并缓存 (src/simulator/user-simulator.ts:40)

### Q6: DialogueEngine 的多轮循环逻辑是怎样的?

答:

核心在 src/engine/dialogue-engine.ts:94-155 的 `runDialogue`:

1. 初始化: 状态机 reset 后转移到 `identityCheck` (src/engine/dialogue-engine.ts:105-106); 首条模型消息不是模型生成的, 而是任务书的 `openingLine` 经占位符替换得到 (src/engine/dialogue-engine.ts:108-111)
2. 每轮: (round > 1 时) 先让被测模型回复, 再让模拟用户回复 (src/engine/dialogue-engine.ts:114-125). 每轮固定两条 turn: model 在前 user 在后
3. 第一轮结束后状态机转移到 `flowExecution` (src/engine/dialogue-engine.ts:127-129)
4. 每轮做三重终止检测 (详见 Q7), 命中则 break
5. 循环自然结束 (达到 maxRounds) 终止原因记为 `maxRoundsReached` (src/engine/dialogue-engine.ts:151)
6. 产出 `DialogueRecord`: taskId、画像、全部 turns、终止原因、ISO 起止时间 (src/engine/dialogue-engine.ts:147-154)

被测模型的 system prompt 每轮动态拼装 (src/engine/dialogue-engine.ts:182-235): 任务角色 + 任务描述 + 流程步骤列表 + FAQ 知识库 + 约束清单 (字数上限/语气/禁用短语 + "像打电话一样自然" + "避免重复, 复述要换表达"). 消息组装上, 最后一条 user turn 作为本轮 userMessage, 其余全部作为 history 传入 (src/engine/dialogue-engine.ts:222-234).

占位符机制: `resolvePlaceholders` 用正则 `/\$\{(\w+)\}/g` 替换 `${name}` 形式变量, 未知名保留原样 (src/engine/dialogue-engine.ts:31-39). `rider_name` 之外的占位符可通过 `options.placeholders` 注入; `rider_name` 的采样值来自 i18n 消息目录 —— 中文环境从 `["小王", "小李", "小张", "小刘", "师傅"]` 随机取 (src/i18n/messages.ts:139), 英文从 `["Alex", "Sam", "Jordan", "Taylor", "Riley"]` 取 (src/i18n/messages.ts:211). 随机函数与时钟均可注入 (src/engine/dialogue-engine.ts:69-72), 保证测试确定性.

### Q7: 对话终止检测有哪几重机制?

答:

三重机制, 其中后两重只在 `round > minRounds` (默认 4) 后激活, 防止开场白阶段的正常语句被误判 (src/engine/dialogue-engine.ts:131-144):

1. 显式挂断信号: `parseHangupSignal` 检查模拟用户回复中是否含 `[HANGUP]` 标记, 命中则剥离标记并置 hangup = true (src/engine/dialogue-engine.ts:42-53). 注意此项不受 minRounds 限制, 因为标记本身就是模拟器的明确意图
2. LLM 拒绝判定: 用裁判模型 (优先于被测模型, src/engine/dialogue-engine.ts:62-66, 98) 以固定 prompt 判定"用户是否明确拒绝继续或要求挂电话", 只回 yes/no, 以 yes 开头即拒绝 (src/engine/dialogue-engine.ts:167-180). 判定调用失败时吞掉异常返回 false, 不中断评测
3. 终止关键词: 中英文关键词表 `["再见", "挂断", "结束", "拜拜", "bye", "goodbye", "hang up", "see you"]` 大小写不敏感匹配 (src/engine/dialogue-engine.ts:13-22, 55-58)

终止原因对应: 挂断或 LLM 判定拒绝 -> `userRefused` (状态机走 userRefusal -> end, src/engine/dialogue-engine.ts:136-139); 关键词命中 -> `userEndedConversation`; 轮数耗尽 -> `maxRoundsReached` (类型定义 src/models/dialogue.ts:12-15).

### Q8: 为什么需要一个对话状态机? 它是怎么设计的?

答:

`DialogueStateMachine` 定义 7 个状态: start / identityCheck / flowExecution / taskComplete / userRefusal / comfortUser / end (src/engine/state-machine.ts:2-10), 合法转移表硬编码在 TRANSITIONS 常量 (src/engine/state-machine.ts:17-27):

```
start          -> identityCheck | flowExecution
identityCheck  -> flowExecution | userRefusal
flowExecution  -> taskComplete | userRefusal | flowExecution (自环)
taskComplete   -> end
userRefusal    -> comfortUser | end
comfortUser    -> end
end            -> (终态)
```

设计要点:

1. `transition(action)` 非法转移直接返回 false 不抛错 (src/engine/state-machine.ts:44-51), 引擎只按主路径驱动 (identityCheck -> flowExecution -> userRefusal -> end), 状态机本身容忍扩展
2. 额外维护 `completedSteps` 集合与 `getCompletionRatio(totalSteps)`, 为流程完成度提供机械统计口径 (src/engine/state-machine.ts:53-66) —— 与 LLM 裁判的 flowCompletion 维度互为补充
3. `reset()` 清空状态、步骤与历史 (src/engine/state-machine.ts:72-76), 引擎每次 runDialogue 前都会 reset (src/engine/dialogue-engine.ts:105), 一个引擎实例可复用跑多组对话
4. `stateHistory` 记录转移轨迹 (src/engine/state-machine.ts:48-49), 便于调试与断言

面试可延伸的点: 这是典型的"显式状态建模 vs 隐式 if-else"取舍 —— 把对话生命周期固化为受检转移表后, 新增 comfortUser (安抚用户) 这类分支状态不会让循环逻辑膨胀.

---

## 三、评测维度与评分聚合

### Q9: 八个评测维度是什么? 权重如何分配?

答:

权威顺序定义在 DIMENSION_KEYS (src/models/evaluation.ts:4-13), 默认权重 (src/models/evaluation.ts:17-27):

| 维度                 | 权重 | 评测内容 (各自 prompt 的 criteria)           |
| -------------------- | ---- | -------------------------------------------- |
| flowCompletion       | 0.30 | 必选步骤是否全部完成、顺序是否正确、执行质量 |
| constraintCompliance | 0.20 | 字数上限 / 禁用短语 / 语气三合一 (见 Q11)    |
| faqAccuracy          | 0.15 | FAQ 回答是否正确、有无误导信息               |
| naturalness          | 0.07 | 是否像真人电话而非机械模板                   |
| intentUnderstanding  | 0.07 | 每轮是否正确理解用户意图、有无答非所问       |
| errorRecovery        | 0.07 | 能否发现用户偏离流程并自然地引导回来         |
| coherence            | 0.07 | 多轮一致性: 不自相矛盾、不遗忘早期信息       |
| infoCompleteness     | 0.07 | 应传达的关键信息是否全部传达、有无遗漏       |

权重必须合计为 1.0, 容差 1e-6, 由 zod refine 强制 (WEIGHT_SUM_TOLERANCE, src/config.ts:16, 33-50), 配错直接启动失败.

空数据短路: faqAccuracy 在任务无 FAQ 时直接满分 (src/evaluator/faq-accuracy.ts:14-16); errorRecovery 在无 flow 时满分 (src/evaluator/error-recovery.ts:14-16), 且 prompt 明确"用户从未偏离流程则给满分"; naturalness 与 constraintCompliance 在无模型发言时满分 (src/evaluator/naturalness.ts:14-16; src/evaluator/constraint-compliance.ts:75-78). 这是"规则不该惩罚不适用项"的评分公平性设计.

### Q10: LLM-as-Judge 的多采样与截尾均值是怎么实现的?

答:

BaseEvaluator.evaluate (src/evaluator/base-evaluator.ts:78-112):

1. 循环调用 `evalCount` 次 (默认 3) `evaluateOnce`, 单次失败不中断, 错误信息收集到 failures (src/evaluator/base-evaluator.ts:84-90)
2. 全部失败: 返回 0 分, 原因写明评估失败及首个错误 (src/evaluator/base-evaluator.ts:92-102) —— 失败显式浮出而不是静默计 0 毒化均值, 这是相对 Python 原版的关键修复
3. 有效样本 >= 3: `trimExtremes` 各去掉一个最高分与最低分 (分数与理由保持配对) 再平均 (src/evaluator/base-evaluator.ts:104-106). trimExtremes 用两次 reduce 找最大/最小索引后 splice, 先删最大再在剩余里删最小 (src/evaluator/base-evaluator.ts:36-55)
4. 部分失败: 保留的样本正常平均, reasons 末尾追加"N 次 judge 调用失败"的说明 (src/evaluator/base-evaluator.ts:108-110)

裁判判决解析 `requestJudgeVerdict` (src/evaluator/base-evaluator.ts:124-134):

- system prompt 末尾追加输出语言指令 (中文模式) (src/i18n/index.ts:29-33)
- 响应先过 `extractJsonObject` 容错提取 (代码围栏/前后缀噪音), 再过 `judgeVerdictSchema` 校验
- schema 用 `z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())])` 兼容裁判把 0.9 输出成 "0.9" 的情况 (src/evaluator/base-evaluator.ts:13-20)
- 分数 clamp 到 [0, 1] (src/evaluator/base-evaluator.ts:28-30, 133)

### Q11: constraintCompliance 维度为什么用规则 + LLM 混合评测?

答:

字数与禁用短语是确定性约束, 用 LLM 判既贵又不可复现, 因此拆成两类 (src/evaluator/constraint-compliance.ts:68-107):

规则部分:

- `evaluateCharLimit`: 统计模型发言中超出 maxChars 的比例, 得分 = 合格数 / 总数 (src/evaluator/constraint-compliance.ts:18-33)
- `evaluateForbiddenPhrases`: 每条发言每命中一个禁用短语记一次违规, 得分 = max(0, 1 - 违规数/发言数), 并汇总实际命中的短语列表 (src/evaluator/constraint-compliance.ts:36-62)

LLM 部分:

- `evaluateTone`: 语气无法规则化, 抽前 3 条模型发言 (TONE_SAMPLE_SIZE = 3, 控制成本) 交给裁判打分 (src/evaluator/constraint-compliance.ts:109-130)

三者加权: 字数 0.4 + 禁语 0.3 + 语气 0.3 (src/evaluator/constraint-compliance.ts:7-9), reasons 按"字数/禁语/语气"分标签拼接. `evaluateCharLimit` / `evaluateForbiddenPhrases` 是导出的纯函数, 可独立单测.

### Q12: 评分如何聚合成总分? 改进建议怎么生成?

答:

Scorer (src/evaluator/scorer.ts):

1. `aggregate`: 按 DIMENSION_KEYS 权威顺序遍历评测 Map 生成 EvaluationScore 数组 (src/evaluator/scorer.ts:34-52). 顺序由类型常量而非 Map 迭代序决定, 报告维度顺序确定 —— 修复了 Python 原版"按完成顺序输出导致每次不一样"的问题 (注释见 src/evaluator/scorer.ts:29-33)
2. `calculateTotal`: sum(rawScore * weight) * 100, 输出 0-100 (src/evaluator/scorer.ts:55-60)
3. `createResult`: rawScore < 0.7 (RECOMMENDATION_THRESHOLD) 的维度生成一条改进建议文案 (src/evaluator/scorer.ts:12, 62-78), 供报告"建议"章节使用
4. HTML 报告同样以 0.7 为及格线着色 (PASS_THRESHOLD, src/report/html-report.tsx:12)

每个维度的 evidence 就是保留样本的裁判理由列表, 报告据此做到"每个分数都有可解释依据".

### Q13: EvaluatorRegistry 如何做并发调度与容错?

答:

src/evaluator/registry.ts:13-54:

1. `evaluateAll` 用 `mapWithConcurrency(evaluators, maxWorkers, task)` 有界并发执行 8 个维度 (src/evaluator/registry.ts:30-51), maxWorkers 默认 4 (src/evaluator/registry.ts:17), 由配置 `evaluation.maxWorkers` 覆盖
2. 单个评测器整体崩溃 (执行抛错) 被捕获, 降级为"0 分 + 错误原因写入 reasons", 不让一次异常毁掉整份报告 (src/evaluator/registry.ts:39-49)
3. 返回 Map<DimensionKey, DimensionEvaluation>, 缺失的维度在 Scorer.aggregate 中被跳过 (src/evaluator/scorer.ts:38-41)

`mapWithConcurrency` 本身 (src/utils/concurrency.ts:5-30) 是一个 worker-pool 实现: 启动 min(limit, items.length) 个 worker, 共享同一个数组迭代器逐个领取任务 (JS 单线程下 entries() 的同步领取保证每个索引只被处理一次), 结果按下标写入预分配数组, 输出顺序与输入一致. 相比"每项一个立即挂起的 Promise + 信号量", 这个实现避免了创建 items.length 个 promise 对象.

---

## 四、LLM 基础设施

### Q14: LLM 层为什么拆成 ChatModel / LLMClient 两层?

答:

三层职责分离 (src/llm/):

| 层          | 文件                         | 职责                                                     |
| ----------- | ---------------------------- | -------------------------------------------------------- |
| 接口        | src/llm/chat-model.ts        | 22 行的最小传输接口: complete(ChatRequest) -> string     |
| OpenAI 适配 | src/llm/openai-chat-model.ts | 调 openai SDK, 错误翻译, 空响应检测, apiKey 回退         |
| 高层客户端  | src/llm/llm-client.ts        | 消息组装 (system + history + user), 限流重试, 参数默认值 |

好处: 换供应商只需新写一个 ChatModel 实现; 测试注入假传输层即可全链路离线跑 (LLMClientOptions.chatModel / sleep 均可注入, src/llm/llm-client.ts:12-15); 重试策略与协议适配互不污染.

错误类型体系 (src/llm/errors.ts): 基类 LLMError, 子类 LLMRateLimitError (429) 与 LLMEmptyResponseError. 适配层 `translateError` 把 OpenAI APIError 中 status === 429 或 message 匹配 /rate.?limit/i 的翻译成 LLMRateLimitError (src/llm/openai-chat-model.ts:31-39), 其余原样上抛.

OpenAIChatModel 细节:

- apiKey 解析顺序: 构造参数 -> `process.env.OPENAI_API_KEY` -> 占位符 "missing-api-key" (发出去会被真实端点以鉴权错误拒绝, 好过静默配错), 缺 key 时 console.warn (src/llm/openai-chat-model.ts:10, 47-60)
- 完成响应中 content 非字符串或为空时抛 LLMEmptyResponseError (src/llm/openai-chat-model.ts:76-82)

### Q15: 重试策略是怎样的? 为什么只重试限流错误?

答:

LLMClient.chat (src/llm/llm-client.ts:69-99):

- 默认最多 5 次尝试 (DEFAULT_MAX_RETRIES = 5), 指数退避 base 1000ms, 即 1s/2s/4s/8s (src/llm/llm-client.ts:29-30, 91-93)
- 只有 LLMRateLimitError 参与重试, 其他错误 (鉴权失败、空响应、参数错) 立即上抛 (src/llm/llm-client.ts:86-89). 理由: 限流是瞬态可自愈的, 而鉴权/配置类错误重试五次只是浪费配额并延迟失败暴露
- 每次调用可传 maxTokens 覆盖客户端级默认 (4096), maxRetries 覆盖默认重试次数 (src/llm/llm-client.ts:22-25)
- sleep 函数可注入, 单测中替换成立即 resolve 即可跑重试分支 (src/llm/llm-client.ts:15, 55)

温度默认值体现了角色差异: 被测模型/模拟用户 0.7 (多样性), 裁判 0.3 (一致性), 分别定义在两个 zod schema 的 default (src/config.ts:22, 27-29).

### Q16: 任务指令是如何从 Markdown 变成结构化数据的?

答:

TaskParser (src/parser/task-parser.ts:145-178) 走"LLM 抽取 + zod 双重校验":

1. `parseFromFile` 读文件, taskId 取文件名去扩展名 (src/parser/task-parser.ts:152-156)
2. 固定的抽取 system prompt ("只回 JSON") + 结构说明 user prompt: 要求输出 role/task/opening_line/flow(step_id/description/required)/faq/constraints(max_chars/tone/forbidden_phrases) 的 snake_case JSON, maxTokens 固定 4096 (src/parser/task-parser.ts:27-62, 159-163)
3. 抽取结果过 `extractedTaskSchema`, 所有字段 nullish 宽容 (LLM 漏字段是常态) (src/parser/task-parser.ts:65-93)
4. `buildTask` 把 snake_case 线格式映射为 camelCase 领域模型并填默认值: stepId 缺省用序号、required 缺省 true、maxChars/tone 缺省 undefined (src/parser/task-parser.ts:97-123)
5. `validateTask` 强制必填: role / task / opening_line / flow 非空, 缺失抛 TaskValidationError 并列出缺失字段 (src/parser/task-parser.ts:125-142)

边界设计: 解析失败抛 TaskParseError 并附 describeError 明细 (src/parser/task-parser.ts:165-172); 抽取 prompt 对 max_chars 给了示例规则 ("at most 15-20 characters" 取 20, src/parser/task-parser.ts:59). 任务文档示例见 data/communicate.md (骑手合同通知外呼任务, 含 Role/Task/Opening Line/Call Flow/Knowledge Points (FAQ)/Constraints 六节, Opening Line 使用 `${rider_name}` 占位符).

### Q17: extractJsonObject 如何从嘈杂的 LLM 输出里抢救 JSON?

答:

裁判模型经常输出 \`\`\`json 围栏或前后加说明文字, 直接 JSON.parse 会挂. src/utils/json.ts:26-61 的策略是候选级联:

1. 原始 trimmed 文本
2. `stripCodeFences` 剥掉首行 \`\`\` 与尾行 \`\`\` 后的文本 (src/utils/json.ts:8-20)
3. 对上述每个候选, 再取第一个 `{` 到最后一个 `}` 的最大切片 (容忍前后缀噪音)
4. 依序尝试 JSON.parse, 第一个解析成功且为非数组对象的胜出
5. 全部失败抛 JsonExtractionError, 错误信息附 120 字符预览 (PREVIEW_LENGTH, src/utils/json.ts:6, 56-60)

注意"最宽切片"策略的隐含权衡: 若模型输出里嵌了多段 `{...}`, 宽切片可能解析失败, 此时靠候选级联回退到其他候选.

---

## 五、报告生成与国际化

### Q18: Markdown 报告包含哪些内容? 有哪些防破坏处理?

答:

MarkdownGenerator 提供 generate (单结果) 与 generateBatch (多画像合并) 两个入口 (src/report/markdown-generator.ts:33-203). batch 报告结构:

1. 概览表: 画像 / 总分 / flowCompletion / constraintCompliance / faqAccuracy 五列 (src/report/markdown-generator.ts:113-132), 附平均分
2. 维度证据: 每画像每维度列出保留样本的裁判理由 (src/report/markdown-generator.ts:145-168)
3. 对话转写: 每组对话一张表 (轮次/角色/内容/备注), 轮次号按模型发言递增 (src/report/markdown-generator.ts:11-30, 170-185)
4. 改进建议: 跨画像去重 (Set) 后按字典序输出 (src/report/markdown-generator.ts:187-199)

防破坏: `escapeMarkdownTableCell` 把 `|` 转义为 `\|`、换行压成空格, 保证对话内容里的竖线和换行不会撑破表格 (src/report/common.ts:32-34).

文件命名: `timestampedPath` 在扩展名前插入 `_YYYYMMDD_HHMMSS` (如 evaluation_report_20260825_161730.md), 无扩展名则直接追加 (src/pipeline/generate-reports.ts:15-21); 输出目录 mkdir recursive, 两个报告路径都保证存在 (修复 Python 原版只为 Markdown 建目录的问题, src/pipeline/generate-reports.ts:36-39).

### Q19: HTML 报告为什么用 React SSR? 安全上做了什么?

答:

HtmlGenerator.generateBatch 空结果渲染占位页, 否则调 `renderHtmlReport(results, now())` (src/report/html-generator.ts:19-26). html-report.tsx 用 `renderToStaticMarkup` 把 React 组件渲染成静态标记 (src/report/html-report.tsx:2, 457-472), 产物是打开即用的自包含 HTML.

技术细节:

1. Chart.js 4.5.0 从 jsdelivr CDN 加载并带 SRI integrity 校验 (版本锁定防供应链漂移), Tailwind 走 @tailwindcss/browser@4 CDN; Tailwind 无法表达的主题规则 (details 折叠箭头、打印样式、prefers-reduced-motion) 写在 `type="text/tailwindcss"` 的 THEME_CSS 里, 含完整设计令牌 (@theme 颜色/字体族) (src/report/html-report.tsx:14-18, 26-52)
2. 每组对话一个雷达图: 图表数据以 JSON payload 塞进隐藏 DOM 节点 (CHART_DATA_ID, src/report/html-report.tsx:19, 426), 内联 bootstrap 脚本从节点读数据初始化 canvas (CHART_BOOTSTRAP, src/report/html-report.tsx:58-111); 脚本是纯静态文本不含插值数据, 所以内联安全
3. 全部用户可控文本 (对话内容、裁判理由) 以 JSX 文本节点插值, `renderToStaticMarkup` 序列化时自动转义 & < >, 防止对话内容注入脚本; 雷达图 JSON payload 额外把 < 转义为 \u003c, 防止内容里的 </script> 提前终止脚本上下文 (src/report/html-report.tsx:117-133) —— 修复 Python 原版的未转义插值. `escapeHtml` (src/report/common.ts:22-29) 作为纯函数从 index.ts 导出, 但 SSR 路径并不调用它
4. 维度得分以 0.7 为及格线着色, 与推荐建议阈值一致 (PASS_THRESHOLD, src/report/html-report.tsx:12)
5. 转写用 details/summary 组织, 默认带 open 属性展开、可点击折叠收起, summary 行附终止原因与轮数 (src/report/html-report.tsx:278-309)

为什么用 React 而不是模板字符串: 8 维度 x 多画像的卡片/表格/雷达图嵌套结构, 组件化比字符串拼接可维护; 且 react/react-dom 是运行时依赖而非 devDependency, 原因即 SSR 需要 (package.json).

### Q20: 双语 (i18n) 是怎么实现的? 为什么不用 i18n 库?

答:

自实现的极简全局 locale (src/i18n/index.ts):

1. 模块级可变状态 `currentLanguage` (默认 "en"), `configureI18n` 设置, `getMessages` 按 locale 返回 ZH_MESSAGES 或 EN_MESSAGES (src/i18n/index.ts:8-23)
2. Messages 接口不只是静态文案: 函数属性承担参数化文案 (如 `recommendation(label)`、`charLimitViolationReason(violations, total, maxChars)`、`dimensionHeading(...)`), 两套目录 (zh/en) 由同一接口约束, 共 212 行 (src/i18n/messages.ts:8-76)
3. 双语覆盖两个面: 报告文案 (标题/表头/标签/终止原因) 与 LLM 输出语言 —— `withOutputLanguageDirective` 在中文模式下给所有 system prompt 追加 "Please respond in Simplified Chinese throughout.", 英文模式原样返回 (src/i18n/index.ts:6, 29-33). 裁判理由、模拟用户发言因此能跟随配置语言
4. 连行为数据都本地化: 占位符采样名 sampleRiderNames 中英文各一套 (src/i18n/messages.ts:139, 211)

不用 i18next 等库的理由: 无运行时切换 UI 的需求 (locale 在进程启动时定死), 消息要跨"文案"与"prompt 指令"两种用途, 引库收益为负.

---

## 六、工程化与质量

### Q21: 配置系统如何校验? 有哪些默认值?

答:

config.yaml (camelCase 键) -> `load` (js-yaml) -> zod schema 链式校验 (src/config.ts:105-143), 任何一步失败抛 ConfigError 并带 prettifyError 明细.

关键 schema 与默认值:

| 配置项                       | 默认                          | 约束                              |
| ---------------------------- | ----------------------------- | --------------------------------- |
| llm.model                    | 必填                          | min(1)                            |
| llm.temperature              | 0.7                           | [0, 2]                            |
| llm.maxTokens                | 4096                          | 正整数                            |
| evaluatorLlm                 | 可选                          | 缺省回退整个 llm 节; 温度默认 0.3 |
| evaluation.evalCount         | 3                             | >= 1 整数                         |
| evaluation.maxWorkers        | 4                             | >= 1 整数                         |
| evaluation.maxDialogueRounds | 30                            | >= 1 整数                         |
| evaluation.minDialogueRounds | 4                             | >= 0 整数                         |
| evaluation.weights           | 内置权重表                    | 8 维合计 = 1.0 (容差 1e-6)        |
| output.markdownPath          | output/evaluation_report.md   | min(1)                            |
| output.htmlPath              | output/evaluation_report.html | min(1)                            |
| language                     | en                            | enum ["zh", "en"]                 |

zod v4 特性 `prefault` 用于 evaluation/output 整节缺省 (src/config.ts:68-69); dotenv 在 CLI 入口最先 import, 兼容 .env 里的 OPENAI_API_KEY (src/main.ts:2).

### Q22: 并发模型是怎样的? 哪些环节是串行的?

答:

三层结构:

1. 画像间: 串行 for 循环 (src/pipeline/run-evaluation.ts:53) —— 评测是重 IO 长任务 (每画像最多 30 轮, 每轮模型与模拟用户各至多一次 LLM 调用, minRounds 后每轮还可能叠加一次拒绝判定), 串行可控且日志可读
2. 维度间: mapWithConcurrency 并发, maxWorkers 默认 4 (src/evaluator/registry.ts:17)
3. 维度内: evalCount 次采样串行 for 循环 (src/evaluator/base-evaluator.ts:84), 避免单维度瞬时并发放大限流概率; 限流兜底由 LLMClient 指数退避负责

整体是"粗粒度串行 + 细粒度受控并发"的典型 IO 密集型编排.

### Q23: 项目的可测试性设计体现在哪里?

答:

测试现状: tests/ 下 14 个测试文件 99 个用例, `npx vitest run` 全绿 (fakes.ts 为公共假件, 不计测试文件).

可测试性来源 (全是构造函数/参数级依赖注入, 无全局 mock 需求):

1. LLMClient 注入 chatModel (假传输) 与 sleep (立即 resolve), 测重试与消息组装 (src/llm/llm-client.ts:12-15)
2. DialogueEngine 注入 random (占位符采样) 与 now (时间戳), 对话循环可复现 (src/engine/dialogue-engine.ts:69-72)
3. 报告生成器注入 now, 报告头时间确定 (src/report/markdown-generator.ts:6-9)
4. 纯函数下沉: evaluateCharLimit / evaluateForbiddenPhrases (规则评测)、trimExtremes (统计)、extractJsonObject (解析)、mapWithConcurrency (并发)、resolvePlaceholders / parseHangupSignal (引擎辅助) 全部独立导出可直接单测
5. TaskParser 提供 parseFromText 绕过文件系统 (src/parser/task-parser.ts:158)
6. 错误信息结构化: TaskValidationError.missingFields 数组 (src/parser/task-parser.ts:16-25), describeError 统一 ZodError -> prettifyError (src/utils/errors.ts:4-10), 断言友好

### Q24: 构建与工具链是怎么配置的?

答:

- 构建: tsup, 双入口 src/index.ts (库) + src/main.ts (CLI), 纯 ESM, target node22, 带 d.ts 与 sourcemap (tsup.config.ts; CLI 入口含 shebang, src/main.ts:1). dts 编译器选项里 `ignoreDeprecations: "6.0"` 是因为 tsup 的 dts worker 会注入 TypeScript 6 已废弃的 baseUrl (tsup.config.ts 注释)
- 运行: `pnpm eval` 即 `node dist/main.js` (package.json scripts)
- 质量门: `pnpm typecheck` (tsc --noEmit)、`pnpm test` (vitest run)、`pnpm check` (biome check --write)、`pnpm format` (biome format)
- 依赖面: 运行时 6 个直接依赖 (openai ^7.5.0 / zod ^4.4.3 / js-yaml ^5.3.0 / dotenv ^17.4.2 / react ^19.2.8 / react-dom ^19.2.8), devDependency 侧 typescript ^6.0.3 / vitest ^4.1.11 / tsup ^8.5.1 / biome ^2.5.10 (package.json); 包为 private, 未发布
- Node 内置 parseArgs 替代 commander/yargs: CLI 面积小到不值得引依赖 (src/main.ts:26-33)

### Q25: 相比 Python 原版修复了哪些缺陷? (迁移价值题)

答:

README.md Migration notes 逐条列出的修复, 均可在代码中指认对应实现:

| Python 原版缺陷                      | TS 版修复与代码位置                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTML 报告只渲染第一个画像的得分      | generateBatch 全量渲染, 每画像独立得分卡/维度表/雷达图 (src/report/html-generator.ts:19-26)                                                                                                                                    |
| 裁判调用失败静默计 0 分毒化均值      | 失败样本剔除, 失败原因浮出到 evidence (src/evaluator/base-evaluator.ts:84-110)                                                                                                                                                 |
| Markdown 围栏 JSON 解析失败          | extractJsonObject 候选级联 (src/utils/json.ts:26-61)                                                                                                                                                                           |
| 达到轮数上限时多生成一条被丢弃的回复 | 循环结构保证最后一轮 user 回复后即检查终止 (src/engine/dialogue-engine.ts:114-145)                                                                                                                                             |
| 拒绝检测用被测模型自审               | refusalJudge 独立注入裁判客户端 (src/engine/dialogue-engine.ts:62-66; src/pipeline/run-evaluation.ts:57)                                                                                                                       |
| 报告维度顺序不确定 (按完成顺序)      | Scorer 按 DIMENSION_KEYS 权威顺序聚合 (src/evaluator/scorer.ts:34-52)                                                                                                                                                          |
| 画像概率字段是死配置                 | 百分比注入模拟器 prompt (src/simulator/user-simulator.ts:13-18)                                                                                                                                                                |
| 仅支持 ${rider_name} 占位符          | resolvePlaceholders 通用 ${name} + placeholders 注入 (src/engine/dialogue-engine.ts:31-39)                                                                                                                                     |
| 库代码里 sys.exit()                  | 类型化错误上抛, CLI 边界统一处理 (src/main.ts:82-85)                                                                                                                                                                           |
| 报告插值未转义 (XSS/表格破坏)        | HTML 侧靠 React SSR 文本自动转义 + 图表 JSON 转义 < (src/report/html-report.tsx:117-133); Markdown 单元格 escapeMarkdownTableCell (src/report/common.ts:32-34); Chart.js CDN 版本锁定 + SRI (src/report/html-report.tsx:14-17) |
| 输出目录只为 Markdown 创建           | 两个报告路径都 mkdir recursive (src/pipeline/generate-reports.ts:36-39)                                                                                                                                                        |

回答思路提示: 这道题考察的是"迁移不是翻译" —— 每条修复都是先定位原版的行为缺陷, 再用 TS 的类型系统 (zod 边界校验)、错误类型体系与依赖注入固化下来.

---

## 附: 快速事实卡

| 事实          | 值                                                                  |
| ------------- | ------------------------------------------------------------------- |
| 包名          | @swifty.js/eval (private, 未发布)                                   |
| 入口          | 库 src/index.ts; CLI src/main.ts (dist/main.js)                     |
| 画像数        | 6 (src/simulator/profiles.ts:10-95)                                 |
| 评测维度      | 8 (src/models/evaluation.ts:4-13)                                   |
| 默认权重大头  | flowCompletion 0.30 / constraintCompliance 0.20 / faqAccuracy 0.15  |
| 默认采样/并发 | evalCount 3 / maxWorkers 4 (src/config.ts:53-54)                    |
| 对话轮上限    | 30, 拒绝检测激活门槛 minRounds 4 (src/config.ts:55-56)              |
| 重试          | 仅限流错误, 最多 5 次, 指数退避 1s 起 (src/llm/llm-client.ts:29-30) |
| 测试          | 14 文件 99 用例, vitest 全绿                                        |
| 报告          | Markdown + React SSR HTML (Chart.js 4.5.0 雷达图, SRI 锁定)         |
| 示例任务      | data/communicate.md (骑手合同通知外呼), data/communicate2.md        |
