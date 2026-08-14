---
title: TypeScript 支持
description: Lark Mvc 框架的 TypeScript 类型系统详解，涵盖泛型视图定义、Store 类型推断、双格式类型声明、严格模式配置及类型增强模式。
---

# TypeScript 支持

Lark Mvc 是一个 TypeScript-first 的前端框架，所有核心 API 均使用 TypeScript 编写，提供完整的类型推断和泛型支持。框架采用函数式 API 设计（无 class、无 this、无 prototype），结合 TypeScript 的类型系统，为开发者提供极致的开发体验和编译时安全保障。

## 一、类型系统概览

### 1.1 核心类型架构

框架的类型定义集中在 `src/types.ts` 中，作为所有模块的单一类型真相源（Single Source of Truth）。主要类型分类：

```
types.ts
├── 函数类型        AnyFunc
├── 缓存类型        CacheEntry, CacheOptions, CacheApi
├── 事件类型        EventListenerEntry, EmitterApi, ChangeEvent
├── URI/路由类型    ParsedUri, Location, LocationDiff, RouterApi
├── DOM 类型       DomRef, DomOp, DomElement
├── VDOM 类型      VDomNode, VDomRef, VDomTemplate
├── 视图类型        ViewSetup, ViewCtx, ViewTemplate, FrameObj
├── 状态类型        StateApi, StoreApi
├── 服务类型        ServiceMetaEntry, PayloadApi, ServiceApi
├── 更新器类型      UpdaterApi
├── 框架配置类型    FrameworkConfig, FrameworkApi
└── 编译选项类型    CompileOptions
```

### 1.2 类型导入方式

```typescript
// 从主入口导入所有类型
import type {
  ViewSetup,
  ViewCtx,
  RouterApi,
  Location,
  FrameworkConfig,
  StateApi,
  UpdaterApi,
} from "@mm/lark-mvc";

// 类型通过 export * from "./types" 全量导出
```

## 二、泛型视图定义

### 2.1 `ViewSetup<T>` 泛型参数

`ViewSetup` 是视图定义函数的核心类型，支持泛型参数 `T` 用于约束初始化参数的类型：

```typescript
// types.ts 中的定义
export type ViewSetup<T = unknown> = (
  ctx: ViewCtx,
  params?: T,
) => {
  template?: ViewTemplate | VDomTemplate;
  events?: Record<string, AnyFunc>;
  assign?: (options?: unknown) => boolean | undefined;
};
```

### 2.2 使用 `defineView` 定义类型安全的视图

```typescript
import { defineView } from "@mm/lark-mvc";
import type { ViewCtx } from "@mm/lark-mvc";
import template from "./user-detail.html";

// 定义视图初始化参数类型
interface UserDetailParams {
  userId: string;
  mode?: "edit" | "view";
}

// 泛型参数确保 params 的类型安全
const userDetailView = defineView<UserDetailParams>((ctx, params) => {
  // params 被推断为 UserDetailParams | undefined
  const userId = params?.userId; // string | undefined
  const mode = params?.mode; // "edit" | "view" | undefined

  ctx.updater.set({
    userId,
    isEditing: mode === "edit",
  });

  return {
    template,
    events: {
      "save<click>"(e: Event) {
        // 事件处理函数
      },
    },
    assign(options) {
      // 父视图数据更新时的回调
      return true;
    },
  };
});

export default userDetailView;
```

### 2.3 ViewCtx 完整类型

`ViewCtx` 是传递给每个视图 setup 函数的上下文对象，提供框架 API 访问：

