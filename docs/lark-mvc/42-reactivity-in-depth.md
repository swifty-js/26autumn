---
title: 深入响应式系统
description: Lark Mvc 响应式系统源码级解析，涵盖完整数据流、setData 变更检测、批量通知与 digest 重入、dispatcher 树遍历、Store 派生值重算、版本追踪与 snapshot/altered 机制
---

# 深入响应式系统

Lark Mvc 的响应式系统由四个层次构成：**视图本地数据**（Updater）、**跨视图共享数据**（State）、**外部 Store**（createStore）与**变更分发**（Dispatcher）。本文从源码出发，逐层拆解数据从「用户操作」流转到「DOM 更新」的完整链路。

## 完整数据流

一次典型的响应式更新经历以下阶段：

```
用户操作（click）
   │
   ▼
EventDelegator 捕获事件（document.body 捕获阶段）
   │  解析 @click 属性 → 定位 frame → 找到 events["handler<click>"]
   ▼
事件处理函数执行
   │  ctx.updater.set({ count: 1 })   ← 变更检测、记录 changedKeys、version++
   │  ctx.updater.digest()            ← 触发渲染
   ▼
runDigest
   │  检查 changed && view && node && signature > 0
   │  调用 template(data, viewId, refData)  ← 编译后的渲染函数
   ▼
渲染函数求值
   │  字符串模式 → 返回 HTML string
   │  VDOM 模式  → 返回 VDomNode 树
   ▼
diff 引擎
   │  字符串模式 → domGetNode 解析 + domSetChildNodes 键控 diff
   │  VDOM 模式  → vdomSetChildNodes 三阶段 diff
   ▼
DOM 批量更新（applyDomOps / insertBefore / removeChild）
   │
   ▼
view.endUpdate() → mountZone → 子视图挂载/props 更新
```

下面逐段解析。

## 一、Updater：视图本地数据中心

每个视图拥有一个独立的 Updater（`createUpdater(viewId)` 工厂函数创建），它是视图数据与 DOM 之间的桥梁。核心内部状态：

```ts
let data: Record<string, unknown> = { vId: viewId }; // 数据本体
const refData: Record<string, unknown> = {}; // 引用令牌表
let changedKeys = new Set<string>(); // 本轮变更的键
let hasChangedFlag = 0; // 脏标记
let version = 0; // 单调递增版本号
let snapshotVersion: number | undefined; // snapshot() 快照
let vdom: VDomNode | undefined; // 上次渲染的 VDOM 树
```

### `get` / `set`

`get(key?)` 读取单个键或整个 data 对象。`set(newData, excludes?)` 浅合并数据并追踪变更：

```ts
function set(newData, excludes?) {
  const changed = setData(
    newData,
    data,
    changedKeys,
    excludes || EMPTY_STRING_SET,
  );
  if (changed) {
    version++; // 版本递增
    hasChangedFlag = 1; // 打脏标记
  }
  return api;
}
```

注意 `set` 只负责「记录变更」，**不触发渲染**——渲染由 `digest` 触发。这种「写入与提交分离」的设计是批量更新的基础。

## 二、变更检测算法：setData

`setData` 是整个响应式系统的判定核心，位于 `utils.ts`：

```ts
export function setData(
  newData: Record<string, unknown>,
  oldData: Record<string, unknown>,
  changedKeys: Set<string>,
  excludes: ReadonlySet<string>,
): boolean {
  let changed = false;
  for (const p in newData) {
    if (hasOwnProperty(newData, p)) {
      const now = newData[p];
      const old = oldData[p];
      if ((!isPrimitiveOrFunc(now) || old !== now) && !excludes.has(p)) {
        changedKeys.add(p);
        changed = true;
      }
      oldData[p] = now;
    }
  }
  return changed;
}
```

判定规则只有两条，但含义深刻：

### 规则 1：原始值按 `!==` 比较

`isPrimitiveOrFunc` 对 `null`、非对象、非函数返回 `true`。对原始值（数字、字符串、布尔等），只有 `old !== now` 时才标记变更。这意味着：

