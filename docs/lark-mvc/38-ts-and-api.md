---
title: TypeScript API 参考
description: Lark Mvc 框架所有导出类型的完整 API 参考手册，按模块分类详细描述每个接口、类型和字段的含义与用法。
---

# TypeScript API 参考

本章提供 Lark Mvc 框架所有导出类型的完整参考。所有类型定义集中在 `src/types.ts` 中，通过主入口 `@mm/lark-mvc` 全量导出。

## 一、基础函数类型

### AnyFunc

```typescript
export type AnyFunc = (...args: any[]) => unknown;
```

通用函数类型，用于事件处理器和回调。使用 `any[]` 参数以接受具有特定参数类型的回调（TypeScript 函数参数是逆变的）。

---

## 二、缓存模块类型

### CacheEntry\<T\>

缓存条目，描述单个缓存项的元数据。

```typescript
export interface CacheEntry<T> {
  /** 原始键（不含前缀） */
  originalKey: string;
  /** 缓存值 */
  value: T | undefined;
  /** 访问频率计数 */
  frequency: number;
  /** 最后访问时间戳 */
  lastTimestamp: number;
}
```

### CacheOptions\<T\>

缓存配置选项。

```typescript
export interface CacheOptions<T> {
  /** 触发淘汰前的最大缓存大小（默认：20） */
  maxSize?: number;
  /** 淘汰缓冲区大小（默认：5） */
  bufferSize?: number;
  /** 条目被移除时的回调 */
  onRemove?: (key: string) => void;
  /** 条目排序比较器 */
  sortComparator?: (a: CacheEntry<T>, b: CacheEntry<T>) => number;
}
```

### CacheApi\<T\>

函数式缓存 API，由 `createCache()` 返回。

```typescript
export interface CacheApi<T = unknown> {
  /** 存储值 */
  set(key: string, resource: T): void;
  /** 读取值（命中时提升频率和时间戳） */
  get(key: string): T | undefined;
  /** 删除指定键 */
  del(key: string): void;
  /** 检查键是否存在（不提升频率） */
  has(key: string): boolean;
  /** 清空所有条目 */
  clear(): void;
  /** 遍历所有缓存值 */
  forEach(callback: (value: T | undefined) => void): void;
  /** 获取当前缓存条目数 */
  getSize(): number;
}
```

---

## 三、事件模块类型

### EventListenerEntry

事件监听器内部条目。

```typescript
export interface EventListenerEntry {
  /** 处理函数 */
  handler: AnyFunc;
  /** 是否正在执行（1 = 执行中，'' = 完成） */
  executing: number | string;
}
```

### ChangeEvent

变更事件对象，所有事件回调的基础类型。

```typescript
export interface ChangeEvent {
  /** 事件类型（只读） */
  readonly type: string;
  /** 变更的数据键集合（只读），使用 keys.has(name) 检查 */
  readonly keys?: ReadonlySet<string>;
}
```

### EmitterApi\<T\>

函数式事件发射器 API，由 `createEmitter()` 返回。无 `this` 绑定，处理器以 `null` 上下文调用。方法返回 API 对象以支持链式调用。

```typescript
export interface EmitterApi<T = unknown> {
  /** 绑定事件监听器 */
  on(name: string, fn: (e?: ChangeEvent) => void): EmitterApi<T>;
  /** 解绑事件监听器（不传 fn 则移除该事件所有监听） */
  off(name: string, fn?: AnyFunc): EmitterApi<T>;
  /** 触发事件 */
  fire(
    name: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): EmitterApi<T>;
}
```

---

## 四、URI / 路由模块类型

### ParsedUri

URL 解析结果，包含路径和参数。

```typescript
export interface ParsedUri {
  /** 路径部分（? 或 # 之前），不含查询参数 */
  path: string;
  /** 从 URL 解析的键值参数 */
  params: Record<string, string>;
}
```

### Location

当前 URL 解析结果接口，由 `Router.parse()` 返回。

