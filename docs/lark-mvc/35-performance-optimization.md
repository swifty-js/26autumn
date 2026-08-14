---
title: 性能优化
description: Lark Mvc 性能优化完整指南，涵盖字符串模式与 VDOM 模式对比、Keyed Diff 算法、LIS 最小编辑、分块任务调度器、LFU 缓存、批量摘要与精确订阅
---

# 性能优化

Lark Mvc 在渲染引擎、任务调度、缓存策略等多个层面进行了深度优化。本文档详细解析各性能机制的原理和最佳使用方式。

## 渲染模式：字符串模式 vs VDOM 模式

Lark Mvc 提供两种渲染引擎，通过 `FrameworkConfig.vdom` 切换：

### 字符串模式（默认）

编译模板输出 HTML 字符串，通过真实 DOM Diff 更新页面：

```ts
Framework.boot({
  vdom: false, // 默认
});
```

**工作流程：**

```
模板函数执行 → HTML 字符串
    ↓
domGetNode()：解析为临时 DOM 树（document.implementation.createHTMLDocument）
    ↓
domSetChildNodes()：Keyed Diff 对比新旧 DOM
    ↓
applyDomOps()：批量执行 DOM 操作
    ↓
applyIdUpdates()：延迟更新元素 ID
```

**优势：**

- 内存占用低（不维护 VDOM 树）
- 利用浏览器原生 HTML 解析器（createHTMLDocument）
- 模板编译产物更小

**劣势：**

- 每次更新（含首次渲染）都需解析 HTML 字符串并执行 keyed diff（没有 VDOM 模式那样的首屏 innerHTML 快速路径）
- 无法利用 `attrs + html` 字符串相等快速跳过

### VDOM 模式

编译模板输出 `VDomNode` 虚拟节点树，通过三阶段 Diff 更新：

```ts
Framework.boot({
  vdom: true,
});
```

**工作流程：**

```
模板函数执行 → VDomNode 树
    ↓
vdomSetChildNodes()：三阶段 Diff
  Phase 1: 头部快速匹配
  Phase 2: 尾部快速匹配
  Phase 3: KeyMap + LIS 调和
    ↓
直接 DOM 操作（createElement / insertBefore / removeChild）
```

**优势：**

- 首屏渲染有 `innerHTML` 一次性直出的快速路径（无旧树时）
- `attrs + html` 字符串相等时 O(1) 跳过整个子树
- 更新时无需解析 HTML（直接操作 VDomNode 对象）
- LIS 算法最小化 DOM 移动操作
- 适合频繁局部更新的场景

**劣势：**

- 内存中维护 VDOM 树
- 模板编译产物稍大

### 选型建议

| 场景                             | 推荐模式   |
| -------------------------------- | ---------- |
| 内容展示型页面（文章、详情）     | 字符串模式 |
| 频繁局部更新（仪表盘、实时数据） | VDOM 模式  |
| 大列表 + 排序/筛选               | VDOM 模式  |
| 包体积 / 内存敏感                | 字符串模式 |
| 表单密集型页面                   | VDOM 模式  |

## Keyed Diff 算法（字符串模式）

### compareKey 机制

`domGetCompareKey` 为每个 DOM 节点计算比较键：

```ts
function domGetCompareKey(node: ChildNode): string | undefined {
  // 优先级：
  // 1. 元素 id 属性
  // 2. v-lark 属性中的视图路径
  // 3. 无键（按位置匹配）
}
```

**最佳实践：为列表项提供稳定的 `id`**

```html
<!-- 好：有稳定 key，Diff 可复用节点 -->
{{forOf list as item}}
<div id="item-{{=item.id}}">{{=item.name}}</div>
{{/forOf}}

<!-- 差：无 key，列表重排时按位置匹配，可能造成大量节点更新 -->
{{forOf list as item}}
<div>{{=item.name}}</div>
{{/forOf}}
```

### Diff 流程

```ts
domSetChildNodes(oldParent, newParent, ref, frame, keys) {
  // 1. 构建旧节点的 keyedNodes Map（key → [nodes]）
  // 2. 统计新节点的 key 计数
  // 3. 遍历新节点：
  //    - 有匹配 key → 复用旧节点，递归 diff 属性/子节点
  //    - 无匹配 → 创建新节点（appendChild）
  // 4. 移除多余的旧节点
}
```

### DOM 操作批量执行

