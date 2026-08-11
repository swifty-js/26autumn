# review

## Tiktok Android Performance

ToD 项目: 团队使用 perfetto 在海量 Android 端设备侧采集设备性能数据

Android 端设备侧的采集方法有两种:

1. 插桩慢函数
2. 抓栈慢函数

<!-- TODO: 两种采集方法的原理 1.md -->

采集的数据落库到 Kafka、Hive、ClickHouse、MySQL、Redis

<!-- TODO: 分析这多个中间件的职责 2.md -->

后端从库中读取数据, 使用 lru 内存缓存, 提供 rpc 服务

<!-- TODO: lru 内存缓存 Go/TS 实现, 支持指定 entry 的 evictTime (lru.ts, lru.go) -->
<!-- TODO: rpc 是什么, rpc 的优势是什么 3.md -->

前端使用 BFF 层加工数据, 调用后端提供的 rpc 服务

<!-- TODO: 为什么要引入 BFF 层, 为什么要: 数据库 -> 后端 -> rpc -> 前端 BFF -> http -> 前端页面
为什么不直接: 数据库 -> 后端 -> http -> 前端页面?
可以从: 消费方不还有别的团队, 提供 rpc 接口; 海量 Android 设备前端渲染性能; 数据清洗、整形等角度出发 4.md -->

前端使用虚拟滚动列表渲染 Android 设备的设备性能分排行榜

<!-- TODO: 为什么要手写虚拟滚动, 而不是使用开源方案, 例如 @tanstack/react-virtual -->
<!-- TODO: 为什么要使用虚拟滚动? 可以提高首屏加载速度吗? -->
<!-- TODO: 如何实现子项不定高的虚拟滚动列表 5.md -->

## IEG

该 ToB 项目是 NoSQL 的管理端, 存在以下公共的选择器 (都是类组件)

- Set 集群选择器
- StandbySet 备用集群选择器
- Database 数据库选择器
- Table 表选择器 (该 NoSQL 的表格式是 xml)
- ...

工作 1: 迁移类组件到函数组件, 为什么要迁移? 有什么注意点? 如何使用大模型的能力进行迁移? 6.md

工作 2: 排查内存泄漏, 编写进程池: Koa 后端调用 C++ .so 链接库, 解密、解析 xml (该 NoSQL 的表格式是 xml), C++ 侧使用了 protobuf, 但是使用 valgrind 排查发现 C++ 侧 protobuf 使用时存在内存泄漏; JS 侧为了避免解密、解析 xml 时崩溃影响到主 Koa 进程, 使用 generic-pool 编写进程池

每次解析 xml 时都需要创建一个大对象 (该对象的部分属性是一块大 buffer), 基于 V8 隐藏类创建对象池, 降低 Koa 服务的 GC 压力

<!-- TODO: 进程池、线程池的常用参数 -->

<!-- TODO: valgrind 的原理、如何使用 valgrind 排查 -->

TODO: JS 使用 ffi-napi 调用 C++ .so 链接库, 是否与 C++ 侧共享内存, 该共享内存受 JS GC 控制吗?

工作 3: 使用 generic-pool 编写 TCP 连接池, Koa 后端使用 TCP 连接池与 Tencent NoSQL DB Admin 建立连接

TCP 连接可能的问题: DB Admin 连接失败、超时、DB Admin 主动关闭、..., 这些异常如何处理?

## Data

JS Error 自动修复

- ToD 搜索推荐平台

react 前端使用监控 SDK 上报 JSError, 携带错误信息, 使用 rrweb 进行还原现场

- 携带哪些错误信息? 越详细越好; 简单的思路可以参考: '$HOME/github/swifty-sentry/sentry'
- rrweb 是什么? 有什么作用? 简单的思路可以参考: '$HOME/github/swifty-sentry/sentry'
- react-router 改造为文件路由, 简单的思路可以参考: '$HOME/github/swifty-sentry/client'

跨域脚本错误屏蔽: 从 CDN 拉取的 js 脚本错误, 由于未设置跨域, 只有很模糊的 Script Error; 如何解决?

rrweb 引入导致前端包体积膨胀, 如何解决? (例如插件化、分级加载)

@../../h/docs/agent/

### 前端性能优化:

在 index.html 的 `<header>` 标签中插入这样的逻辑:

```js
// 对于项目中的公用选择器, 例如:
// Staff 用户选择器, 搜索推荐算法选择器, 向量库选择器等等
// 在 index.html 的 `<header>` 标签中插入这样的脚本

Promise.allSettled([staffPromise, algorithmPromise, vectorDBPromise]);

// promise 挂载到 window
window.staffPromise = staffPromise;
window.algorithmPromise = algorithmPromise;
window.vectorDBPromise = vectorDBPromise;

// result 挂载到 window
staffPromise.then((staffResult) => (window.staffResult = staffResult));
algorithmPromise.then(
  (algorithmResult) => (window.algorithmResult = algorithmResult),
);
vectorDBPromise.then(
  (vectorDBResult) => (window.vectorDBResult = vectorDBResult),
);

// 页面消费选择器数据源时, 使用 fetcher 函数

// fetcher 函数逻辑:
// 先判断 window.xxxResult 是否有值
// 如果有, 则返回, 并后台 SWR
// 如果没有, 再判断 window.xxxPromise 是否有值
// 如果有, 则复用 window.xxxPromise 等待 resolved

// 如果 window.xxxResult 和 window.xxxPromise 都没有, 则重建 SWR 流程
```

## Ali

- Next.js 交互稿还原

<!-- Insforge (连接 insforge MCP 介绍 insforge 是什么) -->
<!-- Next.js 项目, 源代码在 $HOME/workspace/mm-node-nextjs -->

介绍图片拓展名计算, 图片压缩, 转 base64

### A2UI 接入

探索 @../a2ui
