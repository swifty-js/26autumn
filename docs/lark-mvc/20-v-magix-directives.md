---
title: v-lark 指令
description: 详解 Lark Mvc 的 v-lark 指令——核心组合机制。包括 mountZone 查询 [v-lark] 元素、视图路径解析、子视图在 Diff 中的保留策略（字符串与 VDOM 模式）、Zone 挂载/卸载生命周期及嵌套视图。
---

# v-lark 指令

## 概述

`v-lark` 是 Lark Mvc 的**核心组合机制**——它定义了视图之间的嵌套关系。任何带有 `v-lark` 属性的 DOM 元素都会被框架识别为一个**子视图挂载点**，框架会自动完成子视图的加载、挂载、更新和卸载。

本文覆盖以下源码模块：

| 模块       | 文件            | 职责                                |
| ---------- | --------------- | ----------------------------------- |
| Frame 挂载 | `src/frame.ts`  | mountZone 完整实现、Zone 生命周期   |
| 共享常量   | `src/common.ts` | LARK_VIEW 常量定义                  |
| DOM Diff   | `src/dom.ts`    | 字符串模式下子视图保留              |
| VDOM Diff  | `src/vdom.ts`   | VDOM 模式下子视图保留（isLarkView） |

---

## 一、v-lark 属性

### 1.1 常量定义

```typescript
// src/common.ts

/** Attribute name: v-lark */
export const LARK_VIEW = "v-lark";
```

### 1.2 基本语法

```html
<!-- 最简形式：指定视图路径 -->
<div v-lark="views/header"></div>

<!-- 携带路径参数 -->
<div v-lark="views/detail?id=123&tab=info"></div>

<!-- 携带 props -->
<div v-lark="views/counter" p-lark-initial="10" p-lark-step="5"></div>

<!-- 携带事件绑定 -->
<div v-lark="views/list" e-lark-select="handleSelect"></div>

<!-- 完整形式 -->
<div
  v-lark="views/chart"
  p-lark-config="{{@chartConfig}}"
  e-lark-update="handleUpdate"
></div>
```

### 1.3 属性值格式

`v-lark` 的属性值遵循 URI 格式：

```
v-lark="path?key1=value1&key2=value2"
```

| 部分         | 说明                     | 示例           |
| ------------ | ------------------------ | -------------- |
| `path`       | 视图路径（对应注册表键） | `views/header` |
| `?key=value` | 查询参数（传递给 setup） | `?id=123`      |

---

## 二、mountZone — Zone 挂载

### 2.1 触发时机

`mountZone` 在以下时机被调用：

1. **首次渲染后**：`ctx.endUpdate()` → `frame.mountZone(id)`
2. **每次重渲染后**：`updater.digest()` → DOM Diff → `view.endUpdate(viewId)` → `frame.mountZone(updateId)`

### 2.2 完整实现

```typescript
// src/frame.ts

mountZone(zoneId?: string): void {
  const targetZone = zoneId ?? frame.id;

  // 1. 暂停 created 事件触发
  frame.holdFireCreated = 1;

  // 2. 查找 Zone 根元素
  const rootEl = document.getElementById(targetZone);
  if (!rootEl) return;

  // 3. 查询所有 [v-lark] 元素
  const selector = `[${LARK_VIEW}]`;
  const viewElements = rootEl.querySelectorAll(selector);
  const mountList = [];

  // 4. 遍历每个 v-lark 元素
  viewElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const elId = el.id || ensureElementId(el, "frame_");

    // 4a. 已绑定元素：更新 props
    if (htmlElIsBound(el)) {
      const childFrame = Frame.get(elId);
      const childView = childFrame?.view;
      if (childView && childView.signature.value > 0) {
        const props = readProps(el);
        if (Object.keys(props).length > 0) {
          childView.updater.set(props).digest();
        }
      }
      return;
    }

    // 4b. 新元素：收集挂载信息
    Reflect.set(el, "frameBound", 1);
    const viewPathArg = getAttribute(el, LARK_VIEW);
    if (!viewPathArg) return;

    const props = readProps(el);
    const events = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith(LARK_EVENT_PREFIX)) {
        const eventName = attr.name.slice(LARK_EVENT_PREFIX.length);
        events[eventName] = attr.value;
      }
    }

    mountList.push({ frameId: elId, viewPathArg, props, events });
  });

  // 5. 挂载新子 Frame
  for (const { frameId, viewPathArg, props, events } of mountList) {
    const childFrame = frame.mountFrame(frameId, viewPathArg, props);

    // 6. 接线子→父事件
    const parentEvents = frame.view?.getEvents();
    if (parentEvents) {
      for (const eventName in events) {
        const handlerName = events[eventName];
        const prefix = handlerName + "<";
        let handler;
        for (const key in parentEvents) {
          if (key.startsWith(prefix)) {
            handler = parentEvents[key];
            break;
          }
        }
        if (handler && childFrame) {
          childFrame.on(eventName, (data?) => {
            funcWithTry(handler!, data ? [data] : [], frame.view, noop);
          });
        }
      }
    }
  }

  // 7. 恢复 created 事件
  frame.holdFireCreated = 0;
  notifyCreated(frame);
}
```

