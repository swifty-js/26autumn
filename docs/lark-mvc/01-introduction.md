---
title: 简介
description: 了解 Lark Mvc —— 一个零运行时依赖、全函数式的轻量级 TypeScript 单页应用框架的设计理念与整体架构。
---

# 简介

Lark Mvc（包名 `@mm/lark-mvc`）是一个面向**单页应用（SPA）**与**微前端**场景的轻量级 TypeScript 前端框架。它以「全函数式」为核心设计原则，提供从视图系统、路由、状态管理到模板编译、DOM Diff 引擎的完整应用架构，同时保持**零运行时依赖**与极小的内核体积。

> 源码位置：`packages/lark-mvc/src/`
> 公共 API 出口：`packages/lark-mvc/src/index.ts`
> 包定义：`packages/lark-mvc/package.json`

## 什么是 Lark Mvc

Lark Mvc 是一个「函数优先（functional-first）」的框架。它用工厂函数与闭包替代了传统的类、原型链与混入（mixin），为开发者提供一套完整、可组合、可预测的应用开发模型。

它内置了构建现代 Web 应用所需的全部基础设施：

- **视图系统（View）**：通过 `defineView()` 定义视图，配合 `ViewCtx` 与 Hooks 管理状态与副作用。
- **路由（Router）**：支持 `history` / `hash` 两种模式，提供「两阶段路由确认」与异步导航守卫。
- **状态管理（State / Store）**：`State` 用于简单的跨视图共享数据；`createStore` 提供对齐 zustand 的复杂响应式状态管理。
- **服务层（Service）**：内置 LFU 缓存、请求去重、串行队列与生命周期事件的 API 请求管理。
- **DOM Diff 引擎**：默认使用真实 DOM Diff（`innerHTML` + key 比对），可选 VDOM 模式（LIS 重排）。
- **模板编译器**：在构建期将 `.html` 模板编译为 JavaScript 渲染函数，零配置自动提取变量。
- **HMR 热更新**：跨 Vite、Webpack、Rspack 的开箱即用热替换，保留视图本地状态。

## 设计理念

Lark Mvc 的设计建立在以下几条原则之上。这些原则在源码 `types.ts` 的模块头部注释中有明确阐述：

### 1. 全函数式：无 class、无 this、无 prototype、无 mixin

框架中**任何位置**都不使用 `class`、`this`、`prototype` 或 `mixin`。所有 API 都通过工厂函数与闭包实现。

以视图为例，`defineView()` 直接返回一个 setup 函数（见 `src/view.ts`）：

```ts
export function defineView(setup: ViewSetup): ViewSetup {
  return setup;
}
```

setup 函数在挂载时执行一次，接收一个 `ViewCtx` 对象，所有框架能力都通过 ctx 上的方法（闭包）暴露，而非通过 `this` 绑定：

```ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./home.html";

export default defineView((ctx, params) => {
  const [getCount, setCount] = useState("count", 0);
  return {
    template,
    events: {
      "increment<click>"() {
        setCount(getCount() + 1);
      },
    },
  };
});
```

同样地，Updater、Emitter、Cache、Frame 等内部模块都以 `createXxx()` 工厂函数形式实现。例如 `createUpdater(viewId)` 返回一个纯对象 API（见 `src/updater.ts`），内部状态全部由闭包变量持有。

### 2. 零运行时依赖

Lark Mvc 的运行时代码不依赖任何第三方库。`package.json` 中的 `dependencies`（`@babel/parser`、`@babel/types`、`htmlparser2`）**仅用于构建期**的模板编译与变量提取，不会进入浏览器运行时包。

### 3. 默认真实 DOM Diff，VDOM 按需开启

框架默认采用「字符串模式」：模板函数产出 HTML 字符串，引擎将其解析为临时 DOM 树，再与真实 DOM 做 key 化比对（见 `src/dom.ts`）。这避免了在大多数场景下维护虚拟 DOM 的额外开销。

当通过配置 `vdom: true` 开启 VDOM 模式时，模板会编译为 `vdomCreate` 调用，引擎使用「头尾快速路径 + LIS（最长递增子序列）重排」的三阶段 Diff（见 `src/vdom.ts`）。

### 4. 编译期模板转换

模板在构建期被编译为 JavaScript 函数。编译器使用 `@babel/parser` 做基于 AST 的变量提取，实现「零配置」的模板变量检测——开发者无需手动声明模板用到了哪些数据字段。

### 5. 双格式产物：ESM + CJS

`package.json` 为每个入口同时提供 ESM（`import`）与 CJS（`require`）两种产物，并附带独立的类型声明（`.d.ts` / `.d.cts`），可在现代浏览器、Node.js 与各类打包器中无缝使用。

## 架构总览

下图展示了从 `Framework.boot(config)` 启动开始，路由、状态、Frame 树如何协同驱动视图渲染（源自 `README.md`）：

```
                          Framework.boot(config)
                                |
          +---------------------+---------------------+
          |                     |                     |
       Router               State                Frame Tree
    (history/hash)       (observable)          (mount/unmount)
          |                     |                     |
    two-phase              get/set/digest         createFrame
    confirmation           change tracking       parent-child
          |                     |                     |
          +----------+----------+                     |
                     |                                |
              dispatcherNotifyChange                  |
                     |                                |
              dispatcherUpdate (walk tree)            |
                     |                                |
                   ViewCtx <----+----> mountCtx / unmountCtx
                     |          |
              +------+-------+  |
              |      |       |  |
           updater  events  hooks
              |      |       |
         digest()  delegator  useState/useEffect/...
              |
     +--------+--------+
     |                 |
  string mode      VDOM mode
  (real-DOM diff)  (LIS reconciliation)
     |                 |
  dom.ts           vdom.ts
```

