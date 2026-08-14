---
title: 自定义指令
description: Lark Mvc 的指令机制详解——基于属性的事件委托系统、@event 属性语法、$selector 委托模式、以及如何构建可复用的指令式行为
---

# 自定义指令

Lark Mvc **没有** Vue 风格的 `v-*` 指令系统。Lark 采用了一种更轻量、更贴近 DOM 原生语义的方式来实现“指令”功能：**基于属性的事件委托系统**。所有自定义行为通过模板中的 `@event` 属性与 events map 的 `name<eventType>` 命名约定来附加，无需注册全局指令、无需额外的运行时抽象。

## 设计理念

Lark 的"指令"哲学：

- **事件即指令**：DOM 行为通过事件处理器声明，而非自定义属性指令
- **委托而非绑定**：所有 DOM 事件委托到 `document.body`（捕获阶段），无需为每个元素单独绑定监听器
- **Frame 边界隔离**：事件在 Frame（视图容器）边界处停止传播，防止跨视图事件泄漏
- **零配置**：无需注册、无需声明，在 `events` 对象中定义即可生效

---

## 事件系统架构

### 事件委托原理

所有 DOM 事件通过 `EventDelegator` 单例管理，使用**引用计数**避免重复绑定：

```ts
// event-delegator.ts
export const EventDelegator = {
  bind(eventType: string, hasSelector = false): void {
    const counter = rootEvents[eventType] || 0;
    if (counter === 0) {
      // 首次注册：在 document.body 上添加捕获阶段监听器
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
      // 最后一个取消注册：移除监听器
      document.body.removeEventListener(eventType, domEventProcessor, true);
    } else {
      rootEvents[eventType] = counter - 1;
    }
    // ...selector 计数处理
  },
};
```

### 事件处理流程

当事件触发时，`domEventProcessor` 从 `event.target` 向上遍历 DOM 树：

1. 在每个元素上检查 `@eventType` 属性
2. 解析属性值获取 Frame ID、处理器名称、参数
3. 沿 Frame 树向上查找匹配的选择器事件
4. 在视图边界（有模板的视图）处停止

---

## @event 属性语法

在模板中，使用 `@事件类型="处理器名(参数)"` 语法声明事件绑定：

### 基本语法

```html
<!-- 无参数 -->
<button @click="handleClick()">点击</button>

<!-- 带参数（JS 对象字面量自动转为 URL 参数格式） -->
<a @click="navigate({id: '123', type: 'detail'})">详情</a>

<!-- 多参数 -->
<button @click="update({name: 'test', value: 42})">更新</button>
```

### 编译转换

模板编译器（`processViewEvents`）将 `@event` 属性转换为内部格式：

```
@click="handlerName({key: 'value'})"
→ @click="\x1f\x1ehandlerName(key=value)"
```

其中：

- `\x1f`（U+001F）：视图 ID 占位符，运行时替换为实际视图 ID
- `\x1e`（U+001E）：分隔符，分隔视图 ID 和处理器名

### 在视图 setup 中处理

```ts
import { defineView } from "@mm/lark-mvc";
import template from "./list.html";

export default defineView((ctx) => {
  return {
    template,
    events: {
      // 对应模板中的 @click="handleClick()"
      "handleClick<click>"(e) {
        console.log("clicked!", e.eventTarget);
      },

      // 对应模板中的 @click="navigate({id: '123'})"
      "navigate<click>"(e) {
        // e.params 包含解析后的参数
        console.log(e.params.id); // '123'
        console.log(e.params.type); // 'detail'
      },
    },
  };
});
```

### 事件对象扩展

事件处理器接收的 `event` 对象被扩展了以下属性：

| 属性            | 类型                     | 说明                           |
| --------------- | ------------------------ | ------------------------------ |
| `e.eventTarget` | `EventTarget`            | 原始触发事件的 DOM 元素        |
| `e.params`      | `Record<string, string>` | 从 `@event` 属性解析的参数对象 |

---

## 事件命名约定

事件在 `events` 对象中的键名遵循严格的命名约定：

### 完整语法表

