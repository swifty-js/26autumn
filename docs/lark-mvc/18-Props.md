---
title: Props
description: 详解 Lark Mvc 的 Props 系统，包括 p-lark-* 属性约定、*prop 模板简写编译、ref 令牌解析、父级重渲染时的 Props 更新机制，以及 Props 作为 viewInitParams 传递给 setup 函数。
---

# Props

## 概述

Lark Mvc 的 Props 系统实现了父视图向子视图传递数据的标准化通道。与 React 的 JSX props 或 Vue 的 `v-bind` 不同，Lark 采用 **HTML 属性约定** 的方式：所有以 `p-lark-` 为前缀的属性都会被识别为子视图的 props。

本文覆盖以下源码模块：

| 模块       | 文件                              | 职责                                     |
| ---------- | --------------------------------- | ---------------------------------------- |
| Frame 挂载 | `src/frame.ts`                    | mountZone 中的 readProps、props 更新逻辑 |
| 模板编译器 | `src/compiler/template-syntax.ts` | processViewBindings 编译 `*prop` 简写    |
| 共享常量   | `src/common.ts`                   | LARK_PROP_PREFIX 定义与 ref 令牌检测     |

---

## 一、p-lark-\* 属性约定

### 1.1 常量定义

```typescript
// src/common.ts

/** Attribute prefix for component props: p-lark-{name} */
export const LARK_PROP_PREFIX = "p-lark-";
```

### 1.2 基本语法

在模板中，任何以 `p-lark-` 开头的属性都会被传递给子视图：

```html
<!-- 父视图模板 -->
<div
  v-lark="views/counter"
  p-lark-initial="10"
  p-lark-step="5"
  p-lark-label="计数器"
></div>
```

子视图的 setup 函数通过 `params` 接收这些 props：

```typescript
// views/counter.ts
export default defineView((ctx, params) => {
  console.log(params.initial); // "10"（字符串）
  console.log(params.step); // "5"
  console.log(params.label); // "计数器"

  ctx.updater.set({
    count: Number(params.initial) || 0,
    step: Number(params.step) || 1,
    label: params.label || "",
  });

  return { template };
});
```

### 1.3 属性命名规则

| 模板属性             | props 键名   | 说明                        |
| -------------------- | ------------ | --------------------------- |
| `p-lark-initial`     | `initial`    | 去掉前缀即为键名            |
| `p-lark-data-source` | `dataSource` | 连字符保持原样              |
| `p-lark-onChange`    | `onchange`   | HTML 属性名会被浏览器小写化 |

> **注意**：HTML 解析器会将属性名统一转为小写。`p-lark-onChange` 在 DOM 中实际是 `p-lark-onchange`，因此 props 键名也是小写的。

---

## 二、\*prop 模板简写

### 2.1 编译器转换

手写 `p-lark-` 前缀较为冗长，Lark 模板编译器提供了 `*prop="value"` 简写语法：

```typescript
// src/compiler/template-syntax.ts

/**
 * Process *prop and @event bindings on v-lark elements.
 *
 * *count="{{=count}}"        → p-lark-count="{{=count}}"
 * *history="{{@history}}"    → p-lark-history="{{@history}}"
 * @increment="increment"    → e-lark-increment="increment"
 */
export function processViewBindings(source: string): string {
  // Transform *prop="value" → p-lark-prop="value"
  let result = source.replace(
    /\s\*(\w+)="([^"]*)"/g,
    (_, name: string, value: string) => {
      return ` p-lark-${name}="${value}"`;
    },
  );

  // Transform @event="handlerName" (no parens, plain identifier)
  result = result.replace(
    /\s@(\w+)="(\w+)"/g,
    (_, eventName: string, handlerName: string) => {
      return ` e-lark-${eventName}="${handlerName}"`;
    },
  );

  return result;
}
```

### 2.2 编译示例

