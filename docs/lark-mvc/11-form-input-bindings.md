---
title: 表单输入绑定
description: 深入解析 Lark Mvc 的表单输入绑定机制：diff 引擎对 value/checked/selected 的特殊同步、{{:expr}} 绑定语法、useState 驱动的双向绑定模式，以及受控与非受控组件的实现方式。
---

# 表单输入绑定

## 概述

表单是前端框架中最考验 diff 引擎设计功力的场景。HTML 表单元素有一个与生俱来的"双态"问题：同一个 `<input>` 上同时存在**属性（attribute）**与**DOM 属性（property）**两套状态——`value="abc"` 写在标签上只是初始值，用户敲键盘改变的却是 `input.value` 这个 DOM 属性，二者从此分道扬镳。如果 diff 引擎只比较 attribute，用户在输入框里打了一半的字就会被下一次重渲染"冲掉"；如果每次都暴力重写 value，光标又会跳回行首。

Lark Mvc 在 `dom.ts` 中用一张极简的 `DomSpecials` 表和 `domSpecialDiff()` 函数正面解决了这个问题，再配合模板的 `{{:expr}}` 绑定语法与 `useState` Hook，构成了一套完整、可控、可预测的表单绑定方案。

本文涵盖：

1. diff 引擎如何同步 `value` / `checked` / `selected`（`domSpecialDiff`）
2. `{{:expr}}` 绑定语法及其编译产物
3. `useState` + `@input` / `@change` 事件实现双向绑定
4. 受控组件与非受控组件在 Lark 中的写法与取舍

---

## 一、diff 引擎中的表单状态同步

### 1.1 问题：attribute 与 property 的分裂

考虑下面的模板：

```html
<input type="text" value="{{=keyword}}" />
```

首次渲染后，用户在输入框里输入了 "hello"。此时：

- `input.getAttribute("value")` 仍然是模板写入的初始值（比如 `""`）；
- `input.value` 已经是 `"hello"`。

如果此时 `keyword` 数据变化触发重渲染，新模板产出的 `<input value="">` 与旧节点做 `isEqualNode()` 比较——attribute 层面完全一致，diff 引擎会认为"无需更新"。这本身没错，但反过来，如果引擎选择重建节点，用户输入的 `"hello"` 就会凭空消失。

更隐蔽的是 `checked` 与 `selected`：`<input type="checkbox" checked>` 的勾选状态只存在于 DOM property 上，attribute 上的 `checked` 只决定默认值。

### 1.2 DomSpecials：特殊属性登记表

`dom.ts` 用一张静态表声明了"哪些元素的哪些 DOM property 必须单独同步"：

```ts
// src/dom.ts
const DomSpecials: Record<string, string[]> = {
  INPUT: ["value", "checked"],
  TEXTAREA: ["value"],
  OPTION: ["selected"],
};
```

注意键是大写的 `nodeName`（`INPUT`、`TEXTAREA`、`OPTION`），这与 DOM 的 `node.nodeName` 返回值保持一致。`<select>` 本身不在表里——因为选中状态实际落在它的 `<option>` 子元素上，同步 `OPTION.selected` 即可。

### 1.3 domSpecialDiff：逐属性比对并回写

```ts
// src/dom.ts
export function domSpecialDiff(oldNode: ChildNode, newNode: ChildNode): number {
  const specials = DomSpecials[oldNode.nodeName];
  if (!specials) return 0;

  let result = 0;

  for (const prop of specials) {
    if (Reflect.get(oldNode, prop) !== Reflect.get(newNode, prop)) {
      result = 1;
      Reflect.set(oldNode, prop, Reflect.get(newNode, prop));
    }
  }
  return result;
}
```

这段代码的语义是：

- 对 `INPUT` 节点，比较活 DOM 上的 `value` 与 `checked` 和新解析出的节点上的对应 property；
- 只要有一项不同，就把新值**写回活 DOM**，并返回 `1` 标记"发生了变化"；
- 返回 `0` 表示所有特殊属性都一致。

关键在于它比较的是 **property 而非 attribute**。新模板字符串被 `domGetNode()` 解析成临时 DOM 树后，`<input value="abc">` 的 `input.value` 自然就是 `"abc"`，与活节点上的用户输入值直接对比，绕开了 attribute/property 分裂的陷阱。

### 1.4 在 domSetNode 中的调用位置

