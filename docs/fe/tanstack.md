# TanStack Start 使用指南

本文以本仓库（`hangtiancheng/leetcode`，一个 LeetCode 题解本）为样本，解释 TanStack Start 的后端实现方式、与 Vite 的结合点，以及它和 Next.js 的差异。文中涉及的内部机制都对照 `node_modules` 里的实际实现和本项目的构建产物核对过，关键结论附了验证方式。

版本参考：`@tanstack/react-start` 1.170.x、Vite 8、Nitro 3.0 beta。

---

## 1. 它是什么

TanStack Start 是在 TanStack Router 上加了一层全栈能力：SSR、流式渲染、类型安全的 RPC（server functions）、中间件、服务端路由。它自己不实现打包器和 HTTP 服务器，而是把两件事分别交给 Vite 和 Nitro：

- Vite 负责编译和开发服务器，Start 以插件形式接入
- Nitro 负责把 SSR 产物打包成可部署的服务器（本项目用 `node-server` preset）

所以 Start 的“框架”部分主要是三块代码：一个 Vite 插件（`@tanstack/start-plugin-core`）、一个服务端运行时（`@tanstack/start-server-core`）、一个客户端运行时（`@tanstack/start-client-core`）。

### 最重要的一条前提

**默认情况下所有代码都是同构的（isomorphic），会同时进客户端和服务端两份产物。** 路由的 `loader` 在 SSR 时跑在服务端，在客户端导航时跑在浏览器里，是同一份代码。

这条前提是绝大多数误用的根源。要让代码只在服务端跑，唯一可靠的手段是把它放进 `createServerFn`。本项目 `src/routes/index.tsx` 的写法就是标准形态：

```tsx
// src/routes/index.tsx
import { listProblems } from "#/data/problems.ts";

export const Route = createFileRoute("/")({
  loader: () => listProblems(), // loader 同构，但 listProblems 是 server function
  component: ProblemIndex,
});
```

`loader` 本身两端都会执行，但它调用的 `listProblems` 是 server function，所以 Prisma 查询只在服务端发生。

---

## 2. Vite 是怎么接进来的

### 2.1 两个 Vite 环境

Start 插件用 Vite 的 Environment API 声明了两个环境（`start-plugin-core/dist/esm/constants.js`）：

```js
var START_ENVIRONMENT_NAMES = {
  server: "ssr",
  client: "client",
};
```

`client` 是 `type: "client"`，`ssr` 是 `type: "server"`。同一份源码在两个环境里各编译一次，编译结果不同——这正是 server function 能“同一个调用点、两种行为”的基础（见第 4 节）。

构建顺序在 `vite/planning.js` 里是固定的：先 client，再 ssr。因为 SSR 渲染 HTML 时需要知道客户端产物的文件名（生成 `<script>` 和 `modulepreload`），所以必须先有 client manifest。

```js
if (!client.isBuilt) await opts.builder.build(client);
if (!server.isBuilt) await opts.builder.build(server);
```

### 2.2 插件顺序是硬性要求

```ts
// vite.config.ts
plugins: [devtools(), tailwindcss(), tanstackStart(), nitro(), viteReact()];
```

`tanstackStart()` 必须排在 `viteReact()` 之前。Start 的编译器要在 React 插件处理 JSX 之前拿到原始 AST 做 server function 的提取和替换。顺序反了会导致路由生成和 server function 编译失效，且报错信息通常不指向真正原因。

本项目的 `devtools()` 排在最前面，这是 `@tanstack/devtools-vite` 自己的要求（它需要最先看到源码来注入 `data-tsd-source`）。

### 2.3 编译期注入的常量

插件通过 Vite 的 `define` 把一批值替换成字面量（`vite/plugin.js` 的 `createViteDefineConfig`），其中最关键的是：

- `process.env.TSS_SERVER_FN_BASE` —— server function 的 URL 前缀
- `process.env.TSS_ROUTER_BASEPATH` —— 路由 basepath
- `process.env.TSS_DEV_SERVER`、`TSS_PRERENDERING`、`TSS_SHELL` —— 运行模式开关

在本项目的产物里可以直接看到替换结果，`TSS_SERVER_FN_BASE` 是 `/_serverFn/`：

