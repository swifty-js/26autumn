---
title: Lark 与 Web Components
description: Lark Mvc 与 Web Components 的关系与集成实践：真实 DOM 的共通基础、在模板中使用自定义元素、Shadow DOM 对事件委托的影响、双向包装模式与已知限制的规避方案
---

# Lark 与 Web Components

Lark Mvc 与 Web Components 是两套可以共存互补的技术。理解它们在 DOM 模型上的共通点与边界差异，才能在实际项目中正确集成。本文从框架源码出发，分析两者的关系、集成模式与已知限制。

## 一、Lark 视图与 Web Components 的关系

### 共同点：都基于真实 DOM

Lark 视图**不是**虚拟 DOM 组件——每个视图挂载到一个真实的、带 `id` 的 DOM 元素上。`Frame` 与 DOM 元素之间通过 id 建立双向关联：

```ts
// frame.ts — createFrame 时把 frame 挂到 DOM 元素上
const element = document.getElementById(id);
if (element) {
  Reflect.set(element, "frame", frame);
  Reflect.set(element, "frameBound", 1);
}
```

这一点与 Web Components 的自定义元素完全一致：两者都直接生活在真实 DOM 树中，都通过标准的 DOM API 交互。这意味着：

- 自定义元素可以像 `<div>` 一样出现在 Lark 模板里；
- Lark 视图的根节点也可以是自定义元素；
- 两者的更新都直接作用于浏览器渲染树，没有中间抽象层。

### 差异点：边界模型不同

| 维度     | Lark 视图                      | Web Components                      |
| -------- | ------------------------------ | ----------------------------------- |
| 边界标识 | 元素 `id` + Frame 注册表       | 自定义元素标签名                    |
| 封装方式 | 逻辑边界（DOM 仍在全局文档中） | 可选 Shadow DOM（DOM 真正隔离）     |
| 样式隔离 | 无（全局 CSS）                 | Shadow DOM 内建隔离                 |
| 事件模型 | 捕获阶段委托到 `document.body` | 标准冒泡/捕获，可 `composed`        |
| 子树管理 | diff 引擎键控复用              | 元素自管理（内部 DOM 不被框架触碰） |

关键差异在于 **Shadow DOM**：Lark 的所有机制（事件委托、frame 查找、zone 挂载）都假设 DOM 处于全局文档的连通树中，而 Shadow DOM 恰恰打破了这个假设。下面分场景讨论。

## 二、在 Lark 模板中使用 Web Components

### 场景 1：自定义元素作为普通标签（无 Shadow DOM 或仅内部使用）

最常见的集成方式是直接在模板里写自定义元素标签：

```html
<!-- 模板中使用 -->
<my-rating id="rating_{{=item.id}}" score="{{=item.score}}"></my-rating>
```

```ts
// 自定义元素定义（标准 Web Components）
class MyRating extends HTMLElement {
  static get observedAttributes() {
    return ["score"];
  }
  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "score") this.render(Number(newVal));
  }
  render(score: number) {
    this.textContent = "★".repeat(score) + "☆".repeat(5 - score);
  }
}
customElements.define("my-rating", MyRating);
```

**为什么能正常工作？** 看字符串模式的解析路径：

```ts
// dom.ts — domGetNode 通过虚拟文档解析 HTML
const VDoc = document.implementation.createHTMLDocument("");
// ...
tmp.innerHTML = wrap[1] + html;
```

`createHTMLDocument` 创建的是完整文档环境，自定义元素在其中会被正常解析与升级（upgrade）。diff 阶段，只要新旧节点标签名相同（`oldNode.nodeName === newNode.nodeName`），Lark 就**原地更新属性而不替换节点**：

```ts
// dom.ts — domSetNode
if (
  oldNode.nodeType === newNode.nodeType &&
  oldNode.nodeName === newNode.nodeName
) {
  // 同类型 → 原地 diff 属性与子节点
  domSetAttributes(oldEl, newEl, ref, !!newLarkView);
  // ...
}
```

节点不被替换，自定义元素的内部状态（包括 Shadow DOM 内容、实例属性、事件监听器）就完整保留。

### 给自定义元素稳定的 key

diff 引擎通过 `compareKey` 决定复用哪个节点：

```ts
// dom.ts — domGetCompareKey
let key = el.autoId ? "" : el.getAttribute("id") || undefined;
if (!key) {
  const larkView = el.getAttribute(LARK_VIEW);
  if (larkView) key = parseUri(larkView).path || undefined;
}
```

