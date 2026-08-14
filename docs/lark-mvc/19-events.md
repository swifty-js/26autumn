---
title: 事件
description: 详解 Lark Mvc 的组件事件系统，包括 createEmitter API、重入安全机制、onEventName 约定、e-lark-* 子→父事件、@event 编译、frame.on 生命周期事件与跨视图通信模式。
---

# 事件

## 概述

Lark Mvc 的事件系统分为两个层次：

1. **视图内部事件**：通过 `ctx.emitter` 实现，用于生命周期通知和自定义事件广播
2. **组件事件**：通过 `e-lark-*` 属性实现子视图向父视图的事件传递

本文覆盖以下源码模块：

| 模块       | 文件                   | 职责                                           |
| ---------- | ---------------------- | ---------------------------------------------- |
| 事件发射器 | `src/event-emitter.ts` | createEmitter 工厂、重入安全、onEventName 约定 |
| Frame 挂载 | `src/frame.ts`         | e-lark-\* 事件绑定接线                         |
| View 系统  | `src/view.ts`          | 事件注册/注销、全局事件                        |

---

## 一、createEmitter — 事件发射器

### 1.1 基本 API

```typescript
import { Framework } from "@mm/lark-mvc";

// createEmitter 不在包的直接导出列表中，通过 Framework 工厂访问
const emitter = Framework.createEmitter();

// 监听事件
emitter.on("change", (data) => {
  console.log("数据变更:", data);
});

// 触发事件
emitter.fire("change", { key: "count", value: 5 });

// 取消监听
emitter.off("change", handler);
```

### 1.2 完整方法签名

```typescript
interface EmitterApi<T = unknown> {
  /**
   * 监听事件
   * @param event - 事件名（大小写不敏感）
   * @param handler - 处理函数，接收事件数据对象
   */
  on(event: string, handler: (e: ChangeEvent) => void): EmitterApi<T>;

  /**
   * 取消监听
   * @param event - 事件名
   * @param handler - 要移除的处理函数（省略则移除该事件的所有监听）
   */
  off(event: string, handler?: AnyFunc): EmitterApi<T>;

  /**
   * 触发事件
   * @param event - 事件名
   * @param data - 事件数据（会附加 type 字段）
   * @param remove - 触发后是否移除该事件的所有监听
   * @param lastToFirst - 是否逆序调用监听器
   */
  fire(
    event: string,
    data?: Record<string, unknown>,
    remove?: boolean,
    lastToFirst?: boolean,
  ): EmitterApi<T>;
}
```

### 1.3 事件数据结构

触发事件时，框架会自动附加 `type` 字段：

```typescript
emitter.on("save", (e) => {
  console.log(e.type); // 'save'（保留原始大小写）
  console.log(e.payload); // 自定义数据
});

emitter.fire("save", { payload: { id: 1 } });
```

---

## 二、重入安全

### 2.1 问题场景

在事件处理函数内部调用 `off()` 移除监听器是常见需求，但如果直接修改监听器数组，会破坏正在进行的迭代：

```typescript
// 危险场景：fire 过程中移除监听器
emitter.on("tick", handlerA);
emitter.on("tick", handlerB);
emitter.on("tick", handlerC);

emitter.fire("tick");
// 如果 handlerA 内部调用 off('tick', handlerB)
// 直接 splice 会导致 handlerC 被跳过！
```

### 2.2 延迟移除机制

Lark 的解决方案是**延迟移除**：`fire()` 期间的 `off()` 调用只标记待移除，实际移除在最外层 `fire()` 完成后执行：

```typescript
// src/event-emitter.ts

function fire(event, data?, remove?, lastToFirst?) {
  const key = SPLITTER + event.toLowerCase();
  const list = listeners.get(key);

  firingDepth++; // 进入 fire 层级
  try {
    if (list) {
      const len = list.length;
      for (let i = 0; i < len; i++) {
        const idx = lastToFirst ? len - 1 - i : i;
        const listener = list[idx];
        if (!listener) continue;
        if (listener.handler === noop) continue; // 跳过已标记移除的
        listener.executing = 1;
        funcWithTry([listener.handler], [eventData], null, noop);
        listener.executing = "";
      }
    }
    // ...
  } finally {
    firingDepth--;
    // 最外层 fire 结束后，执行延迟的移除
    if (firingDepth === 0 && pendingCompaction) {
      for (const k of pendingCompaction) {
        const l = listeners.get(k);
        if (!l) continue;
        for (let i = l.length - 1; i >= 0; i--) {
          if (l[i].handler === noop) l.splice(i, 1);
        }
        if (l.length === 0) listeners.delete(k);
      }
      pendingCompaction = undefined;
    }
  }
}
```