| 语法                        | 含义                                                 | 示例                         |
| --------------------------- | ---------------------------------------------------- | ---------------------------- |
| `name<eventType>`           | 视图根元素上的事件                                   | `'save<click>'`              |
| `$selector<eventType>`      | 选择器作用域注册（仅注册事件类型，名称限 `\w` 字符） | `'$item<click>'`             |
| `$<eventType>`              | 空选择器，仅注册事件类型                             | `'$<click>'`                 |
| `$window<eventType>`        | 委托到 `window`                                      | `'$window<resize>'`          |
| `$document<eventType>`      | 委托到 `document`                                    | `'$document<keydown>'`       |
| `name<type1,type2>`         | 多事件绑定                                           | `'handler<click,mousedown>'` |
| `name<eventType><modifier>` | 修饰键约束（仅 window/document 生效）                | `'$document<keydown><ctrl>'` |

> **事实说明**：`$selector` 形式在当前实现中只向 EventDelegator 注册对应事件类型的捕获阶段监听；处理器的实际分发仍依赖元素上的 `@event` 属性（`findFrameInfo` 不做 `element.matches(selector)` 匹配）。因此带 `$` 前缀的普通处理器不会由 DOM 事件直接触发，`$window` / `$document` 除外（它们直接 `addEventListener`）。同时 `$.item`、`$[data-x]` 这类带非 `\w` 字符的键不匹配解析正则，根本不会被注册。

### 正则解析

框架使用以下正则解析事件键名：

```ts
// common.ts
export const VIEW_EVENT_METHOD_REGEXP = /^(\$?)([\w]*)<(.*?)>(?:<([\w ,]*)>)?$/;
```

匹配组：

- `$1`：是否为选择器事件（`$` 前缀）
- `$2`：选择器或回调名
- `$3`：事件类型（逗号分隔多个）
- `$4`：修饰键（可选）

---

## $selector 委托模式

`$selector<eventType>` 是 Lark 实现"指令式"行为的核心模式。它允许你在父视图中为所有匹配特定 CSS 选择器的子元素统一注册事件处理。

### 基本用法

```ts
export default defineView((ctx) => {
  return {
    template,
    events: {
      // 所有 .delete-btn 元素的 click 事件
      "$delete-btn<click>"(e) {
        const id = e.eventTarget.getAttribute("data-id");
        removeItem(id);
      },

      // 所有 .tab-item 元素的 click 事件
      "$tab-item<click>"(e) {
        const tab = e.eventTarget.getAttribute("data-tab");
        setActiveTab(tab);
      },

      // 所有 input.search 元素的 input 事件
      "$input.search<input>"(e) {
        const value = e.eventTarget.value;
        handleSearch(value);
      },
    },
  };
});
```

### 对应模板

```html
<div class="list">
  {{forOf items as item}}
  <div class="item">
    <span>{{=item.name}}</span>
    <button class="delete-btn" data-id="{{=item.id}}">删除</button>
  </div>
  {{/forOf}}
</div>

<div class="tabs">
  <div class="tab-item" data-tab="overview">概览</div>
  <div class="tab-item" data-tab="settings">设置</div>
  <div class="tab-item" data-tab="logs">日志</div>
</div>
```

### 选择器事件的工作原理

1. 视图注册 `$selector<click>` 时，调用 `EventDelegator.bind('click', true)`
2. 事件触发时，`domEventProcessor` 从 `event.target` 向上遍历
3. 在每一层检查 `element.matches(selector)`
4. 匹配成功则调用对应处理器
5. 遍历在视图边界（有模板的 Frame）处停止

---

## 全局事件（window/document）

通过 `$window` 和 `$document` 前缀监听全局事件：

```ts
export default defineView((ctx) => {
  const [getWidth, setWidth] = useState("width", window.innerWidth);

  return {
    template,
    events: {
      // 监听 window resize
      "$window<resize>"(e) {
        setWidth(window.innerWidth);
      },

      // 监听 document 键盘事件
      "$document<keydown>"(e) {
        if (e.key === "Escape") {
          closeDialog();
        }
      },

      // 带修饰键约束（修饰键仅对 $window / $document 全局事件生效）
      "$document<keydown><ctrl>"(e) {
        // 仅在 Ctrl 键按下时触发
        saveDocument();
      },
    },
  };
});
```

### 修饰键支持

| 修饰键    | 说明                      |
| --------- | ------------------------- |
| `<ctrl>`  | Ctrl 键                   |
| `<shift>` | Shift 键                  |
| `<alt>`   | Alt 键                    |
| `<meta>`  | Meta 键（Mac 的 Command） |

### 全局事件的生命周期管理

全局事件监听器在视图销毁时自动移除：