### 2.3 执行流程图

```
mountZone(zoneId)
    │
    ├─ holdFireCreated = 1（暂停 created 冒泡）
    │
    ├─ rootEl.querySelectorAll('[v-lark]')
    │
    ├─ 遍历每个元素 ─────────────────────────────┐
    │   │                                         │
    │   ├─ frameBound === 1？                     │
    │   │   ├─ 是 → readProps → updater.set().digest()（更新已有子视图）
    │   │   └─ 否 → 收集到 mountList（新子视图）  │
    │   │                                         │
    ├─ 遍历 mountList ────────────────────────────┘
    │   │
    │   ├─ frame.mountFrame(frameId, viewPath, props)
    │   │   └─ childFrame.mountView(...)
    │   │
    │   └─ 接线 e-lark-* 事件
    │
    ├─ holdFireCreated = 0
    │
    └─ notifyCreated(frame)（触发 created 冒泡）
```

---

## 三、视图路径解析

### 3.1 parseUri

`v-lark` 属性值通过 `parseUri` 解析为路径和参数：

```typescript
// 解析示例
parseUri("views/detail?id=123&tab=info");
// → { path: "views/detail", params: { id: "123", tab: "info" } }

parseUri("views/home");
// → { path: "views/home", params: {} }
```

### 3.2 参数翻译

路径中的参数可能包含 ref 令牌（来自 `{{@expr}}`），需要翻译为实际值：

```typescript
// src/frame.ts — translateQuery

function translateQuery(
  pId: string,
  src: string,
  params: Record<string, string>,
): void {
  const parentFrame = frameRegistry.get(pId);
  const parentView = parentFrame?.view;
  if (!parentView) return;

  const parentRefData = parentView.updater.refData;
  if (!parentRefData) return;

  // 如果 viewPath 包含 SPLITTER，翻译参数中的 ref 令牌
  if (src.indexOf(SPLITTER) > 0) {
    translateData(parentRefData, params);
    // ...
  }
}
```

---

## 四、子视图在 Diff 中的保留

### 4.1 为什么需要保留？

子视图拥有独立的状态和生命周期。当父视图重渲染时，如果子视图的 `v-lark` 路径未变，框架必须**保留**现有子视图实例，而非销毁重建。

### 4.2 字符串模式（dom.ts）

在字符串渲染模式下，`domSetNode` 通过比较 `v-lark` 属性值来判断是否保留子视图：

```typescript
// src/dom.ts — domSetNode 内部

if (oldAsEl !== null && newAsEl !== null) {
  const newLarkView = newEl.getAttribute(LARK_VIEW);
  let updateChildren = true;

  // 如果新旧 v-lark 路径相同，保留现有子视图
  if (newLarkView) {
    const oldFrameId = oldEl.getAttribute("id") || "";
    const newViewPath = parseUri(newLarkView).path;
    const oldLarkView = oldEl.getAttribute(LARK_VIEW);
    const oldViewPath = oldLarkView ? parseUri(oldLarkView).path : "";

    if (oldFrameId && newViewPath === oldViewPath) {
      updateChildren = false; // 不递归 diff 子节点
    }
  }

  domSetAttributes(oldEl, newEl, ref, !!newLarkView);
  if (updateChildren) {
    domSetChildNodes(oldEl, newEl, ref, frame, keys_);
  }
}
```

保留条件：

1. 新元素有 `v-lark` 属性
2. 旧元素有 `id`（已绑定 Frame）
3. 新旧 `v-lark` 的 `path` 部分相同