在列表中渲染自定义元素时，**务必为每个实例设置唯一且稳定的 `id`**，否则列表重排时节点会被错位复用，导致元素状态串行：

```html
{{forOf items as item}}
<my-card id="card_{{=item.id}}" title="{{=item.title}}"></my-card>
{{/forOf}}
```

### 场景 2：传递复杂数据（属性 vs property）

HTML 属性只能传字符串。Lark 模板的 `{{=expr}}` 输出经过 HTML 转义，适合传标量：

```html
<my-chart id="chart_main" title="{{=chartTitle}}" data-json="{{=jsonStr}}">
</my-chart>
```

需要传递对象、函数等复杂值时，属性就力不从心了。两种方案：

**方案 A：自定义元素内部解析 JSON 属性**（推荐，符合 Web Components 惯例）

```ts
class MyChart extends HTMLElement {
  static get observedAttributes() {
    return ["data-json"];
  }
  attributeChangedCallback(name, _, newVal) {
    if (name === "data-json" && newVal) {
      this.data = JSON.parse(newVal);
      this.draw();
    }
  }
}
```

**方案 B：用 Lark 视图包装，通过 property 注入**

把自定义元素放进一个 Lark 子视图，在视图里直接设置 property：

```ts
// chart-wrapper.ts
import { defineView, useEffect } from "@mm/lark-mvc";
import template from "./chart-wrapper.html";

export default defineView((ctx, params) => {
  useEffect(() => {
    const el = document.querySelector(`#${ctx.id} my-chart`) as any;
    el.data = params?.data; // 直接设置 property
    el.onSelect = (item) => {
      ctx.fire("select", { item }); // 桥接到 Lark 事件体系
    };
  });

  return { template };
});
```

```html
<!-- chart-wrapper.html -->
<my-chart id="inner_chart"></my-chart>
```

父视图通过 `v-lark` + `*data` 传递对象（`{{@data}}` 引用令牌会被 `mountZone` 还原为原始 JS 值）：

```html
<div
  v-lark="views/chart-wrapper"
  *data="{{@chartData}}"
  @select="onSelect"
></div>
```

## 三、自定义元素与视图注册并存

### 注册时机

自定义元素必须在**视图渲染之前**完成注册，否则首帧解析出的是未升级的元素。在应用入口（`boot` 之前）注册最稳妥：

```ts
// main.ts
import "./components/my-rating"; // 副作用导入，执行 customElements.define
import "./components/my-chart";

import { Framework } from "@mm/lark-mvc";