```typescript
export interface Location {
  /** 完整 href 原始字符串 */
  href: string;
  /** 原始查询字符串（? 之后、# 之前） */
  srcQuery: string;
  /** 原始哈希字符串（# 之后） */
  srcHash: string;
  /** 从 srcQuery 解析的路径和参数 */
  query: ParsedUri;
  /** 从 srcHash 解析的路径和参数 */
  hash: ParsedUri;
  /** 合并后的参数（query + hash，hash 优先） */
  params: Record<string, string>;
  /** 当前 URL 对应的视图路径（框架启动前可能为 undefined） */
  view?: string;
  /** 根据路由规则计算的解析路径 */
  path?: string;
  /** 按键获取参数，支持默认值 */
  get: (key: string, defaultValue?: string) => string;
}
```

### ParamDiff

URL 参数变更，描述参数值从旧到新的转换。

```typescript
export interface ParamDiff {
  /** 变更前的值 */
  from: string;
  /** 变更后的值 */
  to: string;
}
```

### LocationDiff

URL 路由变更对象，由 `Router.diff()` 返回。

```typescript
export interface LocationDiff {
  /** 所有变更参数的 diff（key -> {from, to}） */
  params: Record<string, ParamDiff>;
  /** 路径变更（仅路径改变时存在） */
  path?: ParamDiff;
  /** 视图变更（仅渲染视图改变时存在） */
  view?: ParamDiff;
  /** 是否为应用初始化时的首次强制变更 */
  force: boolean;
  /** 是否有任何内容发生变更 */
  changed: boolean;
}
```

### RouteChangeEvent

路由预变更事件接口（change 阶段），可阻止、拒绝或接受路由变更。

```typescript
export interface RouteChangeEvent extends ChangeEvent {
  /** 拒绝 URL 变更，回退到之前的 URL */
  reject: () => void;
  /** 接受 URL 变更，继续导航 */
  resolve: () => void;
  /** 阻止 URL 变更，暂停后续路由处理 */
  prevent: () => void;
}
```

### RouteChangedEvent

路由后变更事件接口（changed 阶段），携带路由 diff 信息。

```typescript
export type RouteChangedEvent = LocationDiff & ChangeEvent;
```

### RouterApi

路由器接口，提供 URL 解析、导航、diff 和事件监听能力。

```typescript
export interface RouterApi {
  /** 绑定事件监听器 */
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  /** 解绑事件监听器 */
  off(event: string, handler?: AnyFunc): this;
  /** 触发事件 */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): this;
  /** 解析 href 为 Location 对象（默认解析当前页面 location.href） */
  parse(href?: string): Location;
  /** 计算当前与上一次 location 的 diff */
  diff(): LocationDiff | undefined;
  /**
   * 导航到新 URL
   * - Router.to("/list", { page: 2 }) — 指定路径和参数
   * - Router.to({ page: 2 }) — 仅更新参数，保持当前路径
   */
  to(
    pathOrParams: string | Record<string, unknown>,
    params?: Record<string, unknown>,
    replace?: boolean,
    silent?: boolean,
  ): void;
  /** 拼接路径段 */
  join(...paths: string[]): string;
  /**
   * 注册异步友好的导航守卫
   * 返回 false 或 reject 将中止导航并回退 URL
   * 返回取消订阅函数
   */
  beforeEach(
    guard: (to: Location, from: Location) => boolean | Promise<boolean>,
  ): () => void;
  /** 内部：绑定 hashchange（由 Framework.boot 调用） */
  _bind(): void;
  /** 内部：设置框架配置 */
  _setConfig(cfg: FrameworkConfig): void;
  /** 内部：通知 hash 变更 */
  notify?(e?: Event): void;
  /** URL 即将变更时触发（change 阶段） */
  onChange?: (e?: RouteChangeEvent) => void;
  /** URL 已变更后触发（changed 阶段） */
  onChanged?: (e?: RouteChangedEvent) => void;
}
```

---

## 五、DOM 模块类型

### DomRef

DOM diff 引用对象，追踪真实 DOM 变更。

