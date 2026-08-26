# Loop Engineering 完全指南 — 从概念到实践

> 来源：https://muximxc.github.io/loop-engineering-guide/
> 内容基于 Addy Osmani、Anthropic、OpenAI 等公开资料整理。2026 年硅谷最火概念。

## 长文：Loop Engineering — AI 协作的下一个十年

想象一下这个场景：你是一位产品经理，每天早上打开电脑，AI 已经帮你整理好了昨天的用户反馈、生成了待办事项清单、甚至起草了今天需要跟进的邮件。你不需要逐条告诉 AI "请做这个"、"请做那个"——你设计了一个系统，这个系统会自动发现工作、分配任务、检查结果，然后决定下一步该做什么。

这就是 Loop Engineering（循环工程）的核心理念。

### 从一个简单的类比开始

假设你是一位餐厅老板。在传统的经营方式中，你每天需要亲自告诉厨师做什么菜、告诉服务员接待哪些客人、告诉采购员买什么食材——这就是手动管理。

而 Loop Engineering 就像是：你设计了一套标准操作流程（SOP）。每天早上，系统会自动检查库存、根据预订情况生成菜单、分配工作任务。厨师、服务员、采购员按照流程自动运转，而你只需要在关键节点做决策和审核。

在 AI 的世界里，这个"系统"就是 Loop（循环）——一个能够自主发现工作、提示 AI 代理、检查结果、记录状态的自动化流程。

### 从 Prompt Engineering 到 Loop Engineering

**第一阶段：Prompt Engineering（提示工程）**

大约从 2022 年到 2024 年，我们与 AI 交互的主要方式是"写好提示词"。你精心构思一条指令，发送给 ChatGPT 或 Claude，它给你一个回复。然后你根据回复，再写下一个提示。这个过程就像是在和一位需要详细指导的实习生对话——每一步都需要你的参与。

**第二阶段：Agentic Engineering（代理工程）**

2024 年到 2025 年，AI 代理（Agent）出现了。这些代理不仅能回答问题，还能执行操作——读取文件、运行代码、提交代码。但本质上，你仍然是在和代理进行一轮一轮的对话，每一轮都需要你的输入。

**第三阶段：Loop Engineering（循环工程）**

2026 年，一个新的概念在硅谷迅速传播。它的核心思想是：你不再逐条提示 AI，而是设计一个系统来自动完成这件事。

> "你不应该再手动提示编码代理了。你应该设计循环来提示你的代理。"
> —— Peter Steinberger，知名 iOS 开发者

> "我不再手动提示 Claude 了。我运行的是循环系统。我的工作就是写循环。"
> —— Boris Cherny，Anthropic Claude Code 负责人

### Loop Engineering 到底是什么？

用最简单的话说：Loop Engineering 是设计一个系统，让这个系统代替你来自动提示 AI 代理。

一个"循环"（Loop）可以被理解为一个递归目标：你定义一个目的，然后让 AI 迭代执行，直到任务真正完成。这个系统会：

1. **发现工作**——自动扫描你的项目，找出需要处理的事项
2. **分配任务**——把发现的工作交给合适的 AI 代理
3. **检查结果**——验证 AI 代理的输出是否符合预期
4. **记录状态**——把完成和未完成的事项记录下来
5. **决定下一步**——根据当前状态，决定接下来该做什么

然后，这个循环会自动重复——每天、每小时，或者按照你设定的时间表运行。

### 为什么这个概念现在才火？

Loop Engineering 的概念之所以在 2026 年爆发，是因为工具终于跟上了理念。

一年前（2025 年），如果你想搭建一个 Loop，你需要写一大堆 Bash 脚本，自己维护，而且只有你自己能看懂。这门槛太高了。

但现在，主流 AI 编码工具已经把 Loop 的核心组件内置到了产品里：

- **Anthropic Claude Code** 提供了 /goal、/loop、子代理（Sub-agents）、技能（Skills）等功能
- **OpenAI Codex** 提供了自动化（Automations）、/goal、子代理、工作树（Worktrees）等功能
- **MCP（Model Context Protocol）** 成为了连接 AI 与外部工具的标准协议

正如 Addy Osmani（Google Chrome 工程师，Loop Engineering 概念的推广者）所说："一旦你注意到这些工具的形状是相同的，你就不会再争论哪个工具更好——你只需要设计一个无论坐在哪个工具里都能工作的循环。"

### Loop Engineering 的六大组件

#### 1. Automations（自动化）—— 循环的心跳