```js
// .output/public/assets/index-*.js（压缩后）
function xs(e) {
  let t = `/_serverFn/` + e;
  return Object.assign((...e) => { /* fetch */ }, { url: t, ... });
}
```

这也解释了为什么这些值不能在运行时改：它们在打包时就已经写死了。

### 2.4 `appType: "custom"`

插件把 `appType` 设成 `custom`，意思是 Vite 不再负责“找到 index.html 并注入脚本”。整个 HTML 由 Start 的服务端运行时渲染产出。项目里也确实没有根目录的 `index.html`。

### 2.5 开发模式：没有独立服务器

`vite/dev-server-plugin/plugin.js` 往 Vite 开发服务器上挂了一个中间件，把每个请求转成 Web `Request`，再通过 SSR 环境的 module runner 动态导入服务端入口并调用它的 `fetch`：

```js
viteDevServer.middlewares.use(async (req, res) => {
  const webReq = new NodeRequest({ req, res });
  const serverRunner = serverEnv.runner;
  return sendNodeResponse(
    res,
    await (
      await serverRunner.import(ENTRY_POINTS.server)
    ).default.fetch(webReq),
  );
});
```

所以开发时并不存在“Node 服务器 + Vite 前端”两个进程，只有 Vite 一个进程。服务端代码走 Vite 的模块图，改 server function 会热更新，不需要重启。

值得注意的是本项目的 `dev` 脚本：

```json
"dev": "dotenv -e .env.local -- sh -c \"NODE_OPTIONS='--import ./instrument.server.mjs' vite dev --port 3000\""
```

`instrument.server.mjs` 用 `--import` 在 Node 启动阶段加载，先于任何应用代码。这是 Sentry 这类需要打补丁的库的标准接法，也是一段确定只在服务端存在的代码——它不在 Vite 的模块图里，客户端产物完全看不到它。

### 2.6 生产构建：Vite 产出，Nitro 组装

`pnpm build` 之后的产物结构：

```
.output/
├── public/          # client 环境的产物（Vite）+ public/ 目录原样拷贝
│   └── assets/
├── server/          # ssr 环境的产物，被 Nitro 包装成服务器
│   ├── index.mjs    # Nitro 入口
│   ├── _ssr/        # SSR 代码块
│   └── _libs/       # 外部依赖
└── nitro.json
```

Nitro 在这里承担的是“把一份 fetch handler 变成真正的服务器”：提供 h3 的 HTTP 层、静态资源服务、preset 适配（Node / Cloudflare / Vercel 等）。它不参与 SSR 渲染逻辑本身。

从 `.output/nitro.json` 能看到本项目的配置：

```json
{
  "preset": "node-server",
  "serverEntry": "server/index.mjs",
  "publicDir": "public"
}
```

换部署平台基本上就是换 preset。这跟 Next.js 把服务器实现绑在框架里是不同的取向。

---

## 3. 后端是怎么实现的

### 3.1 一个 handler，三段分派

服务端的全部入口是 `createStartHandler`，它返回一个 `(request: Request) => Promise<Response>`。请求进来后按顺序判断（`start-server-core/dist/esm/createStartHandler.js`）：

**第一段，server function。** 如果路径以 `TSS_SERVER_FN_BASE` 开头，取出后面的 ID 交给 `handleServerAction`：

```js
if (SERVER_FN_BASE && url.pathname.startsWith(SERVER_FN_BASE)) {
  const serverFnId = url.pathname.slice(SERVER_FN_BASE.length).split("/")[0];
  // ... handlerType: "serverFn"
}
```

**第二段，server route。** 走 `handleServerRoutes`，匹配文件路由上的 `server.handlers`（GET/POST/…）。如果命中就返回它的 `Response`。

**第三段，SSR。** 前两段都没接住，才进 `executeRouter`：创建 router 实例、`router.load()` 跑 `beforeLoad`/`loader`、渲染并流式输出 HTML，同时把 loader 数据脱水（dehydrate）进 HTML。

顺序意味着：server function 的 URL 前缀会优先于任何同名页面路由，server route 会优先于页面渲染。

### 3.2 请求上下文靠 AsyncLocalStorage