```ts
ctx.updater.set({ count: 1 });
ctx.updater.set({ count: 1 }); // 第二次不产生变更，digest 时跳过渲染
```

### 规则 2：对象/数组/函数恒为「已变更」

`!isPrimitiveOrFunc(now)` 对任何对象都为 `true`，短路掉 `old !== now` 比较。也就是说：

```ts
const list = ctx.updater.get("list");
list.push(item); // 原地修改，引用未变
ctx.updater.set({ list }); // 依然标记为变更
```

这是一个**有意为之的保守策略**：Lark 不做深度比较（deep diff 成本不可控），也不依赖不可变约定（用户可以自由原地修改），而是「宁可多渲染，不可漏渲染」。真正的去重交给 diff 引擎——如果渲染结果与现有 DOM 一致，diff 不会产生任何 DOM 操作。

### excludes：排除追踪

`set(data, excludes)` 的第二个参数允许某些键「写入但不标记变更」。`State.set` 也透传该参数。典型用途是写入仅供模板读取、但不希望触发渲染的辅助数据。

## 三、digest：批量通知与重入控制

### updater.digest

```ts
function digest(newData?, excludes?, callback?) {
  if (newData) set(newData, excludes);
  if (callback) digestingQueue.push(callback);

  // 已在 digest 中 → 排队，稍后处理
  if (digestingQueue.length > 0 && digestingQueue[0] === null) return;

  runDigest(digestingQueue);
}
```

关键设计：

1. **可合并的 set + digest**：`digest(newData)` 等价于 `set(newData).digest()`。
2. **重入检测**：`digestingQueue` 中的 `null` 是「活动周期哨兵」。`runDigest` 开始时推入 `null` 标记周期起点；若 digest 期间再次调用 `digest()`，检测到 `digestingQueue[0] === null` 后直接返回——回调已入队，等当前周期结束后统一处理。

### runDigest 的执行条件

```ts
function runDigest(digesting) {
  const startIndex = digesting.length;
  digesting.push(null); // 哨兵

  const keys = changedKeys;
  const changed = hasChangedFlag;
  // 注意：此时不重置脏标记！

  const frame = Frame.get(viewId);
  const view = frame?.view;
  const node = getById(viewId);

  if (changed && view && node && view.signature.value > 0 && frame) {
    hasChangedFlag = 0; // 条件满足才重置
    changedKeys = new Set();
    const template = view.getTemplate();
    if (typeof template === "function") {
      const result = template(data, viewId, refData);
      if (typeof result === "string") {
        // 字符串渲染路径
        const newDom = domGetNode(result, node);
        const ref = createDomRef();
        domSetChildNodes(node, newDom, ref, frame, keys);
        applyIdUpdates(ref.idUpdates);
        applyDomOps(ref.domOps);
        view.endUpdate(viewId);
      } else {
        // VDOM 渲染路径
        // ...vdomSetChildNodes(node, vdom, result, ref, frame, keys, view, ready)
      }
    }
  } else {
    changedKeys = new Set(); // 清 changedKeys，保留脏标记
  }

  // 处理重入队列
  if (digesting.length > startIndex + 1) {
    runDigest(digesting); // 递归处理新一轮
  } else {
    const callbacks = digesting.slice();
    digesting.length = 0;
    for (const cb of callbacks) if (cb) cb();
  }
}
```

几个值得注意的细节：

**脏标记的延迟重置**：渲染条件不满足时（如 `mountCtx` 中 `frame.view` 尚未接线），`hasChangedFlag` **保留**，确保下一次 digest 仍能渲染。若在此处提前重置，变更会被静默吞掉——这正是源码注释中提到的 lark-demo 白屏 bug 的根因。

**递归重入**：digest 过程中触发的新 digest 不会立即执行渲染，而是在当前周期结束后通过 `runDigest(digesting)` 递归处理，保证每个周期看到的都是一致的数据快照。

**回调时机**：`digest(data, excludes, callback)` 的 callback 在整个 digest 周期（含重入周期）结束后执行，此时 DOM 已更新完毕，适合执行依赖最新 DOM 的逻辑。