```html
<!-- 源码模板 -->
<div
  v-lark="views/counter"
  *initial="{{=count}}"
  *config="{{@configObj}}"
  @increment="handleIncrement"
></div>

<!-- 编译后输出 -->
<div
  v-lark="views/counter"
  p-lark-initial="{{=count}}"
  p-lark-config="{{@configObj}}"
  e-lark-increment="handleIncrement"
></div>
```

### 2.3 编译管线顺序

`processViewBindings` 必须在 `processViewEvents` 之后执行：

```
模板源码
    │
    ▼
processViewEvents()      ← 处理 @event="handler(params)" 带括号形式
    │
    ▼
processViewBindings()    ← 处理 *prop="value" 和 @event="handler" 无括号形式
    │
    ▼
convertArtSyntax()       ← 转换 {{}} 为 <% %>
    │
    ▼
compileToFunction()      ← 生成模板函数
```

这个顺序很重要：`processViewEvents` 只处理带括号的 `@event="handler(params)"` 形式（视图内部事件），而 `processViewBindings` 处理无括号的 `@event="handler"` 形式（子→父事件绑定）。

---

## 三、ref 令牌解析

### 3.1 问题背景

HTML 属性值只能是字符串。当需要向子视图传递**对象**时，Lark 使用 **ref 令牌** 机制：模板中的 `{{@expr}}` 运算符将对象存入 `refData`，并在属性值中写入一个 SPLITTER 前缀的令牌。

### 3.2 refFn — 令牌生成

```typescript
// src/common.ts

/**
 * Template reference function for creating stable keys for objects.
 * Stores objects in refData with SPLITTER-prefixed keys.
 */
export function refFn(
  ref: Record<string, unknown>,
  value: unknown,
  key: string,
): string {
  const counter = ref[SPLITTER] as number;
  // 先查找是否已存在相同值的令牌（去重）
  for (let i = counter; --i;) {
    key = SPLITTER + i;
    if (ref[key] === value) return key;
  }
  // 不存在则创建新令牌
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}
```

### 3.3 isRefToken — 令牌检测

```typescript
// src/common.ts

/**
 * Check if a string is a refData reference token: SPLITTER followed by
 * one or more ASCII decimal digits.
 */
export function isRefToken(s: string): boolean {
  if (s.length < 2 || s[0] !== SPLITTER) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < "0".charCodeAt(0) || c > "9".charCodeAt(0)) return false;
  }
  return true;
}
```

### 3.4 readProps — 运行时解析

`mountZone` 中的 `readProps` 函数负责从 DOM 元素读取 props 并解析 ref 令牌：

```typescript
// src/frame.ts — mountZone 内部

const readProps = (el: Element): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  const parentRefData = frame.view?.updater.refData;

  for (const attr of el.attributes) {
    if (attr.name.startsWith(LARK_PROP_PREFIX)) {
      const propName = attr.name.slice(LARK_PROP_PREFIX.length);
      const val = attr.value;

      if (parentRefData && isRefToken(val)) {
        // ref 令牌：从父视图的 refData 中解析出原始对象
        props[propName] = hasOwnProperty(parentRefData, val)
          ? parentRefData[val]
          : val;
      } else {
        // 普通字符串值
        props[propName] = val;
      }
    }
  }
  return props;
};
```

### 3.5 对象传递完整流程

```html
<!-- 父视图模板 -->
{{set chartConfig = {type: 'line', animate: true} }}
<div v-lark="views/chart" *config="{{@chartConfig}}"></div>
```

```
编译阶段：
  *config="{{@chartConfig}}"
      → p-lark-config="{{@chartConfig}}"
      → p-lark-config="\x1e3"  （refFn 生成令牌）

渲染阶段：
  refData["\x1e3"] = {type: 'line', animate: true}

挂载阶段（readProps）：
  isRefToken("\x1e3") === true
      → props.config = parentRefData["\x1e3"]
      → props.config = {type: 'line', animate: true}  ✓ 对象引用
```

子视图收到的是**真实的 JavaScript 对象引用**，而非序列化字符串：