Diff 过程中不直接操作 DOM，而是收集操作到 `ref.domOps` 数组，最后批量执行：

```ts
// 操作编码：[opCode, parent, child?, refChild?]
// 1 → appendChild
// 2 → removeChild
// 4 → replaceChild
// 8 → insertBefore

applyDomOps(ref.domOps); // 批量 DOM 变更
applyIdUpdates(ref.idUpdates); // 延迟 ID 更新
```

ID 更新延迟的原因：修改元素 ID 会使 `frameGetter` 查找失效，影响后续兄弟节点的匹配。

## VDOM 三阶段 Diff 与 LIS 算法

### Phase 1：头部快速路径

从头部开始匹配相同节点，无需 DOM 移动：

```ts
// 旧: [A, B, C, D]
// 新: [A, B, E, C, D]
//      ↑  ↑ 匹配成功，headIdx = 2
```

### Phase 2：尾部快速路径

从尾部开始匹配相同节点：

```ts
// 旧: [A, B, C, D]
// 新: [A, B, E, C, D]
//               ↑  ↑ 匹配成功，tailIdx 回退
```

### Phase 3：KeyMap + LIS 调和

对剩余未匹配节点：

1. **构建 keyMap**：`compareKey → [{ domNode, vdomNode }]`
2. **构建 sequence[]**：每个新节点对应的旧索引（-1 表示无匹配）
3. **计算 LIS**：最长递增子序列的节点保持不动
4. **反向遍历**：从右向左插入/移动节点

### LIS 算法实现

```ts
// O(n log n) 的 patience sorting + 二分查找
function computeLIS(sequence: number[]): number[] {
  // tails[i] = 长度为 i+1 的 LIS 的最小尾元素索引
  // predecessors[i] = 前驱节点索引（用于回溯）

  for (let i = 0; i < len; i++) {
    if (sequence[i] < 0) continue; // 跳过未匹配项

    // 二分查找：找到第一个 >= 当前值的 tail
    let lo = 0,
      hi = lisLength;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sequence[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }

    tails[lo] = i;
    predecessors[i] = lo > 0 ? tails[lo - 1] : -1;
    if (lo === lisLength) lisLength++;
  }

  // 回溯构建 LIS 索引数组
}
```

**性能意义：** 如果 LIS 长度为 L，剩余 N 个节点只需 N - L 次 DOM 移动。例如 100 个节点中 90 个保持相对顺序，只需移动 10 个。

### 快速短路

```ts
// attrs + html 完全相等 → 跳过整个子树
if (lastVDom.attrs === newVDom.attrs && lastVDom.html === newVDom.html) {
  // 唯一例外：表单元素需同步 DOM 属性（用户输入可能改变了 value）
  if (newVDom.hasSpecials) {
    vdomSyncFormState(realNode, newVDom);
  }
  return; // O(1) 跳过
}

// HTML 完全相等 → 跳过整个 diff
if (lastVDom.html === newVDom.html) {
  callFunction(ready, []);
  return;
}
```

### compareKey 在 VDOM 中的使用

VDOM 模式下，`vdomCreate` 在编译时提取 compareKey：

```ts
// 优先级：
// 1. "#" 属性（专用 key 属性）
// 2. "id" 属性
// 3. v-lark 视图路径（自动生成 tag + SPLITTER + viewPath）

// 模板中使用 # 指定 key：
// <div #="{{= item.id}}">...</div>
```

## 分块任务调度器

`Framework.task` 提供现代的分块函数执行，避免长任务阻塞主线程：

### 调度优先级

```ts
// 1. scheduler.postTask('background') — Chrome 94+
// 2. requestIdleCallback — Chrome 47+, Firefox
// 3. setTimeout(0) — 通用回退
```

### 时间切片策略

```ts
function executeTaskChunk(deadline?: IdleDeadline): void {
  const hasDeadline = !!deadline;
  const startTime = Date.now();

  while (true) {
    const fn = taskList[taskIndex];
    if (!isAnyFunc(fn)) {
      // 所有任务消费完毕，重置队列
      taskList.length = 0;
      taskIndex = 0;
      taskScheduled = false;
      return;
    }

    // 检查时间预算
    if (hasDeadline && deadline) {
      // 自适应：使用浏览器提供的 deadline
      if (deadline.timeRemaining() <= 0) {
        scheduleTaskChunk(); // 让出主线程
        return;
      }
    } else if (
      Date.now() - startTime > CALL_BREAK_TIME &&
      taskList.length > taskIndex + 3
    ) {
      // 固定 48ms 预算，且仍有剩余任务时才让出
      scheduleTaskChunk();
      return;
    }

    // 执行一个任务
    funcWithTry(fn, args, context, noop);
    taskIndex += 3;
  }
}
```