`getRequest()`、`getCookie()`、`setResponseHeader()` 这些工具不需要传参就能在调用栈任意深度拿到当前请求，靠的是 `@tanstack/start-storage-context` 的 AsyncLocalStorage：

```js
runWithStartContext({ getRouter, request, handlerType: "serverFn", ... }, () =>
  handleServerAction({ request, serverFnId }),
);
```

推论有两条。一是这些函数必须在请求周期内调用，模块顶层调用会抛错。二是不要在模块作用域缓存请求相关的值（cookie、header、部分平台的环境变量），并发请求之间会串。

### 3.3 SSR 渲染模式

默认是流式（`defaultStreamHandler`）。也可以按路由用 `ssr` 选项收窄：

- `ssr: true`（默认）loader 和组件都在服务端跑
- `ssr: 'data-only'` loader 在服务端跑，组件只在客户端渲染
- `ssr: false` 两者都只在客户端

约束是子路由只能比父路由更严格，不能反向放宽。

---

## 4. Server function：编译器做了什么

这是 Start 最值得理解的部分。一个 `createServerFn` 调用会被编译成三种不同的产物，取决于目标环境。

### 4.1 三个编译目标

看 `start-compiler/handleCreateServerFn.js` 里的模板：

```js
var serverRpcTemplate = template.expression(
  `createServerRpc(%%serverFnMeta%%, %%fn%%)`,
);
var clientRpcTemplate = template.expression(`createClientRpc(%%functionId%%)`);
var ssrRpcManifestTemplate = template.expression(
  `createSsrRpc(%%functionId%%)`,
);
```

对应关系是：

第一种，provider 文件。编译器给源文件挂一个 `?tss-serverfn-split` 查询参数生成一个虚拟模块，把 handler 的函数体搬进去，包成 `createServerRpc(meta, fn)`。这是真正执行业务逻辑的那份代码，只存在于服务端。

第二种，client 环境的调用点。替换成 `createClientRpc(functionId)`——一个只知道 ID 的 fetch 存根，handler 函数体和 `validator` 都被剥掉（源码里 `context.env === "client"` 时执行 `stripMethodCall`）。所以校验逻辑不会泄漏到浏览器，也不会在浏览器里重复执行。

第三种，ssr 环境的调用点。替换成 `createSsrRpc(functionId)`。这个值得单独说。

### 4.2 SSR 调用不走 HTTP

`createSsrRpc` 的实现（`start-server-core/dist/esm/createSsrRpc.js`）：

```js
var createSsrRpc = (functionId) => {
  const fn = async (...args) =>
    (await getServerFnById(functionId, { origin: "server" }))(...args);
  return Object.assign(fn, { url, serverFnMeta, [TSS_SERVER_FUNCTION]: true });
};
```

服务端渲染时调用 server function，是从 manifest 里查出函数直接在进程内调用，**没有 HTTP 往返**。这就是为什么官方反复强调不要在 loader 里 `fetch('/api/...')`：那样才真的会产生一次自己打自己的网络请求，而直接调用 server function 不会。

服务端的 manifest 是编译期生成的（`start-compiler/server-fn-resolver-module.js`），在本项目 `.output/server/_ssr/ssr.mjs` 里能看到实物：

```js
const manifest = {
  fcc733bc0bbe9d000fa499552efa4b570a9c460869efdec192a268315800ff3e: {
    functionName: "listProblems_createServerFn_handler",
    importer: () => import("./problems-DSIDq0QT.mjs"),
  },
  // ... 另外 6 个
};
```

`importer` 是动态导入，所以只有被调用的 server function 才会真正加载对应的代码块。

### 4.3 函数 ID 的来历

生产构建里 ID 是 `sha256("<相对路径>--<函数名>")`（`start-compiler/compiler.js`）：

```js
const entryId = `${opts.filename}--${opts.functionName}`;
functionId = crypto.createHash("sha256").update(entryId).digest("hex");
```

可以直接验证。本项目 `listProblems` 的 ID：

```bash
node -e "console.log(require('node:crypto').createHash('sha256')
  .update('src/server/problems.ts--listProblems_createServerFn_handler')
  .digest('hex'))"
# fcc733bc0bbe9d000fa499552efa4b570a9c460869efdec192a268315800ff3e
```