`domSpecialDiff` 被嵌入节点级 diff 的入口判断中：

```ts
// src/dom.ts（domSetNode 节选）
const equalAsNodes =
  oldAsEl !== null &&
  newAsEl !== null &&
  oldAsEl.isEqualNode &&
  oldAsEl.isEqualNode(newAsEl);

if (domSpecialDiff(oldNode, newNode) || !equalAsNodes) {
  // 进入属性/子节点的细粒度 diff……
}
```

这里有一个精妙的设计：`domSpecialDiff(oldNode, newNode)` 放在 `||` 左侧，**无论 `isEqualNode` 结果如何都会执行**。也就是说：

- 即便两个节点在 attribute 层面完全相等（`isEqualNode` 返回 `true`），只要用户输入导致 `value` property 与模板值不一致，特殊属性同步依然会发生；
- 同步本身是"幂等回写"——把模板值写回 DOM，保证视图永远忠实于数据。

同时，由于 diff 走的是"就地修改"而非"替换节点"路径，节点的焦点状态得以保留，输入光标不会乱跳。

### 1.5 同步方向的约定：数据 → DOM 是单向的

必须强调：`domSpecialDiff` 只做**数据到 DOM 的单向回写**。它不会把用户输入读回 `updater.data`。回写方向由开发者通过事件显式完成（见下一节）。这个约定保证了 Lark 的数据流始终是可预测的单向环：

```
updater.data ──digest()──▶ 模板字符串 ──diff──▶ 活 DOM（value/checked/selected 被同步）
     ▲                                              │
     └──────────── @input/@change 事件处理器 ◀──────┘
```

---

## 二、`{{:expr}}` 绑定语法

### 2.1 语法定义

模板编译器支持四个输出操作符（见 `compiler/template-syntax.ts` 头部注释）：

| 语法        | 含义                                     |
| ----------- | ---------------------------------------- |
| `{{=expr}}` | 转义输出（HTML 实体编码）                |
| `{{:expr}}` | 双向绑定（渲染时与 `=` 相同）            |
| `{{!expr}}` | 原始输出（不转义）                       |
| `{{@expr}}` | 引用查找（对象穿透 DOM，见《模板引用》） |

### 2.2 编译产物：`:` 与 `=` 等价

查看 `compiler/compile-template.ts` 的核心分发逻辑：

```ts
// src/compiler/compile-template.ts（节选）
if (operate === "@") {
  funcSource += `'+__lark_ref_fn__(__lark_ref_alt__,${content})+'`;
} else if (operate === "=" || operate === ":") {
  // : (binding) is treated the same as = (escaped output) for rendering
  funcSource += `'+__lark_enc_html__(${content})+'`;
} else if (operate === "!") {
  // ...
}
```

也就是说，`{{:name}}` 与 `{{=name}}` 编译出的渲染代码完全一致——都经过 `__lark_enc_html__`（即 `encodeHTML`）做 HTML 实体转义后拼进字符串。**Lark 不在编译期给 `{{:}}` 注入任何隐式的事件监听**。

这是一个深思熟虑的设计决策：

1. **显式优于隐式**——不生成"魔法"监听器，事件绑定全部由开发者在 `events` 映射中声明，可读、可调试；
2. **零额外运行时开销**——绑定语法不引入代理对象或 getter/setter；
3. **与 diff 引擎解耦**——"双向"的语义由 `domSpecialDiff`（下行同步）+ 事件处理器（上行同步）共同实现，模板层只负责渲染。

### 2.3 在表单中使用

```html
<!-- search.html -->
<input type="text" value="{{:keyword}}" @input="onInput()" />

<input type="checkbox" {{:agree}} @change="onAgreeChange()" />

<textarea>{{:remark}}</textarea>

<select @change="onCityChange()">
  {{forOf cities as city}}
  <option value="{{=city.code}}" {{if city.code === selectedCity}}selected{{/if}}>
    {{=city.name}}
  </option>
  {{/forOf}}
</select>
```

注意 checkbox 的写法：`{{:agree}}` 输出的是字符串 `"true"`/`"false"`，作为 `checked` 属性存在即为勾选。更严谨的做法是用 `{{if}}` 控制属性是否输出：

```html
<input type="checkbox" {{if agree}}checked{{/if}} @change="onAgreeChange()" />
```

---

## 三、useState + 事件：双向绑定的完整实现

### 3.1 useState 回顾

