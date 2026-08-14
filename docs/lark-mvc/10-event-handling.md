---
title: 事件处理
description: Lark Mvc 的事件委托系统，包括模板 @event 语法、events map 命名规范、捕获阶段委托、修饰键与 domEventProcessor 遍历算法
---

# 事件处理

Lark Mvc 采用**事件委托**机制处理所有 DOM 事件。事件监听器统一注册在 `document.body` 的**捕获阶段**，而非绑定到各个 DOM 元素上。当用户触发事件时，委托系统从 `event.target` 向上遍历 DOM 树，匹配已注册的处理函数。

## 模板中的事件绑定

### @event 语法

在模板中，通过 `@事件名="处理函数(参数)"` 绑定事件：

```html
<!-- 无参数 -->
<button @click="handleClick()">点击</button>

<!-- 带参数 -->
<button @click="addItem({id: '123', name: '商品'})">添加</button>

<!-- 不同事件类型 -->
<input @input="onInput()" @focus="onFocus()" @blur="onBlur()" />

<!-- 表单提交 -->
<form @submit="onSubmit()">
  <button type="submit">提交</button>
</form>
```

### 编译编码

模板编译时，`processViewEvents` 函数将 `@event` 属性值编码为内部格式：

```ts
export function processViewEvents(source: string): string {
  return source.replace(
    /@(\w+)="([^"]+)"/g,
    (fullAttr, eventName, attrValue) => {
      const eventMatch = attrValue.match(/^(\w+)\((.*)\)$/s);
      if (!eventMatch) return fullAttr; // 无括号，非事件处理

      const handlerName = eventMatch[1];
      const paramsStr = eventMatch[2].trim();

      if (!paramsStr) {
        // 无参数: handlerName() → \x1f\x1ehandlerName()
        return `@${eventName}="${VIEW_ID_PLACEHOLDER}${SPLITTER}${handlerName}()"`;
      }

      // 转换 JS 对象字面量为 URL 查询参数
      const urlParams = jsObjectToUrlParams(paramsStr);
      return `@${eventName}="${VIEW_ID_PLACEHOLDER}${SPLITTER}${handlerName}(${urlParams})"`;
    },
  );
}
```

编码规则：

| 模板写法                           | 编译后 DOM 属性值                     |
| ---------------------------------- | ------------------------------------- |
| `@click="save()"`                  | `@click="\x1f\x1esave()"`             |
| `@click="del({id: 1})"`            | `@click="\x1f\x1edel(id=1)"`          |
| `@click="go({page: 2, size: 10})"` | `@click="\x1f\x1ego(page=2&size=10)"` |

其中：

- `\x1f`（U+001F）：View ID 占位符，运行时替换为实际的 View ID
- `\x1e`（U+001E，SPLITTER）：分隔符，分隔 View ID 和处理函数信息

### 参数格式转换

`jsObjectToUrlParams` 将 JS 对象字面量转换为 URL 查询参数格式：

```ts
function jsObjectToUrlParams(paramsStr: string): string {
  const trimmed = paramsStr.trim();
  // 已经是 URL 格式: key=value&key2=value2
  if (!/^[{[]/.test(trimmed) && /=/.test(trimmed)) {
    return trimmed;
  }
  // JS 对象字面量: {key: 'value', key2: 123}
  const objMatch = trimmed.match(/^\{(.*)\}$/s);
  if (objMatch) {
    const inner = objMatch[1];
    const pairs: string[] = [];
    const pairRegExp = /(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|([^,}]+))/g;
    let m;
    while ((m = pairRegExp.exec(inner)) !== null) {
      const key = m[1];
      const value = m[2] ?? m[3] ?? m[4]?.trim() ?? "";
      pairs.push(`${key}=${value}`);
    }
    return pairs.join("&");
  }
  return trimmed;
}
```

## events map 命名规范

View 的 `setup` 函数返回 `events` 对象，键名遵循严格的命名规范：