和产物里的 manifest key 完全一致。

这带来一个实际影响：**重命名文件或函数会改变 server function 的 URL。** 开发模式下 ID 不是哈希，而是 `{file, export}` 的 base64url 编码，方便调试。

### 4.4 线上协议

客户端存根的行为在 `client-rpc/serverFnFetcher.js`：请求带 `x-tsr-serverFn: true` 头；`GET` 把序列化后的参数编码进 query string，`POST` 放进 body。

可以直接用 curl 调，这是最直观的验证。启动本项目构建产物后：

```bash
ID=fcc733bc0bbe9d000fa499552efa4b570a9c460869efdec192a268315800ff3e
curl -H "x-tsr-serverFn: true" "http://localhost:3111/_serverFn/$ID"
# Forbidden        （HTTP 403）
```

403 是因为 CSRF 保护。补上同源 `Origin` 就能拿到数据：

```bash
curl -H "x-tsr-serverFn: true" -H "Origin: http://localhost:3111" \
     "http://localhost:3111/_serverFn/$ID"
```

```
HTTP/1.1 200
content-type: application/json
x-tss-serialized: true

{"t":10,"i":0,"p":{"k":["result","error","context"],"v":[{"t":9,"i":1,"a":[{"t":10,"i":2,
"p":{"k":["id","title","difficulty","description","createdAt","updatedAt","examples","solutions"],
"v":[{"t":0,"s":7},{"t":1,"s":"检查是否是类的对象实例"},...,{"t":5,"i":3,"s":"2026-08-29T06:23:38.085Z"},...
```

两点值得注意。

一是序列化用的是 seroval 的 cross-JSON 格式，不是普通 JSON。`{"t":5,...}` 是 Date，`{"t":1,...}` 是字符串，`{"t":0,...}` 是数字。所以 `createdAt` / `updatedAt` 到了客户端仍然是真正的 `Date` 实例，Prisma 返回的对象不需要手工转换。Map、Set、`Promise`、`ReadableStream` 也在支持范围内。

二是响应体里同时带 `result`、`error`、`context` 三个槽位。抛出的错误、`redirect()`、`notFound()` 都通过这个结构跨越边界，在客户端被重新抛出成同类型的对象。

### 4.5 CSRF 有个容易踩的坑

`createStartHandler.js` 里这一行决定了默认保护是否生效：

```js
requestMiddleware: hasStartInstance ? startOptions.requestMiddleware : [defaultCsrfMiddleware],
```

意思是：

- 项目里**没有** `src/start.ts` 时，框架自动挂上默认的 CSRF 中间件。本项目就是这种情况（`src/start.ts` 不存在），所以上面那个 curl 会吃到 403。
- 项目里**有** `src/start.ts` 并用了 `createStart` 时，默认中间件被你自己的 `requestMiddleware` 完全替换。如果你没显式加 CSRF，保护就消失了，只会在控制台看到一段警告。

所以一旦你为了加全局中间件而引入 `src/start.ts`，必须自己把 CSRF 加回去：

```ts
// src/start.ts
import { createStart, createCsrfMiddleware } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
```

### 4.6 server function 是公开端点

编译产物决定了这一点：每个 server function 都是一个可以被独立请求的 URL，和哪个页面调用它无关。所以鉴权必须写在 handler 或中间件里，路由的 `beforeLoad` 只管 UI 体验，不是数据边界。

本项目目前没有鉴权（单人题解本，所有 server function 都是公开的写接口）。如果以后要放到公网可写，`createProblem` / `deleteProblem` 这类必须在 handler 里加权限判断，光在 `/dashboard` 路由上加 `beforeLoad` 是不够的。

---

## 5. 另外两个后端原语

### 5.1 server route：需要裸 HTTP 契约时用

server function 的 URL 是哈希，不适合作为对外接口。要暴露稳定的 HTTP 端点（webhook、第三方回调、RSS、文件下载），用文件路由上的 `server` 属性：

```ts
// src/routes/api/health.ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({ ok: true }),
    },
  },
});
```

同一个文件可以既有 `server.handlers` 又有 `component`，按请求方法和 `Accept` 分流。