`hooks.ts` 中的 `useState` 返回 `[getter, setter]` 元组（注意不是 React 的 `[value, setValue]`）：

```ts
// src/hooks.ts（节选）
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();

  const existing = ctx.updater.get<unknown>(key);
  if (existing === undefined) {
    ctx.updater.set({ [key]: initial });
  }

  const getter = (): T => ctx.updater.get<T>(key);
  const setter = (v: T): void => {
    ctx.updater.set({ [key]: v }).digest();
  };

  return [getter, setter];
}
```

getter 是一个**每次调用都从 `updater.data` 现读**的函数，因此事件处理器里永远拿不到过期闭包值——这是 Lark "setup 只运行一次"模型下避免 stale closure 的关键。setter 写数据并立即 `digest()`，触发模板重渲染，`domSpecialDiff` 随之把新值同步回 DOM。

### 3.2 文本输入框

```ts
// search.ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./search.html";

export default defineView((ctx) => {
  const [getKeyword, setKeyword] = useState("keyword", "");

  return {
    template,
    events: {
      // 模板中：<input value="{{:keyword}}" @input="onInput()" />
      "onInput<input>"(e: Event) {
        const target = e.target as HTMLInputElement;
        setKeyword(target.value); // 上行：DOM → 数据，并触发 digest
      },
    },
  };
});
```

一次按键的完整链路：

1. 用户按键，浏览器更新 `input.value`（DOM property）；
2. `input` 事件冒泡到 `document.body`，被事件委托系统（`event-delegator.ts`）在捕获阶段截获，根据元素上的 `@input` 属性找到 `onInput` 处理器；
3. `setKeyword(target.value)` → `updater.set({keyword})` → `digest()`；
4. 模板重新求值，产出新的 HTML 字符串，`domSetChildNodes` 做 keyed diff；
5. `domSpecialDiff` 发现活节点的 `value` 与新节点的 `value` 一致（都是刚写入的值），无需回写——输入流畅，光标不动。

### 3.3 复选框与单选框

```ts
export default defineView((ctx) => {
  const [getAgree, setAgree] = useState("agree", false);

  return {
    template,
    events: {
      "onAgreeChange<change>"(e: Event) {
        const target = e.target as HTMLInputElement;
        setAgree(target.checked);
      },
    },
  };
});
```

`checked` 在 `DomSpecials.INPUT` 中登记，digest 后若数据与 DOM 不一致会被自动纠正。

### 3.4 下拉选择框

```html
<select @change="onCityChange()">
  {{forOf cities as city}}
  <option value="{{=city.code}}" {{if city.code === selectedCity}}selected{{/if}}>{{=city.name}}</option>
  {{/forOf}}
</select>
```

```ts
const [getCity, setCity] = useState("selectedCity", "hangzhou");

// events:
"onCityChange<change>"(e: Event) {
  const target = e.target as HTMLSelectElement;
  setCity(target.value);
}
```

`OPTION.selected` 在 `DomSpecials` 中单独登记。digest 时，模板根据 `selectedCity` 决定哪个 `<option>` 带 `selected` 属性，`domSpecialDiff` 把结果同步到每个 option 的 `selected` property 上。

### 3.5 直接用 updater 的等价写法

不使用 Hook 时，可以直接操作 `ctx.updater`：

```ts
export default defineView((ctx) => {
  ctx.updater.set({ keyword: "" });

  return {
    template,
    events: {
      "onInput<input>"(e: Event) {
        ctx.updater
          .set({ keyword: (e.target as HTMLInputElement).value })
          .digest();
      },
    },
  };
});
```

两种写法完全等价——`useState` 只是 `updater.set` + `digest` 的语法糖。

---

## 四、受控组件与非受控组件

### 4.1 受控组件（推荐）

上文所有示例都是**受控组件**：表单值唯一来源于 `updater.data`，每次输入都经过"事件 → setState → digest → diff 回写"的闭环。其特征是：

- 任意时刻 `input.value === updater.get("keyword")`（digest 完成后）；
- 可以对输入做即时校验、格式化、联动；
- 重渲染不会丢失状态，因为状态在数据里，不在 DOM 里。

```ts
// 即时格式化的受控示例：金额输入只保留两位小数
"onAmountInput<input>"(e: Event) {
  const target = e.target as HTMLInputElement;
  const normalized = target.value.replace(/[^\d.]/g, "").replace(/(\.\d{2})\d+/, "$1");
  setAmount(normalized);
}
```

