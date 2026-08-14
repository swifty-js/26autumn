---
title: 透传 Attributes
description: 详解 Lark Mvc 中 v-lark 元素上的属性处理机制，包括 p-lark-* 属性传递、DOM diff 引擎的属性更新策略、子视图 id/class 保留规则，以及向子视图根元素透传 DOM 属性的实用模式。
---

# 透传 Attributes

在 Lark Mvc 中，当父视图模板中包含 `v-lark` 子视图元素时，该元素上的 HTML 属性需要被正确处理：哪些属性作为组件 Props 传递给子视图，哪些属性直接保留在 DOM 元素上。本文档详细说明这一机制的完整工作流程。

## 核心概念

Lark Mvc 使用三种属性前缀来区分不同用途：

| 前缀       | 用途                  | 示例                                 |
| ---------- | --------------------- | ------------------------------------ |
| `v-lark`   | 声明子视图路径        | `v-lark="app/views/counter"`         |
| `p-lark-*` | 传递组件 Props        | `p-lark-count="10"`                  |
| `e-lark-*` | 绑定子→父事件         | `e-lark-increment="handleIncrement"` |
| 其他属性   | 普通 DOM 属性（透传） | `class="wrapper" data-id="123"`      |

## mountZone：子视图挂载流程

当父视图渲染完成后，框架调用 `frame.mountZone()` 扫描模板中所有 `v-lark` 元素并挂载子视图。以下是 `src/frame.ts` 中的核心实现：

```typescript
mountZone(zoneId?: string): void {
  const targetZone = zoneId ?? frame.id;
  frame.holdFireCreated = 1;

  const rootEl = document.getElementById(targetZone);
  if (!rootEl) return;

  // 查找所有 v-lark 元素
  const selector = `[${LARK_VIEW}]`;
  const viewElements = rootEl.querySelectorAll(selector);

  viewElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const elId = el.id || ensureElementId(el, "frame_");

    // 已绑定的元素：更新 props
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

    // 新元素：挂载子视图
    Reflect.set(el, "frameBound", 1);
    const viewPathArg = getAttribute(el, LARK_VIEW);
    if (!viewPathArg) return;

    const props = readProps(el);
    // 读取 e-lark-* 事件绑定
    const events: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith(LARK_EVENT_PREFIX)) {
        const eventName = attr.name.slice(LARK_EVENT_PREFIX.length);
        events[eventName] = attr.value;
      }
    }

    mountList.push({ frameId: elId, viewPathArg, props, events });
  });
}
```

## p-lark-\* 属性：Props 传递

`p-lark-*` 前缀的属性被解析为子视图的初始化参数（Props）。框架通过 `readProps` 函数提取这些属性：

```typescript
const readProps = (el: Element): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  const parentRefData = frame.view?.updater.refData;
  for (const attr of el.attributes) {
    if (attr.name.startsWith(LARK_PROP_PREFIX)) {
      const propName = attr.name.slice(LARK_PROP_PREFIX.length);
      const val = attr.value;
      // 支持 refData 引用令牌（模板中的 {{@value}} 语法）
      if (parentRefData && isRefToken(val)) {
        props[propName] = hasOwnProperty(parentRefData, val)
          ? parentRefData[val]
          : val;
      } else {
        props[propName] = val;
      }
    }
  }
  return props;
};
```

### Props 传递示例

父视图模板：

```html
<div
  v-lark="app/views/counter"
  id="my_counter"
  p-lark-initial="10"
  p-lark-step="2"
  p-lark-label="计数器"
  class="counter-wrapper"
  data-testid="counter-component"
></div>
```

子视图接收到的 params：

```typescript
const CounterView = defineView((ctx, params) => {
  // params = { initial: "10", step: "2", label: "计数器" }
  const [getCount, setCount] = useState("count", Number(params.initial) || 0);

  return {
    template,
    events: {
      "incr<click>": () => setCount(getCount() + Number(params.step)),
    },
  };
});
```

### 引用令牌（Ref Token）机制

