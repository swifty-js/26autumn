---
title: HMR 热更新
description: Lark Mvc 的热模块替换机制详解，包括双层 HMR 架构、状态保留策略、跨打包器适配及 Module Federation 兼容方案
---

# HMR 热更新

Lark Mvc 实现了完整的热模块替换（Hot Module Replacement）支持，在开发阶段修改视图代码后无需刷新页面即可看到更新，同时**保留视图本地状态**（计数器、表单输入、滚动位置等）。

## 一、架构概览：双层 HMR

Lark Mvc 的 HMR 分为两个独立的层级，分别处理模板文件和视图逻辑文件的变更：

```
┌─────────────────────────────────────────────────────────┐
│                    HMR 触发                               │
├────────────────────────┬────────────────────────────────┤
│  模板层 (.html 变更)    │  视图层 (.ts 变更)              │
│  hotSwapByTemplate()   │  hotSwapByView()               │
│  只替换模板函数引用      │  重新执行 setup 函数            │
│  事件处理器不变         │  事件/模板/assign 全部更新       │
├────────────────────────┴────────────────────────────────┤
│              状态保留：ViewCtx 实例不变                    │
│     updater.data / resources / emitter / signature       │
└─────────────────────────────────────────────────────────┘
```

### 第一层：模板热替换（hotSwapByTemplate）

当 `.html` 模板文件变更时触发。只替换模板函数引用，不重新执行 setup：

```typescript
// hmr.ts
export function hotSwapByTemplate(
  oldTemplate: ViewTemplate,
  newTemplate: ViewTemplate,
): boolean {
  if (!oldTemplate || !newTemplate || oldTemplate === newTemplate) return false;
  let swapped = false;

  // 遍历所有已挂载的 Frame
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    if (!view || view.getTemplate() !== oldTemplate) continue;

    // 替换模板引用
    view.setTemplate(newTemplate);

    if (view.signature.value > 0) {
      view.signature.value++;
      view.fire("render");
      destroyAllResources(view, false);
      // 强制重新渲染（数据不变但模板变了）
      view.updater.forceDigest();
    }
    swapped = true;
  }
  return swapped;
}
```

**特点**：

- 事件处理器保持不变（它们存在于 `events` map 中，与模板无关）
- 使用 `forceDigest()` 强制渲染——因为数据没变，普通 `digest()` 不会触发更新
- 所有使用同一模板函数的视图实例都会被更新

### 第二层：视图 Setup 热替换（hotSwapByView）

当 `.ts` 视图文件变更时触发。重新执行 setup 函数，但复用同一个 `ViewCtx`：

```typescript
// hmr.ts
export function hotSwapByView(
  oldSetup: ViewSetup,
  newSetup: ViewSetup,
): boolean {
  if (!oldSetup || !newSetup || oldSetup === newSetup) return false;

  // 1. 更新视图注册表
  const reg = getViewClassRegistry();
  for (const path in reg) {
    if (reg[path] === oldSetup) reg[path] = newSetup;
  }

  // 2. 遍历所有 Frame，热替换匹配的视图
  let swapped = false;
  for (const [, frame] of Frame.getAll()) {
    const view = frame.view;
    const vp = frame.getViewPath();
    if (view && vp) {
      const parsed = parseUri(vp);
      if (reg[parsed.path] === newSetup) {
        hotSwapView(frame, newSetup);
        swapped = true;
      }
    }
  }
  return swapped;
}
```

## 二、状态保留机制

`hotSwapView` 是状态保留的核心——它复用现有的 `ViewCtx` 实例：

```typescript
// hmr.ts
export function hotSwapView(frame: FrameObj, newSetup: ViewSetup): void {
  const oldView = frame.view;
  if (!oldView) {
    // 视图未挂载，直接挂载
    const vp = frame.getViewPath();
    if (vp) frame.mountView(vp);
    return;
  }

  // 步骤 1：执行旧的 useEffect 清理函数
  for (let i = oldView.cleanups.length - 1; i >= 0; i--) {
    oldView.cleanups[i]();
  }
  oldView.cleanups.length = 0;

  // 步骤 2：注销旧事件
  unregisterEvents(oldView);

  // 步骤 3：销毁 destroyOnRender 资源
  destroyAllResources(oldView, false);

  // 步骤 4：重新执行 setup（使用同一个 ctx！）
  setCurrentCtx(oldView);
  let descriptor: ReturnType<ViewSetup>;
  try {
    descriptor = newSetup(oldView, undefined);
  } finally {
    setCurrentCtx(null);
  }

  // 步骤 5：更新模板/事件/assign
  oldView.setTemplate(descriptor.template);
  oldView.setEvents(descriptor.events);
  if (descriptor.assign) oldView.setAssign(descriptor.assign);

  // 步骤 6：注册新事件
  registerEvents(oldView);

  // 步骤 7：强制重新渲染
  if (oldView.signature.value > 0) {
    oldView.signature.value++;
    oldView.fire("render");
    destroyAllResources(oldView, false);
    oldView.updater.forceDigest();
  }
}
```