```typescript
export interface DomRef {
  /** ID 更新列表：[element, newId][] */
  idUpdates: [Element, string][];
  /** DOM 操作列表 */
  domOps: DomOp[];
  /** 是否有变更 */
  hasChanged: number;
}
```

### DomOp

编码的 DOM 变更操作。操作码对应 DOM 的 `appendChild` 系列方法。

```typescript
export type DomOp =
  | [1, Element, ChildNode] // appendChild(parent, newChild)
  | [2, Element, ChildNode] // removeChild(parent, oldChild)
  | [4, Element, ChildNode, ChildNode] // replaceChild(parent, newChild, oldChild)
  | [8, Element, ChildNode, ChildNode]; // insertBefore(parent, newChild, refChild)
```

### DomElement

带有 DOM diff 缓存的扩展 Element。

```typescript
export interface DomElement extends Element {
  /** compare key 是否已缓存 */
  compareKeyCached?: number | undefined;
  /** 缓存的 compare key */
  cachedCompareKey?: string | undefined;
  /** 是否为自动生成的 ID */
  autoId?: number;
}
```

---

## 六、VDOM 模块类型

### VDomNode

虚拟 DOM 节点，由 `vdomCreate` 生成，供 VDOM diff 引擎消费。

```typescript
export interface VDomNode {
  /** 标签名：元素为 string，文本为 0 (V_TEXT_NODE)，原始 HTML 为 SPLITTER */
  tag: string | number;
  /** 内部 HTML（元素的序列化子节点，文本节点的文本内容） */
  html: string;
  /** 序列化的开标签（含属性），如 '<div class="row"' */
  attrs?: string;
  /** 属性键值映射 */
  attrsMap?: Record<string, unknown>;
  /** 作为 DOM property（而非 attribute）设置的属性名 */
  attrsSpecials?: Record<string, string>;
  /** 原始 specials 参数（用于变更检测） */
  hasSpecials?: Record<string, string> | undefined;
  /** 子 VDomNode 数组（文本/原始/自闭合节点为 undefined） */
  children?: VDomNode[] | undefined;
  /** Diff key：来自 id、# 或 v-lark 路径 */
  compareKey?: string | undefined;
  /** 有键子节点计数映射（compareKey -> count） */
  reused?: Record<string, number> | undefined;
  /** 有键子节点总数 */
  reusedTotal?: number;
  /** 子视图引用：[viewPath, owner, uri, params] 元组 */
  views?: [string, string, string, Record<string, string>][] | undefined;
  /** 是否自闭合（children 参数为字面量 1） */
  selfClose?: boolean;
  /** 若此节点承载 v-lark 视图，则为子视图路径 */
  isLarkView?: string | undefined;
}
```

### VDomRef

VDOM diff 操作追踪器，与 DomRef 平行但用于 VDOM 管线。

```typescript
export interface VDomRef {
  /** 视图 ID（用于占位符替换） */
  viewId: string;
  /** 延迟 DOM property 赋值：[element, propName, value][] */
  nodeProps: [Element, string, unknown][];
  /** 待处理的异步操作计数 */
  asyncCount: number;
  /** DOM 是否实际发生变更 */
  changed: number;
}
```

### VDomTemplate

VDOM 模板函数签名。编译后的模板通过 ES module import 导入 vdomCreate。

```typescript
export type VDomTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => VDomNode;
```

---

## 七、视图模块类型

### ViewTemplate

编译后的模板函数签名（字符串模式）。

```typescript
export type ViewTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => string;
```

### Ref\<T\>

可变引用单元，用于 `ViewCtx` 上的 `signature` 和 `rendered`。

```typescript
export interface Ref<T> {
  value: T;
}
```

### ViewLocationObserved

视图路由观察配置。

```typescript
export interface ViewLocationObserved {
  /** 是否观察 location */
  flag: number;
  /** 观察的键列表 */
  keys: string[];
  /** 是否观察路径变更 */
  observePath: boolean;
}
```

### ViewResourceEntry

视图资源条目。

