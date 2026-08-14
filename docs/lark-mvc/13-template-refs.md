---
title: 模板引用
description: 深入解析 Lark Mvc 的 {{@expr}} 模板引用系统：SPLITTER 前缀令牌如何让活的 JS 对象穿越 DOM 字符串边界，refData 的存储结构，translate/parse 的还原机制，以及向子视图传递对象 props 的完整链路。
---

# 模板引用

## 概述

模板渲染的本质是把数据序列化成 HTML 字符串。字符串能表达数字、布尔、文本，却表达不了**对象**——一个 `{ id: 1, name: "Lark" }` 写进 attribute 就变成 `"[object Object]"`，函数更是无从谈起。

但组件化开发中，"父视图向子视图传递一个对象/函数"是刚需。Lark Mvc 的解法是一套**引用令牌（reference token）系统**：模板里的 `{{@expr}}` 不输出值本身，而是输出一个由 `SPLITTER` 字符（U+001E）前缀的短令牌（如 `"\x1e1"`、`"\x1e2"`）；真正的对象被存进视图的 `refData` 字典，令牌就是字典的键。令牌是普通字符串，可以安全地写进任何 HTML attribute；等事件触发或子视图挂载时，框架再用 `translate` / `parse` 把令牌还原成原对象。

这套机制让**活的 JS 引用穿越了 DOM 字符串边界**，且全程不经过 JSON 序列化——对象保持引用同一性，函数可以直接调用。

本文涵盖：

1. `SPLITTER` 与 `isRefToken`：令牌的形态
2. `refFn`：令牌的生成与去重
3. `refData`：令牌的存储容器
4. `translate` / `parse`：令牌的还原
5. 实战：通过 `p-lark-*` 向子视图传递对象 props

---

## 一、SPLITTER：永不冲突的命名空间分隔符

### 1.1 定义

```ts
// src/common.ts
export const SPLITTER = String.fromCharCode(0x1e);
```

`0x1E` 是 ASCII 控制字符 **Record Separator（记录分隔符）**，在终端和文本中完全不可见。选择它的原因在源码注释中写得很清楚：

> 在整个框架中用作命名空间分隔符：refData 键、事件属性编码、缓存键组合、视图路径分隔符。选择它是因为它**永远不会出现在用户数据中**，且在 HTML attribute 中是安全的。

还有一个工程细节——用 `String.fromCharCode(0x1e)` 而非字面量 `"\x1e"`，是为了**防止打包器/压缩器剥离控制字符字面量**。

### 1.2 令牌的判定：isRefToken

并非所有 SPLITTER 开头的字符串都是引用令牌——事件属性编码也用 SPLITTER 做分隔。`isRefToken` 给出严格判定：

```ts
// src/common.ts
export function isRefToken(s: string): boolean {
  if (s.length < 2 || s[0] !== SPLITTER) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < "0".charCodeAt(0) || c > "9".charCodeAt(0)) return false;
  }
  return true;
}
```

判定规则：**SPLITTER 后跟纯 ASCII 数字**。即 `"\x1e1"`、`"\x1e42"` 是令牌；`"\x1ehandlerName(key=value)"`（事件编码）不是。这个区分在 `frame.ts` 的属性读取逻辑中至关重要（见第五节）。

---

## 二、refFn：令牌的生成

### 2.1 实现

```ts
// src/common.ts
export function refFn(
  ref: Record<string, unknown>,
  value: unknown,
  key: string,
): string {
  const counter = ref[SPLITTER] as number;
  for (let i = counter; --i;) {
    key = SPLITTER + i;
    if (ref[key] === value) return key;
  }
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}
```

`refFn(refData, value, key)` 的行为：

1. 从 `ref[SPLITTER]` 读取当前计数器（注意：`refData[SPLITTER]` 这个键被复用为计数器本身）；
2. **从新到旧遍历已有令牌**，若某个令牌指向的正是同一个 `value`（`===` 引用相等），直接复用该令牌；
3. 找不到则分配新令牌 `SPLITTER + counter++`，把 `value` 存入并返回。