## 四、State：跨视图批量通知

`State` 是全局单例的内存数据对象，其批量机制与 Updater 同构：

```ts
set(data, excludes?) {
  dataIsChanged = setData(data, appData, changedKeys, excludes) || dataIsChanged;
  return State;
},

digest(data?, excludes?) {
  if (data) State.set(data, excludes);
  if (dataIsChanged) {
    dataIsChanged = false;
    const keys = changedKeys;
    stashedChangedKeys = keys;   // 暂存供 diff() 读取
    changedKeys = new Set();
    emitter.fire(RouterEvents.CHANGED, { keys });
  }
}
```

多次 `set` 累积 `changedKeys`，一次 `digest` 触发**一个** `changed` 事件，携带全部变更键。`diff()` 返回最近一次 digest 的变更键集合。

### 引用计数回收

`State.clean(keys)(ctx)` 在视图 setup 中调用，为每个 key 增加引用计数；视图销毁时递减，计数归零时**自动删除该 key 的数据**，防止内存泄漏：

```ts
function teardownKeysRef(keyList: string[]): void {
  for (const key of keyList) {
    if (hasOwnProperty(keyRefCounts, key)) {
      const count = --keyRefCounts[key];
      if (count <= 0) {
        Reflect.deleteProperty(keyRefCounts, key);
        Reflect.deleteProperty(appData, key); // 数据回收
      }
    }
  }
}
```

## 五、Dispatcher：变更如何找到视图

`State.digest()` 与 `Router` 变更都会触发 `dispatcherNotifyChange`，它负责把变更**精确送达**观察了对应 key 的视图。

### 入口分流

```ts
function dispatcherNotifyChange(e: ChangeEvent): void {
  const rootFrame = Frame.getRoot();
  if (!rootFrame) return;

  if ("view" in e && e.view !== undefined) {
    // 路由 view 变化 → 挂载新视图
    rootFrame.mountView(viewPath);
  } else {
    // 参数/状态变化 → 遍历 frame 树通知视图
    dispatcherUpdateTag++;
    dispatcherUpdate(rootFrame, e.keys);
  }
}
```

### 迭代式树遍历（LIFO 栈）

`dispatcherUpdate` 不使用递归，而是用**显式 LIFO 栈**迭代遍历 Frame 树——深层嵌套的 Frame 树不会撑爆 JS 调用栈（V8 不做尾调用优化）：

```ts
function dispatcherUpdate(
  frame: FrameObj,
  stateKeys?: ReadonlySet<string>,
): void {
  const stack: FrameObj[] = [frame];

  const drain = (s: FrameObj[]): void => {
    while (s.length > 0) {
      const current = s.pop();
      if (!current) continue;
      const view = current.view;

      if (
        !view ||
        current.dispatcherUpdateTag === dispatcherUpdateTag ||
        view.signature.value <= 1
      ) {
        continue;
      }
      current.dispatcherUpdateTag = dispatcherUpdateTag;

      const isChanged = stateKeys
        ? stateIsObserveChanged(view, stateKeys)
        : viewIsObserveChanged(view);

      let renderPromise;
      if (isChanged) {
        const renderResult = funcWithTry(
          view.renderMethod ?? view.render,
          [],
          view,
          noop,
        );
        if (isThenable(renderResult)) renderPromise = renderResult;
      }

      const children = current.children();
      if (renderPromise) {
        // 异步分支：等 render settle 后再处理该子树
        renderPromise.then(() => {
          const subStack = [];
          for (let i = children.length - 1; i >= 0; i--) {
            const child = Frame.get(children[i]);
            if (child) subStack.push(child);
          }
          drain(subStack);
        });
      } else {
        // 逆序入栈，使 pop() 按原始顺序访问
        for (let i = children.length - 1; i >= 0; i--) {
          const child = Frame.get(children[i]);
          if (child) s.push(child);
        }
      }
    }
  };

  drain(stack);
}
```

三个关键机制：