### 4.3 compareKey 机制

在 keyed diff 算法中，`v-lark` 路径作为节点的 `compareKey`：

```typescript
// src/dom.ts — domGetCompareKey

export function domGetCompareKey(node: ChildNode): string | undefined {
  if (node.nodeType !== 1) return undefined;
  const el = node as DomElement;

  // 优先使用 id
  let key = el.autoId ? "" : el.getAttribute("id") || undefined;

  // 其次使用 v-lark 路径
  if (!key) {
    const larkView = el.getAttribute(LARK_VIEW);
    if (larkView) {
      key = parseUri(larkView).path || undefined;
    }
  }

  return key || "";
}
```

这确保了即使 DOM 位置变化，只要 `v-lark` 路径相同，节点就能被正确匹配和复用。

### 4.4 VDOM 模式（vdom.ts）

在 VDOM 渲染模式下，子视图保留通过 `isLarkView` 字段实现：

```typescript
// src/vdom.ts — vdomCreate 内部

// v-lark 子视图检测
if (prop === LARK_VIEW && value) {
  const parsed = parseUri(value as string);
  isLarkView = parsed.path;
  if (!viewList) viewList = [];
  viewList.push([
    isLarkView,
    propsObj["lark-owner"] as string,
    value as string,
    parsed.params,
  ]);
  if (!compareKey) {
    compareKey = tag + SPLITTER + isLarkView;
  }
}
```

```typescript
// src/vdom.ts — vdomSetNode 内部

// 子视图处理
let updateChildren = true;
if (newVDom.isLarkView) {
  const oldFrameId = (realNode as Element).getAttribute("id") || "";
  const newViewPath = newVDom.isLarkView;
  const oldViewPath = lastVDom.isLarkView || "";

  if (oldFrameId && newViewPath === oldViewPath) {
    // 相同视图：保留现有子视图
    updateChildren = false;
  }
}
```

### 4.5 两种模式对比

| 特性       | 字符串模式 (dom.ts)                  | VDOM 模式 (vdom.ts)        |
| ---------- | ------------------------------------ | -------------------------- |
| 检测方式   | `getAttribute(LARK_VIEW)`            | `vdomNode.isLarkView`      |
| 路径比较   | `parseUri(attr).path`                | 直接使用 `isLarkView` 字段 |
| compareKey | `id` 或 `v-lark path`                | `tag + SPLITTER + path`    |
| 保留判断   | `oldFrameId && newPath === oldPath`  | 相同逻辑                   |
| 性能       | 每次 diff 需 getAttribute + parseUri | 编译时预计算，O(1) 比较    |

---

## 五、Zone 卸载生命周期

### 5.1 unmountZone

```typescript
// src/frame.ts

unmountZone(zoneId?: string): void {
  for (const childId in frame.childrenMap) {
    if (hasOwnProperty(frame.childrenMap, childId)) {
      if (!zoneId || childId !== zoneId) {
        frame.unmountFrame(childId);
      }
    }
  }
  notifyCreated(frame);
}
```

### 5.2 unmountFrame

```typescript
unmountFrame(id?: string): void {
  const targetId = id ? frame.childrenMap[id] : frame.id;
  const targetFrame = frameRegistry.get(targetId);
  if (!targetFrame) return;

  const wasCreated = targetFrame.readyCount > 0;
  const pId = targetFrame.parentId;

  // 1. 卸载视图
  targetFrame.unmountView();

  // 2. 从注册表移除（触发 Frame 'remove' 事件）
  removeFrame(targetId, wasCreated);

  // 3. 从父级 children 中移除
  const parent = frameRegistry.get(pId ?? "");
  if (parent && parent.childrenMap[targetId]) {
    Reflect.deleteProperty(parent.childrenMap, targetId);
    parent.childrenCount--;
    notifyCreated(parent);
  }
}
```

### 5.3 unmountView

```typescript
unmountView(): void {
  const currentView = frame.view;

  // 清空 invoke 队列
  frame.invokeList.length = 0;
  if (!currentView) return;

  // 标记为销毁中
  frame.destroyed = 1;

  // 卸载子 Zone
  frame.unmountZone();

  // 通知 alter 事件
  notifyAlter(frame, globalAlter);

  // 执行视图清理
  unmountCtx(currentView);

  // 清除视图引用
  frame.view = undefined;

  // 恢复原始模板
  const node = document.getElementById(frame.id);
  if (node && frame.originalTemplate) {
    node.innerHTML = frame.originalTemplate;
  }
}
```