当模板中使用 `{{@objectValue}}` 语法时，编译器会生成一个 SPLITTER 前缀的引用令牌。`readProps` 在解析时会从父视图的 `refData` 中还原实际值：

```html
<!-- 模板中传递对象引用 -->
<div
  v-lark="app/views/detail"
  p-lark-data="{{@complexObject}}"
  p-lark-config="{{@configObj}}"
></div>
```

子视图将收到实际的 JavaScript 对象，而非字符串。

## DOM Diff 引擎的属性处理

当父视图重新渲染时，DOM diff 引擎（`src/dom.ts`）负责对比新旧 DOM 树并更新属性。核心函数为 `domSetAttributes`：

```typescript
export function domSetAttributes(
  oldNode: Element,
  newNode: Element,
  ref: DomRef,
  keepId?: boolean,
): void {
  // 重置 compare key 缓存
  const oldEl = oldNode as DomElement;
  Reflect.deleteProperty(oldEl, "compareKeyCached");

  const oldAttrs = oldNode.attributes;
  const newAttrs = newNode.attributes;

  // 移除新节点中不存在的属性
  for (let i = oldAttrs.length; i--;) {
    const name = oldAttrs[i].name;
    if (!newNode.hasAttribute(name)) {
      if (name === "id") {
        if (!keepId) {
          ref.idUpdates.push([oldNode, ""]);
        }
      } else {
        ref.hasChanged = 1;
        oldNode.removeAttribute(name);
      }
    }
  }

  // 添加/更新新节点中的属性
  for (let i = newAttrs.length; i--;) {
    const attr = newAttrs[i];
    const key = attr.name;
    const value = attr.value;
    if (oldNode.getAttribute(key) !== value) {
      if (key === "id") {
        ref.idUpdates.push([oldNode, value]);
      } else {
        ref.hasChanged = 1;
        oldNode.setAttribute(key, value);
      }
    }
  }
}
```

### 关键行为说明

1. **属性移除**：旧元素上存在但新元素上不存在的属性会被移除
2. **属性更新**：值发生变化的属性会被更新
3. **id 特殊处理**：id 变更被延迟执行（推入 `ref.idUpdates`），避免 diff 过程中影响 frame 查找
4. **keepId 参数**：当元素是 `v-lark` 子视图容器时，`keepId` 为 `true`，即使新模板中未指定 id，也不会移除旧 id

## 子视图的 id/class 保留

在 `domSetNode` 函数中，框架对 `v-lark` 元素有特殊处理逻辑：

```typescript
export function domSetNode(
  oldNode: ChildNode,
  newNode: ChildNode,
  oldParent: Element,
  ref: DomRef,
  frame: FrameObj,
  keys_?: ReadonlySet<string>,
): void {
  // ...
  if (oldAsEl !== null && newAsEl !== null) {
    const newLarkView = newEl.getAttribute(LARK_VIEW);
    let updateChildren = true;

    // 如果是相同的 v-lark 视图路径，保留现有子视图
    if (newLarkView) {
      const oldFrameId = oldEl.getAttribute("id") || "";
      const newViewPath = parseUri(newLarkView).path;
      const oldLarkView = oldEl.getAttribute(LARK_VIEW);
      const oldViewPath = oldLarkView ? parseUri(oldLarkView).path : "";

      if (oldFrameId && newViewPath === oldViewPath) {
        updateChildren = false; // 不更新子节点，保留子视图 DOM
      }
    }

    // keepId = !!newLarkView，子视图容器保留 id
    domSetAttributes(oldEl, newEl, ref, !!newLarkView);
    if (updateChildren) {
      domSetChildNodes(oldEl, newEl, ref, frame, keys_);
    }
  }
}
```

### 保留规则总结

| 场景             | id 处理             | class 处理   | 子节点处理               |
| ---------------- | ------------------- | ------------ | ------------------------ |
| 相同 v-lark 路径 | 保留（keepId=true） | 按新模板更新 | 不更新（保留子视图 DOM） |
| 不同 v-lark 路径 | 保留（keepId=true） | 按新模板更新 | 更新（重新挂载）         |
| 普通元素         | 按新模板更新        | 按新模板更新 | 正常 diff                |