自动化是让 Loop 真正成为"循环"的关键。没有自动化，Loop 就只是你手动运行一次的任务。

你可以把它理解为"定时任务"——比如每天早上 9 点，自动扫描昨天的 CI 失败记录、整理未解决的 Issue、生成今日待办。或者当你提交代码时，自动触发代码审查、运行测试、检查代码风格。

在 Claude Code 中，这通过 /loop 命令实现；在 OpenAI Codex 中，这通过 Automations 标签页配置。

#### 2. Worktrees（工作树）—— 并行不冲突

当你同时运行多个 AI 代理时，它们可能会修改同一个文件——这就像两个工程师同时编辑同一段代码，没有沟通，结果一团糟。

Worktree 是 Git 的一个功能，它允许你在同一个仓库上创建多个独立的工作目录。每个代理在自己的 Worktree 里工作，互不干扰。完成后，再把修改合并回来。

类比：就像餐厅里每个厨师有自己的操作台，不会互相抢锅。

#### 3. Skills（技能）—— 项目知识编码

每次启动 AI 代理时，它都是"一片空白"的——它不知道你的项目用什么框架、有什么约定、之前发生过什么坑。

Skills 就是把项目知识写成文档，让 AI 每次运行时都能读到。比如："我们使用 React + TypeScript"、"不要修改 generated/ 目录下的文件"、"提交前必须跑测试"。

这些知识被保存在 SKILL.md 文件中，AI 会自动加载。这样你就不需要每次重复解释同样的事情。

#### 4. Plugins / Connectors（插件与连接器）—— 接入真实世界

一个只能读写文件的 AI 代理，能力非常有限。Plugins 和 Connectors 让 AI 能够接入你日常使用的工具——比如读取 JIRA 上的任务、查询数据库、发送 Slack 消息、检查 Sentry 错误报告。

这些连接器基于 MCP（Model Context Protocol）标准，这是 2024 年底 Anthropic 推出的开放协议，现在已经被 OpenAI、Google、Microsoft 等主流厂商支持。

类比：就像给 AI 装上了"手脚"，让它不再只是"说说而已"，而是真正能在你的工具链里操作。

#### 5. Sub-agents（子代理）—— 分工与制衡

让写代码的 AI 自己来检查代码质量，就像让学生自己批改自己的作业——它往往会对自己太宽容。

Sub-agents 的核心思想是"制造者"与"检查者"分离。一个代理负责写代码，另一个代理负责审查代码，还有一个代理负责写测试。它们各自独立运行，最后把结果汇总。

在 Claude Code 中，你可以定义 .claude/agents/ 目录下的代理角色；在 Codex 中，你可以用 /spawn 命令启动子代理。

#### 6. Memory（持久记忆）—— 跨会话的记忆

AI 代理有一个致命弱点：每次会话结束后，它就会忘记一切。就像金鱼一样，7 秒记忆。

Memory 就是解决这个问题的方法——把重要的信息保存在磁盘上（比如 Markdown 文件、Linear 看板、数据库），而不是依赖 AI 的上下文记忆。

常见的做法包括：维护一个 AGENTS.md 或 TODO.md 文件，记录已完成和待办的事项；或者把状态同步到项目管理工具。

这样，即使 AI 代理"失忆"了，它也能从文件中读取之前的状态，继续工作。

### Loop Engineering 与 Prompt Engineering 的本质区别

| 维度     | Prompt Engineering         | Loop Engineering          |
| -------- | -------------------------- | ------------------------- |
| 核心动作 | 优化单次手动指令           | 设计自动运行的系统        |
| 交互方式 | 你 → 提示 → AI → 回复 → 你 | 你设计系统 → 系统自动运行 |
| 时间维度 | 单次、即时                 | 持续、周期性              |
| 人的角色 | 每次都在驾驶座上           | 设计路线，偶尔检查        |
| 杠杆点   | 单条提示的质量             | 系统设计的质量            |
| 适用场景 | 一次性任务、探索性工作     | 重复性工作、长期项目      |

### Loop Engineering 不是什么？

Loop Engineering 不是"让 AI 完全自主，人什么都不管"。

Addy Osmani 反复强调："设计循环。但像一位打算继续做工程师的人那样设计它，而不是像一位只想按'开始'按钮的人。"

Loop Engineering 改变了工作的形式，但没有消除人的责任。三个问题实际上会随着 Loop 变得更好而变得更加尖锐：