Framework.boot({
  rootId: "app",
  defaultView: "views/home",
});
```

若自定义元素是异步加载的（动态 `import()`），Lark 的 diff 也能兼容：元素升级后 `attributeChangedCallback` 会补发，属性驱动的组件不受影响。但依赖 `connectedCallback` 时序的逻辑要注意，diff 复用节点时**不会**再次触发 `connectedCallback`（节点没有离开文档树）。

### 自定义元素作为视图根节点

`Frame.createRoot` 只要求根元素有 id，不关心标签类型，因此可以把视图挂载到自定义元素上：

```ts
// 根元素是自定义元素
// <app-shell id="app"></app-shell>
Framework.boot({
  rootId: "app",
  defaultView: "views/home",
});
```

视图的模板输出会渲染进 `<app-shell>` 的内部（light DOM）。只要自定义元素不把自己的 light DOM 挪进 Shadow DOM 的 slot 之外的位置，两者相安无事。

## 四、事件委托与 Shadow DOM 边界

这是 Lark 与 Web Components 集成时**最需要警惕**的部分。

### Lark 事件委托的工作原理

Lark 的所有 DOM 事件都委托到 `document.body` 的**捕获阶段**。事件触发后，处理器从 `event.target` 开始沿 `parentElement` 一路向上走到 `document.body`，逐层解析 `@event` 属性与选择器事件：

```ts
// event-delegator.ts — domEventProcessor
function domEventProcessor(domEvent: Event): void {
  const target = domEvent.target as HTMLElement;
  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const eventInfos = findFrameInfo(current, eventType);
    // ... 解析 @event 属性、匹配选择器事件
    current = current.parentElement; // ← 关键：依赖 parentElement 向上遍历
  }
}
```

`findFrameInfo` 还会继续向上查找最近的 frame：

```ts
// 沿 DOM 向上找最近的 frame
while (begin && begin !== document.body) {
  const beginId = begin.id;
  if (beginId && frameGetter?.(beginId)) {
    selectorFrameId = beginId;
    break;
  }
  begin = begin.parentElement;
}
```

### Shadow DOM 带来的两个断裂

**断裂 1：事件目标重定向（retargeting）**

Shadow DOM 内的事件穿过边界后，`event.target` 被重定向为**宿主元素**而非真实触发元素。Lark 拿到的 target 是 `<my-component>` 而不是内部的 `<button>`——挂在内部元素上的 `@event` 属性永远无法被 `findFrameInfo` 读到。

**断裂 2：parentElement 遍历止步于 shadow root**

Shadow tree 内部节点的 `parentElement` 链终止于 shadow root（`shadowRoot` 不是 Element，`parentElement` 为 `null`），不会连接到宿主元素。事件处理器内部从 target 向上的 `parentElement` 遍历无法跨越边界。

### 规避方案

**方案 1：自定义元素转发 composed 事件（推荐）**

让自定义元素监听内部事件，再以 `composed: true` 派发语义化的自定义事件。Lark 的委托监听器挂在 `document.body` 捕获阶段，composed 事件会穿过 shadow 边界到达全局文档，委托链正常工作：

```ts
class MyList extends HTMLElement {
  connectedCallback() {
    this.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest("[data-id]");
      if (!item) return;
      this.dispatchEvent(
        new CustomEvent("itemselect", {
          bubbles: true,
          composed: true, // ← 关键：穿过 shadow 边界
          detail: { id: item.getAttribute("data-id") },
        }),
      );
    });
  }
}
```

Lark 视图侧用 `@itemselect` 接收。注意事件名需小写（HTML 属性名不区分大小写，委托器按属性名精确匹配）：

```html
<my-list id="list_main" @itemselect="onItemSelect"></my-list>
```

```ts
events: {
  "onItemSelect<itemselect>"(e) {
    const { id } = e.detail;
    // ...
  },
}
```

**方案 2：在自定义元素内部自行委托**

如果事件源在 shadow tree 深处且无法修改组件源码，可以在宿主元素（light DOM 侧）直接监听——宿主元素本身处于全局文档中：

```ts
useEffect(() => {
  const host = document.getElementById("list_main");
  const handler = (e: CustomEvent) => {
    /* ... */
  };
  host.addEventListener("itemselect", handler);
  return () => host.removeEventListener("itemselect", handler);
});
```

**方案 3：不使用 Shadow DOM**

许多自定义元素可以完全不用 Shadow DOM（只用 `this.attachShadow` 之外的方式渲染内部结构）。无 shadow 的自定义元素对 Lark 完全透明——事件、id 查找、diff 全部正常工作。如果样式隔离不是硬需求，这是集成成本最低的选择。

## 五、把 Lark 视图包装为自定义元素

反向集成——让 Lark 视图以 Web Component 的形式对外发布——也是常见需求（微前端、组件库输出）。核心思路：自定义元素在 light DOM 中创建带 id 的容器，交给 Frame 挂载。

```ts
import { Frame } from "@mm/lark-mvc";

class LarkViewElement extends HTMLElement {
  private frameId = "";

  connectedCallback() {
    const viewPath = this.getAttribute("view") || "";
    if (!viewPath) return;

    // 在 light DOM 中创建容器（不要用 Shadow DOM）
    this.frameId = `wc_${viewPath.replace(/[^\w]/g, "_")}_${++counter}`;
    const container = document.createElement("div");
    container.id = this.frameId;
    this.appendChild(container);

    // 挂载 Lark 视图
    const root = Frame.getRoot();
    root.mountFrame(this.frameId, viewPath, this.collectParams());
  }

  disconnectedCallback() {
    // 从 Frame 树卸载，触发视图完整清理
    const parent = Frame.get(this.frameId)?.parent();
    parent?.unmountFrame(this.frameId);
  }

  private collectParams() {
    const params: Record<string, unknown> = {};
    for (const attr of this.attributes) {
      if (attr.name.startsWith("param-")) {
        params[attr.name.slice(6)] = attr.value;
      }
    }
    return params;
  }
}