```typescript
export interface ViewResourceEntry {
  /** 资源实体 */
  entity: unknown;
  /** 是否在 render() 时销毁 */
  destroyOnRender: boolean;
}
```

### ViewCtx

函数式视图上下文，作为第一个参数传递给每个视图 setup 函数。提供框架 API 访问，无需 `this` 绑定。

```typescript
export interface ViewCtx {
  /** 视图 ID（与 owner frame ID 相同） */
  id: string;
  /** 所属 Frame 引用 */
  owner: FrameObj;
  /** 数据绑定更新器 API */
  updater: UpdaterApi;
  /** 签名：>0 表示活跃，render 时递增，0 = 已销毁 */
  signature: Ref<number>;
  /** 是否已渲染过至少一次 */
  rendered: Ref<boolean>;
  /** 获取视图模板函数 */
  getTemplate(): ViewTemplate | VDomTemplate | undefined;
  /** 设置视图模板函数 */
  setTemplate(v: ViewTemplate | VDomTemplate | undefined): void;
  /** 路由观察配置 */
  locationObserved: ViewLocationObserved;
  /** 获取观察的状态键 */
  getObservedStateKeys(): string[] | undefined;
  /** 设置观察的状态键 */
  setObservedStateKeys(v: string[] | undefined): void;
  /** 资源映射 */
  resources: Record<string, ViewResourceEntry>;
  /** 内部事件发射器（"destroy"、"render" 等生命周期事件） */
  emitter: EmitterApi;
  /** 获取 EndUpdate 待处理标志 */
  getEndUpdatePending(): number | undefined;
  /** 设置 EndUpdate 待处理标志 */
  setEndUpdatePending(v: number | undefined): void;
  /** 包装后的 render 方法 */
  renderMethod?: AnyFunc;
  /** 获取 setup 返回的事件处理器映射 */
  getEvents(): Record<string, AnyFunc> | undefined;
  /** 设置事件处理器映射 */
  setEvents(v: Record<string, AnyFunc> | undefined): void;
  /** useEffect 注册的清理函数列表 */
  cleanups: Array<() => void>;
  /** 获取 setup 返回的 assign 函数 */
  getAssign(): ((options?: unknown) => boolean | undefined) | undefined;
  /** 设置 assign 函数 */
  setAssign(v: ((options?: unknown) => boolean | undefined) | undefined): void;

  // ─── 生命周期 / 框架 API 方法 ───

  /** 触发视图渲染 */
  render(): void;
  /** 开始更新（暂停 DOM 同步） */
  beginUpdate(id?: string): void;
  /** 结束更新（恢复 DOM 同步） */
  endUpdate(id?: string, inner?: boolean): void;
  /** 包装异步回调（视图销毁后自动失效） */
  wrapAsync<Fn extends AnyFunc>(
    fn: Fn,
    context?: unknown,
  ): (...args: Parameters<Fn>) => ReturnType<Fn> | undefined;
  /** 观察路由参数变更 */
  observeLocation(
    params: string | string[] | Record<string, unknown>,
    observePath?: boolean,
  ): void;
  /** 观察全局状态键变更 */
  observeState(keys: string | string[]): void;
  /** 捕获资源（视图销毁时自动释放） */
  capture(key: string, resource?: unknown, destroyOnRender?: boolean): unknown;
  /** 释放资源 */
  release(key: string, destroy?: boolean): unknown;
  /** 触发自定义事件 */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): void;
  /** 监听事件（返回取消函数） */
  on(event: string, handler: AnyFunc): () => void;
  /** 取消监听 */
  off(event: string, handler?: AnyFunc): void;
}
```

### ViewSetup\<T\>

视图 setup 函数类型——定义视图的函数式 API。挂载时调用一次，接收 `ViewCtx` 和可选初始化参数，返回包含 `template`、`events`、`assign` 的描述符。

```typescript
export type ViewSetup<T = unknown> = (
  ctx: ViewCtx,
  params?: T,
) => {
  template?: ViewTemplate | VDomTemplate;
  events?: Record<string, AnyFunc>;
  assign?: (options?: unknown) => boolean | undefined;
};
```