### 使用方式

```ts
// 将耗时操作拆分为多个小任务
Framework.task(processItem, [item1], context);
Framework.task(processItem, [item2], context);
Framework.task(processItem, [item3], context);
// 任务在空闲时批量执行，不阻塞用户交互
```

### 内部队列结构

```ts
// 扁平数组：[fn, context, args, fn, context, args, ...]
const taskList: unknown[] = [];
let taskIndex = 0; // 当前读取位置
let taskScheduled = false; // 是否已调度
```

这种扁平结构避免了对象创建开销，GC 友好。

## LFU 缓存

`createCache` 实现 LFU（Least Frequently Used）风格的有界缓存：

### 核心机制

```ts
const cache = createCache<Location>({ maxSize: 20, bufferSize: 5 });
```

- **容量**：`maxSize + bufferSize = 25`
- **驱逐**：超过容量时，一次性驱逐 `bufferSize`（5）个最差条目
- **频率追踪**：每次 `get` 递增 `frequency` 和 `lastTimestamp`

### 驱逐算法

```ts
// 单趟部分选择 O(n·k)，而非全排序 O(n log n)
// 对于典型 bufferSize = 5，几乎是线性扫描
function evictEntries(): void {
  const worst: CacheEntry<T>[] = [];

  for (const entry of entries) {
    if (worst.length < bufferSize) {
      // 插入排序维护 worst 数组
      worst.splice(insertPos, 0, entry);
    } else if (comparator(entry, worst[bufferSize - 1]) > 0) {
      worst.pop();
      worst.splice(insertPos, 0, entry);
    }
  }

  // 批量删除最差条目
  entries = entries.filter((e) => !evictSet.has(e));
}
```

### 在框架中的应用

```ts
// Router：href → Location 缓存
const hrefCache = createCache<Location>();

// Router：(oldHref + newHref) → diff 结果缓存
const changedCache = createCache<{ changed: boolean; diff: LocationDiff }>();

// 视图/模板缓存（由 Frame 系统管理）
```

### 缓存失效

```ts
// URL 变化时清除解析缓存
function watchChange() {
  hrefCache.clear(); // 确保不使用过期数据
  // ...
}
```

## 批量 Digest

### Updater 的批处理

```ts
// 多次 set 累积变更，单次 digest 触发渲染
ctx.updater.set({ name: "Alice" }); // 记录 changedKeys: {"name"}
ctx.updater.set({ age: 25 }); // 记录 changedKeys: {"name", "age"}
ctx.updater.set({ role: "admin" }); // 记录 changedKeys: {"name", "age", "role"}
ctx.updater.digest(); // 一次渲染，传递所有 changedKeys
```

### Digest 重入支持

```ts
// digest 期间的再次 digest 会被排队
function digest(newData?, excludes?, callback?): void {
  if (callback) digestingQueue.push(callback);

  // 如果已在 digest 中，排队等待
  if (digestingQueue.length > 0 && digestingQueue[0] === null) {
    return; // 不重入，等当前 digest 完成后处理
  }

  runDigest(digestingQueue);
}
```

### State 的批处理

```ts
// 正确模式
State.set({ page: 2 });
State.set({ size: 20 });
State.set({ sort: "name" });
State.digest(); // 一次 changed 事件，keys = {"page", "size", "sort"}

// 框架只遍历一次视图树
```

## observeState / observeLocation 精确订阅

### 问题：过度订阅

```ts
// 差：观察所有状态键，任何 State 变化都触发重渲染
ctx.observeState("a,b,c,d,e,f,g,h,i,j");
```

### 解决：最小化订阅

```ts
// 好：只观察当前视图真正使用的键
ctx.observeState("theme"); // 只有 theme 变化才重渲染
```

### 框架的变更检测

```ts
// dispatcher 只重渲染观察键命中的视图
function stateIsObserveChanged(
  view: ViewCtx,
  stateKeys: ReadonlySet<string>,
): boolean {
  const observedKeys = view.getObservedStateKeys();
  if (!observedKeys) return false;
  for (const key of observedKeys) {
    if (stateKeys.has(key)) return true;
  }
  return false;
}
```