1. **验证仍然是你的责任。** 无人值守运行的 Loop，也会无人值守地犯错。子代理的审查只能降低风险，不能消除风险。
2. **理解力会退化。** Loop 产出代码的速度越快，你实际理解这些代码的速度可能越慢。如果不主动阅读 Loop 的产出，你会逐渐失去对项目的掌控。
3. **认知投降是最危险的。** 当 Loop 自动运行时，很容易停止思考，接受它给的一切。Addy Osmani 称之为"认知投降"——用 Loop 来避免思考，和用 Loop 来提升思考，是同一个动作，但结果完全相反。

### 对非技术人员的意义

Loop Engineering 的核心思想——"设计系统，而非逐条执行"——是一种通用的工作哲学。它可以应用在任何需要重复决策和执行的领域：

- **内容运营**：设计一个 Loop，自动监控热点话题、生成选题建议、起草初稿、安排发布时间
- **客户服务**：设计一个 Loop，自动分类客户咨询、分配给合适的处理人、跟踪处理进度、提醒超时事项
- **数据分析**：设计一个 Loop，定期拉取数据、生成报表、标记异常、发送给相关人员

你不需要写代码来实现这些。越来越多的无代码/低代码工具正在集成 Loop 的理念。关键是思维方式的转变：从"我来做"到"我设计一个系统来做"。

### 写在最后

Loop Engineering 代表了 AI 协作方式的范式转移。

从手动提示每一条指令，到设计一个自动运行的系统——这个转变的杠杆效应是巨大的。正如 Boris Cherny 所说："这不是工作变简单了，而是杠杆点转移了。"

但请记住：Loop 是工具，你是工程师。设计一个好的 Loop，比写一条好的 Prompt 更难——因为它要求你思考得更系统、更全面。

---

## 进阶课程

五章深入内容，从哲学到实践，从理论到代码。

---

## 第 1 章：Loop Engineering 的哲学与演变

### 1.1 从"对话"到"系统"

人类与 AI 的交互方式，正在经历第三次重大转变。

**第一次转变：从搜索到对话（2022）**

ChatGPT 的发布让普通人第一次体验到"和 AI 对话"。你问一个问题，它给你一个答案。这种交互方式如此自然，以至于在短短几个月内，数亿人开始使用它。

**第二次转变：从对话到代理（2024）**

AI 不再只是回答问题，它开始执行操作。Claude Code、GitHub Copilot Agent、Cursor 等工具让 AI 能够读取代码库、运行测试、提交修改。但交互方式仍然是"对话"——你发一条消息，AI 执行一系列操作，然后停下来等你下一条消息。

**第三次转变：从代理到循环（2026）**

Loop Engineering 的核心洞察是：对话式的交互方式有一个根本性的瓶颈——它要求人类在每一轮都参与。当任务变得复杂、需要多轮迭代时，这个瓶颈变得非常明显。

#### 什么是"Open-Loop"和"Closed-Loop"？

这两个术语来自控制论（Cybernetics），后来被引入 AI 领域。

- **Open-Loop（开环）**：系统执行操作，但不根据结果调整。就像你按下一个开关，灯亮了，但开关不会关心灯是否真的亮了。传统的自回归 Transformer 就是开环的——它生成一个 token，然后基于这个 token 生成下一个，但从不"回头检查"之前生成的内容是否正确。
- **Closed-Loop（闭环）**：系统执行操作，观察结果，然后根据结果调整下一步行动。就像恒温器：它测量室温，如果太冷就打开暖气，然后继续测量，形成一个循环。Loop Engineering 就是要把 AI 的工作方式从"开环"变成"闭环"。

2025 年底的一篇论文 "Closed-Loop Transformers: Autoregressive Modeling as Iterative Latent Equilibrium" 从学术角度论证了这一点：标准的 Transformer 在每个隐藏状态上只做一次前向传播，从不修正，这导致了错误在序列中累积。而"闭环 Transformer"通过迭代优化隐藏状态，直到达到自洽的平衡态，才继续生成下一个 token。

### 1.2 关键人物与里程碑