### 保留的状态

| 状态           | 保留原因                            |
| -------------- | ----------------------------------- |
| `updater.data` | 同一个 ctx 实例，data 对象未被替换  |
| `resources`    | 只有 `destroyOnRender` 的资源被销毁 |
| `emitter`      | 同一个 ctx 实例上的事件发射器       |
| `signature`    | 递增而非重置，保持异步守卫有效      |
| `id` / `owner` | 视图标识和 Frame 归属不变           |

### useState 在 HMR 中的行为

```typescript
// hooks.ts 中 useState 的初始化逻辑
const existing = ctx.updater.get<unknown>(key);
if (existing === undefined) {
  ctx.updater.set({ [key]: initial });
}
```

由于 `updater.data` 被保留，HMR 重新执行 setup 时 `existing !== undefined`，**不会覆盖已有数据**。这是状态保留的关键设计。

## 三、打包器适配：HMR 代码注入

### 为什么需要自动注入？

类似 React 的 `@vitejs/plugin-react` 和 Vue 的 `@vitejs/plugin-vue`，Lark 的构建插件会自动在编译输出中注入 HMR 代码，开发者无需手动编写 `import.meta.hot` 样板代码。

### 注入目标

`hmr-inject.ts` 负责生成两种 HMR 代码片段：

1. **模板模块**（`.html` 编译产物）：注入 `hotSwapByTemplate` 调用
2. **视图模块**（`.ts` 文件）：注入 `hotSwapByView` 调用

### Vite 适配（import.meta.hot）

Vite 的 `accept(cb)` 中，回调是**更新成功回调**，接收新模块作为参数：

```javascript
// 模板 HMR — Vite
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldTemplate = __lark_template__;
  });
  import.meta.hot.accept((newMod) => {
    const newTemplate = newMod?.default;
    const oldTemplate = import.meta.hot.data?.oldTemplate;
    if (oldTemplate && newTemplate && oldTemplate !== newTemplate) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  });
}
```

```javascript
// 视图 HMR — Vite
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.oldView = __lark_view__;
  });
  import.meta.hot.accept((newMod) => {
    const newView = newMod?.default;
    const oldView = import.meta.hot.data?.oldView;
    if (oldView && newView && oldView !== newView) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByView) hmr.hotSwapByView(oldView, newView);
    }
  });
}
```

### Webpack/Rspack 适配（import.meta.webpackHot）

Webpack/Rspack 的 `accept(cb)` 中，回调是**错误处理器**（只在更新失败时执行），不能在其中放置替换逻辑。正确模式是**自接受 + dispose + 顶层数据检查**：

```javascript
// 模板 HMR — Webpack/Rspack
if (import.meta.webpackHot) {
  // 顶层检查：HMR 重新执行时，data 中存有旧模板引用
  const oldTemplate = import.meta.webpackHot.data?.oldTemplate;
  if (oldTemplate) {
    const newTemplate = __lark_template__;
    if (oldTemplate !== newTemplate) {
      const hmr = globalThis.__lark_hmr__;
      if (hmr && hmr.hotSwapByTemplate)
        hmr.hotSwapByTemplate(oldTemplate, newTemplate);
    }
  }
  // dispose：模块被替换前保存旧引用
  import.meta.webpackHot.dispose((data) => {
    data.oldTemplate = __lark_template__;
  });
  // accept()：无参数，标记为自接受
  import.meta.webpackHot.accept((err) => {
    if (err) {
      console.error(err);
      globalThis.location?.reload();
    }
  });
}
```

### 跨打包器差异总结

| 打包器  | HMR 上下文               | accept(cb) 语义            | 替换逻辑位置           |
| ------- | ------------------------ | -------------------------- | ---------------------- |
| Vite    | `import.meta.hot`        | 成功回调（接收 newModule） | accept 回调内          |
| Webpack | `import.meta.webpackHot` | 错误处理器                 | 模块顶层（重新执行时） |
| Rspack  | `import.meta.webpackHot` | 错误处理器                 | 模块顶层（重新执行时） |

### Webpack/Rspack 自接受工作流

```
1. 文件变更 → Webpack 检测到模块需要更新
2. 调用 dispose(cb) → 保存旧引用到 hot.data
3. 从模块缓存中驱逐旧模块
4. 重新执行模块顶层代码（新代码）
5. 顶层代码检查 hot.data → 发现旧引用 → 执行替换
6. 调用 accept() 确认自接受
```

## 四、globalThis.**lark_hmr**：规避 Module Federation 问题

### 问题背景

在 Module Federation 架构下（`@mm/lark-mvc` 作为 shared singleton），如果 HMR 回调中通过 `import`/`require` 引用 `@mm/lark-mvc`，会产生严重的副作用：

```
HMR 回调中 import "@mm/lark-mvc"
  → Webpack 将调用模块注册为 shared consumer
  → 主 chunk（shared scope 初始化器）被标记为需要 hot-update
  → 但主 chunk 代码实际未变更，不会生成 main.<hash>.hot-update.js
  → HMR 运行时请求 404
  → ChunkLoadError: Loading hot update chunk main failed
  → accept 回调永远不执行 → UI 不更新
```