```ts
// view.ts → registerGlobalEvent
function registerGlobalEvent(ctx, element, eventName, handler, modifiers) {
  const listener = {
    handleEvent(domEvent) {
      /* ... */
    },
  };
  element.addEventListener(eventName, listener);

  // 视图销毁时自动清理
  ctx.on("destroy", () => {
    element.removeEventListener(eventName, listener);
  });
}
```

---

## 子视图事件绑定（e-lark-\*）

在 `v-lark` 子视图元素上，可以使用 `e-lark-*` 属性建立子→父的事件通信：

### 模板语法

```html
<!-- 父视图模板 -->
<div
  v-lark="app/views/counter"
  *count="{{=initialCount}}"
  e-lark-increment="onIncrement"
  e-lark-decrement="onDecrement"
></div>
```

编译后转换为：

```html
<div
  v-lark="app/views/counter"
  p-lark-count="{{=initialCount}}"
  e-lark-increment="onIncrement"
  e-lark-decrement="onDecrement"
></div>
```

### 父视图处理

```ts
// 父视图
export default defineView((ctx) => {
  const [getTotal, setTotal] = useState("total", 0);

  return {
    template: parentTemplate,
    events: {
      // 处理子视图触发的 increment 事件
      "onIncrement<increment>"(data) {
        setTotal(getTotal() + data.amount);
      },
      "onDecrement<decrement>"(data) {
        setTotal(getTotal() - data.amount);
      },
    },
  };
});
```

### 子视图触发

```ts
// 子视图 (counter)
export default defineView((ctx, params) => {
  let count = params.count || 0;

  return {
    template: counterTemplate,
    events: {
      "add<click>"(e) {
        count++;
        // 通过 Frame 事件向父视图通信
        ctx.owner.fire("increment", { amount: 1 });
      },
    },
  };
});
```

### 事件绑定原理

Frame 系统在 `mountZone` 时读取 `e-lark-*` 属性，将子 Frame 事件连接到父视图处理器：

```ts
// frame.ts → mountZone
const parentEvents = frame.view?.getEvents();
if (parentEvents) {
  for (const eventName in events) {
    const handlerName = events[eventName];
    const prefix = handlerName + "<";
    // 在父视图 events 中查找匹配的处理器
    for (const key in parentEvents) {
      if (key.startsWith(prefix)) {
        handler = parentEvents[key];
        break;
      }
    }
    if (handler && childFrame) {
      childFrame.on(eventName, (data) => {
        funcWithTry(handler, data ? [data] : [], frame.view, noop);
      });
    }
  }
}
```

---

## 构建可复用的"指令"模式

虽然 Lark 没有全局指令注册机制，但可以通过以下模式实现等效的可复用行为：

### 模式一：工具函数 + 事件处理器

由于 events map 的 `$name` 只允许 `\w` 字符且不按 CSS 选择器分发，需要“按属性匹配任意元素”时，标准做法是用 `$document` 全局事件 + `closest()` 判断：

```ts
// directives/tooltip.ts
export function createTooltipHandler(ctx: ViewCtx) {
  let tooltipEl: HTMLElement | null = null;

  return {
    "$document<mouseover>"(e: Event) {
      const target = (e.target as HTMLElement).closest?.("[data-tooltip]");
      if (!(target instanceof HTMLElement)) return;
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      tooltipEl = document.createElement("div");
      tooltipEl.className = "tooltip";
      tooltipEl.textContent = text;
      document.body.appendChild(tooltipEl);
      // 定位逻辑...
    },
    "$document<mouseout>"() {
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
      }
    },
  };
}

// 在视图中使用
import { createTooltipHandler } from "./directives/tooltip";

export default defineView((ctx) => {
  return {
    template,
    events: {
      ...createTooltipHandler(ctx),
      // 其他事件...
    },
  };
});
```

### 模式二：高阶 setup 函数

```ts
// behaviors/draggable.ts
export function withDraggable(setup: ViewSetup): ViewSetup {
  return (ctx, params) => {
    const descriptor = setup(ctx, params);

    // 注入拖拽行为（拖拽起点由模板 @mousedown="dragStart()" 触发，
    // 移动/结束用 $document 全局事件）
    const dragEvents = {
      "dragStart<mousedown>"(e) {
        // 拖拽开始逻辑（模板内对应元素写 @mousedown="dragStart()"）
      },
      "$document<mousemove>"(e) {
        // 拖拽移动逻辑
      },
      "$document<mouseup>"(e) {
        // 拖拽结束逻辑
      },
    };

    return {
      ...descriptor,
      events: { ...descriptor.events, ...dragEvents },
    };
  };
}

// 使用
export default withDraggable(
  defineView((ctx) => {
    return {
      template,
      events: {/* 业务事件 */},
    };
  }),
);
```