### 5.4 卸载顺序

```
unmountView()
    │
    ├─ invokeList.length = 0（清空待执行调用）
    │
    ├─ frame.unmountZone()（递归卸载所有子 Frame）
    │   │
    │   └─ 对每个 childId:
    │       ├─ childFrame.unmountView()（递归）
    │       ├─ removeFrame(childId)（从注册表移除）
    │       └─ 更新父级 childrenMap
    │
    ├─ notifyAlter()（通知父级变更）
    │
    ├─ unmountCtx(view)（执行视图清理）
    │   ├─ useEffect 清理
    │   ├─ 注销事件
    │   ├─ 销毁资源
    │   ├─ fire('destroy')
    │   └─ signature = 0
    │
    └─ 恢复 originalTemplate
```

---

## 六、嵌套视图

### 6.1 多层嵌套

`v-lark` 支持任意深度的嵌套：

```html
<!-- views/layout.html -->
<div class="layout">
  <header v-lark="views/header"></header>
  <main v-lark="views/content"></main>
  <footer v-lark="views/footer"></footer>
</div>
```

```html
<!-- views/content.html -->
<div class="content">
  <aside v-lark="views/sidebar"></aside>
  <section v-lark="views/main-panel">
    <!-- main-panel 内部还可以有子视图 -->
  </section>
</div>
```

```html
<!-- views/main-panel.html -->
<div class="panel">
  <div v-lark="views/data-table" *data="{{@tableData}}"></div>
  <div
    v-lark="views/pagination"
    *page="{{=page}}"
    @change="handlePageChange"
  ></div>
</div>
```

### 6.2 嵌套树结构

```
Frame: "app" (views/layout)
├── Frame: "frame_1" (views/header)
├── Frame: "frame_2" (views/content)
│   ├── Frame: "frame_3" (views/sidebar)
│   └── Frame: "frame_4" (views/main-panel)
│       ├── Frame: "frame_5" (views/data-table)
│       └── Frame: "frame_6" (views/pagination)
└── Frame: "frame_7" (views/footer)
```

### 6.3 created 事件冒泡

嵌套视图的 `created` 事件从叶子节点向根冒泡：

```
pagination created → main-panel readyCount++
data-table created → main-panel readyCount++
main-panel childrenCount === readyCount → main-panel created → content readyCount++
sidebar created → content readyCount++
content childrenCount === readyCount → content created → app readyCount++
header created → app readyCount++
footer created → app readyCount++
app childrenCount === readyCount → app created ✓
```

### 6.4 条件嵌套

```html
<!-- 条件渲染子视图 -->
{{if showDetail}}
<div v-lark="views/detail" *id="{{=selectedId}}"></div>
{{/if}}
```

当条件从 `true` 变为 `false` 时：

1. DOM Diff 移除该元素
2. `domUnmountFrames` 检测到元素有 `id`
3. 调用 `frame.unmountZone(id)` 和 `frame.unmountFrame(id)`
4. 子视图完整卸载

```typescript
// src/dom.ts — domUnmountFrames

export function domUnmountFrames(frame: FrameObj, node: ChildNode): void {
  if (!(node instanceof Element)) return;
  const id = node.getAttribute("id");
  if (!id) return;
  frame.unmountZone(id);
  if (frame.children().includes(id)) {
    frame.unmountFrame(id);
  }
}
```

---

## 七、frameBound 标记

### 7.1 作用

`frameBound` 是设置在 DOM 元素上的内部标记，用于区分**新元素**和**已绑定元素**：

```typescript
// 新元素挂载时设置
Reflect.set(el, "frameBound", 1);

// Frame 移除时清除
Reflect.set(element, "frameBound", 0);
```

### 7.2 判断逻辑

```typescript
function htmlElIsBound(element: HTMLElement): boolean {
  return !!Reflect.get(element, "frameBound");
}
```

### 7.3 在 mountZone 中的意义

| frameBound        | 含义                 | mountZone 行为       |
| ----------------- | -------------------- | -------------------- |
| `0` / `undefined` | 新元素，从未挂载过   | 创建 Frame，挂载视图 |
| `1`               | 已绑定，视图正在运行 | 仅更新 props         |