```ts
const MyView = defineView((ctx) => {
  return {
    template,
    events: {
      // 格式: "处理函数名<事件类型>"
      "handleClick<click>": (e) => {
        /* ... */
      },

      // 选择器作用域注册: "$名称<事件类型>"（名称仅限 \w 字符；
      // 当前实现中处理器的实际分发仍依赖模板中的 @event 属性）
      "$item<click>": (e) => {
        /* ... */
      },

      // 全局事件: "$window<事件类型>" 或 "$document<事件类型>"
      "$window<resize>": (e) => {
        /* ... */
      },
      "$document<keydown>": (e) => {
        /* ... */
      },

      // 多事件绑定
      "handlePointer<click,mousedown>": (e) => {
        /* ... */
      },

      // 修饰键（仅对 $window / $document 全局事件生效）
      "$document<keydown><ctrl>": (e) => {
        /* ... */
      },
    },
  };
});
```

### 命名格式解析

events 键名由 `VIEW_EVENT_METHOD_REGEXP` 正则解析：

```ts
export const VIEW_EVENT_METHOD_REGEXP = /^(\$?)([\w]*)<(.*?)>(?:<([\w ,]*)>)?$/;
```

| 捕获组              | 含义                     | 示例                             |
| ------------------- | ------------------------ | -------------------------------- |
| Group 1 `(\$?)`     | 是否为选择器/全局事件    | `$` 或空                         |
| Group 2 `([\w]*)`   | 选择器名或处理函数名     | `window`、`.item`、`handleClick` |
| Group 3 `(.*?)`     | 事件类型（逗号分隔多个） | `click`、`click,mousedown`       |
| Group 4 `([\w ,]*)` | 修饰键（可选）           | `ctrl`、`shift,alt`              |

### 完整命名规范表

| 语法                       | 含义                               | 示例                          |
| -------------------------- | ---------------------------------- | ----------------------------- |
| `handler<click>`           | View 根元素上的事件                | `"save<click>"`               |
| `$selector<click>`         | 选择器作用域注册（仅注册事件类型） | `"$btn<click>"`               |
| `$<click>`                 | 空选择器，仅注册事件类型           | `"$<click>"`                  |
| `$window<resize>`          | 委托到 window 对象                 | `"$window<resize>"`           |
| `$document<keydown>`       | 委托到 document 对象               | `"$document<keydown>"`        |
| `handler<click,mousedown>` | 多事件绑定                         | `"press<click,mousedown>"`    |
| `name<click><ctrl>`        | 修饰键（仅 window/document 生效）  | `"$document<keydown><ctrl>"`  |
| `name<click><shift,alt>`   | 多修饰键组合（同上）               | `"$window<click><shift,alt>"` |

> **重要事实说明**：
>
> 1. 键名由 `VIEW_EVENT_METHOD_REGEXP`（`/^(\$?)([\w]*)<(.*?)>(?:<([\w ,]*)>)?$/`）解析，名称部分只允许 `\w` 字符——`"$.item<click>"`、`"$[data-x]<click>"` 这类键**不匹配正则，根本不会被注册**。
> 2. `$selector` / `$` 形式在当前实现中只向 EventDelegator 注册事件类型监听；`domEventProcessor` 按 `@event` 属性解析出的 `handlerName<type>` 查找处理器，**不会按 CSS 选择器分发**——因此带 `$` 前缀的处理器不会由 DOM 事件直接触发（`$window` / `$document` 除外，它们直接 addEventListener）。常规做法是模板 `@click="name()"` + `"name<click>"`。
> 3. 修饰键过滤仅在 `$window` / `$document` 全局事件的 `registerGlobalEvent` 中执行；写在普通处理器上（如 `"save<click><ctrl>"`）会导致分发时的 `"save<click>"` 键查不到该处理器，事件永远不触发。

## 事件注册流程

View 挂载后，`registerEvents` 函数解析 events map 并向 EventDelegator 注册：