选择标准很清晰：数据只给自己的前端用就写 server function，从 loader 直接调；HTTP 契约本身是产品的一部分才写 server route。两者都需要时，把业务逻辑放进一个服务模块，让两边都调它，而不是让 loader 去 `fetch` 自己的 API 路由。

本项目没有 server route，所有数据都是自用的。

### 5.2 middleware：两种，别混淆

`createMiddleware()` 有两个类型，能力范围不同。

请求中间件（不带 `type`）作用于所有服务端请求，包括 SSR、server route、server function，只有 `.server()` 阶段：

```ts
const loggingMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    console.log(request.method, request.url);
    return next();
  },
);
```

函数中间件（`{ type: 'function' }`）只作用于 server function，但多了 `.client()` 阶段和 `.validator()`：

```ts
const authMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next, request }) => {
    const session = await getSession(request.headers);
    if (!session) throw new Error("Unauthorized");
    return next({ context: { session } }); // 往下游传类型化的 context
  },
);

const listMine = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return db.problem.findMany({ where: { userId: context.session.userId } });
  });
```

链式方法的顺序被类型系统强制：`middleware()` → `validator()` → `client()` → `server()`。写反了是类型错误。

请求中间件挂在 `src/start.ts` 的 `requestMiddleware` 上成为全局中间件，也就是 4.5 节说的那个会顶掉默认 CSRF 保护的地方。

---

## 6. 对照本项目

### 6.1 文件职责

```
src/
├── router.tsx                  # getRouter() 工厂，两端共用
├── routes/
│   ├── __root.tsx              # 文档外壳：<html>/<head>/<body> + HeadContent + Scripts
│   ├── index.tsx               # /            loader: listProblems()
│   ├── dashboard.tsx           # /dashboard   增删改
│   └── problems.$problemId.tsx # /problems/:id 详情 + 编辑器
├── routeTree.gen.ts            # 由插件生成，勿手改
├── server/problems.ts          # 7 个 server function（唯一的服务端逻辑）
├── data/problems.ts            # 数据层接缝（见 5.3）
├── db.ts                       # Prisma client 单例
└── integrations/tanstack-query/root-provider.tsx
```

`__root.tsx` 里有两个不能省的组件：`<HeadContent />` 输出 `head` 内容，`<Scripts />` 输出客户端脚本。少了 `<Scripts />` 页面能渲染但不会 hydrate，表现为“静态页面，点击无反应”。

`src/router.tsx` 的 `basepath` 是为静态部署加的：

```tsx
const router = createTanStackRouter({
  routeTree,
  context,
  basepath: import.meta.env.BASE_URL,
  scrollRestoration: true,
  defaultPreload: "intent",
});
```

### 6.2 一次请求的完整链路

首屏访问 `/problems/7`：

1. 请求进 `createStartHandler`，路径不以 `/_serverFn/` 开头，也没有 server route 匹配，落到第三段 SSR。
2. `router.load()` 执行 `problems.$problemId.tsx` 的 loader，loader 调 `getProblem({ data: { id: 7 } })`。
3. 这里是 ssr 环境的编译产物，即 `createSsrRpc`，从 manifest 查到函数后进程内直接调用，跑 Prisma 查询。没有 HTTP 往返。
4. 结果被 seroval 脱水进 HTML，随流式响应一起发出。
5. 浏览器加载 `index-*.js` 并 hydrate，loader 数据直接从 HTML 里的脱水数据取，不会重复请求。

之后在页面上点保存：

1. `saveSolution(...)` 调用命中的是 client 环境的编译产物，即 `createClientRpc`。
2. 发出 `POST /_serverFn/<saveSolution 的 sha256>`，带 `x-tsr-serverFn: true`。
3. 请求进 `createStartHandler` 第一段，`handleServerAction` 按 ID 取出函数，校验 method，用 seroval 反序列化参数，执行 handler。
4. 返回结果反序列化成 `Solution & { _count }`。
5. 页面 `await router.invalidate()` 让 loader 重跑，这次是在浏览器里跑，走 `createClientRpc` 请求 `getProblem`。