去重是这里的关键设计：**同一个对象无论被 `{{@}}` 引用多少次、渲染多少轮，始终对应同一个令牌**。这带来两个好处：

- diff 时 attribute 值稳定不变（`value="\x1e1"` 永远是 `"\x1e1"`），不会触发无谓的 DOM 写入；
- 子视图的 props 比较可以依赖令牌稳定性。

### 2.2 运行时出口

`refFn` 通过 `runtime.ts` 暴露给编译后的模板：

```ts
// src/runtime.ts
export { refFn };
```

编译器在模板模块中把它别名为 `__lark_ref_fn__`（见 `compiler/compile-template.ts`）：

```ts
// src/compiler/compile-template.ts（节选）
if (operate === "@") {
  funcSource += `'+__lark_ref_fn__(__lark_ref_alt__,${content})+'`;
}
```

其中 `__lark_ref_alt__` 就是模板函数的第三个参数 `refData`。

---

## 三、refData：令牌的存储容器

### 3.1 初始化

每个视图的 Updater 在创建时就拥有独立的 `refData`：

```ts
// src/updater.ts（createUpdater 节选）
/** Ref data for template rendering */
const refData: Record<string, unknown> = {};
refData[SPLITTER] = 1;
```

`refData[SPLITTER] = 1` 把计数器初始化为 1——因此第一个令牌是 `"\x1e1"`，`"\x1e0"` 永远不会被分配（`isRefToken` 允许 `"\x1e0"`，但生成路径不会产生它）。

### 3.2 模板调用时的三参数签名

Updater 渲染时把 `refData` 作为第三参数传给模板函数：

```ts
// src/updater.ts（runDigest 节选）
const template = view.getTemplate();
if (typeof template === "function") {
  const result = template(data, viewId, refData);
  // ...
}
```

对应的类型签名（`types.ts`）：

```ts
export type ViewTemplate = (
  data: unknown,
  viewId: string,
  refData: unknown,
) => string;
```

于是模板中的 `{{@list}}` 编译后等价于 `__lark_ref_fn__(refData, list, ...)`——把 `data.list` 这个活对象登记进 `refData`，返回令牌字符串拼进 HTML。

### 3.3 一个具体的例子

假设有如下 setup 与模板：

```ts
export default defineView((ctx) => {
  const history = {
    stack: [],
    push(p: string) {
      this.stack.push(p);
    },
  };
  ctx.updater.set({ history, title: "Demo" }).digest();
  return { template };
});
```

```html
<!-- demo.html -->
<div v-lark="app/views/child" *history="{{@history}}" *title="{{=title}}"></div>
```

渲染后，DOM 中实际写入的是：

```html
<div
  id="frame_x1"
  v-lark="app/views/child"
  p-lark-history="\x1e1"
  p-lark-title="Demo"
></div>
```

`history` 对象本体安静地躺在 `refData["\x1e1"]` 里，DOM 上只有一个三字符的令牌。注意 `{{=title}}` 走的是 `encodeHTML` 字符串路径，只有 `{{@}}` 才走引用路径。

---

## 四、translate 与 parse：令牌的还原

### 4.1 translate：单令牌还原

```ts
// src/updater.ts
function translate(dataVal: unknown): unknown {
  if (typeof dataVal !== "string" || !isRefToken(dataVal)) return dataVal;
  return hasOwnProperty(refData, dataVal) ? refData[dataVal] : dataVal;
}
```

语义非常克制：

- 输入不是字符串、或不是合法令牌 → 原样返回；
- 是令牌但 `refData` 中不存在（比如视图已重建）→ 原样返回令牌字符串；
- 命中 → 返回原对象。

这个"查不到就降级返回原值"的策略保证了还原逻辑永远安全，不会抛错。

### 4.2 parse：点路径安全解析

`parse` 用于从 `refData` 中按**点分路径**取值，是 `eval` 的安全替代：