```ts
export function registerEvents(ctx: ViewCtx): void {
  const events = ctx.getEvents();
  if (!events) return;

  for (const key of Object.keys(events)) {
    if (!hasOwnProperty(events, key)) continue;
    const handler = events[key];
    if (typeof handler !== "function") continue;

    const matches = key.match(VIEW_EVENT_METHOD_REGEXP);
    if (!matches) continue;

    const isSelector = matches[1]; // "$" 或 ""
    const selectorOrCallback = matches[2]; // 选择器或函数名
    const eventTypes = matches[3]; // 事件类型
    const modifiers = matches[4]; // 修饰键

    for (const eventType of eventTypes.split(",")) {
      const globalNode = VIEW_GLOBALS[selectorOrCallback]; // window/document

      if (isSelector && globalNode) {
        // 全局事件（window/document）
        registerGlobalEvent(ctx, globalNode, eventType, handler, mod);
      } else if (isSelector) {
        // 选择器事件
        EventDelegator.bind(eventType, true);
      } else {
        // 根元素事件
        EventDelegator.bind(eventType, false);
      }
    }
  }
}
```

## 事件委托机制

### 捕获阶段监听

所有 DOM 事件通过 `document.body.addEventListener(type, handler, true)` 注册在捕获阶段：

```ts
export const EventDelegator = {
  bind(eventType: string, hasSelector = false): void {
    const counter = rootEvents[eventType] || 0;

    if (counter === 0) {
      // 首次注册，挂载捕获阶段监听器
      document.body.addEventListener(eventType, domEventProcessor, true);
    }

    rootEvents[eventType] = counter + 1;

    if (hasSelector) {
      selectorEvents[eventType] = (selectorEvents[eventType] || 0) + 1;
    }
  },

  unbind(eventType: string, hasSelector = false): void {
    const counter = rootEvents[eventType] || 0;

    if (counter <= 1) {
      // 最后一个取消注册，移除监听器
      document.body.removeEventListener(eventType, domEventProcessor, true);
      Reflect.deleteProperty(rootEvents, eventType);
    } else {
      rootEvents[eventType] = counter - 1;
    }
  },
};
```

### 引用计数

多个 View 可能注册相同类型的事件。EventDelegator 使用引用计数确保：

- 第一个注册者触发 `addEventListener`
- 后续注册者仅递增计数
- 只有最后一个取消注册者才触发 `removeEventListener`

这避免了重复监听器，也防止一个 View 销毁时误删其他 View 仍在使用的监听器。

## domEventProcessor 遍历算法

当事件触发时，`domEventProcessor` 是核心处理函数：

```ts
function domEventProcessor(domEvent: Event): void {
  const target = domEvent.target as HTMLElement;
  const eventType = domEvent.type;
  let lastFrameId = "";

  // 从 event.target 向上遍历到 document.body
  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const eventInfos = findFrameInfo(current, eventType);

    if (eventInfos.length) {
      for (const info of eventInfos) {
        const { id: frameId, name: handlerName, params } = info;

        // 跨 Frame 时检查 stopPropagation
        if (lastFrameId !== frameId) {
          if (lastFrameId && domEvent.isPropagationStopped?.()) {
            break;
          }
          lastFrameId = frameId;
        }

        // 查找 Frame 对应的 View
        const frame = frameId ? frameGetter?.(frameId) : undefined;
        const view = frame?.view;
        if (view) {
          // 构造事件键: "handlerName<eventType>"
          const eventKey = handlerName + "<" + eventType + ">";
          const events = view.getEvents?.();
          const fn = events?.[eventKey];

          if (fn) {
            // 附加事件元数据
            const extendedEvent = domEvent;
            extendedEvent.eventTarget = target;
            extendedEvent.params = params ? parseUri(params).params : {};
            // 调用处理函数
            funcWithTry(fn, [extendedEvent], view, noop);
          }
        }
      }
    }

    // 检查 stopPropagation
    if (domEvent.isPropagationStopped?.()) {
      break;
    }

    current = current.parentElement;
  }
}
```