| 时间          | 事件                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2024 年 11 月 | **MCP 协议发布** — Anthropic 发布 Model Context Protocol，为 AI 与外部工具的连接建立开放标准。                                          |
| 2025 年 2 月  | **Harness Engineering 概念提出** — Mitchell Hashimoto 提出"Harness Engineering"——围绕 AI 模型构建 harness（harness = 模型之外的一切）。 |
| 2025 年 10 月 | **Claude Code Skills 发布** — Anthropic 推出 Skills 功能，允许用户将项目知识编码为可复用的模块。                                        |
| 2026 年 2 月  | **Claude Code Agent Teams 发布** — Anthropic 推出多代理团队功能，多个 Claude 实例可以并行协作。                                         |
| 2026 年 4 月  | **OpenAI Codex 重大更新** — Codex 加入 /goal、subagents、MCP 支持，与 Claude Code 形成直接竞争。                                        |
| 2026 年 6 月  | **Loop Engineering 概念推广** — Addy Osmani 发表博客文章，系统性地总结和命名了 Loop Engineering 这一范式。                              |

### 1.3 相关概念辨析

#### Loop Engineering vs Vibe Coding

Vibe Coding（氛围编程）是 2025 年流行起来的一个术语，描述的是一种"跟着感觉走"的 AI 辅助编程方式——你描述一个大致的想法，让 AI 自由发挥，不断迭代，直到"感觉对了"。

Addy Osmani 指出，Vibe Coding 已经成为一个"行李箱术语"——人们用它描述从周末小项目到严谨的企业级开发的一切。这两者本质上是不同的。

Loop Engineering 是 Vibe Coding 的"纪律版"。当 Vibe Coding 需要持续运行、需要可重复、需要可验证时，你就需要 Loop Engineering。Loop Engineering 给 Vibe Coding 加上了结构：自动化、验证、记忆、分工。

类比：Vibe Coding 像即兴爵士乐，Loop Engineering 像有乐谱的交响乐。两者都可以很美，但适用场景不同。

#### Loop Engineering vs Harness Engineering

Harness Engineering 由 Mitchell Hashimoto 在 2026 年 2 月提出，核心定义是："每当你发现代理犯了一个错误，你就花时间设计一个解决方案，让代理再也不会犯同样的错误。"

一个常见的简化公式是：Agent = Model + Harness。Harness 是模型之外的一切：系统提示词、工具、沙箱、审查代理、重试逻辑、压缩策略。

Loop Engineering 是 Harness Engineering 的一个具体实现。Harness Engineering 回答的是"如何让代理更可靠"，Loop Engineering 回答的是"如何让代理持续自动运行"。

Addy Osmani 把两者的关系描述为：Harness Engineering 是单个代理运行的环境，而 Loop Engineering 是运行在定时器上的 Harness，它会生成小助手，并且自我喂养。

#### Loop Engineering vs Agentic Engineering

Agentic Engineering（代理工程）是一个更广泛的术语，描述的是"让 AI 代理自主规划、编写、测试和迭代代码"的软件开发范式。

Loop Engineering 是 Agentic Engineering 的一个子集，专注于"循环"这个特定的设计模式。Agentic Engineering 还包括其他模式，比如单次代理执行、人机协作流程、多代理编排等。

类比：Agentic Engineering 是"汽车工程"，Loop Engineering 是"自动巡航系统"。

---

## 第 2 章：六大核心组件详解

### 2.1 Automations：循环的心跳

没有自动化，Loop 就不是 Loop——它只是你手动运行一次的任务。

自动化 Loop 的工作流程：

1. **定时触发** — Loop 按照设定的时间表启动。可以是 cron 表达式（如每天 9 点）、事件触发（如 CI 失败时）、或手动触发。
2. **发现工作** — Loop 扫描项目状态，发现需要处理的事项。包括：读取 CI 日志、检查未解决的 Issue、分析最近的提交、查询监控告警等。
3. **分类筛选** — 对发现的事项进行分类：紧急（需要今天处理）、重要（本周处理）、观察（持续监控）。
4. **分配任务** — 根据分类结果，spawn 合适的子代理来处理任务。每个子代理在独立的 worktree 中工作。
5. **验证结果** — 独立的验证代理（或 /goal 的内置检查机制）审查子代理的产出。验证条件必须是客观可检查的。
6. **记录状态** — 把所有完成和未完成的事项记录到持久存储（如 Markdown 文件、Linear 看板）。

**在 Claude Code 中：**

- `/loop` 命令：按设定的时间间隔重复执行提示
- `/goal` 命令：持续执行，直到你设定的验证条件为真
- Hooks：在代理生命周期的特定节点触发 shell 命令
- GitHub Actions 集成：把 Loop 推送到云端，即使关掉电脑也能运行

**在 OpenAI Codex 中：**

- Automations 标签页：选择项目、提示词、执行频率、运行环境
- 结果进入 Triage Inbox（分类收件箱）
- 没有发现问题的运行自动归档
- 自动化可以调用 Skill，保持可维护性