customElements.define("lark-view", LarkViewElement);
```

使用方式：

```html
<lark-view view="views/user-card" param-user-id="42"></lark-view>
```

**为什么容器必须放在 light DOM？** 因为 `mountView` 依赖 `document.getElementById(frame.id)` 定位容器：

```ts
// frame.ts — mountView
mountView(viewPathArg: string, viewInitParams?) {
  const node = document.getElementById(frame.id); // ← 只搜索全局文档
  // ...
}
```

`document.getElementById` **不会**搜索 Shadow tree——容器一旦放进 shadow root，`mountView` 拿到 `null` 后直接返回，视图静默不渲染。

## 六、已知限制与规避方案汇总

### 限制 1：`mountZone` 无法发现 shadow 内的 v-lark

`mountZone` 用 `querySelectorAll("[v-lark]")` 扫描子视图挂载点：

```ts
// frame.ts — mountZone
const rootEl = document.getElementById(targetZone);
const selector = `[${LARK_VIEW}]`;
const viewElements = rootEl.querySelectorAll(selector);
```

`querySelectorAll` 不穿透 Shadow DOM。若 `v-lark` 元素位于某自定义元素的 shadow tree 内，Lark 永远发现不了它。

**规避**：`v-lark` 挂载点始终放在 light DOM。需要 slot 分发时，把 `v-lark` 元素作为自定义元素的 light DOM 子节点（slot 内容仍属于 light DOM，可被查询到）。

### 限制 2：shadow 内元素无法成为 Frame

Frame 注册依赖 `document.getElementById`，shadow 内元素查不到，无法作为视图根节点或子 frame 容器。

**规避**：所有 frame 容器置于 light DOM。

### 限制 3：diff 引擎可能替换自定义元素节点

若标签名不同或 key 未命中，diff 会 `replaceChild` 整个节点——自定义元素实例连同其 shadow tree、内部状态一起被销毁重建。

**规避**：为自定义元素设置稳定 `id`；条件渲染时尽量保持标签结构稳定。

### 限制 4：表单特殊 diff 不覆盖自定义表单控件

`domSpecialDiff` / `vdomSyncFormState` 只同步原生 `INPUT`/`TEXTAREA`/`OPTION` 的 `value`/`checked`/`selected`：

```ts
const DomSpecials: Record<string, string[]> = {
  INPUT: ["value", "checked"],
  TEXTAREA: ["value"],
  OPTION: ["selected"],
};
```

自定义表单控件（如 `<my-input>`）的状态不在同步范围内。

**规避**：自定义表单控件通过属性（attribute）驱动状态，让 `attributeChangedCallback` 成为唯一状态入口——属性 diff 会正常更新它们。

### 限制 5：全局 CSS 与 Shadow 隔离的冲突

Lark 视图样式是全局 CSS，无法作用于 Shadow DOM 内部；反之 shadow 内样式也不影响视图。

**规避**：

- 自定义元素用 CSS 自定义属性（custom properties 可穿透 shadow 边界）暴露样式钩子：

```ts
// 自定义元素内部
// :host { background: var(--my-card-bg, white); }
```

```css
/* Lark 视图侧全局 CSS */
my-card {
  --my-card-bg: #f5f5f5;
}
```

- 或用 `::part()` 暴露 shadow 内部结构供外部样式化。

### 限制 6：HMR 与 devtool 的盲区

Frame Devtool Bridge 通过 frame 注册表检查视图树，shadow 内的 DOM 结构对 devtool 不可见；HMR 的 `hotSwapView` 复用 ctx 重渲染，若模板输出被自定义元素拦截或改写（如 slot 变换），可能出现渲染不一致。

**规避**：开发期尽量让 Lark 管理的 DOM 留在 light DOM；shadow 只封装纯展示、自管理的部分。

## 七、集成决策矩阵

| 需求                         | 推荐方案                                           |
| ---------------------------- | -------------------------------------------------- |
| 在视图里用现成 Web Component | 直接写标签 + 稳定 id + 属性传值                    |
| 传对象/函数给组件            | 视图包装 + property 注入，或 JSON 属性             |
| 组件事件通知视图             | 组件派发 `composed: true` 自定义事件 + `@event`    |
| 视图发布为组件               | 自定义元素 + light DOM 容器 + `mountFrame`         |
| 需要样式隔离                 | Shadow DOM 仅封装自管理区域，Lark 区域留 light DOM |
| 深度双向集成                 | 避免 Shadow DOM，自定义元素做纯行为增强            |

## 小结

Lark Mvc 与 Web Components 的集成边界可以概括为一句话：**light DOM 里水乳交融，Shadow DOM 处泾渭分明**。

- 真实 DOM 是两者的共通语言，自定义元素在 Lark 模板中一等公民般工作；
- diff 引擎的键控复用天然保护自定义元素实例状态，前提是给它稳定的 key；
- Lark 的事件委托、frame 查找、zone 挂载三大机制都建立在全局文档连通性上，Shadow DOM 会切断它们；
- 跨边界通信的标准姿势是 `composed: true` 的自定义事件 + 属性/property 桥接。

遵循「Lark 管理的留在 light DOM，shadow 只封装自管理区域」的原则，两套技术可以在同一个应用里长期稳定共存。