---

## 八、Frame 模块类型

### FrameInvokeEntry

跨视图方法调用条目。

```typescript
export interface FrameInvokeEntry {
  /** 方法名 */
  name: string;
  /** 方法参数 */
  args: unknown[];
  /** 内部键 */
  key: string;
  /** 是否已移除（参数匹配） */
  removed?: boolean;
}
```

### FrameObj

函数式 Frame 对象，由 `createFrame()` 创建。管理视图生命周期（挂载/卸载、父子树、跨视图方法调用）。

```typescript
export interface FrameObj {
  /** Frame ID */
  id: string;
  /** 获取视图路径 */
  getViewPath(): string | undefined;
  /** 父 Frame ID（根节点为 undefined） */
  readonly parentId: string | undefined;
  /** 关联的视图上下文 */
  view: ViewCtx | undefined;
  /** 待调用方法列表 */
  invokeList: FrameInvokeEntry[];
  /** 签名 */
  signature: number;
  /** 是否已销毁 */
  destroyed: number;
  /** 是否有变更 */
  hasAltered: number;
  /** 原始模板 */
  originalTemplate?: string;
  /** 是否暂停触发 created */
  holdFireCreated: number;
  /** 子节点是否已创建 */
  childrenCreated: number;
  /** 子节点是否处于变更状态 */
  childrenAlter: number;
  /** 子节点映射 */
  childrenMap: Record<string, string>;
  /** 子节点数量 */
  childrenCount: number;
  /** 就绪计数 */
  readyCount: number;
  /** 就绪映射 */
  readyMap: Set<string>;
  /** 事件发射器 */
  emitter: EmitterApi;
  /** Dispatcher 访问标记 */
  dispatcherUpdateTag?: number;

  /** 挂载视图 */
  mountView(viewPath: string, viewInitParams?: Record<string, unknown>): void;
  /** 卸载视图 */
  unmountView(): void;
  /** 挂载子 Frame */
  mountFrame(
    frameId: string,
    viewPath: string,
    viewInitParams?: Record<string, unknown>,
  ): FrameObj;
  /** 卸载子 Frame */
  unmountFrame(id?: string): void;
  /** 挂载区域 */
  mountZone(zoneId?: string): void;
  /** 卸载区域 */
  unmountZone(zoneId?: string): void;
  /** 获取父 Frame（可指定层级） */
  parent(level?: number): FrameObj | undefined;
  /** 调用视图方法 */
  invoke(name: string, args?: unknown[]): unknown;
  /** 获取所有子 Frame ID */
  children(): string[];
  /** 绑定事件 */
  on(event: string, handler: AnyFunc): FrameObj;
  /** 解绑事件 */
  off(event: string, handler?: AnyFunc): FrameObj;
  /** 触发事件 */
  fire(event: string, data?: Record<string, unknown>): FrameObj;
}
```

---

## 九、Updater 模块类型

### UpdaterApi

函数式更新器 API，由 `createUpdater()` 返回。提供视图数据绑定、变更检测和 DOM diff 触发。

```typescript
export interface UpdaterApi {
  /** 获取数据（支持泛型，不传 key 返回全部数据） */
  get: <T = unknown>(key?: string) => T;
  /** 设置数据（返回自身以支持链式调用） */
  set: (
    data: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
  ) => UpdaterApi;
  /** 设置数据并触发渲染 */
  digest: (
    data?: Record<string, unknown>,
    excludes?: ReadonlySet<string>,
    callback?: () => void,
  ) => void;
  /** 强制重新渲染（忽略变更检测） */
  forceDigest: () => void;
  /** 创建当前数据快照 */
  snapshot: () => UpdaterApi;
  /** 检测数据是否有变更 */
  altered: () => boolean | undefined;
  /** 引用数据对象（存储 {{@}} 传递的对象） */
  refData: Record<string, unknown>;
  /** 翻译 ref token 为实际值 */
  translate: (data: unknown) => unknown;
  /** 解析表达式 */
  parse: (expr: string) => unknown;
  /** 获取最近一次 digest 中变更的键集合 */
  getChangedKeys: () => ReadonlySet<string>;
}
```

