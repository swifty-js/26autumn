# Codex Goals 使用指南：为什么 `/goal` 比"继续做"更强

> 来源：https://xaicontrol.com/blog/codex-goals-guide/
> 基于 OpenAI 官方《Using Goals in Codex》与 Codex CLI 文档整理，检查日期 2026-05-19。

## 先看结论（1 分钟版）

1. `/goal` 不是普通 prompt 的加强版，而是一种"持续有效的目标契约"。
2. 它最适合"终点明确，但路径不确定"的任务，比如性能优化、flaky test 排查、依赖迁移、复杂重构、研究复现。
3. Goals 从 Codex `0.128.0` 开始可用。
4. `/goal` 目前是实验性 CLI 功能，需要启用 `features.goals`。
5. 一个强 Goal 至少要写清楚 6 件事：结果、验证方式、约束、边界、迭代策略、阻塞停止条件。
6. Goal 的"完成"必须靠证据判断，不是靠模型觉得"大概好了"。

## 一、Goal 到底是什么

Goal 是 Codex 中的持久化目标，会让当前线程跨多个 turn 持续朝某个确定结果推进。

```
不是"下一步做什么"
而是"在什么条件成立之前，不要停"
```

普通 prompt 更像一次临时指令：

```
修一下这个测试
```

而 Goal 更像一个可持续追踪的完成条件：

```
/goal 让 checkout 测试在当前分支通过，同时不改变公开 API 行为
```

## 二、Goal 和普通 Prompt 的区别

```
Prompt: ask -> work -> result -> wait
Goal:   work -> check -> continue or complete
```

- **普通 prompt**：Codex 按当前指令做一轮，给你结果，然后停下等你下一句。
- **Goal**：Codex 做完一轮之后，会回头检查"目标是否已经满足"；如果还没有，而且 Goal 仍处于激活状态、预算也没用完，它就可以继续推进。

适合的任务特征——下一步动作取决于刚刚得到的证据：

- 先跑测试，再决定下一步怎么修
- 先跑 benchmark，再决定该改哪里
- 先复现实验，再决定还能不能继续逼近结果

## 三、什么时候该用 `/goal`

**判断标准：当任务的终点很明确，但达到终点的路径还不明确时，就适合用 Goal。**

### 适合的任务

- 性能优化
- flaky test 调查
- 依赖迁移
- 需要先复现再修的 bug 排查
- 多步骤重构
- benchmark 驱动的调优
- 需要最终产物的研究型任务

### 不适合的任务

- 改一段文案
- 补一个小注释
- 解释某个函数
- 改一个明确的小错误

一句话区分：

- **一次做完就结束**：用普通 prompt
- **需要"做一轮、检查、继续、再检查"**：用 Goal

## 四、怎么启用和使用 `/goal`

### 1. 先确认版本

Goals 从 Codex `0.128.0` 开始可用。

```bash
npm install -g @openai/codex@latest
codex --version
```

或：

```bash
brew update
brew upgrade codex
codex --version
```

### 2. 启用 goals 功能

在 Codex 里打开 `/experimental`，或在 `config.toml` 中启用：

```toml
[features]
goals = true
```

### 3. 基本命令

```
/goal <objective>   设置目标
/goal               查看当前目标
/goal pause         暂停目标
/goal resume        恢复目标
/goal clear         清除目标
```

示例：

```
/goal Reduce p95 latency below 120 ms without regressing correctness tests
```

边界限制：

- Goal 内容不能为空
- 最长不超过 4000 个字符
- 如果说明太长，把细节放进文件，再让 Goal 指向那个文件

## 五、一个强 Goal 应该怎么写

一个好 Goal 不是更长的 prompt，而是一份紧凑的工作契约。最强的 Goal 通常定义 6 件事：

1. **Outcome**：完成时什么结果应该成立
2. **Verification surface**：用什么证据验证它真的完成了
3. **Constraints**：什么东西不能被破坏或退化
4. **Boundaries**：允许动哪些文件、工具、数据或资源
5. **Iteration policy**：每一轮之后，Codex 应该如何决定下一步
6. **Blocked stop condition**：什么情况下应该停止，并报告当前已经无路可走

这 6 点解决的是 AI 长任务最常见的三个问题：

- 到底算不算做完
- 能不能为了达到目标把别的东西搞坏
- 如果做不下去了，应该怎么诚实停下来

### 可直接套用的 Goal 模板

```
/goal <最终结果>，通过 <具体证据> 验证，同时保持 <约束条件> 不退化。
只使用 <允许的文件/工具/边界>。
每轮之后，根据 <迭代策略> 决定下一步。
如果被阻塞或在当前限制下已无有效路径，停止并报告 <已尝试路径>、<证据>、<阻塞点> 和 <下一步需要的输入>。
```