#### /goal 命令的底层机制

/goal 是 2026 年最受关注的代理原语之一。它的工作原理是：

1. 你设定一个可验证的停止条件，比如"所有 test/auth 下的测试通过，且 lint 无错误"
2. 代理开始工作，每完成一轮，一个独立的、更小的模型会检查条件是否满足
3. 如果条件不满足，继续下一轮
4. 如果条件满足，Loop 停止，报告结果

关键设计：检查条件的模型和做工作的模型是分离的。这避免了"自己给自己打分"的问题。做工作的模型可能会对自己的产出过于宽容，而独立的检查模型会更严格。

类比：就像考试，出题老师和阅卷老师不能是同一个人。

### 2.2 Worktrees：并行不冲突

当你同时运行多个 AI 代理时，文件冲突是最常见的问题。两个代理同时修改同一个文件，结果往往是代码损坏。

Git Worktree 是 Git 的一个高级功能，它允许你在同一个仓库上创建多个独立的工作目录，每个目录对应不同的分支。这些工作目录共享同一个 Git 历史，但文件系统是隔离的。

```bash
# 创建一个新的 worktree，用于代理 A 的工作
git worktree add ../project-agent-a feature-branch-a

# 创建另一个 worktree，用于代理 B 的工作
git worktree add ../project-agent-b feature-branch-b

# 代理 A 和代理 B 现在可以在各自的目录里独立工作
# 互不干扰，完成后合并回主分支
```

- 在 Claude Code 中：使用 `--worktree` 标志开启独立会话，或使用 `isolation: worktree` 配置子代理。
- 在 Codex 中：每个线程自动获得独立的 worktree，多个线程可以同时操作同一个仓库。

### 2.3 Skills：项目知识编码

AI 代理每次启动都是"冷启动"——它不知道你的项目用什么技术栈、有什么约定、之前踩过什么坑。如果没有 Skills，你每次都需要重复解释同样的事情。

Skills 的核心思想是"渐进式披露"（Progressive Disclosure）：

1. 启动时，AI 只加载所有 Skill 的名称和描述（保持上下文精简）
2. 当 AI 判断某个 Skill 适用时，才加载该 Skill 的完整内容
3. 执行过程中，辅助文件只在需要时才加载

```markdown
---
name: react-component
description: Generate React components following our design system
---

# React Component Skill

## Conventions

- Use TypeScript with strict mode
- Follow the shadcn/ui component pattern
- All components must be accessible (ARIA labels)
- Use Tailwind CSS for styling

## File Structure

- Component: `components/{ComponentName}.tsx`
- Tests: `components/{ComponentName}.test.tsx`
- Stories: `components/{ComponentName}.stories.tsx`

## Common Pitfalls

- NEVER use inline styles
- ALWAYS forward refs for composability
- Check for memory leaks in useEffect
```

### 2.4 Plugins / Connectors：接入真实世界

MCP（Model Context Protocol）是连接 AI 与外部工具的开放标准。它的设计非常简洁，就像 USB-C 一样——一个标准接口，任何设备都能用。

#### MCP 的技术架构

MCP 基于 JSON-RPC 2.0 协议，支持三种传输方式：

- **stdio**：本地进程间通信，适合桌面代理集成
- **HTTP + SSE**：服务器发送事件，适合远程部署
- **Streamable HTTP**：当前互联网部署的标准

一个 MCP Server 需要实现三个核心接口：

- `tools/list`：列出可用的工具（函数）
- `tools/call`：执行工具调用
- `resources/list`（可选）：列出可读的资源

截至 2026 年 3 月，MCP 的 SDK 月下载量达到 9700 万，注册表中有超过 17,000 个 MCP Server。它已经成为 AI 集成领域事实上的标准。

### 2.5 Sub-agents：分工与制衡

Sub-agents 是 Loop 中最有用的结构性设计。核心原则：让写代码的代理和检查代码的代理不是同一个。

| 代理角色              | 职责                         | 推荐模型     |
| --------------------- | ---------------------------- | ------------ |
| Explorer（探索者）    | 阅读代码、理解结构、生成报告 | 轻量快速模型 |
| Implementer（实现者） | 编写代码、修改文件           | 主力模型     |
| Tester（测试者）      | 编写测试、运行测试套件       | 主力模型     |
| Reviewer（审查者）    | 检查代码质量、安全风险       | 强推理模型   |

### 2.6 Memory：跨会话的记忆

AI 代理的上下文窗口是有限的，而且每次新会话都会清空。Memory 解决的是持久化状态的问题。