### 2.3 off() 的重入处理

```typescript
function off(event: string, handler?: AnyFunc): EmitterApi<T> {
  const key = SPLITTER + event.toLowerCase();
  if (handler) {
    const list = listeners.get(key);
    if (!list) return api;

    if (firingDepth > 0) {
      // 重入移除：标记为 noop，延迟压缩
      for (const listener of list) {
        if (listener.handler === handler) {
          listener.handler = noop;
          (pendingCompaction ??= new Set()).add(key);
          break;
        }
      }
    } else {
      // 正常移除：直接 splice
      for (let i = 0; i < list.length; i++) {
        if (list[i].handler === handler) {
          list.splice(i, 1);
          break;
        }
      }
      if (list.length === 0) listeners.delete(key);
    }
  } else {
    // 移除所有监听
    listeners.delete(key);
  }
  return api;
}
```

### 2.4 实际效果

```typescript
const emitter = Framework.createEmitter();

const handlerA = () => {
  console.log("A 执行");
  emitter.off("tick", handlerB); // 标记移除 B
};
const handlerB = () => console.log("B 执行"); // 本次仍会执行
const handlerC = () => console.log("C 执行"); // 不会被跳过

emitter.on("tick", handlerA);
emitter.on("tick", handlerB);
emitter.on("tick", handlerC);

emitter.fire("tick");
// 输出: A 执行 → B 执行 → C 执行（B 虽被标记移除，但本次迭代完整）

emitter.fire("tick");
// 输出: A 执行 → C 执行（B 已被实际移除）
```

---

## 三、onEventName 约定

### 3.1 约定机制

发射器支持 `on{EventName}` 方法约定：如果对象上存在名为 `onXxx` 的方法，`fire('xxx')` 会在调用完监听器列表后自动调用它：

```typescript
// src/event-emitter.ts

function fire(event, ...) {
  // ... 调用监听器列表 ...

  // 调用 onEventName 方法（如果存在）
  const onMethod = internal[onMethodName(event)];
  if (typeof onMethod === "function") {
    funcWithTry([onMethod], [eventData], null, noop);
  }
  // ...
}

function onMethodName(event: string): string {
  return "on" + event[0].toUpperCase() + event.slice(1);
}
```

### 3.2 使用示例

```typescript
const emitter = Framework.createEmitter();

// 方式一：on() 注册
emitter.on("destroy", () => console.log("监听器方式"));

// 方式二：onEventName 属性
emitter.onDestroy = () => console.log("约定方式");

emitter.fire("destroy");
// 输出: 监听器方式 → 约定方式（约定方式在监听器之后调用）
```

### 3.3 框架内部应用

这个约定是 Lark View/Frame/Router/State 生命周期回调的基础：

```typescript
// 视图销毁时的调用
ctx.fire("destroy", undefined, true, true);
// 如果 ctx.emitter 上有 onDestroy 方法，会被自动调用
```

---

## 四、视图事件注册

### 4.1 事件键名格式

视图的 `events` 对象使用特殊的键名格式：

```typescript
const events = {
  "submit<click>": handleSubmit, // 根元素 click 事件
  "$list<change>": handleListChange, // 选择器匹配元素的 change 事件
  "$window<resize>": handleResize, // window resize 事件
  "$document<scroll>": handleScroll, // document scroll 事件
  "item<click,mousedown>": handleItem, // 多事件类型
  "$document<keydown><ctrl>": handleKeydown, // 带修饰符（仅 Ctrl 按下时触发）
};
```

### 4.2 键名解析正则

```typescript
// src/common.ts
export const VIEW_EVENT_METHOD_REGEXP = /^(\$?)([\w]*)<(.*?)>(?:<([\w ,]*)>)?$/;
```

| 分组         | 含义                       | 示例 `'$document<scroll,resize><ctrl>'` |
| ------------ | -------------------------- | --------------------------------------- |
| `matches[1]` | 是否选择器事件（`$` 前缀） | `'$'`                                   |
| `matches[2]` | 选择器或全局对象名         | `'document'`                            |
| `matches[3]` | 事件类型列表               | `'scroll,resize'`                       |
| `matches[4]` | 修饰符                     | `'ctrl'`                                |

### 4.3 注册流程