## 六、把弱 Goal 改成强 Goal

### 弱写法

```
/goal Improve performance
```

问题：没有明确指标、没有验证方式、没有约束条件。

### 强写法

```
/goal Reduce p95 checkout latency below 120 ms on the checkout benchmark while keeping the correctness test suite green
```

多了 3 个关键点：

- **结果**：p95 低于 120ms
- **验证面**：checkout benchmark
- **约束**：正确性测试必须继续为绿

### 更完整的写法

```
/goal Reduce p95 checkout latency below 120 ms, verified by the checkout benchmark, while keeping the correctness suite green. Use only the checkout service, benchmark fixtures, and related tests. Between iterations, record what changed, what the benchmark showed, and the next best experiment to try. If the benchmark cannot run or no valid paths remain, stop with the attempted paths, the evidence gathered, the blocker, and the next input needed.
```

## 七、Goal 激活后，Codex 会发生什么变化

### 1. 目标会持续可见

如果 Codex 跑了一轮测试但失败了，线程里仍然保留着原来的终点。不会因为中间出现一次失败就丢掉目标本身。

### 2. 空闲线程可以继续推进

Goal 激活后，只要线程空闲、没有新的用户输入排队、也没有别的待处理工作，而且 Goal 仍处于激活状态并且没超预算，它就可以继续。

官方设计是保守的，不是无限循环。Codex 只会在安全边界上考虑继续：

- 一个 turn 已经结束
- 当前线程空闲
- 没有待处理的新输入
- 没有其他挂起工作

### 3. 完成必须靠证据

Goal 不应该因为模型觉得"差不多了"就结束。它应该在检查过这些东西之后再判断是否完成：

- 修改过的文件
- 运行过的命令
- 测试结果
- benchmark 输出
- 生成的 artifact
- 研究证据

Goal 的本质不是"自动继续"，而是**带证据地持续推进**。

## 八、Goal 不是全局记忆，而是线程级契约

Goal 是持久化的线程状态，不是全局记忆，也不是项目级说明。

- 它属于当前 thread
- 它跟着当前线程里的上下文走
- 它依赖这个线程已经看过的文件、跑过的命令、见过的日志和形成的推理链路

```
Goal = 当前线程内持续有效的完成契约
```

不是：

```
Goal = 全局长期记忆
```

## 九、普通用户最容易犯的 4 个错误

### 1. 把 Goal 写成口号

```
/goal Improve the system
```

几乎没法验证，也没法决定什么时候停。

### 2. 只写结果，不写验证方法

如果你说"把性能搞好"，但不说看哪份 benchmark，Codex 很难知道完成条件。

### 3. 不写约束

比如只说"把测试修好"，却没说"不要改公开 API 行为"，那 Codex 可能会通过一种你并不接受的方式达成目标。

### 4. 没有 blocked stop condition

很多人会写"继续做直到完成"，但不写"如果做不下去该怎么停"。这会导致：

- 要么过早停下
- 要么在没有新证据的情况下瞎转

Goal 应该定义"无可辩护路径时如何停止并汇报"。

## 十、3 个适合直接抄的 Goal 场景

### 1. 性能优化

```
/goal Reduce p95 latency below 120 ms on the checkout benchmark while keeping the correctness suite green
```

### 2. flaky test 排查

```
/goal Make the checkout test suite pass on the current branch without changing public API behavior. Verify with the current test suite and failure logs. Use only the checkout service, related tests, and local reproduction steps. If no defensible fix remains, stop with attempted fixes, evidence, blocker, and the next input needed.
```

### 3. 文档产物生成

```
/goal Produce a docs page for Goals that explains the lifecycle, command surface, and two examples. Verify that the page builds locally and that all referenced commands match the current CLI behavior.
```

Goal 并不只适合改代码。只要有明确结果、明确验证方式、明确边界，它也可以用于文档、报告、研究和其他复杂产物。

## 十一、如果你不会写 Goal，先让 Codex 帮你起草

1. 先用人话描述任务
2. 再让 Codex 帮你把它改写成强 Goal

```
Help me turn this into a strong `/goal`: I want Codex to keep working on this flaky checkout test until we either fix it with evidence or can clearly explain what is blocking progress.
```

让 Codex 先给你起草一版，再由你补强 success condition、verification surface、constraints、blocked stop condition，通常会比一开始自己硬写更稳。

## 总结

普通 prompt 是让 Codex 做一步，Goal 是让 Codex 对着验收标准持续做下去。

真正让 `/goal` 变强的三个关键词：

- **持续目标**
- **线程作用域**
- **证据完成**

## 相关链接

- OpenAI 官方 cookbook：https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- OpenAI 官方 CLI slash commands：https://developers.openai.com/codex/cli/slash-commands