常见的 Memory 实现方式：

- **Markdown 文件**：AGENTS.md、TODO.md、PROGRESS.md
- **项目管理工具**：通过 MCP 连接器同步到 Linear、JIRA、Notion
- **数据库**：把状态存储在 SQLite 或 PostgreSQL 中

```markdown
# AGENTS.md - 项目状态记录

## 当前进行中的工作

- [ ] 重构支付模块（Issue #234）
  - 负责人: payment-refactor-agent
  - Worktree: ../project-payment
  - 状态: 测试中，3/5 测试通过

## 已完成

- [x] 修复登录页面的 CSS 问题（PR #456）
  - 验证: 所有视觉回归测试通过

## 待分类

- CI 失败: test/auth 超时（需调查）
- 新 Issue: 用户报告导出功能异常
```

---

## 第 3 章：学术基础与理论支撑

### 3.1 Closed-Loop Transformers：从开环到闭环

2025 年底，一篇题为 "Closed-Loop Transformers: Autoregressive Modeling as Iterative Latent Equilibrium" 的论文提出了一个核心观点：

> 当代自回归 Transformer 以开环方式运行：每个隐藏状态在单次前向传播中计算，且从不修正。这导致错误在序列中无修正地传播，是长程推理、事实一致性和多步规划失败的根本架构瓶颈。

论文提出的解决方案是"平衡 Transformer"（Equilibrium Transformer）：在生成每个 token 之前，模型通过梯度下降迭代优化隐藏状态，直到达到自洽的平衡态。

#### 为什么"开环"是瓶颈？

想象你在写一篇长文章。开环的方式就像：你写下第一句话，然后基于这句话写第二句，基于第二句写第三句……你从不回头检查第一句是否和后面的内容矛盾。

闭环的方式就像：你写每一句话之前，都会回头检查之前写的内容，确保逻辑自洽。如果有矛盾，你会修正之前的句子。

论文的实验表明，在二进制奇偶校验任务（测试长程依赖的经典任务）上，平衡 Transformer 在标准 Transformer 接近随机猜测的困难序列上，提升了 +8.07% 的准确率。而且，迭代优化过程收敛很快——94% 的 token 在 8 次迭代内达到平衡。

### 3.2 Test-Time Training：测试时的自我改进

Test-Time Training（TTT）是一类方法，让模型在推理过程中实时调整自己，而不需要修改预训练权重。

核心思想：模型在生成答案的过程中，同时也在"学习"——它根据生成的内容计算自监督损失，然后用这个损失来更新自己的隐藏状态。

#### TTT 与 Loop Engineering 的关系

TTT 是在模型层面的闭环——模型自己迭代优化自己的表示。Loop Engineering 是在系统层面的闭环——你设计的系统迭代优化 AI 代理的工作流程。

两者是互补的：

- TTT 让单个模型在推理时更聪明
- Loop Engineering 让整个系统在工作流层面更可靠

论文指出，Equilibrium Transformer 统一了 TTT、深度平衡模型、扩散语言模型等近期进展，揭示了它们都是"闭环预测原理"的特例。

### 3.3 认知科学的启示

Loop Engineering 的理念与认知科学中的几个重要理论高度吻合：

- **预测编码（Predictive Coding）**：大脑通过迭代最小化预测误差来理解世界。Loop 中的"检查-修正"循环与此同构。
- **分析-综合（Analysis-by-Synthesis）**：人类在解决问题时，会在心中构建一个模型，然后验证它是否符合观察，不断迭代。
- **全局工作空间理论（Global Workspace Theory）**：意识是一个"广播系统"，信息在多个专用模块之间循环传递，直到达成共识。

这些联系暗示：Loop Engineering 可能不只是工程技巧，而是触及了智能的一个深层计算原理——迭代信念修正。

---

## 第 4 章：工具实战与代码示例

### 4.1 Claude Code 的 Loop 原语

```bash
# /goal: 持续工作，直到验证条件满足
# 独立的检查模型每轮验证条件
/goal "All tests in test/auth pass and lint is clean"

# /loop: 按时间表重复执行提示
# 每个工作日早上 9 点运行
/loop "Read yesterday's CI failures and open issues,
       write findings to TODO.md, and draft fixes
       for anything labeled quick-win" \
       --schedule "0 9 * * 1-5"

# 子代理：并行执行探索任务
/spawn "audit the test suite for flaky tests
        and report which ones share a fixture"
/spawn "review the diff against our coding-standards.md
        and list violations"
```