### 遍历流程

```
event.target
    │
    ├─ findFrameInfo(element, eventType)
    │   ├─ 读取 @eventType 属性 → 解析 EventInfo { id, name, params }
    │   └─ 向上查找最近的 Frame → 确定所属 View
    │
    ├─ 通过 frameId 查找 Frame → 获取 View
    │
    ├─ 构造 eventKey = "handlerName<eventType>"
    │
    ├─ 从 view.getEvents() 中查找处理函数
    │
    ├─ 附加 eventTarget 和 params 到事件对象
    │
    └─ 调用处理函数 funcWithTry(fn, [event], view)
    │
    ▼
parentElement（继续向上，直到 document.body 或 stopPropagation）
```

## findFrameInfo：事件信息解析

`findFrameInfo` 负责从 DOM 元素上解析事件处理信息：

```ts
function findFrameInfo(current: HTMLElement, eventType: string): EventInfo[] {
  const eventInfos: EventInfo[] = [];

  // 读取 @eventType 属性
  const info = current.getAttribute(`@${eventType}`);
  const hasSelectorEvents = !!selectorEvents[eventType];

  // 快速退出：无 @event 属性且无选择器事件
  if (!info && !hasSelectorEvents) {
    return eventInfos;
  }

  let begin = current;
  let match;
  if (info) {
    match = parseEventInfo(info);
  }

  // 向上查找最近的 Frame 边界
  if ((match && !match.id) || hasSelectorEvents) {
    let selectorFrameId = "#";
    while (begin && begin !== document.body) {
      const beginId = begin.id;
      if (beginId && frameGetter?.(beginId)) {
        selectorFrameId = beginId;
        break;
      }
      begin = begin.parentElement;
    }

    // 沿 Frame 树向上查找，直到遇到有模板的 View（View 边界）
    let frameId = selectorFrameId;
    do {
      const frame = frameId ? frameGetter?.(frameId) : undefined;
      if (frame) {
        const view = frame.view;
        if (view) {
          // 到达 View 边界（有模板的 View），停止向上查找
          if (view.getTemplate() && !backtrace) {
            if (match && !match.id) {
              match.id = frameId;
            }
            break;
          }
        }
      }
      if (frame) {
        frameId = frame.parentId || "";
      } else {
        break;
      }
    } while (frameId);
  }

  if (match) {
    eventInfos.push({
      id: match.id,
      value: match.value,
      name: match.name,
      params: match.params,
    });
  }

  return eventInfos;
}
```

### parseEventInfo：属性值解析

```ts
// 格式: "viewId\x1ehandlerName(params)"
function parseEventInfo(eventInfo: string): EventInfo {
  const match = eventInfo.match(EVENT_METHOD_REGEXP) || [];
  return {
    id: match[1] || "", // View/Frame ID
    name: match[2] || "", // 处理函数名
    params: match[3] || "", // 参数字符串
  };
}
```

`EVENT_METHOD_REGEXP` 的定义：