```ts
// src/updater.ts
function parse(expr: string): unknown {
  const trimmed = expr.trim();
  if (!trimmed) return undefined;

  // 纯数字字面量 → 返回 number
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // 点分属性路径：identifier(.identifier)*
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
    return undefined;
  }

  let cur: unknown = refData;
  for (const segment of trimmed.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = Reflect.get(cur, segment);
  }
  return cur;
}
```

两条白名单规则：

1. **数字字面量**（`"42"`、`"-3.14"`）→ 转成 `number` 返回；
2. **标识符点路径**（`"a.b.c"`）→ 从 `refData` 逐段 `Reflect.get`。

任何计算属性、函数调用、运算符都会被正则拒绝并返回 `undefined`——模板事件参数在 DOM 上以字符串流转，`parse` 是它们回到 JS 世界的安全门。

### 4.3 二者在 API 中的位置

`translate` 与 `parse` 都挂在 `UpdaterApi` 上（`types.ts`）：

```ts
export interface UpdaterApi {
  // ...
  refData: Record<string, unknown>;
  translate: (data: unknown) => unknown;
  parse: (expr: string) => unknown;
  // ...
}
```

事件委托系统在派发 `@click="handler({id: 1})"` 这类带参事件时，会先用 `parse` 解析参数表达式，遇到令牌再经 `translate` 还原成对象——`{{@}}` 传入的对象就是这样抵达事件处理器的。

---

## 五、实战：向子视图传递对象 props

引用令牌最重要的消费场景是**父视图向子视图传 props**。完整链路涉及模板语法、Frame 挂载、属性读取三个环节。

### 5.1 模板侧：\*prop 与 {{@}}

`compiler/template-syntax.ts` 的 `processViewBindings` 把 `*prop` 语法糖展开为标准属性：

```ts
// src/compiler/template-syntax.ts（节选）
export function processViewBindings(source: string): string {
  // *prop="value" → p-lark-prop="value"
  let result = source.replace(
    /\s\*(\w+)="([^"]*)"/g,
    (_, name: string, value: string) => {
      return ` p-lark-${name}="${value}"`;
    },
  );

  // @event="handlerName"（无括号）→ e-lark-event="handlerName"
  result = result.replace(
    /\s@(\w+)="(\w+)"/g,
    (_, eventName: string, handlerName: string) => {
      return ` e-lark-${eventName}="${handlerName}"`;
    },
  );

  return result;
}
```

于是 `*history="{{@history}}"` 变成 `p-lark-history="{{@history}}"`，再经模板求值变成 `p-lark-history="\x1e1"`。

### 5.2 Frame 侧：挂载时还原令牌

父视图 digest 完成后，`endUpdate` 触发 `frame.mountZone`，扫描所有 `v-lark` 元素并读取 props。`frame.ts` 中的 `readProps` 是令牌还原的现场：

```ts
// src/frame.ts（mountZone 节选）
const readProps = (el: Element): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  const parentRefData = frame.view?.updater.refData;
  for (const attr of el.attributes) {
    if (attr.name.startsWith(LARK_PROP_PREFIX)) {
      const propName = attr.name.slice(LARK_PROP_PREFIX.length);
      const val = attr.value;
      if (parentRefData && isRefToken(val)) {
        // 是令牌 → 从父视图 refData 还原为原对象
        props[propName] = hasOwnProperty(parentRefData, val)
          ? parentRefData[val]
          : val;
      } else {
        // 普通字符串 → 原样传递
        props[propName] = val;
      }
    }
  }
  return props;
};
```

注意这里用的是**父视图**的 `refData`（`frame.view?.updater.refData`）——因为令牌是父视图的模板生成的，登记在父视图的字典里。`isRefToken` 在此处起到分流作用：`p-lark-title="Demo"` 原样传字符串，`p-lark-history="\x1e1"` 还原为对象。

### 5.3 子视图侧：props 即 updater 数据

还原后的 props 作为 `viewInitParams` 传入 `mountFrame` → `mountView`，最终合并进子视图的 `updater.data`。子视图 setup 中直接读取：