```typescript
// views/chart.ts
export default defineView((ctx, params) => {
  const config = params.config; // {type: 'line', animate: true}
  console.log(config.type); // 'line'
  return { template };
});
```

---

## 四、父级重渲染时的 Props 更新

### 4.1 更新机制

当父视图重新渲染时，`mountZone` 会检测已绑定的子视图元素，并将新 props 推送给子视图：

```typescript
// src/frame.ts — mountZone 内部

viewElements.forEach((el) => {
  if (!(el instanceof HTMLElement)) return;
  const elId = el.id || ensureElementId(el, "frame_");

  // 已绑定的 v-lark 元素：更新现有子视图的 props
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

  // 新的 v-lark 元素：挂载新子视图
  // ...
});
```

### 4.2 更新流程

```
父视图数据变更
    │
    ▼
ctx.updater.set({count: 5}).digest()
    │
    ▼
模板重新渲染 → DOM Diff
    │
    ▼
view.endUpdate(viewId)
    │
    ▼
frame.mountZone(updateId)
    │
    ├─ 查询 [v-lark] 元素
    │
    ├─ htmlElIsBound(el) === true（已绑定）
    │   │
    │   ├─ readProps(el) → 读取最新属性值
    │   │
    │   └─ childView.updater.set(props).digest()
    │       │
    │       └─ 子视图收到新 props 并重渲染
    │
    └─ htmlElIsBound(el) === false（新元素）
        │
        └─ frame.mountFrame(...) → 挂载新子视图
```

### 4.3 子视图响应 Props 更新

子视图通过 `assign` 方法响应 props 变化：

```typescript
// views/counter.ts
export default defineView((ctx, params) => {
  ctx.updater.set({ count: Number(params.initial) || 0 });

  return {
    template,
    assign(options) {
      // 父级重渲染时，新 props 通过 options 传入
      ctx.updater.snapshot();
      if (options.initial !== undefined) {
        ctx.updater.set({ count: Number(options.initial) });
      }
      return ctx.updater.altered();
    },
  };
});
```

> **注意**：即使子视图没有定义 `assign`，`updater.set(props).digest()` 仍会执行。此时 props 会被合并到子视图的数据中，如果数据实际发生变化，子视图会重渲染。

---

## 五、Props 作为 viewInitParams

### 5.1 mountFrame 调用链

新子视图挂载时，props 作为 `viewInitParams` 传递：

```typescript
// src/frame.ts — mountZone 内部

for (const { frameId, viewPathArg, props, events } of mountList) {
  const childFrame = frame.mountFrame(frameId, viewPathArg, props);
  // ...
}

// mountFrame 内部
mountFrame(frameId: string, viewPathArg: string, viewInitParams?: Record<string, unknown>): FrameObj {
  // ...
  childFrame.mountView(viewPathArg, viewInitParams);
  return childFrame;
}

// mountView 内部
mountView(viewPathArg: string, viewInitParams?: Record<string, unknown>): void {
  // ...
  const initParams: Record<string, unknown> = { ...params }; // 路径查询参数
  if (viewInitParams) {
    assign(initParams, viewInitParams); // 合并 props
  }
  // ...
  doMountView(registered, initParams, node, sign);
}
```

### 5.2 参数合并优先级

```typescript
// 最终 params = 路径查询参数 + p-lark-* props
const initParams = { ...parsed.params }; // 低优先级
assign(initParams, viewInitParams); // 高优先级（覆盖同名键）
```

```html
<!-- 示例：props 覆盖路径参数 -->
<div v-lark="views/detail?id=1" p-lark-id="2"></div>
<!-- setup 收到 params.id === "2" -->
```

### 5.3 setup 函数签名

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

## 六、完整示例

### 6.1 父视图