**去重标签**：`dispatcherUpdateTag` 每次通知递增，frame 上的 `dispatcherUpdateTag` 记录上次处理它的轮次。同一轮通知中每个 frame 只处理一次，即使它在树中被多条路径引用。

**变更过滤**：`stateIsObserveChanged` 检查视图通过 `ctx.observeState("keys")` 声明的观察键与本次变更键的交集；路由变更则用 `viewIsObserveChanged` 检查 `observeLocation` 声明的 path/params。未观察的视图完全跳过，不做无谓渲染。

**异步感知**：若 `render()` 返回 thenable（异步渲染），该 frame 的子树被推迟到 promise resolve 后处理，而**兄弟子树继续同步消费栈**——异步分支不阻塞整棵树的遍历。

## 六、Store：eager push-based 派生值重算

`createStore` 实现了 zustand 风格的外部 Store，其 `computed` 派生值采用**急切（eager）、推送（push-based）**的重算策略。

### setState 的精确比较

与 `setData` 的保守策略不同，Store 用 `Object.is` 做精确比较，无变化则完全不通知：

```ts
const setState = (partial) => {
  if (destroyed) return;
  const prevState = state;
  const resolved = typeof partial === "function" ? partial(prevState) : partial;

  const nextState = { ...prevState };
  let changed = false;

  for (const key in resolved) {
    if (
      hasOwnProperty(resolved, key) &&
      !computedKeys.has(key) && // computed 键写入被忽略
      !actionKeys.has(key)
    ) {
      // action 键写入被忽略
      const newVal = Reflect.get(resolved, key);
      if (!Object.is(Reflect.get(prevState, key), newVal)) {
        Reflect.set(nextState, key, newVal);
        changed = true;
      }
    }
  }

  if (!changed) return; // 无变化 → 不通知

  state = nextState;
  recomputeIfNeeded(prevState); // 先重算派生值

  for (const listener of listeners) {
    listener(state, prevState); // 再通知监听者
  }
};
```

### computed 的重算时机

`recomputeIfNeeded` 在 `state` 更新后、监听者通知**之前**执行，保证监听者看到的永远是一致的「state + 派生值」：

```ts
const recomputeIfNeeded = (prevState: T): void => {
  if (computedDefs.size === 0) return;

  // 1. 对比出本轮实际变化的键
  const changedKeys = new Set<string>();
  for (const key of Object.keys(state)) {
    if (!Object.is(Reflect.get(state, key), Reflect.get(prevState, key))) {
      changedKeys.add(key);
    }
  }

  // 2. 依赖了变化键的 computed 立即重算
  for (const [key, def] of computedDefs) {
    if (def.deps.some((dep) => changedKeys.has(dep))) {
      const newVal = def.fn();
      if (!Object.is(Reflect.get(state, key), newVal)) {
        Reflect.set(state, key, newVal);
      }
    }
  }
};
```

这就是「eager push-based」的含义：

- **eager**：写入时立即重算，而非读取时惰性求值；
- **push-based**：变更从源头（setState）主动推向依赖方，依赖方通过 `deps` 声明被动接收。

`computed` 返回的是一个带 Symbol 品牌（`COMPUTED_BRAND`）的标记对象，`createStore` 在初始化时通过 `isComputedMarker` 识别它们，将其与普通 state、action 函数分离：

```ts
const body = creator(setState, getState);
for (const key of Object.keys(body)) {
  const val = Reflect.get(body, key);
  if (isComputedMarker(val)) {
    computedDefs.set(key, val); // 派生值定义
    computedKeys.add(key);
  } else if (typeof val === "function") {
    Reflect.set(actions, key, val); // action
    actionKeys.add(key);
  } else {
    initialState[key] = val; // 普通 state
  }
}
```

### bindStore：Store 与视图的桥接

`bindStore(view, store, selector?)` 订阅 Store 变化，把 state 同步进视图的 `updater.data` 并 digest，视图销毁时自动退订：

```ts
// 初始同步
view.updater.set(extract(store.getState()));
view.updater.digest();

const off = store.subscribe((state) => {
  view.updater.set(extract(state));
  view.updater.digest();
});

view.on("destroy", off); // 生命周期绑定
```