```typescript
// src/view.ts

export function registerEvents(ctx: ViewCtx): void {
  const events = ctx.getEvents();
  if (!events) return;

  for (const key of Object.keys(events)) {
    const handler = events[key];
    if (typeof handler !== "function") continue;

    const matches = key.match(VIEW_EVENT_METHOD_REGEXP);
    if (!matches) continue;

    const isSelector = matches[1];
    const selectorOrCallback = matches[2];
    const eventTypes = matches[3];
    const modifiers = matches[4];

    for (const eventType of eventTypes.split(",")) {
      const globalNode = VIEW_GLOBALS[selectorOrCallback];

      if (isSelector && globalNode) {
        // 全局事件（window/document）
        registerGlobalEvent(ctx, globalNode, eventType, handler, mod);
      } else if (isSelector) {
        // 选择器事件 → 事件委托
        EventDelegator.bind(eventType, true);
      } else {
        // 根元素事件 → 事件委托
        EventDelegator.bind(eventType, false);
      }
    }
  }
}
```

### 4.4 全局事件修饰符

`window` / `document` 事件支持键盘修饰符检测：

```typescript
const events = {
  "$document<keydown><ctrl>": handleCtrlKeydown, // 仅 Ctrl 按下时触发
  "$document<click><shift,alt>": handleCombo, // Shift + Alt 同时按下
};
```

```typescript
// src/view.ts — registerGlobalEvent 内部
handleEvent(domEvent: Event): void {
  if (modifiers) {
    const ctrlKey = Reflect.get(domEvent, "ctrlKey");
    const shiftKey = Reflect.get(domEvent, "shiftKey");
    const altKey = Reflect.get(domEvent, "altKey");
    const metaKey = Reflect.get(domEvent, "metaKey");
    if (
      (modifiers["ctrl"] && !ctrlKey) ||
      (modifiers["shift"] && !shiftKey) ||
      (modifiers["alt"] && !altKey) ||
      (modifiers["meta"] && !metaKey)
    ) {
      return;  // 修饰符不匹配，忽略
    }
  }
  funcWithTry(handler, [domEvent], ctx, noop);
}
```

---

## 五、子→父事件：e-lark-\*

### 5.1 模板语法

子视图通过 `fire()` 触发的事件，可以被父视图通过 `e-lark-*` 属性监听：

```html
<!-- 父视图模板 -->
<div
  v-lark="views/counter"
  e-lark-increment="handleIncrement"
  e-lark-reset="handleReset"
></div>
```

### 5.2 @event 编译

模板编译器将 `@event="handler"` 简写转换为 `e-lark-event="handler"`：

```typescript
// src/compiler/template-syntax.ts — processViewBindings 内部
result = result.replace(/\s@(\w+)="(\w+)"/g, (_, eventName, handlerName) => {
  return ` e-lark-${eventName}="${handlerName}"`;
});
```

```html
<!-- 源码 -->
<div v-lark="views/counter" @increment="handleIncrement"></div>

<!-- 编译后 -->
<div v-lark="views/counter" e-lark-increment="handleIncrement"></div>
```

### 5.3 事件接线

`mountZone` 在挂载子 Frame 时完成事件绑定：

```typescript
// src/frame.ts — mountZone 内部

for (const { frameId, viewPathArg, props, events } of mountList) {
  const childFrame = frame.mountFrame(frameId, viewPathArg, props);

  // 接线子→父事件绑定
  const parentEvents = frame.view?.getEvents();
  if (parentEvents) {
    for (const eventName in events) {
      const handlerName = events[eventName];
      // 在父视图的 events 映射中查找处理函数
      const prefix = handlerName + "<";
      let handler: AnyFunc | undefined;
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
```

### 5.4 完整示例

```typescript
// ─── 子视图 views/counter.ts ───
export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "increment<click>"(e) {
        const newCount = getCount() + 1;
        setCount(newCount);
        // 向父视图发送事件
        ctx.fire("increment", { count: newCount });
      },
    },
  };
});
```

```typescript
// ─── 父视图 views/parent.ts ───
export default defineView((ctx) => {
  return {
    template,
    events: {
      // 处理子视图的 increment 事件
      "handleIncrement<increment>"(data) {
        console.log("计数器变为:", data.count);
        ctx.updater.set({ total: data.count }).digest();
      },
    },
  };
});
```

```html
<!-- 父视图模板 -->
<div v-lark="views/counter" @increment="handleIncrement"></div>
<p>当前值: {{=total}}</p>
```

### 5.5 事件名大小写

HTML 属性名会被浏览器解析器统一转为小写，因此事件匹配是**大小写不敏感**的：

```typescript
// src/event-emitter.ts — fire 内部
const key = SPLITTER + event.toLowerCase();
// fire("clearHistory") 会匹配 on("clearhistory")
```

---

## 六、frame.on — 生命周期事件

### 6.1 Frame 级事件

每个 Frame 拥有独立的 emitter，支持以下生命周期事件：