### 模式三：useEffect + DOM 操作

```ts
// behaviors/intersection-observer.ts
export function useLazyLoad(
  ctx: ViewCtx,
  selector: string,
  callback: (el: HTMLElement) => void,
) {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          callback(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      });
    });

    // 观察所有匹配元素
    const root = document.getElementById(ctx.id);
    root?.querySelectorAll(selector).forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  });
}

// 在视图中使用
export default defineView((ctx) => {
  useLazyLoad(ctx, "img[data-src]", (img) => {
    img.setAttribute("src", img.getAttribute("data-src")!);
  });

  return { template };
});
```

### 模式四：自定义属性 + 选择器事件

```html
<!-- 模板中声明“指令”：自定义属性携带规则，@blur 绑定处理器 -->
<input v-validate="required,email" type="email" @blur="validateField()" />
```

```ts
// 处理器从 eventTarget 上读取自定义属性，统一校验
export default defineView((ctx) => {
  return {
    template,
    events: {
      "validateField<blur>"(e) {
        const el = e.eventTarget as HTMLInputElement;
        const rules = (el.getAttribute("v-validate") || "").split(",");
        validateField(el, el.value, rules);
      },
    },
  };
});
```

---

## 事件注册与注销

### 注册流程

视图 setup 返回后，框架调用 `registerEvents(ctx)` 解析 events 对象：

```ts
export function registerEvents(ctx: ViewCtx): void {
  const events = ctx.getEvents();
  if (!events) return;

  for (const key of Object.keys(events)) {
    const matches = key.match(VIEW_EVENT_METHOD_REGEXP);
    if (!matches) continue;

    const isSelector = matches[1]; // '$' 前缀
    const selectorOrCallback = matches[2]; // 选择器或名称
    const eventTypes = matches[3]; // 事件类型

    for (const eventType of eventTypes.split(",")) {
      const globalNode = VIEW_GLOBALS[selectorOrCallback]; // window/document

      if (isSelector && globalNode) {
        registerGlobalEvent(ctx, globalNode, eventType, handler, mod);
      } else if (isSelector) {
        EventDelegator.bind(eventType, true); // 选择器事件
      } else {
        EventDelegator.bind(eventType, false); // 根事件
      }
    }
  }
}
```

### 注销流程

视图销毁时，`unregisterEvents(ctx)` 递减引用计数：

- 全局事件（window/document）：通过 `ctx.on("destroy")` 回调移除
- 选择器事件：`EventDelegator.unbind(eventType, true)`
- 根事件：`EventDelegator.unbind(eventType, false)`

当引用计数归零时，`document.body` 上的捕获阶段监听器才会被真正移除。

---

## 与 Vue 指令的对比

| 特性         | Vue 指令                   | Lark 事件系统                       |
| ------------ | -------------------------- | ----------------------------------- |
| 注册方式     | `app.directive()` 全局注册 | events 对象中声明                   |
| 编译时处理   | 需要编译器识别             | 模板中直接使用 `@event`             |
| 生命周期钩子 | mounted/updated/unmounted  | 通过 useEffect 管理                 |
| 复用方式     | 指令对象                   | 工具函数 / 高阶 setup               |
| 参数传递     | binding.value              | `@event="handler({key: val})"`      |
| 修饰符       | `.stop` `.prevent` 等      | `<ctrl>` `<shift>` 等（仅全局事件） |
| 性能         | 每个元素绑定               | 全局委托，引用计数                  |

## 最佳实践

1. **优先使用模板 `@event` + 处理器**：这是当前实现中唯一可靠的元素级分发路径；`$selector` 仅注册事件类型，不按选择器分发
2. **利用 `data-*` 传参**：比在 `@event` 中硬编码参数更灵活
3. **封装为工具函数**：可复用的行为封装为返回 events 片段的函数
4. **注意 Frame 边界**：事件分发在遇到有模板的视图时停止，防止跨视图泄漏
5. **全局事件注意清理**：`$window` / `$document` 事件在视图销毁时自动清理，无需手动处理