### 4.2 OpenAI Codex 的 Loop 原语

```bash
# /goal: 持续运行的目标（CLI 0.128.0+）
codex /goal "Migrate the billing module to the new pricing API,
             keep all existing tests green"

# /spawn: 启动子代理并行工作
> /spawn "list every file under apps/billing that imports
         from apps.legacy and write the import graph"
> /spawn "grep for raw SQL strings that bypass the ORM
         in apps/billing and apps/payments"
> /spawn "for each test that takes more than 5 seconds,
         output test name + likely cause"

# 父代理汇总三个子代理的报告，制定迁移计划
```

### 4.3 一个完整的 Loop 配置示例

下面是一个典型的"每日晨间 triage"Loop 的完整配置。

**CLAUDE.md / AGENTS.md：**

```markdown
# 项目级配置：Claude Code 每次启动时读取

## 项目概述

- 技术栈: Next.js 14 + TypeScript + Prisma + PostgreSQL
- 测试框架: Vitest + Playwright
- 代码风格: ESLint (strict) + Prettier

## 工作约定

- NEVER 直接修改 migration 文件
- ALWAYS 在修改 API 后更新 OpenAPI 文档
- 提交前必须跑 `npm run test:ci`
- 所有新功能必须有对应的 E2E 测试

## 子代理配置

- explorer: 只读权限，用于代码探索和分析
- implementer: 读写权限，用于实现功能
- reviewer: 只读权限，用于代码审查
- tester: 可运行测试，用于验证
```

**Skill: daily-triage**

```markdown
---
name: daily-triage
description: Daily automated triage of project status
---

# Daily Triage Skill

## Steps

1. Read CI failures from the last 24 hours
2. Check open issues labeled `bug` or `urgent`
3. Review recent commits for potential regressions
4. Write findings to `DAILY_TRIAGE.md`

## For each finding:

- If labeled `quick-win`: spawn implementer subagent
- If complex: add to `BACKLOG.md` with analysis
- If security-related: immediately notify + spawn reviewer

## Output Format

## YYYY-MM-DD Triage

### Critical (needs action today)

- [ ] Issue #XXX: ...

### This Week

- [ ] Issue #YYY: ...

### Watched

- Issue #ZZZ: ... (monitoring)
```

---

## 第 5 章：设计你自己的 Loop

### 5.1 Loop 设计原则

在设计 Loop 之前，记住 Addy Osmani 的三条核心原则：

1. **验证仍然是你的责任。** Loop 的"完成"是一个声明，不是一个证明。子代理的审查只能降低风险。
2. **保持理解力。** Loop 产出代码的速度越快，你理解这些代码的速度可能越慢。主动阅读 Loop 的产出。
3. **避免认知投降。** 用 Loop 来提升思考，而不是避免思考。

### 5.2 五个 Loop 演示案例

#### 案例 1：每日晨间 Triage Loop

自动扫描项目状态，分类问题，分配修复任务。（自动化 · 子代理）

**场景：** 每天早上，Loop 自动运行，扫描 CI 失败、未解决的 Issue、最近的提交。

**流程：**

1. 自动化触发（每天早上 9 点）
2. 调用 triage skill 读取项目状态
3. 分类：紧急 / 本周 / 观察
4. 对 quick-win 问题，spawn 修复子代理
5. 对复杂问题，写入 BACKLOG
6. 对安全问题，立即通知 + spawn 审查子代理
7. 记录状态到 DAILY_TRIAGE.md

**关键设计：** 制造者（修复代理）和检查者（审查代理）分离。

#### 案例 2：持续集成修复 Loop

CI 失败时自动诊断、修复、验证。（/goal · 验证循环）

**场景：** 开发者提交代码后，CI 失败。Loop 自动介入。

**流程：**

1. Hook 触发：CI 失败时通知 Loop
2. Loop 读取 CI 日志，诊断失败原因
3. Spawn 修复子代理（在独立 worktree 中）
4. 修复完成后，运行测试验证
5. 如果测试通过，提交 PR
6. 如果测试失败，把日志反馈给修复代理，继续迭代
7. 使用 /goal 确保"所有测试通过"才停止

**关键设计：** 可验证的停止条件 + 失败时的自动重试。

#### 案例 3：依赖更新 Loop

自动检查、测试、合并依赖更新。（定时任务 · 安全审查）

**场景：** 每周检查依赖更新，自动测试，安全审查后合并。

**流程：**