```typescript
export interface ViewCtx {
  /** 视图 ID（与 owner frame ID 相同） */
  id: string;
  /** 所属 Frame 引用 */
  owner: FrameObj;
  /** 数据绑定更新器 */
  updater: UpdaterApi;
  /** 签名：>0 表示活跃，render 时递增，0 = 已销毁 */
  signature: Ref<number>;
  /** 是否已渲染过至少一次 */
  rendered: Ref<boolean>;

  // 模板管理
  getTemplate(): ViewTemplate | VDomTemplate | undefined;
  setTemplate(v: ViewTemplate | VDomTemplate | undefined): void;

  // 路由观察
  locationObserved: ViewLocationObserved;
  observeLocation(
    params: string | string[] | Record<string, unknown>,
    observePath?: boolean,
  ): void;

  // 状态观察
  getObservedStateKeys(): string[] | undefined;
  setObservedStateKeys(v: string[] | undefined): void;
  observeState(keys: string | string[]): void;

  // 资源管理
  resources: Record<string, ViewResourceEntry>;
  capture(key: string, resource?: unknown, destroyOnRender?: boolean): unknown;
  release(key: string, destroy?: boolean): unknown;

  // 事件系统
  emitter: EmitterApi;
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void;
  on(event: string, handler: AnyFunc): () => void;
  off(event: string, handler?: AnyFunc): void;

  // 生命周期
  render(): void;
  beginUpdate(id?: string): void;
  endUpdate(id?: string, inner?: boolean): void;
  wrapAsync<Fn extends AnyFunc>(
    fn: Fn,
    context?: unknown,
  ): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined;

  // 事件和 assign 管理
  getEvents(): Record<string, AnyFunc> | undefined;
  setEvents(v: Record<string, AnyFunc> | undefined): void;
  getAssign(): ((options?: unknown) => boolean | undefined) | undefined;
  setAssign(v: ((options?: unknown) => boolean | undefined) | undefined): void;

  // useEffect 清理函数
  cleanups: Array<() => void>;
}
```

## 三、Store 类型系统

### 3.1 `StoreApi<T>` 泛型接口

Store 采用 zustand 对齐的 API 设计，完整支持泛型类型推断：

```typescript
// store.ts
export interface StoreApi<T = object> {
  getState(): T;
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prevState: T) => void): () => void;
  destroy(): void;
}
```

### 3.2 类型安全的 Store 创建

```typescript
import { createStore, computed } from "@mm/lark-mvc";

// 定义 Store 状态类型
interface TodoState {
  todos: Array<{ id: number; text: string; done: boolean }>;
  filter: "all" | "active" | "completed";
  // 计算属性
  remaining: number;
}

// createStore 自动推断泛型类型
const todoStore = createStore<TodoState>("todos", (set, get) => ({
  todos: [],
  filter: "all",
  // computed 返回类型与声明一致
  remaining: computed(
    ["todos"],
    () => get().todos.filter((t) => !t.done).length,
  ),
}));

// 类型安全的状态读取
const state = todoStore.getState();
state.todos; // Array<{ id: number; text: string; done: boolean }>
state.filter; // "all" | "active" | "completed"
state.remaining; // number

// 类型安全的状态更新
todoStore.setState({ filter: "active" });
todoStore.setState((prev) => ({
  todos: [...prev.todos, { id: Date.now(), text: "新任务", done: false }],
}));

// 类型安全的订阅
const unsubscribe = todoStore.subscribe((state, prevState) => {
  if (state.filter !== prevState.filter) {
    console.log("过滤器变更:", state.filter);
  }
});
```

### 3.3 在视图中使用 Store

```typescript
import { defineView, useStore } from "@mm/lark-mvc";
import { todoStore } from "../stores/todo";
import template from "./todo-list.html";

export default defineView((ctx) => {
  // useStore 返回一个 getter 函数，调用后读取选中的状态
  const getTodoState = useStore(todoStore);

  // 调用 getter 读取当前状态（返回 Partial<TodoState>）
  const { todos, filter, remaining } = getTodoState();

  ctx.updater.set({ todos, filter, remaining });

  return {
    template,
    events: {
      "toggleFilter<click>"(e: Event) {
        const newFilter = (e.target as HTMLElement).dataset
          .filter as TodoState["filter"];
        todoStore.setState({ filter: newFilter });
      },
    },
  };
});
```

## 四、双格式类型声明（ESM + CJS）

### 4.1 package.json exports 配置

框架通过 `exports` 字段为每个入口提供 ESM 和 CJS 双格式类型声明：

```json
{
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./vite": {
      "import": {
        "types": "./dist/vite.d.ts",
        "default": "./dist/vite.js"
      },
      "require": {
        "types": "./dist/vite.d.cts",
        "default": "./dist/vite.cjs"
      }
    },
    "./runtime": {
      "import": {
        "types": "./dist/runtime.d.ts",
        "default": "./dist/runtime.js"
      },
      "require": {
        "types": "./dist/runtime.d.cts",
        "default": "./dist/runtime.cjs"
      }
    }
  }
}
```

### 4.2 类型解析规则