### observeLocation 精确化

```ts
// 差：观察 path，任何路由变化都重渲染
ctx.observeLocation({ params: [], path: true });

// 好：只观察影响当前视图的参数
ctx.observeLocation("page,size");
```

## 避免不必要的重渲染

### 1. 使用 snapshot/altered

```ts
assign() {
  ctx.updater.snapshot();

  // 只在数据真正变化时返回 true
  const loc = Router.parse();
  ctx.updater.set({ page: loc.get("page") });

  return ctx.updater.altered(); // false → 跳过渲染
}
```

### 2. Store 的 Object.is 检查

```ts
// setState 内部使用 Object.is 比较
// 值未变化时不通知监听器
store.setState({ count: 5 }); // count 已是 5 → 无操作
```

### 3. VDOM 的字符串短路

```ts
// 序列化的 attrs 和 html 相等 → 跳过整个子树
if (lastVDom.attrs === newVDom.attrs && lastVDom.html === newVDom.html) {
  return; // O(1)
}
```

### 4. 子视图保持

当 `v-lark` 视图路径未变时，跳过子视图的 DOM 更新：

```ts
// dom.ts / vdom.ts 中的逻辑
if (oldFrameId && newViewPath === oldViewPath) {
  updateChildren = false; // 保持现有子视图
}
```

### 5. 稳定的 compareKey

```html
<!-- 好：稳定 key，列表重排时复用 DOM 节点 -->
{{forOf items as item}}
<div id="item-{{=item.id}}">{{=item.name}}</div>
{{/forOf}}

<!-- 差：无 key，重排时按位置匹配，更新量大 -->
{{forOf items as item}}
<div>{{=item.name}}</div>
{{/forOf}}
```

## Framework.task 处理重计算

### 场景：大列表处理

```ts
// 将 1000 项的处理拆分为独立任务
function processLargeList(items: unknown[]) {
  for (const item of items) {
    Framework.task(processSingleItem, [item], context);
  }
  // 任务在浏览器空闲时批量执行
  // 每批最多执行 48ms（或 deadline 耗尽）
  // 不阻塞用户交互和渲染
}
```

### 场景：延迟非关键初始化

```ts
export default defineView((ctx) => {
  // 关键渲染路径：同步执行
  ctx.updater.set({ essential: computeEssential() }).digest();

  // 非关键初始化：延迟到空闲时
  Framework.task(() => {
    const analytics = initAnalytics();
    const prefetch = prefetchMvcPage();
  });

  return { template: (d) => `...` };
});
```

## Dispatcher 的迭代遍历

框架使用显式 LIFO 栈遍历 Frame 树，避免深层嵌套导致栈溢出：

```ts
function dispatcherUpdate(
  frame: FrameObj,
  stateKeys?: ReadonlySet<string>,
): void {
  const stack: FrameObj[] = [frame];

  const drain = (s: FrameObj[]): void => {
    while (s.length > 0) {
      const current = s.pop();
      // ... 检查视图是否需要更新
      // 将子 Frame 压栈（逆序，保证正序访问）
      for (let i = children.length - 1; i >= 0; i--) {
        s.push(Frame.get(children[i]));
      }
    }
  };

  drain(stack);
}
```

### 异步渲染支持

如果视图的 `render()` 返回 Promise，子树处理延迟到 Promise resolve：

```ts
if (isThenable(renderResult)) {
  renderResult.then(() => {
    // 异步渲染完成后再处理子树
    drain(subStack);
  });
} else {
  // 同步渲染：立即处理子树
  for (const child of children) s.push(child);
}
```

## 性能检查清单

| 检查项                       | 说明                     |
| ---------------------------- | ------------------------ |
| 列表项有稳定 key             | 使用 `id` 或 `#` 属性    |
| 批量 set + 单次 digest       | 避免多次 DOM 更新        |
| observeState 最小化          | 只订阅真正使用的键       |
| observeLocation 精确化       | 只订阅影响当前视图的参数 |
| assign 使用 snapshot/altered | 无变化时跳过渲染         |
| 异步操作用 wrapAsync         | 避免过期回调触发无效渲染 |
| 重计算用 Framework.task      | 不阻塞主线程             |
| 子视图路径稳定               | 避免不必要的子视图重建   |
| Store selector 精确          | bindStore 只同步需要的键 |
| 及时销毁 Store               | 不再使用时调用 destroy() |