---

## 十、State 模块类型

### StateApi

全局状态接口，提供跨视图数据共享和变更通知。State 是管理应用级状态数据的单例对象。适用于简单的跨视图数据（计数器、开关、页面标题、会话信息等）。复杂响应式状态请使用 `createStore`。

```typescript
export interface StateApi {
  /** 绑定事件监听器 */
  on(event: string, handler: (e?: ChangeEvent) => void): this;
  /** 解绑事件监听器 */
  off(event: string, handler?: AnyFunc): this;
  /** 触发事件 */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): this;
  /** 获取状态数据（不传 key 返回完整状态对象） */
  get<T = unknown>(key?: string): T;
  /** 设置状态数据（需显式调用 digest() 通知视图更新） */
  set(data: Record<string, unknown>, excludes?: ReadonlySet<string>): this;
  /** 创建视图销毁时的状态键清理函数 */
  clean(
    keys: string,
  ): (ctx: { on: (event: string, handler: () => void) => void }) => void;
  /** 检测变更并派发 changed 事件 */
  digest(data?: Record<string, unknown>, excludes?: ReadonlySet<string>): void;
  /** 获取最近一次 digest 中变更的键集合 */
  diff: () => ReadonlySet<string>;
  /** 变更回调 */
  onChanged?: (e?: ChangeEvent) => void;
}
```

---

## 十一、Service 模块类型

### ServiceMetaEntry

API 端点元数据配置，用于向 Service 注册 API 端点。

```typescript
export interface ServiceMetaEntry {
  /** 端点名称（同一 Service 内唯一） */
  name: string;
  /** 请求 URL（必填） */
  url: string;
  /** 缓存 TTL（毫秒），0 = 不缓存 */
  cache?: number;
  /** 请求发送前的钩子函数 */
  before?: (payload: PayloadApi) => void;
  /** 请求成功后的钩子函数 */
  after?: (payload: PayloadApi) => void;
  /** 销毁时清理的关联端点名（逗号分隔） */
  cleanKeys?: string;
  /** 附加属性 */
  [k: string]: unknown;
}
```

### PayloadApi

数据载体接口，包装 API 请求响应数据。

```typescript
export interface PayloadApi {
  /** 按键获取数据 */
  get<T = unknown>(key: string): T;
  /**
   * 设置数据，支持三种调用模式：
   * - 键值对：payload.set("name", "value")
   * - 数据对象：payload.set({ name: "value" })
   * - 端点元数据对象（框架内部使用）
   */
  set(
    keyOrData: string | Record<string, unknown> | ServiceMetaEntry,
    value?: unknown,
  ): PayloadApi;
  /** 原始数据对象 */
  data: Record<string, unknown>;
  /** 缓存信息 */
  cacheInfo?: ServiceCacheInfo;
}
```

### ServiceCacheInfo

附加到 Payload 实体的缓存信息。

```typescript
export interface ServiceCacheInfo {
  /** 端点名称 */
  name: string;
  /** 缓存键 */
  key: string;
  /** 缓存时间戳 */
  time: number;
}
```

### PendingCacheEntry

去重用的待处理缓存条目（Service 内部使用）。

```typescript
export interface PendingCacheEntry extends Array<unknown> {
  /** 待处理 Payload 实体的引用 */
  entity?: unknown;
}
```

---

## 十二、框架配置类型

### FrameworkConfig

框架配置接口，`Framework.boot()` 时传入的全局配置。