```ts
export const EVENT_METHOD_REGEXP = new RegExp(
  `(?:([\\w-]+)${SPLITTER})?([^(]+)\\(([\\s\\S]*?)?\\)`,
);
```

## 事件对象

处理函数接收的事件对象是原始 DOM Event 的扩展版本：

```ts
interface ExtendedEvent extends Event {
  /** 事件的原始目标元素（event.target） */
  eventTarget: EventTarget | null;
  /** 从 @event 属性解析的参数对象 */
  params: Record<string, string>;
}
```

### 使用示例

```ts
const MyView = defineView((ctx) => {
  return {
    template: `
      <div>
        <button @click="onItemClick({id: '42', type: 'primary'})">
          点击
        </button>
      </div>
    `,
    events: {
      "onItemClick<click>": (e) => {
        // e.eventTarget → 被点击的 <button> 元素
        console.log(e.eventTarget);

        // e.params → { id: "42", type: "primary" }
        console.log(e.params.id); // "42"
        console.log(e.params.type); // "primary"

        // 标准 DOM Event 属性仍可用
        e.preventDefault();
        e.stopPropagation();
      },
    },
  };
});
```

## 修饰键（Modifiers）

修饰键用于限制事件仅在特定键盘修饰键按下时触发。**注意：修饰键过滤只在 `registerGlobalEvent` 中实现，因此仅对 `$window` / `$document` 全局事件生效**；普通处理器键名上的修饰符会使分发时的 `name<type>` 键无法命中，导致事件不触发：

```ts
events: {
  // 仅在 Ctrl 按下时触发
  "$document<keydown><ctrl>": (e) => { save(); },

  // 仅在 Shift 按下时触发
  "$window<click><shift>": (e) => { multiSelect(); },

  // 组合修饰键
  "$document<keydown><alt,shift>": (e) => { specialAction(); },

  // Meta 键（macOS 的 Cmd）
  "$document<keydown><meta>": (e) => { openInNewTab(); },
}
```

修饰键检查在 `registerGlobalEvent` 中实现：

```ts
function registerGlobalEvent(ctx, element, eventName, handler, modifiers) {
  const listener = {
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
          return; // 修饰键不满足，跳过
        }
      }
      funcWithTry(handler, [domEvent], ctx, noop);
    },
  };

  element.addEventListener(eventName, listener);

  // View 销毁时自动清理
  ctx.on("destroy", () => {
    element.removeEventListener(eventName, listener);
  });
}
```

## 全局事件（window/document）

通过 `$window` 或 `$document` 前缀注册全局事件：

```ts
const MyView = defineView((ctx) => {
  return {
    template: `<div>...</div>`,
    events: {
      // 窗口大小变化
      "$window<resize>": (e) => {
        const width = window.innerWidth;
        ctx.updater.set({ isMobile: width < 768 });
        ctx.updater.digest();
      },

      // 键盘快捷键
      "$document<keydown>": (e) => {
        if (e.key === "Escape") {
          closeDialog();
        }
      },

      // 滚动事件
      "$window<scroll>": (e) => {
        checkInfiniteScroll();
      },
    },
  };
});
```

全局事件的特点：

- 直接注册在 `window`/`document` 对象上（非 body 委托）
- View 销毁时自动通过 `ctx.on("destroy")` 清理
- 支持修饰键过滤

## 事件取消注册

View 销毁时，`unregisterEvents` 递减引用计数：

```ts
export function unregisterEvents(ctx: ViewCtx): void {
  const events = ctx.getEvents();
  if (!events) return;

  for (const key of Object.keys(events)) {
    const matches = key.match(VIEW_EVENT_METHOD_REGEXP);
    if (!matches) continue;

    const isSelector = matches[1];
    const selectorOrCallback = matches[2];
    const eventTypes = matches[3];

    for (const eventType of eventTypes.split(",")) {
      const globalNode = VIEW_GLOBALS[selectorOrCallback];

      if (isSelector && globalNode) {
        // 全局事件：由 ctx.on("destroy") 回调清理
      } else if (isSelector) {
        EventDelegator.unbind(eventType, true);
      } else {
        EventDelegator.unbind(eventType, false);
      }
    }
  }
}
```

## 事件信息缓存

为避免重复解析 `@event` 属性值，系统使用 LFU 缓存：

```ts
const eventInfoCache = createCache<Record<string, string>>({
  maxSize: 30,
  bufferSize: 10,
});

function parseEventInfo(eventInfo: string): EventInfo {
  const cached = eventInfoCache.get(eventInfo);
  if (cached) {
    return assign({}, cached, { value: eventInfo });
  }

  const match = eventInfo.match(EVENT_METHOD_REGEXP) || [];
  const result = {
    id: match[1] || "",
    name: match[2] || "",
    params: match[3] || "",
  };

  eventInfoCache.set(eventInfo, result);
  return assign({}, result, { value: eventInfo });
}
```

## 完整示例

### 待办事项列表

```ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./todo.html";

export default defineView((ctx) => {
  const [getTodos, setTodos] = useState("todos", []);
  const [getFilter, setFilter] = useState("filter", "all");

  return {
    template,
    events: {
      // 添加待办
      "addTodo<click>": (e) => {
        const input = document.getElementById("todo-input");
        const text = input?.value?.trim();
        if (!text) return;
        setTodos([...getTodos(), { id: Date.now(), text, done: false }]);
        input.value = "";
      },

      // 切换完成状态（模板 @click="toggleTodo({id: ...})" 触发）
      "toggleTodo<click>": (e) => {
        const id = Number(e.params.id);
        setTodos(
          getTodos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        );
      },

      // 删除（模板 @click="deleteTodo({id: ...})" 触发）
      "deleteTodo<click>": (e) => {
        const id = Number(e.params.id);
        setTodos(getTodos().filter((t) => t.id !== id));
      },

      // 筛选
      "setFilter<click>": (e) => {
        setFilter(e.params.filter);
      },

      // 键盘快捷键
      "$document<keydown>": (e) => {
        if (e.key === "Enter" && e.target?.id === "todo-input") {
          // 触发添加
        }
      },
    },
  };
});
```

对应模板 `todo.html`：

```html
<div class="todo-app">
  <div class="input-row">
    <input id="todo-input" type="text" placeholder="添加待办..." />
    <button @click="addTodo()">添加</button>
  </div>

  <div class="filters">
    <button
      @click="setFilter({filter: 'all'})"
      class="{{=filter === 'all' ? 'active' : ''}}"
    >
      全部
    </button>
    <button
      @click="setFilter({filter: 'active'})"
      class="{{=filter === 'active' ? 'active' : ''}}"
    >
      进行中
    </button>
    <button
      @click="setFilter({filter: 'done'})"
      class="{{=filter === 'done' ? 'active' : ''}}"
    >
      已完成
    </button>
  </div>

  <ul class="todo-list">
    {{forOf todos as todo}}
    <li
      class="todo-item {{=todo.done ? 'done' : ''}}"
      @click="toggleTodo({id: '{{=todo.id}}'})"
    >
      <span class="checkbox">{{=todo.done ? '✓' : ''}}</span>
      <span class="text">{{=todo.text}}</span>
      <button class="delete" @click="deleteTodo({id: '{{=todo.id}}'})">
        ✕
      </button>
    </li>
    {{/forOf}}
  </ul>
</div>
```

## 架构优势

| 特性          | 说明                                                     |
| ------------- | -------------------------------------------------------- |
| 统一委托      | 所有事件通过 body 捕获阶段处理，无需为每个元素绑定监听器 |
| 引用计数      | 多 View 共享同一事件类型监听器，避免重复注册             |
| View 边界隔离 | 遍历在遇到有模板的 View 时停止，防止跨 View 事件泄漏     |
| 自动清理      | View 销毁时自动递减计数/移除监听器，无内存泄漏           |
| 参数编码      | 模板中的参数编译为 URL 格式，运行时解析为对象            |
| 缓存优化      | 事件信息解析结果缓存，避免重复正则匹配                   |

## 小结

- 模板中使用 `@click="handler(params)"` 绑定事件
- 编译时编码为 `\x1f\x1ehandlerName(urlParams)` 格式
- events map 使用 `"name<eventType>"` 命名规范
- 事件委托在 `document.body` 捕获阶段，通过引用计数管理
- `domEventProcessor` 从 target 向上遍历，匹配 Frame 和 View 边界
- 支持 `$window`/`$document` 全局事件；`<ctrl>`/`<shift>` 等修饰键仅对全局事件生效
- 事件对象扩展了 `eventTarget` 和 `params` 属性