```typescript
const frame = Frame.get("my-frame");

// 所有子 Frame 挂载完成
frame.on("created", () => {
  console.log("子视图全部就绪");
});

// 子 Frame 内容发生变更
frame.on("alter", (data) => {
  console.log("子视图变更:", data.id);
});

// 自定义事件
frame.on("dataReady", (data) => {
  console.log("数据就绪:", data);
});
frame.fire("dataReady", { items: [] });
```

### 6.2 Frame 静态事件

`Frame` 单例提供全局的 Frame 生命周期监听：

```typescript
// 监听 Frame 创建
Frame.on("add", ({ frame }) => {
  console.log("Frame 创建:", frame.id);
});

// 监听 Frame 移除
Frame.on("remove", ({ frame, fcc }) => {
  console.log("Frame 移除:", frame.id, "曾就绪:", fcc);
});
```

### 6.3 视图生命周期事件

通过 `ctx.on()` 监听视图生命周期：

```typescript
export default defineView((ctx) => {
  // 视图销毁前清理
  const unsubscribe = ctx.on("destroy", () => {
    console.log("视图销毁，执行清理");
  });

  // 每次渲染时
  ctx.on("render", () => {
    console.log("视图重渲染");
  });

  return { template };
});
```

---

## 七、跨视图通信模式

### 7.1 模式一：子→父事件（推荐）

```typescript
// 子视图
ctx.fire('selected', { id: 123 });

// 父视图模板
<div v-lark="views/list" @selected="handleSelected"></div>

// 父视图
events: {
  'handleSelected<selected>'(data) { /* ... */ },
}
```

### 7.2 模式二：invoke 直接调用

```typescript
// 父视图调用子视图方法
const childFrame = Frame.get("child-id");
childFrame.invoke("refresh", [newData]);

// 子视图暴露方法
export default defineView((ctx) => {
  // 方法挂载到 ctx 上（通过 hooks 或直接定义）
  return {
    template,
    // invoke 会查找 ctx 上的同名函数
  };
});
```

### 7.3 模式三：全局 State

```typescript
// 视图 A：写入状态
State.set({ user: userInfo }).digest();

// 视图 B：观察状态
ctx.observeState("user");
// user 变化时视图 B 自动重渲染
```

### 7.4 模式四：自定义事件总线

```typescript
// 创建共享总线（经 Framework 工厂）
const bus = Framework.createEmitter();

// 视图 A
bus.fire("notification", { message: "保存成功" });

// 视图 B
useEffect(() => {
  const off = () => bus.off("notification", handler);
  bus.on("notification", handler);
  return off; // 销毁时取消监听
});
```

### 7.5 模式选择指南

| 场景             | 推荐模式                |
| ---------------- | ----------------------- |
| 子视图通知父视图 | 子→父事件（e-lark-\*）  |
| 父视图控制子视图 | invoke 直接调用         |
| 兄弟视图通信     | 共同父视图中转 或 State |
| 全局广播         | State 或 事件总线       |
| 跨层级通信       | State（observeState）   |

---

## 八、最佳实践

### 8.1 事件清理

```typescript
export default defineView((ctx) => {
  // ✓ 使用 useEffect 确保清理
  useEffect(() => {
    const handler = () => {
      /* ... */
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  });

  // ✓ ctx.on 返回取消函数
  const off = ctx.on("custom", handler);
  // 需要时调用 off()

  return { template };
});
```

### 8.2 避免内存泄漏

```typescript
// ❌ 错误：全局事件未清理
events: {
  '$window<scroll>'(e) { /* ... */ },  // 框架会自动处理
}

// ✓ 正确：框架自动管理 $window/$document 事件的清理
// registerGlobalEvent 内部已注册 destroy 时的清理逻辑
```

### 8.3 事件数据设计

```typescript
// ✓ 传递纯数据，避免传递 DOM 元素或函数
ctx.fire("itemSelected", {
  id: item.id,
  name: item.name,
});

// ❌ 避免传递复杂引用
ctx.fire("itemSelected", { element: e.target, callback: fn });
```

---

## 总结

| 概念          | 要点                                                        |
| ------------- | ----------------------------------------------------------- |
| createEmitter | 函数式工厂，返回 on/off/fire API                            |
| 重入安全      | fire 期间的 off 延迟到最外层 fire 结束执行                  |
| onEventName   | `onXxx` 方法约定，fire('xxx') 自动调用                      |
| 事件键名      | `'name<type>'`、`'$selector<type>'`、`'$window<type><mod>'` |
| e-lark-\*     | 子→父事件绑定属性                                           |
| @event 编译   | `@event="handler"` → `e-lark-event="handler"`               |
| frame.on      | Frame 生命周期事件（created/alter）                         |
| Frame.on      | 全局 Frame 增删事件（add/remove）                           |
| 通信模式      | 子→父事件、invoke、State、事件总线                          |
