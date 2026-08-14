# 面试 QA 文档

欢迎使用面试 QA 文档站点. 本站点收录了前端、后端及 Swifty 系列项目的面试精编题目与参考答案, 以及工作笔记、框架源码解析和框架文档翻译.

## 分类导航

### 前端基础

涵盖 React、Next.js、CSS、Vite、JavaScript 等核心前端主题, 面向中高级前端工程师.

- [React 面试题](fe/react.md)
- [Next.js 面试题](fe/next.md)
- [前端综合面试题](fe/fe.md)
- [CSS 面试题](fe/css.md)
- [Vite 面试题](fe/vite.md)
- [A2UI 面试题](fe/a2ui.md)
- [CodeGraph 深度解析](fe/codegraph.md)
- [anti-copy 核心技术文档](fe/anti-copy.md)
- [whistle + SwitchyOmega 本地代理调试指南](fe/whistle+switchy-omega.md)

### Swifty 前端

Swifty 框架前端相关的深度面试题, 包括 Agent、Code、Chatbot、Sentry 等模块.

- [Swifty CLI 面试题](fe/swifty.md)
- [Swifty Agent 面试题](fe/swifty-agent.md)
- [Swifty Chatbot 面试题](fe/swifty-chatbot.md)
- [Swifty Sentry 面试题](fe/swifty-sentry.md)

### 后端基础

Go 语言、分布式系统、数据库及中间件相关面试题.

- [Go 面试题](be/go.md)
- [MySQL 面试题](be/mysql.md)
- [Redis 面试题](be/redis.md)
- [中间件面试题](be/middleware.md)

### Swifty 后端

Swifty 后端框架相关的深度面试题, 包括 HTTP、RPC、Cache、Agent 等模块.

- [Swiftx 面试题](be/swiftx.md)
- [Swifty HTTP 面试题](be/swifty-http.md)
- [Swifty RPC 面试题](be/swifty-rpc.md)
- [Swifty Cache 面试题](be/swifty-cache.md)
- [Swifty Agent 面试题](be/swifty-agent.md)

### 工作笔记与项目分析

实习与工作期间的技术记录、源码解析和竞品调研.

- [视频切片与 LLM 聚类标签](docs/0.md)
- [ToD 设备性能数据采集: perfetto](docs/1.md)
- [ToD 数据链路: Kafka、Hive、ClickHouse、MySQL、Redis](docs/2.md)
- [RPC 原理与优势](docs/3.md)
- [为什么要引入 BFF 层](docs/4.md)
- [虚拟滚动: 原理与不定高实现](docs/5.md)
- [IEG 工作 1: 迁移类组件到函数组件](docs/6.md)
- [IEG 工作 2: 内存泄漏排查、进程池与 ffi 内存模型](docs/7.md)
- [IEG 工作 3: TCP 连接池与连接异常处理](docs/8.md)
- [IEG 工作 4: 排查闭包引用导致的内存泄漏](docs/9.md)
- [Data 工作: JSError 自动修复与故障现场还原](docs/10.md)
- [Ali 工作: Next.js 交互稿还原](docs/11.md)
- [手写 SWR: 预加载 + 请求去重 + Stale-While-Revalidate](docs/12.md)
- [Formily 新手入门教程与原理解析](docs/formily.md)

### 竞品调研

- [竞品调研报告](docs/13.md)
- [竞品调研报告](docs/14.md)
- [竞品调研报告](docs/15.md)
- [竞品调研报告](docs/16.md)
- [竞品调研报告](docs/17.md)
- [竞品调研报告 pdd](docs/18.md)
- [竞品调研报告](docs/19.md)
- [竞品调研报告](docs/20.md)
- [竞品调研报告](docs/21.md)

### Lit 框架文档

Lit 3 官方文档的中文翻译, 涵盖组件、模板、组合、数据流、SSR、工具链等.

- [什么是 Lit?](lit/index.md)
- [入门](lit/getting-started.md)

组件:

- [组件概述](lit/components/overview.md)
- [定义组件](lit/components/defining.md)
- [响应式属性](lit/components/properties.md)
- [渲染](lit/components/rendering.md)
- [事件](lit/components/events.md)
- [生命周期](lit/components/lifecycle.md)
- [样式](lit/components/styles.md)
- [使用 Shadow DOM](lit/components/shadow-dom.md)
- [装饰器](lit/components/decorators.md)

模板:

- [模板概述](lit/templates/overview.md)
- [表达式](lit/templates/expressions.md)
- [条件](lit/templates/conditionals.md)
- [列表](lit/templates/lists.md)
- [自定义指令](lit/templates/custom-directives.md)

组合:

- [组合概述](lit/composition/overview.md)
- [组件组合](lit/composition/component-composition.md)
- [响应式控制器](lit/composition/controllers.md)
- [混入](lit/composition/mixins.md)

数据流:

- [信号](lit/data/signals.md)
- [上下文](lit/data/context.md)
- [异步任务](lit/data/task.md)

服务器端渲染:

- [SSR 概述](lit/ssr/overview.md)
- [为 Lit SSR 编写组件](lit/ssr/authoring.md)
- [Lit SSR 服务器使用](lit/ssr/server-usage.md)
- [Lit SSR 客户端使用](lit/ssr/client-usage.md)
- [Lit SSR DOM 模拟](lit/ssr/dom-emulation.md)

工具与工作流:

- [工具概述](lit/tools/overview.md)
- [要求](lit/tools/requirements.md)
- [将 Lit 添加到现有项目](lit/tools/adding-lit.md)
- [开发](lit/tools/development.md)
- [测试](lit/tools/testing.md)
- [为生产环境构建](lit/tools/production.md)
- [发布](lit/tools/publishing.md)
- [入门套件](lit/tools/starter-kits.md)

本地化:

- [本地化概述](lit/localization/overview.md)
- [运行时本地化模式](lit/localization/runtime-mode.md)
- [转换本地化模式](lit/localization/transform-mode.md)
- [本地化 CLI 和配置](lit/localization/cli-and-config.md)
- [本地化最佳实践](lit/localization/best-practices.md)

其他:

- [React 集成](lit/frameworks/react.md)
- [Lit Labs](lit/libraries/labs.md)
- [独立使用 lit-html](lit/libraries/standalone-templates.md)
- [Lit 3 升级指南](lit/releases/upgrade.md)
- [社区](lit/resources/community.md)

### Lark Docs 文档

Magix Docs 静态文档站点框架的使用指南.

- [简介](lark-docs/01-introduction.md)
- [什么是 Lark Docs?](lark-docs/02-what-is-magix-docs.md)
- [快速开始](lark-docs/03-getting-started.md)
- [路由](lark-docs/04-routing.md)
- [写作](lark-docs/05-writing.md)
- [Markdown 扩展](lark-docs/06-markdown-extensions.md)
- [Frontmatter](lark-docs/07-frontmatter.md)
- [在 Markdown 中使用 Lark Mvc](lark-docs/08-using-magix-next.md)
- [资源处理](lark-docs/09-asset-handling.md)
- [国际化](lark-docs/10-i18n.md)
- [侧边栏](lark-docs/11-sidebar.md)
- [搜索](lark-docs/12-search.md)
- [自定义](lark-docs/13-customization.md)
- [自定义主题](lark-docs/14-custom-theme.md)
- [扩展默认主题](lark-docs/15-extending-default-theme.md)
- [构建时数据加载](lark-docs/16-build-time-data-loading.md)
- [部署](lark-docs/17-deploy.md)
- [配置与 API 参考](lark-docs/18-api-reference.md)

### Lark MVC 文档

Magix MVC 前端框架的完整教程, 从基础语法到高级主题.

- [简介](lark-mvc/01-introduction.md)
- [快速上手](lark-mvc/02-quick-start.md)
- [创建一个应用](lark-mvc/03-creating-an-app.md)
- [模板语法](lark-mvc/04-template-syntax.md)
- [响应式基础](lark-mvc/05-reactivity-fundamentals.md)
- [计算属性](lark-mvc/06-computed-properties.md)
- [类与样式绑定](lark-mvc/07-class-and-style-bindings.md)
- [条件渲染](lark-mvc/08-conditional-rendering.md)
- [列表渲染](lark-mvc/09-list-rendering.md)
- [事件处理](lark-mvc/10-event-handling.md)
- [表单输入绑定](lark-mvc/11-form-input-bindings.md)
- [侦听器](lark-mvc/12-watchers.md)
- [模板引用](lark-mvc/13-template-refs.md)
- [组件基础](lark-mvc/14-component-basics.md)
- [生命周期](lark-mvc/15-lifecycle.md)
- [深入组件](lark-mvc/16-components-in-depth.md)
- [注册](lark-mvc/17-registration.md)
- [Props](lark-mvc/18-Props.md)
- [事件](lark-mvc/19-events.md)
- [v-lark 指令](lark-mvc/20-v-magix-directives.md)
- [透传 Attributes](lark-mvc/21-fallthrough-attributes.md)
- [插槽与内容组合](lark-mvc/22-slots.md)
- [依赖注入](lark-mvc/23-dependency-injection.md)
- [异步组件](lark-mvc/24-async-components.md)
- [逻辑复用](lark-mvc/25-logic-reuse.md)
- [组合式函数 (Hooks)](lark-mvc/26-composables.md)
- [自定义指令](lark-mvc/27-custom-directives.md)
- [插件与构建集成](lark-mvc/28-plugins.md)
- [内置组件](lark-mvc/29-built-in-components.md)
- [应用规模化](lark-mvc/30-scaling-up.md)
- [路由系统](lark-mvc/31-routing.md)
- [状态管理](lark-mvc/32-state-management.md)
- [测试指南](lark-mvc/33-testing.md)
- [最佳实践](lark-mvc/34-best-practices.md)
- [性能优化](lark-mvc/35-performance-optimization.md)
- [安全](lark-mvc/36-security.md)
- [TypeScript 支持](lark-mvc/37-TypeScript.md)
- [TypeScript API 参考](lark-mvc/38-ts-and-api.md)
- [进阶主题](lark-mvc/39-advanced-topics.md)
- [使用 Lark 的多种方式](lark-mvc/40-ways-of-using-magix.md)
- [API 常见问答](lark-mvc/41-api-faq.md)
- [深入响应式系统](lark-mvc/42-reactivity-in-depth.md)
- [渲染机制](lark-mvc/43-rendering-mechanism.md)
- [渲染函数](lark-mvc/44-render-functions.md)
- [Lark 与 Web Components](lark-mvc/45-magix-and-web-components.md)
- [动画技巧](lark-mvc/46-animation-techniques.md)
- [常见陷阱](lark-mvc/47-pitfalls.md)
- [HMR 热更新](lark-mvc/48-hmr.md)
- [服务层](lark-mvc/49-service-layer.md)
- [架构总览](lark-mvc/50-overview.md)