1. 每周一早上，Loop 检查 npm outdated
2. 对 minor/patch 更新：spawn 测试子代理
3. 对 major 更新：spawn 分析子代理，评估破坏性变更
4. 所有更新在独立 worktree 中测试
5. spawn 安全审查子代理检查漏洞
6. 测试通过 + 安全审查通过 → 自动提交 PR
7. 记录更新日志到 DEPENDENCIES.md

**关键设计：** 风险分级（minor vs major）+ 安全审查作为强制步骤。

#### 案例 4：文档同步 Loop

代码变更时自动更新相关文档。（Hook · MCP）

**场景：** 当 API 代码变更时，自动更新 API 文档、README、CHANGELOG。

**流程：**

1. Hook 触发：检测到 API 相关文件变更
2. Spawn 分析子代理：识别变更内容
3. Spawn 文档子代理：更新 OpenAPI 规范
4. Spawn 更新子代理：更新 README 示例
5. Spawn 更新子代理：追加 CHANGELOG
6. 通过 MCP 连接器同步到文档站点（如 Notion）
7. 人类审查后合并

**关键设计：** 多个专业子代理并行工作 + MCP 连接器实现跨工具同步。

#### 案例 5：代码质量监控 Loop

持续监控代码质量指标，自动修复退化。（指标 · 渐进优化）

**场景：** 持续监控测试覆盖率、复杂度、重复代码等指标。

**流程：**

1. 每天运行代码质量扫描（覆盖率、复杂度、lint）
2. 与基线对比，识别退化
3. 如果覆盖率下降：spawn 测试子代理补充测试
4. 如果复杂度上升：spawn 重构子代理简化代码
5. 如果重复代码增加：spawn 提取子代理重构
6. 所有修改在独立 worktree 中完成
7. 验证指标恢复后，提交 PR
8. 记录质量趋势到 QUALITY.md

**关键设计：** 指标驱动 + 渐进式优化 + 历史趋势记录。

### 5.3 常见反模式

知道什么不该做，和知道什么该做同样重要。

**反模式 1：Loop 过于复杂**

- 症状：一个 Loop 里嵌套了 10 个子代理，每个子代理又有自己的子代理，协调开销超过了实际工作。
- 解决：从简单开始。一个主代理 + 2-3 个专业子代理就足够了。只有在上下文分离能带来明确价值时，才增加子代理。

**反模式 2：验证条件太弱**

- 症状：/goal 的条件是"看起来没问题"或"代码编译通过"。Loop 很快宣布完成，但代码有严重 bug。
- 解决：验证条件必须是可客观验证的。比如"所有测试通过"、"lint 无错误"、"代码审查通过"。避免主观判断。

**反模式 3：忽视 Token 成本**

- 症状：Loop 每小时运行一次，每次 spawn 5 个子代理，每个子代理都用最强模型。月底账单惊人。
- 解决：
  - 从慢频率开始（比如每天一次），观察产出质量
  - 子代理用轻量模型（如 Haiku / GPT-5.4-mini），只有关键步骤用强模型
  - 设置成本预算上限
  - 定期审查 Loop 的产出，砍掉低价值的自动化

### 5.4 成本管理策略

Loop Engineering 的一个现实考量是成本。多个子代理、频繁运行、强模型——这些都会消耗大量 Token。

| 策略       | 具体做法                                       | 效果             |
| ---------- | ---------------------------------------------- | ---------------- |
| 模型分层   | 探索用轻量模型，实现用主力模型，审查用强模型   | 降低 60-80% 成本 |
| 频率控制   | 从每天一次开始，根据产出质量调整               | 避免无效运行     |
| 条件触发   | 只在检测到变化时才运行（如 CI 失败、新 Issue） | 减少空转         |
| 上下文压缩 | 使用 Skills 的渐进式披露，避免加载无关内容     | 减少 Token 消耗  |
| 预算上限   | 设置每日/每周 Token 预算，超限自动暂停         | 防止意外账单     |

### 5.5 写在最后

Loop Engineering 是一个还在快速演化的领域。2026 年 6 月，这个概念刚刚被命名和系统化。未来几个月，我们可能会看到更多工具支持、更多最佳实践、更多失败教训。

但核心理念是稳定的：从手动提示到系统设计，从单次交互到持续循环。

正如 Addy Osmani 所说：

> "设计循环。但像一位打算继续做工程师的人那样设计它，而不是像一位只想按'开始'按钮的人。"

祝你在 Loop Engineering 的旅程中，既能享受自动化带来的效率提升，也能保持对技术的深度理解和掌控。