| 导入方式                                 | 解析的类型文件      | 运行时文件        |
| ---------------------------------------- | ------------------- | ----------------- |
| `import ... from "@mm/lark-mvc"`         | `dist/index.d.ts`   | `dist/index.js`   |
| `require("@mm/lark-mvc")`                | `dist/index.d.cts`  | `dist/index.cjs`  |
| `import ... from "@mm/lark-mvc/vite"`    | `dist/vite.d.ts`    | `dist/vite.js`    |
| `import ... from "@mm/lark-mvc/runtime"` | `dist/runtime.d.ts` | `dist/runtime.js` |

### 4.3 构建配置

使用 `tsup` 进行双格式构建，自动生成 `.d.ts` 和 `.d.cts` 声明文件：

```json
// package.json scripts
{
  "build": "pnpm build:tsup",
  "typecheck": "tsc -p tsconfig.build.json --noEmit"
}
```

## 五、严格模式配置

### 5.1 tsconfig.build.json

框架的 TypeScript 构建配置启用了严格模式及多项额外检查：

```json
{
  "compilerOptions": {
    // 严格模式（启用所有严格类型检查选项）
    "strict": true,

    // 额外安全检查
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUncheckedSideEffectImports": true,

    // 模块系统
    "module": "esnext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "isolatedModules": true,

    // 声明文件生成
    "declaration": true,
    "declarationDir": "./dist",

    // 目标与库
    "target": "esnext",
    "lib": ["esnext", "DOM", "DOM.Iterable"],

    // 互操作性
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,

    // 路径别名
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["./src/**/*.ts", "./src/**/*.d.ts"]
}
```

### 5.2 严格模式对开发者的影响

由于框架在 `strict: true` 下编译，所有导出的类型都经过严格检查。消费者项目建议同样启用严格模式以获得最佳类型推断：

```json
// 消费者项目 tsconfig.json 推荐配置
{
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "esnext"
  }
}
```

## 六、类型增强模式

### 6.1 全局类型声明（client.d.ts）

框架通过 `@mm/lark-mvc/client` 提供全局类型增强，消费者在 `tsconfig.json` 中引入：

```json
{
  "compilerOptions": {
    "types": ["@mm/lark-mvc/client"]
  }
}
```

或在代码中引用：

```typescript
/// <reference types="@mm/lark-mvc/client" />
```

### 6.2 提供的类型增强

```typescript
// client.d.ts 中的全局增强

// 1. import.meta.hot HMR 上下文
interface ImportMeta {
  hot?: {
    accept(cb?: (mod: { default?: unknown } | undefined) => void): void;
    dispose(cb: (data: unknown) => void): void;
    invalidate(): void;
  };
}

// 2. HTMLElement 扩展（Frame 绑定）
interface HTMLElement {
  frame?: FrameApi | undefined;
  frameBound?: number;
  autoId?: number;
}

// 3. Element 扩展（DOM diff 缓存）
interface Element {
  compareKeyCached?: number | undefined;
  cachedCompareKey?: string | undefined;
  "v-lark"?: string | undefined;
}

// 4. 全局 HMR 句柄
var __lark_hmr__: {
  hotSwapByTemplate: (
    oldTemplate: ViewTemplate,
    newTemplate: ViewTemplate,
  ) => boolean;
  hotSwapByView: (oldSetup: ViewSetup, newSetup: ViewSetup) => boolean;
};

// 5. 模块声明
declare module "*.html" {
  const template: ViewTemplate | VDomTemplate;
  export default template;
}

declare module "*.css" {
  const content: string;
  export default content;
}
```

### 6.3 HTML 模板模块类型

引入 client 类型后，`.html` 文件导入自动获得类型：

```typescript
// 无需额外声明，TypeScript 自动识别 .html 导入
import template from "./views/home.html";
// template 的类型为 ViewTemplate | VDomTemplate

// ViewTemplate 签名
type ViewTemplate = (data: unknown, viewId: string, refData: unknown) => string;

// VDomTemplate 签名
type VDomTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => VDomNode;
```

### 6.4 自定义类型增强

开发者可以扩展框架类型以满足项目需求：

```typescript
// types/lark-augment.d.ts
import "@mm/lark-mvc";

declare module "@mm/lark-mvc" {
  // 扩展 FrameworkConfig 添加项目自定义配置
  interface FrameworkConfig {
    /** 项目自定义：API 基础路径 */
    apiBaseUrl?: string;
    /** 项目自定义：埋点开关 */
    analytics?: boolean;
  }
}
```