同一个 `getProblem` 调用点，首屏是进程内直调，客户端导航是 HTTP 请求，源码只有一份。这就是同构模型的实际形态。

### 6.3 静态构建为什么能成立

本项目额外支持一个 `build:static`，产出纯静态站点部署到 GitHub Pages。它建立在两个机制上。

一是 Start 的 SPA 模式，把整个应用变成客户端渲染，只预渲染一个外壳：

```ts
tanstackStart({
  router: { basepath: base },
  spa: { enabled: true, prerender: { outputPath: "/index" } },
});
```

二是 Vite 的 alias，在静态构建时把数据层整体换掉：

```ts
alias: staticBuild
  ? { "#/data/problems.ts": resolve("src/data/problems.static.ts") }
  : {};
```

`src/data/problems.ts` 默认转发到 `src/server/problems.ts`（server function 版本），静态构建时被替换成 `src/data/problems.static.ts`（Dexie/IndexedDB 版本）。因为没有任何模块再引用 server function，整条 Prisma 依赖链被 tree-shake 掉。

这个替换之所以干净，恰恰因为 server function 的调用约定就是普通的异步函数调用（`fn({ data })`），没有 `"use server"` 之类的语法标记，也没有必须由框架注入的运行时。换成任意同签名的实现即可，UI 代码一行不用改。

### 6.4 本项目的几个注意点

`tsconfig.json` 开了 `verbatimModuleSyntax: true`，而 Start 官方指引把这一项列为应当关闭（它可能导致服务端模块被保留进客户端产物）。我核对过当前构建产物，客户端 bundle 里没有 `PrismaClient` 或 `better-sqlite3`，也就是说目前没有实际泄漏。但这是官方标注的风险点，改动数据层引用关系时值得复查一次产物。

`src/db.ts` 和 `src/server/problems.ts` 都没有用 `.server.ts` 后缀，也没有 `import '@tanstack/react-start/server-only'` 标记，所以没有开启 import protection。如果哪天有组件误引了 `#/db.ts`，构建不会报错，Prisma 会直接进客户端产物。把 `src/db.ts` 改名成 `src/db.server.ts` 可以把这个错误提前到构建期。

`instrument.server.mjs` 走 `NODE_OPTIONS --import`，不在 Vite 模块图里，所以 Sentry 的服务端 SDK 不会影响客户端体积。`VITE_SENTRY_DSN` 为空时它只打一行警告，不做任何事。

---

## 7. 和 Next.js 的差异

### 7.1 心智模型上的根本差异

Next.js App Router 是服务端优先：组件默认是 Server Component，只在服务端执行，要下发到客户端得显式写 `"use client"`。边界由指令划定，跨边界的数据必须可序列化。

TanStack Start 是同构优先：没有 RSC，所有组件都是普通 React 组件，既在服务端渲染也在客户端 hydrate。边界由函数划定——`createServerFn` 之内是服务端，之外是两端。

这导致两者的“默认危险方向”正好相反。Next.js 里容易犯的错是把客户端交互写进 Server Component；Start 里容易犯的错是把数据库查询写进 loader（它会被打进客户端产物）。

### 7.2 API 对照

| 需求         | Next.js App Router                      | TanStack Start                                   |
| ------------ | --------------------------------------- | ------------------------------------------------ |
| 服务端取数   | Server Component 里直接 await           | `createServerFn` + 路由 `loader`                 |
| 变更操作     | Server Action（`"use server"`）         | `createServerFn({ method: 'POST' })`             |
| REST 端点    | `app/api/*/route.ts`                    | 文件路由的 `server.handlers`                     |
| 布局         | `app/layout.tsx`                        | 父路由 / `__root.tsx`                            |
| 中间件       | 根 `middleware.ts`（单一，Edge 运行时） | `createMiddleware`，可组合、可挂到全局或单个函数 |
| 路由参数类型 | 手写，或开启实验性 typedRoutes          | 从路由树全量推导                                 |
| 查询参数     | `useSearchParams`，`string \| null`     | `validateSearch` + Zod，类型化且可写回           |
| 元信息       | `metadata` 导出                         | 路由 `head()`                                    |

不要在 Start 里写 `getServerSideProps`、`"use server"`、`app/layout.tsx`——这些都不是 Start 的 API。