由于 digest 后 `domSpecialDiff` 会把规范化后的值写回 DOM，用户输入的非法字符会被"抹掉"，实现受控格式化。

### 4.2 非受控组件

如果只需要在提交时读取一次值，可以让 DOM 自行持有状态，不做任何事件绑定：

```html
<form @submit="onSubmit()">
  <input type="text" name="username" />
  <input type="password" name="password" />
  <button type="submit">登录</button>
</form>
```

```ts
events: {
  "onSubmit<submit>"(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    // 提交时一次性读取，平时不介入
    login(String(data.get("username")), String(data.get("password")));
  },
}
```

非受控模式下，只要模板重渲染时该 `<input>` 的 attribute 没变，`domSpecialDiff` 就不会碰它的 `value`——用户输入安然无恙。这正是 keyed diff + 就地更新带来的红利：**不重建节点，就不破坏 DOM 私有状态**。

### 4.3 如何选择

| 场景                        | 推荐模式         | 理由                      |
| --------------------------- | ---------------- | ------------------------- |
| 需要即时校验/联动/格式化    | 受控             | 数据是唯一事实来源        |
| 值需要被其他视图/Store 消费 | 受控             | 便于通过 State/Store 共享 |
| 简单表单，提交时整体读取    | 非受控           | 代码最少，无 digest 开销  |
| 大文本高频输入且无校验需求  | 非受控或节流受控 | 避免每次按键全量 diff     |

### 4.4 常见陷阱

**陷阱一：digest 时机缺失。** 只 `set` 不 `digest`，数据变了但视图不更新：

```ts
// 错误：数据已更新，DOM 不会同步
ctx.updater.set({ keyword: v });

// 正确
ctx.updater.set({ keyword: v }).digest();
// 或使用 useState 的 setter（内部自动 digest）
```

**陷阱二：在受控输入上遗漏事件绑定。** 只写了 `value="{{:keyword}}"` 却没绑 `@input`，用户输入后下一次 digest 会把值"弹回"数据里的旧值——这是单向数据流的正确行为，不是 bug。

**陷阱三：把 `{{:}}` 当成自动双向绑定。** 如前所述，`{{:}}` 在渲染层与 `{{=}}` 等价，上行同步必须自己写事件处理器。

---

## 五、内部机制串联

把整条链路按源码顺序串一遍：

1. **数据变更**：`updater.set()` 浅合并数据，`setData`（`utils.ts`）记录 `changedKeys`，`version++`（`updater.ts`）；
2. **digest**：`runDigest` 检查 `changed && view && node && signature > 0`，调用编译后的模板函数 `template(data, viewId, refData)` 产出 HTML 字符串；
3. **解析**：`domGetNode(html, node)` 借助 `document.implementation.createHTMLDocument` 把字符串解析成临时 DOM 树，`<table>`、`<select>`、`<svg>` 等上下文敏感标签由 `wrapMeta` 表自动补全父级；
4. **keyed diff**：`domSetChildNodes` 按 `id` 或 `v-lark` 路径做节点复用与重排；
5. **特殊属性同步**：每个配对节点进入 `domSetNode` 时，`domSpecialDiff` 先行同步 `value`/`checked`/`selected`；
6. **批量落盘**：所有结构变更以 `[opCode, parent, ...]` 元组暂存于 `ref.domOps`，diff 结束后由 `applyDomOps` 一次性执行，`id` 变更由 `applyIdUpdates` 延迟应用。

整条流水线中，表单状态的同步只是第 5 步里那张六行的小表——但它恰好落在"attribute diff 看不见的盲区"，是 Lark Mvc 能用纯字符串 diff 支撑完整表单交互的基石。

---

## 小结

- `DomSpecials` 登记了 `INPUT`（value/checked）、`TEXTAREA`（value）、`OPTION`（selected）三类需要 property 级同步的表单元素；
- `domSpecialDiff` 在每次节点 diff 时无条件执行，把模板值单向回写到活 DOM，保住数据的主导权；
- `{{:expr}}` 是语义化的绑定标记，编译产物与 `{{=expr}}` 相同，上行同步由开发者用 `@input`/`@change` + `useState` 显式完成；
- 受控与非受控两种模式在 Lark 中都是一等公民，keyed diff 的就地更新策略让非受控输入在重渲染间天然存活。