---

## 八、ID 生成

### 8.1 ensureElementId

没有 `id` 属性的 `v-lark` 元素会被自动分配 ID：

```typescript
const elId = el.id || ensureElementId(el, "frame_");
// 生成类似 "frame_1"、"frame_2" 的 ID
```

### 8.2 自定义 ID

可以通过 `id` 属性指定 Frame ID：

```html
<div id="my-chart" v-lark="views/chart"></div>
```

```typescript
// 通过 ID 获取 Frame
const chartFrame = Frame.get("my-chart");
chartFrame.invoke("resize", [800, 600]);
```

---

## 九、完整示例

### 9.1 应用布局

```html
<!-- index.html -->
<div id="app"></div>
```

```typescript
// views/app.ts
export default defineView((ctx) => {
  ctx.updater.set({ user: null, loading: true });

  fetch("/api/user")
    .then((r) => r.json())
    .then(
      ctx.wrapAsync((user) => {
        ctx.updater.set({ user, loading: false }).digest();
      }),
    );

  return { template: appTemplate };
});
```

```html
<!-- views/app.html -->
<div class="app">
  <nav v-lark="views/nav" *user="{{@user}}"></nav>

  {{if loading}}
  <div class="loading">加载中...</div>
  {{else}}
  <main v-lark="views/dashboard" *user="{{@user}}"></main>
  {{/if}}
</div>
```

### 9.2 动态子视图

```html
<!-- views/dashboard.html -->
<div class="dashboard">
  {{forOf widgets as widget}}
  <div
    v-lark="{{=widget.viewPath}}"
    *config="{{@widget.config}}"
    @action="handleWidgetAction"
  ></div>
  {{/forOf}}
</div>
```

```typescript
// views/dashboard.ts
export default defineView((ctx, params) => {
  ctx.updater.set({
    widgets: [
      { viewPath: "views/widgets/chart", config: { type: "line" } },
      { viewPath: "views/widgets/table", config: { columns: 5 } },
      { viewPath: "views/widgets/stats", config: { metrics: ["pv", "uv"] } },
    ],
  });

  return {
    template,
    events: {
      "handleWidgetAction<action>"(data) {
        console.log("Widget 动作:", data);
      },
    },
  };
});
```

---

## 十、性能考量

### 10.1 子视图保留的重要性

```
父视图重渲染（无子视图保留）：
  销毁子视图 → 重新加载 → 重新挂载 → 重新渲染
  耗时: ~50ms+（含异步加载）

父视图重渲染（有子视图保留）：
  更新 props → 子视图 digest
  耗时: ~2ms（仅数据更新）
```

### 10.2 避免不必要的子视图重建

```html
<!-- ❌ 错误：条件切换导致子视图反复销毁/重建 -->
{{if tab === 'list'}}
<div v-lark="views/list"></div>
{{else}}
<div v-lark="views/grid"></div>
{{/if}}

<!-- ✓ 更好：使用 CSS 隐藏，保持子视图存活 -->
<div
  v-lark="views/list"
  style="display:{{if tab === 'list'}}block{{else}}none{{/if}}"
></div>
<div
  v-lark="views/grid"
  style="display:{{if tab === 'grid'}}block{{else}}none{{/if}}"
></div>
```

### 10.3 Zone 粒度控制

```typescript
// 局部更新：只重挂载指定 Zone
ctx.beginUpdate("zone-sidebar");
// ... 更新 sidebar 数据 ...
ctx.endUpdate("zone-sidebar");
// 其他 Zone 的子视图不受影响
```

---

## 总结

| 概念        | 要点                                  |
| ----------- | ------------------------------------- |
| `v-lark`    | 核心组合指令，标记子视图挂载点        |
| mountZone   | 查询 `[v-lark]` 元素，挂载/更新子视图 |
| parseUri    | 解析视图路径和查询参数                |
| frameBound  | 区分新元素与已绑定元素                |
| 子视图保留  | Diff 时路径相同则保留，不递归子节点   |
| compareKey  | `v-lark` 路径作为 keyed diff 的匹配键 |
| unmountZone | 递归卸载所有子 Frame                  |
| 嵌套视图    | 任意深度，created 事件从叶到根冒泡    |
| 条件渲染    | 条件消失时自动卸载子视图              |
| 性能        | 保留机制避免不必要的销毁/重建         |