## 七、Router 类型系统

### 7.1 Location 类型

```typescript
export interface Location {
  href: string;
  srcQuery: string;
  srcHash: string;
  query: ParsedUri;
  hash: ParsedUri;
  params: Record<string, string>;
  view?: string;
  path?: string;
  get: (key: string, defaultValue?: string) => string;
}
```

### 7.2 类型安全的路由操作

```typescript
import { Router } from "@mm/lark-mvc";
import type { Location, LocationDiff } from "@mm/lark-mvc";

// parse 返回完整类型的 Location 对象
const loc: Location = Router.parse();
const page: string = loc.get("page", "1"); // 带默认值

// diff 返回 LocationDiff | undefined
const diff: LocationDiff | undefined = Router.diff();
if (diff?.changed) {
  // params 中每个变更都有 from/to 类型
  const pageDiff = diff.params["page"];
  if (pageDiff) {
    console.log(`页码: ${pageDiff.from} → ${pageDiff.to}`);
  }
}

// beforeEach 守卫的类型安全
Router.beforeEach((to: Location, from: Location) => {
  // to 和 from 都是完整的 Location 类型
  if (to.path === "/admin" && !isAuthenticated()) {
    return false; // 阻止导航
  }
  return true;
});
```

## 八、UpdaterApi 类型

```typescript
export interface UpdaterApi {
  /** 获取数据，支持泛型 */
  get: <T = unknown>(key?: string) => T;
  /** 设置数据 */
  set: (
    data: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
  ) => UpdaterApi;
  /** 设置并渲染 */
  digest: (
    data?: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
    callback?: () => void,
  ) => void;
  /** 强制重新渲染 */
  forceDigest: () => void;
  /** 创建快照 */
  snapshot: () => UpdaterApi;
  /** 检测是否有变更 */
  altered: () => boolean | undefined;
  /** 引用数据（refData） */
  refData: Record<string, unknown>;
  /** 翻译 ref token */
  translate: (data: unknown) => unknown;
  /** 解析表达式 */
  parse: (expr: string) => unknown;
  /** 获取变更的键集合 */
  getChangedKeys: () => ReadonlySet<string>;
}
```

使用示例：

```typescript
const view = defineView((ctx) => {
  // 泛型 get
  const count = ctx.updater.get<number>("count"); // number
  const user = ctx.updater.get<{ name: string }>("user"); // { name: string }

  // 链式 set
  ctx.updater.set({ count: 0 }).set({ list: [] });

  // digest 触发渲染
  ctx.updater.digest({ loading: false });

  return { template };
});
```

## 九、编译选项类型

```typescript
export interface CompileOptions {
  /** 启用调试模式（行追踪） */
  debug?: boolean;
  /** 全局变量名列表（从 $$ refData 解构） */
  globalVars?: string[];
  /** 文件路径（用于调试错误信息） */
  file?: string;
  /** 生成 VDOM 输出而非 HTML 字符串 */
  vdom?: boolean;
}
```

## 十、最佳实践

### 10.1 视图参数类型化

```typescript
// 始终为视图定义参数接口
interface ListViewParams {
  categoryId: string;
  page?: number;
  sort?: "asc" | "desc";
}

export default defineView<ListViewParams>((ctx, params) => {
  // 完整的类型推断和自动补全
  const { categoryId, page = 1, sort = "asc" } = params ?? {};
  // ...
});
```

### 10.2 避免 `any` 类型

```typescript
// 不推荐
const data = ctx.updater.get("data"); // unknown

// 推荐：使用泛型约束
interface PageData {
  list: Item[];
  total: number;
}
const data = ctx.updater.get<PageData>("data"); // PageData
```

### 10.3 事件处理函数类型

```typescript
const view = defineView((ctx) => {
  return {
    template,
    events: {
      // 事件处理函数使用标准 DOM 事件类型
      "submit<click>"(e: MouseEvent) {
        e.preventDefault();
        const target = e.currentTarget as HTMLElement;
      },
      "input<change>"(e: Event) {
        const input = e.target as HTMLInputElement;
        ctx.updater.digest({ value: input.value });
      },
    },
  };
});
```