### 7.3 数据取用与缓存

Next.js 有多层服务端缓存（fetch 缓存、Full Route Cache、Router Cache），行为由 `fetch` 的选项和路由段配置共同决定，也是它最常被抱怨的部分。

Start 没有服务端 fetch 缓存层。缓存是路由级的：`staleTime`、`gcTime`、`router.invalidate()`。需要更细的缓存就自己接 TanStack Query，本项目就装了 `@tanstack/react-router-ssr-query` 做这件事：

```tsx
// src/router.tsx
setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });
```

它的作用是把 Query 的缓存接进 SSR 的脱水/注水流程。语义上更接近“你自己管缓存”，而不是框架替你猜。

### 7.4 变更操作的形态

Server Action 是 POST-only，围绕表单设计（`<form action={fn}>`、`useFormState`），返回值必须可序列化，调用点看起来像普通函数但实际有一套 React 运行时在背后调度。

server function 是显式的 RPC。可以指定 `GET` 或 `POST`，可以在 loader、事件处理、别的 server function 里调用，返回值经 seroval 序列化。它是一个普通的异步函数对象，上面挂了 `url` 和 `serverFnMeta` 属性。

实际差别体现在两个地方。一是 `GET` 的 server function 走的是可缓存的 HTTP 动词，配合 `setResponseHeader('cache-control', ...)` 能交给浏览器或 CDN 缓存（默认响应不带缓存头，需要自己加），Server Action 固定 POST，没有这个选项。二是 server function 可以被任意替换（本项目的静态构建就依赖这一点），Server Action 和 React 运行时绑定，做不到。

### 7.5 构建与部署

Next.js 自带服务器实现，`next start` 跑的是它自己的 Node 服务器；部署到非 Vercel 平台需要适配层。

Start 的服务端产物本质上是一个 `(Request) => Response`，由 Nitro 包装成目标平台的形态。换平台改 preset：`node-server`、`cloudflare-module`、`vercel` 等。本项目还利用这一点做了第三种形态——完全不要服务器的静态站点。

### 7.6 类型安全

这是差距比较明显的一处。Start 从路由树推导出 `to`、`params`、`search`、`loaderData` 的完整类型，写错路径或漏传参数是编译错误。`routeTree.gen.ts` 就是这套推导的载体，由插件生成，不要手改。

对应地，Start 的文档反复强调不要给推导出来的值加类型标注或做类型断言——那样只会把推导链打断。本项目 `src/data/problems.static.ts` 里的类型就是顺着这个思路写的，从 Prisma 的返回类型派生而不是手写：

```ts
type ProblemRow = Omit<ProblemListItem, "examples" | "solutions">;
type ExampleRow = ProblemListItem["examples"][number];
type SolutionRow = Omit<SolutionWithMeta, "_count">;
```

---

## 8. 容易踩的坑

Vite 插件顺序反了。`tanstackStart()` 必须在 `viteReact()` 之前。

在 loader 里直接查数据库。loader 是同构的，数据库驱动会被打进客户端产物，运行时报错。放进 `createServerFn`。

在 loader 里 `fetch('/api/...')`。SSR 阶段相对 URL 没有 base，而且这是一次自己打自己的网络请求。直接调 server function。

模块顶层读 `process.env`。一是有泄漏风险，二是在 Cloudflare Workers 这类按请求注入环境变量的平台上，模块顶层读到的是 `undefined`。放进 `.handler()` 里读。

给客户端用的变量忘了加 `VITE_` 前缀，或者反过来给服务端密钥加了 `VITE_` 前缀。后者会把密钥打进客户端产物。

`__root.tsx` 里漏了 `<Scripts />`。页面能出来但不会 hydrate。

以为 `beforeLoad` 能保护数据。server function 是独立可达的 URL，鉴权要写在 handler 或中间件里。

引入 `src/start.ts` 后没有把 CSRF 中间件加回去（见 4.5）。

改完 mutation 只更新本地组件状态，没有 `await router.invalidate()`。表现是刷新页面后数据变回去了。

重命名 server function 所在的文件或函数名会改变它的 URL。生产环境滚动发布期间，旧客户端可能请求已经不存在的 ID。