```typescript
export interface FrameworkConfig {
  /** 根元素 ID（必填，默认 "root"） */
  rootId: string;
  /** 路由模式："history"（默认）或 "hash" */
  routeMode?: "history" | "hash";
  /** 默认视图路径 */
  defaultView?: string;
  /** 无 hash 时的默认路径（默认 "/"） */
  defaultPath?: string;
  /** 路由映射：path -> view */
  routes?: Record<string, string | RouteViewConfig>;
  /** Hashbang 前缀（仅 hash 模式） */
  hashbang?: string;
  /** 全局错误处理函数 */
  error?: (error: Error) => void;
  /** 扩展模块路径数组（预留字段，当前 boot() 不会自动加载） */
  extensions?: string[];
  /** 初始化模块（预留字段，当前运行时未消费） */
  initModule?: string;
  /** 路由重写函数 */
  rewrite?: (
    path: string,
    params: Record<string, string>,
    routes: Record<string, string>,
  ) => string;
  /** 未匹配视图（404 页面） */
  unmatchedView?: string;
  /** 模块加载函数（用于异步视图加载 / Module Federation） */
  require?: (
    names: string[],
    params?: Record<string, unknown>,
  ) => Promise<unknown[]> | undefined;
  /** 跳过视图渲染检查 */
  skipViewRendered?: boolean;
  /** 当前应用项目名（微前端桥接用） */
  projectName?: string;
  /** 是否启用 VDOM 模式（默认 false） */
  vdom?: boolean;
  /** 是否启用 Devtool Bridge（默认 false） */
  devtool?: boolean;
}
```

### RouteViewConfig

路由视图配置对象。

```typescript
export interface RouteViewConfig {
  /** 视图路径 */
  view: string;
  /** 附加属性（合并到 location） */
  [k: string]: unknown;
}
```

### FrameworkApi

框架主 API 接口，通过 `Framework` 单例访问。

```typescript
export interface FrameworkApi {
  /** 读取框架配置 */
  getConfig(): FrameworkConfig;
  getConfig<T = unknown>(key: string): T | undefined;
  /** 合并配置补丁 */
  setConfig<T extends object = Partial<FrameworkConfig>>(
    patch: Partial<FrameworkConfig> & T,
  ): FrameworkConfig & T;
  /** 应用初始化入口 */
  boot(cfg: FrameworkConfig): void;
  /** 路径+参数转 URL 字符串 */
  toUri(
    path: string,
    params?: Record<string, unknown>,
    keepEmpty?: Set<string>,
  ): string;
  /** URL 字符串解析为路径和参数 */
  parseUri(url: string): ParsedUri;
  /** 合并对象属性 */
  assign<T extends object>(target: T, ...sources: Record<string, unknown>[]): T;
  /** 获取对象可枚举属性键数组 */
  keys<T extends object>(src: T): string[];
  /** 检查 DOM 节点包含关系 */
  nodeInside(
    node: HTMLElement | string,
    container: HTMLElement | string,
  ): boolean;
  /** 确保 DOM 元素有 ID */
  ensureNodeId(node: HTMLElement): string;
  /** 使用配置的模块加载器加载模块 */
  use(
    names: string | string[],
    callback?: (...modules: unknown[]) => void,
  ): void;
  /** 生成全局唯一标识符 */
  generateId(prefix?: string): string;
  /** 创建异步回调有效性标记 */
  mark(host: object, key: string): () => boolean;
  /** 延迟等待（Promise 化的 setTimeout） */
  delay(time: number): Promise<void>;
  /** 框架是否已启动 */
  isBooted(): boolean;
  /** 使异步回调标记失效 */
  unmark(host: object): void;
  /** 在目标元素上触发自定义 DOM 事件 */
  dispatchEvent(
    target: EventTarget,
    eventType: string,
    eventInit?: CustomEventInit,
  ): void;
  /** 在 try-catch 中执行函数（带分块调度） */
  task(fn: AnyFunc, args?: unknown[], context?: unknown): void;
  /** 等待区域内所有视图渲染完成 */
  waitZoneViewsRendered(viewId: string, timeout?: number): Promise<number>;
  /** 等待结果：视图渲染成功 */
  WAIT_OK: number;
  /** 等待结果：超时或未找到 */
  WAIT_TIMEOUT_OR_NOT_FOUND: number;
  /** Emitter 工厂函数 */
  createEmitter: typeof import("./event-emitter").createEmitter;
  /** 视图工厂函数 */
  defineView: typeof import("./view").defineView;
  /** 缓存工厂函数 */
  createCache: typeof import("./cache").createCache;
  /** 全局状态对象 */
  State: StateApi;
  /** 路由器对象 */
  Router: RouterApi;
  /** Frame 单例 */
  Frame: typeof import("./frame").Frame;
}
```