整体流程可以概括为：

1. `Framework.boot(config)` 合并配置、绑定路由与状态事件、创建根 Frame。
2. 路由变化或状态变化触发 `dispatcherNotifyChange`。
3. `dispatcherUpdate` 遍历 Frame 树，找出观察的键发生变化的视图。
4. 命中的视图调用 `render()` → `updater.digest()`。
5. Updater 执行模板函数，产出字符串或 VDOM 树，交由对应的 Diff 引擎更新真实 DOM。

## 模块结构

下表列出框架核心源码模块及其职责（完整结构见 `README.md` 的「Project Structure」一节）：

| 模块                                   | 职责                                       |
| -------------------------------------- | ------------------------------------------ |
| `index.ts`                             | 公共 API 桶式导出（barrel export）         |
| `types.ts`                             | 所有共享类型定义的单一来源                 |
| `common.ts`                            | 常量（如 `SPLITTER`）与编码辅助函数        |
| `utils.ts`                             | 工具函数与协作式任务调度器                 |
| `framework.ts`                         | `Framework.boot`、变更分发器、任务队列     |
| `view.ts`                              | `defineView`、`ViewCtx`、挂载/卸载生命周期 |
| `frame.ts`                             | Frame 树、`createFrame`、挂载/卸载         |
| `router.ts`                            | 两阶段确认的路由器                         |
| `state.ts`                             | 跨视图共享数据的 `State` 单例              |
| `store.ts`                             | `createStore`、`computed`、`bindStore`     |
| `service.ts`                           | `createService`、API 请求管理              |
| `hooks.ts`                             | `useState`、`useEffect`、`useStore` 等     |
| `updater.ts`                           | 每视图数据绑定与 digest                    |
| `dom.ts`                               | 真实 DOM Diff 引擎（字符串模式）           |
| `vdom.ts`                              | VDOM Diff 引擎（VDOM 模式）                |
| `event-emitter.ts`                     | 多播事件系统                               |
| `event-delegator.ts`                   | DOM 事件委托                               |
| `cache.ts`                             | LFU 风格的有界缓存                         |
| `runtime.ts`                           | 模板运行时辅助函数                         |
| `compiler/`                            | 模板编译器（语法转换、函数生成、变量提取） |
| `vite.ts` / `webpack.ts` / `rspack.ts` | 各打包器的插件 / 加载器                    |

## 公共 API 出口

`src/index.ts` 以桶式导出聚合了框架的完整公共表面。按类别划分如下：

| 类别      | 导出                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| Framework | `Framework`、`defineView`、`EventDelegator`                                                 |
| State     | `State`、`createStore`、`computed`、`bindStore`、`useUrlState`                              |
| Router    | `Router`                                                                                    |
| Hooks     | `useState`、`useEffect`、`useStore`、`useInterval`、`useTimeout`、`useResource`、`useEvent` |
| Frame     | `Frame`、`createFrame`、`registerViewClass`、`invalidateViewClass`                          |
| Service   | `createService`、`ServiceApi`、`ServiceInstance`                                            |
| VDOM      | `vdomCreate`（编译后的模板模块在运行时导入）                                                |
| Types     | 通过 `export *` 重新导出 `./types` 的全部类型                                               |

> 内部工具（`mark`、`createCache`、`createEmitter`、HMR 交换函数等）属于实现细节，不在此处导出，而是通过 `Framework` 对象或 `globalThis` 访问，以避免膨胀公共 API 表面。

## 打包器入口

除了主运行时入口，框架还为不同构建工具提供独立入口：

| 导入路径                | 说明                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| `@mm/lark-mvc`          | 主运行时 API                                                              |
| `@mm/lark-mvc/vite`     | Vite 插件（`larkMvcPlugin`）                                              |
| `@mm/lark-mvc/webpack`  | Webpack 加载器（`larkMvcLoader`）                                         |
| `@mm/lark-mvc/rspack`   | Rspack 加载器（`larkMvcLoader`）                                          |
| `@mm/lark-mvc/runtime`  | 模板运行时辅助函数（`encHtml`、`strSafe`、`encUri`、`encQuote`、`refFn`） |
| `@mm/lark-mvc/compiler` | 构建期编译器（`compileTemplate`、`extractGlobalVars`）                    |
| `@mm/lark-mvc/devtool`  | 开发者工具桥接（`installFrameDevtoolBridge`）                             |
| `@mm/lark-mvc/client`   | 客户端类型声明（DOM 增强、`*.html` 模块类型）                             |

## 适用场景

- **单页应用（SPA）**：完整的视图 + 路由 + 状态 + 服务分层架构。
- **微前端**：通过 `FrameworkConfig.require` 与 `projectName` 集成 Module Federation，支持跨项目视图加载。
- **对包体积敏感的项目**：零运行时依赖、真实 DOM Diff 默认开启，内核精简。
- **需要可预测状态更新的项目**：显式的 digest 模型（详见「响应式基础」一章），变更来源清晰可控。

## 下一步

- 想要快速跑起一个项目？请阅读 [快速上手](./02-quick-start.md)。
- 想深入理解启动流程与配置项？请阅读 [创建一个应用](./03-creating-an-app.md)。
- 想了解模板写法？请阅读 [模板语法](./04-template-syntax.md)。
- 想理解数据如何驱动视图更新？请阅读 [响应式基础](./05-reactivity-fundamentals.md)。