```ts
// 子视图 child.ts
export default defineView((ctx, params) => {
  // params.history 是父视图传来的活对象（同一引用）
  const history = params?.history as { stack: string[]; push(p: string): void };

  ctx.updater.set({ stack: history.stack });

  return {
    template: childTemplate,
    events: {
      "go<click>"() {
        history.push("/next"); // 直接调用父视图对象上的方法
      },
    },
  };
});
```

**引用同一性**在这里体现价值：子视图调用的 `history.push` 操作的就是父视图持有的那个对象，无需任何序列化/反序列化，也不需要 Store 中转。

### 5.4 已挂载子视图的 props 更新

父视图重渲染时，若子视图的 `v-lark` 元素仍然存在（keyed diff 复用了节点），`mountZone` 走"已绑定"分支，把新 props 直接灌进子视图的 updater：

```ts
// src/frame.ts（mountZone 节选）
if (htmlElIsBound(el)) {
  const childFrame = Frame.get(elId);
  const childView = childFrame?.view;
  if (childView && childView.signature.value > 0) {
    const props = readProps(el);
    if (Object.keys(props).length > 0) {
      childView.updater.set(props).digest(); // ← 子视图随 props 更新
    }
  }
  return;
}
```

由于 `refFn` 的去重特性，对象引用不变时令牌也不变；对象换了新引用（如 `setState` 产生新数组），新令牌会随 diff 写入 attribute，`readProps` 还原出新的对象交给子视图。

### 5.5 查询参数中的令牌：translateQuery

`v-lark` 的值本身也可以携带令牌参数，例如 `v-lark="app/views/detail?id={{@itemId}}"`。`frame.ts` 的 `translateQuery` 负责在挂载前还原：

```ts
// src/frame.ts（节选）
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

  if (src.indexOf(SPLITTER) > 0) {
    translateData(parentRefData, params);
    // ...
  }
}
```

---

## 六、设计要点回顾

把整条链路压成一句话：**`{{@expr}}` 在编译期变成 `refFn` 调用，在渲染期把对象换成令牌写进 HTML，在消费期（事件派发/子视图挂载）用 `translate`/`parse` 换回对象**。

这套设计的取舍清晰可见：

| 收益                        | 代价                                              |
| --------------------------- | ------------------------------------------------- |
| 对象/函数可穿越字符串模板   | `refData` 持有引用，对象不会先于视图被 GC         |
| 无序列化开销，引用同一      | 令牌不可跨视图边界随意传播（需经父 refData 还原） |
| attribute 值稳定，diff 友好 | 调试时 DOM 上只能看到 `"\x1e1"`，需配合 devtool   |
| `parse` 白名单杜绝注入      | 不支持计算属性等复杂表达式                        |

与 React 的 props 对比：React 在内存中直接传递 JS 对象，不经过 DOM；Lark 的模板是字符串，必须先把一切 stringify 再 diff——`{{@}}` 令牌系统正是为字符串渲染管线补上了"对象通道"，让 Lark 在保留字符串 diff 高性能的同时，拥有了不输组件化框架的 props 传递能力。

---

## 小结

- `SPLITTER`（U+001E）是不可见控制字符，保证令牌永不与用户数据冲突；`isRefToken` 以"SPLITTER + 纯数字"严格识别令牌；
- `refFn` 生成令牌并按引用相等去重，同一对象永远对应同一令牌；计数器复用了 `refData[SPLITTER]` 键；
- `refData` 是每视图独立的字典，随 `template(data, viewId, refData)` 传入编译后的模板；
- `translate` 单令牌还原、查不到即降级；`parse` 以白名单正则安全解析数字与点路径，替代 `eval`；
- 向子视图传对象的标准姿势：`*prop="{{@obj}}"` → `p-lark-prop="\x1eN"` → `mountZone` 的 `readProps` 从父 `refData` 还原 → 合并进子视图 `updater.data`。