### compareKey 机制

DOM diff 使用 `domGetCompareKey` 进行节点匹配：

```typescript
export function domGetCompareKey(node: ChildNode): string | undefined {
  if (node.nodeType !== 1) return undefined;
  const el = node as DomElement;

  // 优先使用 id 作为 key
  let key = el.autoId ? "" : el.getAttribute("id") || undefined;

  // 其次使用 v-lark 路径作为 key
  if (!key) {
    const larkView = el.getAttribute(LARK_VIEW);
    if (larkView) {
      key = parseUri(larkView).path || undefined;
    }
  }

  return key;
}
```

这意味着：

- 有 `id` 的元素通过 id 匹配
- `v-lark` 元素通过视图路径匹配
- 自动生成的 id（`autoId`）不参与匹配

## 已绑定元素的 Props 更新

当父视图重新渲染但子视图路径未变时，框架不会重新挂载子视图，而是直接更新其 Props：

```typescript
// 已绑定的 v-lark 元素：更新 props
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
```

这确保了：

- 子视图不会被销毁重建（保留内部状态）
- 新的 Props 值通过 `updater.set().digest()` 触发子视图重新渲染
- 子视图可以通过 `assign` 函数决定是否响应 Props 变化

## 实用模式

### 模式一：透传样式类名

```html
<!-- 父视图模板 -->
<div
  v-lark="app/views/card"
  class="card card--primary shadow-lg"
  p-lark-title="标题"
></div>
```

`class` 属性作为普通 DOM 属性直接保留在容器元素上，子视图渲染的内容位于该容器内部。

### 模式二：透传 data 属性用于测试

```html
<div
  v-lark="app/views/form"
  data-testid="user-form"
  data-section="profile"
  p-lark-user-id="{{@userId}}"
></div>
```

`data-*` 属性保留在 DOM 上，可用于 E2E 测试选择器。

### 模式三：动态 class 绑定

```html
<div
  v-lark="app/views/status-badge"
  class="badge {{= isActive ? 'badge--active' : 'badge--inactive'}}"
  p-lark-status="{{= statusText}}"
></div>
```

父视图重新渲染时，diff 引擎会更新 `class` 属性值，但不会重建子视图。

### 模式四：子视图根元素与容器分离

需要注意的是，`v-lark` 元素是**容器**，子视图渲染的内容在其**内部**：

```html
<!-- 父视图模板 -->
<section v-lark="app/views/sidebar" class="layout-sidebar" id="sidebar_zone">
  <!-- 子视图渲染的内容会出现在这里 -->
</section>
```

```typescript
// 子视图 sidebar.ts
const SidebarView = defineView((ctx, params) => {
  return {
    template, // 渲染到 #sidebar_zone 内部
  };
});
```

最终 DOM 结构：

```html
<section v-lark="app/views/sidebar" class="layout-sidebar" id="sidebar_zone">
  <!-- 子视图 template 的输出 -->
  <nav class="sidebar-nav">...</nav>
</section>
```

### 模式五：条件属性透传

```html
<div v-lark="app/views/modal"
     {{if visible}}class="modal modal--visible"{{else}}class="modal modal--hidden"{{/if}}
     p-lark-title="{{= title}}"
     aria-hidden="{{= !visible}}">
</div>
```

## 注意事项

1. **p-lark-\* 属性会保留在 DOM 上**：它们既是传递给子视图的 Props，也会作为普通属性保留在容器元素上，DOM diff 会像处理其他属性一样同步这些属性值
2. **id 是子视图的标识**：`v-lark` 元素的 `id` 用于关联 Frame 实例，不建议动态更改
3. **属性值始终为字符串**：HTML 属性值本质是字符串，传递复杂数据应使用 refData 引用令牌
4. **事件属性大小写**：HTML 会将属性名转为小写，框架的事件匹配是大小写不敏感的
5. **自动 ID 生成**：未指定 id 的 `v-lark` 元素会自动获得 `frame_` 前缀的 id，但此 id 不参与 diff 匹配