```html
<!-- views/parent.html -->
<div class="dashboard">
  <h1>{{=title}}</h1>

  <!-- 字符串 props -->
  <div
    v-lark="views/stat-card"
    *label="访问量"
    *value="{{=visitCount}}"
    *trend="{{=trend}}"
  ></div>

  <!-- 对象 props（ref 令牌） -->
  <div
    v-lark="views/chart"
    *config="{{@chartConfig}}"
    *data="{{@chartData}}"
  ></div>

  <!-- 子→父事件 -->
  <div v-lark="views/filter-panel" @filter="handleFilter"></div>
</div>
```

```typescript
// views/parent.ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./parent.html";

export default defineView((ctx) => {
  const [getVisitCount, setVisitCount] = useState("visitCount", 0);
  const [getTrend, setTrend] = useState("trend", "up");

  const chartConfig = {
    type: "bar",
    animate: true,
    colors: ["#3b82f6", "#10b981"],
  };
  const chartData = [120, 200, 150, 80, 70];

  return {
    template,
    events: {
      "refresh<click>"(e) {
        setVisitCount(getVisitCount() + 100);
        // 重渲染后，stat-card 子视图会收到新的 value prop
        ctx.render();
      },
      "handleFilter<filter>"(data) {
        console.log("子视图触发过滤:", data);
      },
    },
  };
});
```

### 6.2 子视图

```typescript
// views/stat-card.ts
import { defineView } from "@mm/lark-mvc";
import template from "./stat-card.html";

export default defineView((ctx, params) => {
  // 初始 props
  ctx.updater.set({
    label: params.label || "",
    value: Number(params.value) || 0,
    trend: params.trend || "flat",
  });

  return {
    template,
    assign(options) {
      // 响应父级重渲染带来的 props 更新
      ctx.updater.snapshot();
      ctx.updater.set({
        value: Number(options.value) || 0,
        trend: options.trend,
      });
      return ctx.updater.altered();
    },
  };
});
```

```html
<!-- views/stat-card.html -->
<div class="stat-card {{=trend}}">
  <span class="label">{{=label}}</span>
  <span class="value">{{=value}}</span>
  <span class="trend-icon">{{if trend === 'up'}}↑{{else}}↓{{/if}}</span>
</div>
```

---

## 七、最佳实践

### 7.1 Props 设计原则

| 原则       | 说明                                           |
| ---------- | ---------------------------------------------- |
| 单向数据流 | Props 只能从父流向子，子视图不应直接修改 props |
| 不可变更新 | 传递对象时使用新引用，确保变更检测生效         |
| 默认值处理 | setup 中为所有 props 提供合理默认值            |
| 类型转换   | HTML 属性值是字符串，数字需手动转换            |

### 7.2 避免常见陷阱

```typescript
// ❌ 错误：直接修改对象引用，变更检测可能失效
assign(options) {
  options.config.type = 'pie'; // 修改了共享引用
  ctx.updater.set({ config: options.config });
}

// ✓ 正确：创建新引用
assign(options) {
  ctx.updater.set({
    config: { ...options.config, type: 'pie' },
  });
}
```

### 7.3 性能优化

```typescript
// 使用 snapshot/altered 避免不必要的重渲染
assign(options) {
  ctx.updater.snapshot();
  ctx.updater.set({ value: options.value });
  return ctx.updater.altered(); // 值未变 → 返回 false → 不重渲染
}
```

---

## 总结

| 概念               | 要点                                       |
| ------------------ | ------------------------------------------ |
| `p-lark-*`         | Props 属性前缀约定，去掉前缀即为键名       |
| `*prop="value"`    | 模板简写，编译为 `p-lark-prop="value"`     |
| `{{@expr}}`        | ref 令牌语法，传递对象引用                 |
| refFn / isRefToken | 令牌生成与检测                             |
| readProps          | 运行时读取属性并解析 ref 令牌              |
| Props 更新         | 父级重渲染 → `updater.set(props).digest()` |
| viewInitParams     | Props 合并到 setup 的 params 参数          |
| assign             | 子视图响应 props 更新的标准方式            |