这样 Store 的每次 `setState` 都会经由 Updater 的变更检测流入视图——由于 Store state 每次都是新对象（`{ ...prevState }`），`setData` 的对象恒变规则保证视图必然重渲染。

## 七、版本追踪与 snapshot/altered

Updater 维护一个单调递增的 `version`，每次 `set` 产生实际变更时递增。围绕它有一对协作 API：

```ts
function snapshot(): UpdaterApi {
  snapshotVersion = version;
  return api;
}

function altered(): boolean | undefined {
  if (snapshotVersion === undefined) return undefined;
  return version !== snapshotVersion;
}
```

### 用途：assign 的渲染决策

视图的 `assign(options)` 在子视图 props 更新时被框架调用，用于判断「props 变了，我需要重渲染吗」。标准写法：

```ts
return {
  template,
  assign(options) {
    ctx.updater.snapshot(); // 记录当前版本
    ctx.updater.set(options || {}); // 合并新 props
    return ctx.updater.altered(); // 版本变了才返回 true
  },
};
```

若 `assign` 返回 `false`，框架跳过该视图的重渲染——这是子视图避免无谓更新的关键优化。`altered()` 在从未调用 `snapshot()` 时返回 `undefined`，提醒调用方流程不完整。

## 八、refData 与引用令牌

模板中的 `{{@expr}}` 用于传递**活的 JS 值**（对象、函数）。由于 DOM 属性只能存字符串，编译器调用 `refFn` 把值存入 `refData` 并返回一个 `SPLITTER + 序号` 的令牌字符串：

```ts
export function refFn(ref, value, key) {
  const counter = ref[SPLITTER] as number;
  for (let i = counter; --i;) {
    key = SPLITTER + i;
    if (ref[key] === value) return key; // 同一值复用同一令牌
  }
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}
```

事件触发或子视图挂载时，框架用 `updater.translate(token)` 或 `translateData` 把令牌还原为原始值。`isRefToken` 严格校验「SPLITTER + 纯数字」的形态，确保用户数据即使恰好以 SPLITTER 开头也不会被误判为引用。

## 九、时序总览

把以上机制串成一次完整更新的时间线：

```
t0  用户点击
t1  domEventProcessor 捕获事件（捕获阶段，document.body）
t2  解析 @click="viewId\x1ehandler(params)" → events["handler<click>"]
t3  handler 执行：updater.set() → setData 判定 → version++ / changedKeys
t4  updater.digest()
t5  runDigest：条件检查 → template(data, viewId, refData)
t6  diff 引擎对比新旧树，收集 DomOp / nodeProps
t7  applyDomOps 批量写入 DOM
t8  view.endUpdate() → frame.mountZone() → 子视图 props 更新
t9  digestingQueue 回调执行（digest 第三参数）
```

跨视图更新（State）则多一段：

```
t4' State.digest() → fire("changed", { keys })
t5' dispatcherNotifyChange → dispatcherUpdateTag++
t6' LIFO 栈遍历 Frame 树，过滤出观察了 keys 的视图
t7' 命中视图执行 render() → 各自的 updater.digest()
```

## 设计取舍小结

| 决策                                   | 理由                                       |
| -------------------------------------- | ------------------------------------------ |
| 对象恒为变更（不做深比较）             | 深比较成本不可控；去重交给 diff 引擎       |
| 写入与提交分离（set/digest）           | 支持批量合并，一次渲染多次写入             |
| digest 重入哨兵                        | 渲染期间的二次 digest 不丢失、不嵌套执行   |
| 脏标记延迟重置                         | 渲染条件未满足时保留变更，避免吞更新       |
| LIFO 栈遍历 + 异步分支延迟             | 防栈溢出；异步渲染不阻塞兄弟子树           |
| Store 用 Object.is，Updater 用恒变规则 | Store 是外部事实源需精确；视图渲染宁多勿漏 |
| computed eager push                    | 监听者永远看到一致快照，无读取时抖动       |