### 解决方案

通过 `globalThis.__lark_hmr__` 全局对象暴露 HMR 函数，完全绕过模块解析：

```typescript
// hmr.ts — 框架启动时注册
if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
  globalThis.__lark_hmr__ = {
    hotSwapByTemplate,
    hotSwapByView,
  };
}
```

```typescript
// framework.ts — boot() 中再次确保注册
boot(cfg?: FrameworkConfig): void {
  if (typeof globalThis !== "undefined" && !globalThis.__lark_hmr__) {
    globalThis["__lark_hmr__"] = { hotSwapByTemplate, hotSwapByView };
  }
  // ...
}
```

HMR 代码片段中通过全局对象访问：

```javascript
const hmr = globalThis.__lark_hmr__;
if (hmr && hmr.hotSwapByTemplate)
  hmr.hotSwapByTemplate(oldTemplate, newTemplate);
```

**优势**：

- 无 import/require → 无 chunk-graph 副作用
- 无模块解析 → 不触发 Module Federation shared scope
- 框架启动时注册一次，所有 HMR 回调共享

## 五、视图文件的 HMR 转换

### export default 重写

为了让 HMR 代码能引用视图 setup 函数，`injectViewHmrSnippet` 会将 `export default` 重写为命名常量：

```typescript
// 原始代码
export default defineView((ctx) => {
  // ...
});

// 转换后
const __lark_view__ = defineView((ctx) => {
  // ...
});
export default __lark_view__;

// + HMR 代码片段
if (import.meta.hot) { ... }
```

### 检测条件

只有导入了 `.html` 模板的 `.ts` 文件才会被注入视图 HMR：

```typescript
// hmr-inject.ts
const HTML_IMPORT_RE =
  /import\s+(?:template\s+from\s+|.*from\s+)?["'][^"']+\.html["']/;

export function importsHtmlTemplate(source: string): boolean {
  return HTML_IMPORT_RE.test(source);
}
```

不导入模板的文件（如纯工具模块）不会被注入 HMR 代码，修改它们会触发全页刷新。

## 六、forceDigest：模板变更后的强制渲染

普通 `digest()` 只在数据变更时触发渲染。但 HMR 替换模板后，数据没变、模板变了——需要强制渲染：

```typescript
// updater.ts
function forceDigest(): void {
  hasChangedFlag = 1;
  changedKeys = new Set(Object.keys(data)); // 标记所有键为已变更
  digest();
}
```

这确保了新模板会基于现有数据完整重新渲染。

## 七、HMR 开发最佳实践

### 状态保留友好的写法

```typescript
export default defineView((ctx) => {
  // 好：useState 在 HMR 时不会覆盖已有数据
  const [getCount, setCount] = useState("count", 0);

  // 好：useEffect 的 cleanup 会在 HMR 时执行，然后重新运行 effect
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");
    return () => ws.close(); // HMR 时正确关闭旧连接
  });

  // 避免：直接 set 会覆盖 HMR 前的数据
  // ctx.updater.set({ count: 0 }); // 不要这样写

  return { template, events: { ... } };
});
```

### HMR 不生效的排查

| 症状              | 可能原因                    | 解决方案                                   |
| ----------------- | --------------------------- | ------------------------------------------ |
| 修改 .html 无反应 | 插件未正确配置              | 检查 vite.config / webpack config          |
| 修改 .ts 全页刷新 | 文件未导入 .html            | 确保有 `import template from "./xxx.html"` |
| ChunkLoadError    | Module Federation 冲突      | 确认使用 globalThis.**lark_hmr**           |
| 状态丢失          | setup 中硬编码初始值        | 使用 useState 代替 updater.set             |
| Webpack 下不更新  | swap 逻辑放在 accept(cb) 中 | 使用自接受模式（顶层 data 检查）           |

### 生产构建

在生产环境中，HMR API（`import.meta.hot` / `import.meta.webpackHot`）为 `undefined`，整个 `if` 块是死代码，会被 tree-shaking 移除——零运行时开销。

## 八、完整 HMR 流程图

```
开发者修改 counter.html
        │
        ▼
Vite/Webpack 检测到文件变更
        │
        ▼
重新编译模板 → 新的 __lark_template__ 函数
        │
        ▼
触发 HMR dispose → 保存旧模板引用到 hot.data
        │
        ▼
Vite: accept(newMod) 回调执行
Webpack: 模块重新执行，顶层检查 hot.data
        │
        ▼
调用 globalThis.__lark_hmr__.hotSwapByTemplate(old, new)
        │
        ▼
遍历所有 Frame，找到使用旧模板的视图
        │
        ▼
view.setTemplate(newTemplate)
        │
        ▼
view.updater.forceDigest() → 用新模板 + 旧数据重新渲染
        │
        ▼
DOM diff 更新界面，状态完整保留 ✓
```