---

## 十三、编译选项类型

### CompileOptions

模板编译选项。

```typescript
export interface CompileOptions {
  /** 启用调试模式（行追踪）（默认：false） */
  debug?: boolean;
  /** 全局变量名列表（从 $$ refData 解构） */
  globalVars?: string[];
  /** 文件路径（用于调试错误信息） */
  file?: string;
  /** 生成 VDOM 输出而非 HTML 字符串（默认：false） */
  vdom?: boolean;
}
```

---

## 十四、Store 模块类型

### StoreApi\<T\>

Zustand 对齐的状态管理 API（定义在 `store.ts` 中）。

```typescript
export interface StoreApi<T = object> {
  /** 获取当前状态快照 */
  getState(): T;
  /** 浅合并状态并通知监听器 */
  setState(partial: Partial<T> | ((prev: T) => Partial<T>)): void;
  /** 订阅状态变更（返回取消订阅函数） */
  subscribe(listener: (state: T, prevState: T) => void): () => void;
  /** 销毁 store */
  destroy(): void;
}
```

---

## 十五、类型导入速查表

| 类型名              | 所属模块              | 用途             |
| ------------------- | --------------------- | ---------------- |
| `AnyFunc`           | types                 | 通用函数类型     |
| `CacheEntry<T>`     | types / cache         | 缓存条目         |
| `CacheOptions<T>`   | types / cache         | 缓存配置         |
| `CacheApi<T>`       | types / cache         | 缓存 API         |
| `ChangeEvent`       | types                 | 变更事件基础类型 |
| `EmitterApi<T>`     | types / event-emitter | 事件发射器       |
| `ParsedUri`         | types                 | URL 解析结果     |
| `Location`          | types / router        | 当前路由位置     |
| `ParamDiff`         | types                 | 参数变更         |
| `LocationDiff`      | types / router        | 路由 diff        |
| `RouteChangeEvent`  | types                 | 路由预变更事件   |
| `RouteChangedEvent` | types                 | 路由后变更事件   |
| `RouterApi`         | types / router        | 路由器 API       |
| `DomRef`            | types / dom           | DOM diff 引用    |
| `DomOp`             | types / dom           | DOM 操作编码     |
| `DomElement`        | types / dom           | 扩展 Element     |
| `VDomNode`          | types / vdom          | 虚拟 DOM 节点    |
| `VDomRef`           | types / vdom          | VDOM diff 引用   |
| `VDomTemplate`      | types / vdom          | VDOM 模板函数    |
| `ViewTemplate`      | types                 | 字符串模板函数   |
| `ViewSetup<T>`      | types / view          | 视图 setup 函数  |
| `ViewCtx`           | types / view          | 视图上下文       |
| `FrameObj`          | types / frame         | Frame 对象       |
| `FrameInvokeEntry`  | types / frame         | 跨视图调用条目   |
| `UpdaterApi`        | types / updater       | 更新器 API       |
| `StateApi`          | types / state         | 全局状态 API     |
| `StoreApi<T>`       | store                 | Store API        |
| `ServiceMetaEntry`  | types / service       | 端点元数据       |
| `PayloadApi`        | types / service       | 数据载体         |
| `ServiceCacheInfo`  | types / service       | 缓存信息         |
| `FrameworkConfig`   | types / framework     | 框架配置         |
| `FrameworkApi`      | types / framework     | 框架主 API       |
| `RouteViewConfig`   | types                 | 路由视图配置     |
| `CompileOptions`    | types / compiler      | 编译选项         |
| `Ref<T>`            | types                 | 可变引用单元     |
