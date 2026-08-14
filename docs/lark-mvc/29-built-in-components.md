---
title: 内置组件
description: Lark Mvc 的组件体系详解——v-lark 子视图系统、Frame 组件树、Zone 挂载机制、以及如何实现过渡动画、缓存保活、传送门等常见组件模式
---

# 内置组件

Lark Mvc **没有**类似 Vue/React 的内置组件（没有 `<Transition>`、`<KeepAlive>`、`<Teleport>`、`<Suspense>`）。Lark 的设计哲学是：**视图即组件，Frame 即组件树**。所有"组件"功能通过视图系统、Frame 树和 DOM 操作原语来实现。

## Lark 的"组件"是什么？

在 Lark 中，组件的概念由以下机制承载：

| 传统框架概念 | Lark 对应机制                  |
| ------------ | ------------------------------ |
| 组件         | View（通过 `defineView` 定义） |
| 组件树       | Frame 树（父子 Frame 嵌套）    |
| 组件挂载     | `v-lark` 属性 + Zone 挂载      |
| Props 传递   | `p-lark-*` 属性                |
| 事件通信     | `e-lark-*` 属性 + Frame 事件   |
| 插槽         | 模板中的子视图占位             |

---

## v-lark 子视图系统

`v-lark` 是 Lark 中唯一的"内置组件"——它是一个 HTML 属性，用于在模板中声明子视图挂载点。

### 基本语法

```html
<!-- 在父视图模板中声明子视图 -->
<div v-lark="app/views/header"></div>
<div v-lark="app/views/sidebar"></div>
<div v-lark="app/views/content"></div>
<div v-lark="app/views/footer"></div>
```

### 带 Props 的子视图

使用 `*propName` 语法向子视图传递数据：

```html
<!-- 传递字符串 prop -->
<div
  v-lark="app/views/user-card"
  *name="{{=userName}}"
  *avatar="{{=avatarUrl}}"
  *role="{{=userRole}}"
></div>

<!-- 传递复杂对象（使用 @ 引用查找） -->
<div
  v-lark="app/views/data-table"
  *columns="{{@tableColumns}}"
  *data="{{@tableData}}"
  *config="{{@tableConfig}}"
></div>
```

编译后 `*prop` 转换为 `p-lark-prop`：

```html
<div
  v-lark="app/views/user-card"
  p-lark-name="{{=userName}}"
  p-lark-avatar="{{=avatarUrl}}"
  p-lark-role="{{=userRole}}"
></div>
```

### 子视图接收 Props

```ts
// app/views/user-card.ts
import { defineView } from "@mm/lark-mvc";
import template from "./user-card.html";

export default defineView((ctx, params) => {
  // params 包含父视图传递的所有 props
  const { name, avatar, role } = params;

  ctx.updater.set({ name, avatar, role }).digest();

  return { template };
});
```

### 子→父事件通信

使用 `@eventName="handlerName"` 语法建立事件绑定：

```html
<!-- 父视图模板 -->
<div
  v-lark="app/views/counter"
  *initial="{{=count}}"
  @increment="handleIncrement"
  @decrement="handleDecrement"
></div>
```

编译后 `@event` 转换为 `e-lark-event`：

```html
<div
  v-lark="app/views/counter"
  p-lark-initial="{{=count}}"
  e-lark-increment="handleIncrement"
  e-lark-decrement="handleDecrement"
></div>
```

父视图处理子视图事件：

```ts
// 父视图
export default defineView((ctx) => {
  const [getTotal, setTotal] = useState("total", 0);

  return {
    template: parentTemplate,
    events: {
      "handleIncrement<increment>"(data) {
        setTotal(getTotal() + 1);
      },
      "handleDecrement<decrement>"(data) {
        setTotal(getTotal() - 1);
      },
    },
  };
});
```

子视图触发事件：

```ts
// 子视图 (counter)
export default defineView((ctx, params) => {
  let count = Number(params.initial) || 0;

  return {
    template: counterTemplate,
    events: {
      "add<click>"(e) {
        count++;
        ctx.owner.fire("increment", { count });
      },
      "sub<click>"(e) {
        count--;
        ctx.owner.fire("decrement", { count });
      },
    },
  };
});
```

---

## Frame 树：组件树

Frame 是 Lark 的组件实例容器。每个 `v-lark` 元素对应一个 Frame 对象，所有 Frame 构成一棵树。

### Frame 对象结构

```ts
interface FrameObj {
  id: string; // Frame ID（= DOM 元素 ID）
  parentId?: string; // 父 Frame ID
  view?: ViewCtx; // 挂载的视图上下文
  childrenMap: Record<string, string>; // 子 Frame 映射
  childrenCount: number; // 子 Frame 数量
  readyCount: number; // 已就绪的子 Frame 数量
  signature: number; // 签名（用于异步安全）
  destroyed: number; // 是否已销毁

  mountView(viewPath, params?): void; // 挂载视图
  unmountView(): void; // 卸载视图
  mountFrame(id, viewPath, params?): FrameObj; // 挂载子 Frame
  unmountFrame(id?): void; // 卸载子 Frame
  mountZone(zoneId?): void; // 挂载 Zone 内所有子视图
  unmountZone(zoneId?): void; // 卸载 Zone 内所有子视图
  invoke(name, args?): unknown; // 调用视图方法
  parent(level?): FrameObj | undefined; // 获取父 Frame
  children(): string[]; // 获取子 Frame ID 列表
  on(event, handler): FrameObj; // 监听事件
  off(event, handler?): FrameObj; // 取消监听
  fire(event, data?): FrameObj; // 触发事件
}
```

### Frame 静态 API

```ts
import { Frame } from "@mm/lark-mvc";

// 获取 Frame
const frame = Frame.get("frame-id");

// 获取所有 Frame
const allFrames = Frame.getAll(); // Map<string, FrameObj>

// 获取根 Frame
const root = Frame.getRoot();

// 创建根 Frame（幂等）
const root = Frame.createRoot("app");

// 监听 Frame 添加/移除
Frame.on("add", ({ frame }) => {
  console.log("Frame added:", frame.id);
});
Frame.on("remove", ({ frame }) => {
  console.log("Frame removed:", frame.id);
});
```

### Frame 生命周期事件

| 事件             | 触发时机                  |
| ---------------- | ------------------------- |
| `created`        | 所有子 Frame 挂载完成     |
| `alter`          | 子 Frame 内容即将变化     |
| `add`（静态）    | 新 Frame 注册到全局注册表 |
| `remove`（静态） | Frame 从全局注册表移除    |

---

## Zone 挂载机制

Zone 是 Frame 内部的子视图挂载区域。当视图渲染（`render()`）时，框架通过 `mountZone` 扫描模板输出中的 `v-lark` 元素并挂载子视图。

### 挂载流程

```
ctx.render()
  → updater.digest()
    → 模板输出写入 DOM
    → ctx.endUpdate()
      → frame.mountZone(zoneId)
        → 扫描 [v-lark] 元素
        → 对每个新元素：
          1. 确保元素有 ID
          2. 读取 p-lark-* 属性（props）
          3. 读取 e-lark-* 属性（事件绑定）
          4. frame.mountFrame(frameId, viewPath, props)
          5. 连接子→父事件
        → 对已绑定元素：
          更新 props → childView.updater.set(props).digest()
```

### Props 更新

当父视图重新渲染时，已存在的子视图不会被销毁重建，而是更新 props：

```ts
// frame.ts → mountZone（已绑定元素的处理）
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

### 引用传递（@ 操作符）

`{{@value}}` 操作符允许传递复杂对象（而非字符串）给子视图：

```html
<div
  v-lark="app/views/chart"
  *options="{{@chartOptions}}"
  *data="{{@chartData}}"
></div>
```

框架通过 `refData` 机制将对象存储为引用令牌（SPLITTER + 数字），子视图挂载时解析回原始对象：

```ts
// frame.ts → translateQuery
function translateQuery(pId, src, params) {
  const parentView = parentFrame?.view;
  const parentRefData = parentView.updater.refData;
  if (src.indexOf(SPLITTER) > 0) {
    translateData(parentRefData, params);
    // 将 SPLITTER 前缀的令牌解析为实际对象
  }
}
```

---

## 实现常见组件模式

### 过渡动画（Transition）

Lark 没有内置 `<Transition>` 组件，但可以通过 CSS + 生命周期钩子实现：

#### CSS 类切换方式

```ts
// views/animated-panel.ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./animated-panel.html";

export default defineView((ctx) => {
  const [getVisible, setVisible] = useState("visible", false);

  return {
    template,
    events: {
      "toggle<click>"(e) {
        setVisible(!getVisible());
      },
    },
  };
});
```

```html
<!-- animated-panel.html -->
<button @click="toggle()">切换</button>

{{if visible}}
<div class="panel fade-in">
  <p>内容区域</p>
</div>
{{/if}}
```

```css
/* 进入动画 */
.fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### 退出动画（延迟销毁）

```ts
export default defineView((ctx) => {
  const [getVisible, setVisible] = useState("visible", true);
  const [getAnimating, setAnimating] = useState("animating", false);

  function hide() {
    setAnimating(true);
    // 等待动画完成后真正隐藏
    setTimeout(
      ctx.wrapAsync(() => {
        setVisible(false);
        setAnimating(false);
      }),
      300,
    );
  }

  return {
    template,
    events: {
      "close<click>"(e) {
        hide();
      },
    },
  };
});
```

```html
{{if visible}}
<div class="modal {{if animating}}fade-out{{else}}fade-in{{/if}}">
  <button @click="close()">关闭</button>
</div>
{{/if}}
```

#### 列表过渡

```html
<ul class="list">
  {{forOf items as item idx}}
  <li class="list-item" style="animation-delay: {{=idx * 50}}ms">
    {{=item.name}}
  </li>
  {{/forOf}}
</ul>
```

```css
.list-item {
  animation: slideIn 0.3s ease forwards;
  opacity: 0;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

---

### 缓存保活（KeepAlive）

Lark 的视图在 Frame 卸载时会被销毁。实现 KeepAlive 需要手动缓存视图状态：

#### 方案一：Store 持久化状态

```ts
import { createStore } from "@mm/lark-mvc";

// 将视图状态存储在 Store 中（视图销毁后状态保留）
const useTabStore = createStore("tab-cache", (set, get) => ({
  scrollPositions: {} as Record<string, number>,
  formDrafts: {} as Record<string, string>,
  saveScroll: (tab: string, pos: number) =>
    set((s) => ({ scrollPositions: { ...s.scrollPositions, [tab]: pos } })),
  saveDraft: (tab: string, text: string) =>
    set((s) => ({ formDrafts: { ...s.formDrafts, [tab]: text } })),
}));

// 视图挂载时恢复状态
export default defineView((ctx, params) => {
  const tabId = params.tab;
  const store = useTabStore.getState();

  // 恢复滚动位置
  useEffect(() => {
    const savedPos = store.scrollPositions[tabId] || 0;
    const container = document.getElementById(ctx.id);
    if (container && savedPos) {
      container.scrollTop = savedPos;
    }

    // 离开时保存
    return () => {
      const pos = container?.scrollTop || 0;
      useTabStore.getState().saveScroll(tabId, pos);
    };
  });

  return { template };
});
```

#### 方案二：DOM 缓存（隐藏而非销毁）

```ts
export default defineView((ctx) => {
  const [getActiveTab, setActiveTab] = useState("activeTab", "home");

  return {
    template,
    events: {
      "$tab<click>"(e) {
        const tab = e.eventTarget.getAttribute("data-tab");
        // 隐藏当前面板（不销毁）
        const panels = document.querySelectorAll(".tab-panel");
        panels.forEach((p) => {
          (p as HTMLElement).style.display = "none";
        });
        // 显示目标面板
        const target = document.getElementById(`panel-${tab}`);
        if (target) target.style.display = "block";
        setActiveTab(tab);
      },
    },
  };
});
```

```html
<div class="tabs">
  <div class="tab" data-tab="home">首页</div>
  <div class="tab" data-tab="profile">个人</div>
  <div class="tab" data-tab="settings">设置</div>
</div>

<!-- 所有面板同时存在，通过 display 控制 -->
<div id="panel-home" class="tab-panel">
  <div v-lark="app/views/home"></div>
</div>
<div id="panel-profile" class="tab-panel" style="display:none">
  <div v-lark="app/views/profile"></div>
</div>
<div id="panel-settings" class="tab-panel" style="display:none">
  <div v-lark="app/views/settings"></div>
</div>
```

---

### 传送门（Teleport）

将内容渲染到 DOM 树的另一个位置：

#### 方案一：useEffect + DOM 操作

```ts
import { defineView, useEffect, useState } from "@mm/lark-mvc";
import template from "./modal.html";

export default defineView((ctx) => {
  const [getOpen, setOpen] = useState("open", false);

  useEffect(() => {
    if (!getOpen()) return;

    // 创建传送门容器
    const portal = document.createElement("div");
    portal.id = "modal-portal";
    document.body.appendChild(portal);

    // 将模态框 DOM 移动到 portal
    const modal = document.getElementById("modal-content");
    if (modal) portal.appendChild(modal);

    return () => {
      // 清理：移除 portal
      portal.remove();
    };
  });

  return {
    template,
    events: {
      "openModal<click>"(e) {
        setOpen(true);
      },
      "closeModal<click>"(e) {
        setOpen(false);
      },
    },
  };
});
```

#### 方案二：独立的顶层 Frame

```ts
// 在应用根部预留传送门容器
// index.html
// <div id="app"></div>
// <div id="modal-root"></div>
// <div id="toast-root"></div>

// 通过 Frame API 直接挂载到顶层容器
import { Frame } from "@mm/lark-mvc";

export function showModal(viewPath: string, params?: Record<string, unknown>) {
  const modalRoot = Frame.get("modal-root") || Frame.createRoot("modal-root");
  modalRoot.mountView(viewPath, params);
}

export function hideModal() {
  const modalRoot = Frame.get("modal-root");
  modalRoot?.unmountView();
}

// 在任意视图中调用
export default defineView((ctx) => {
  return {
    template,
    events: {
      "showDialog<click>"(e) {
        showModal("app/views/dialogs/confirm", {
          title: "确认删除",
          message: "此操作不可撤销",
        });
      },
    },
  };
});
```

---

### 异步加载（Suspense）

```ts
import { defineView, useState } from "@mm/lark-mvc";
import template from "./async-panel.html";

export default defineView((ctx) => {
  const [getStatus, setStatus] = useState("status", "loading"); // loading | ready | error
  const [getData, setData] = useState("data", null);

  useEffect(() => {
    fetch("/api/heavy-data")
      .then((r) => r.json())
      .then(
        ctx.wrapAsync((data) => {
          setData(data);
          setStatus("ready");
        }),
      )
      .catch(
        ctx.wrapAsync((err) => {
          setStatus("error");
        }),
      );
  });

  return { template };
});
```

```html
<!-- async-panel.html -->
{{if status === 'loading'}}
<div class="skeleton">
  <div class="skeleton-line"></div>
  <div class="skeleton-line"></div>
  <div class="skeleton-line short"></div>
</div>
{{else if status === 'error'}}
<div class="error-state">
  <p>加载失败</p>
  <button @click="retry()">重试</button>
</div>
{{else}}
<div class="content">{{!data.html}}</div>
{{/if}}
```

---

## 视图注册表

视图通过注册表管理，支持同步和异步两种加载方式：

```ts
import { registerViewClass } from "@mm/lark-mvc";
import HomeView from "./views/home";
import AboutView from "./views/about";

// 同步注册（打包在主 bundle 中）
registerViewClass("app/views/home", HomeView);
registerViewClass("app/views/about", AboutView);

// 未注册的视图通过 config.require 异步加载
Framework.boot({
  rootId: "app",
  defaultView: "app/views/home",
  require: (names) => {
    // 动态 import 或 Module Federation
    return Promise.all(names.map((name) => import(`./${name}.ts`)));
  },
});
```

---

## 与 Vue/React 内置组件的对比

| 功能           | Vue/React                                 | Lark Mvc                      |
| -------------- | ----------------------------------------- | ----------------------------- |
| Transition     | `<Transition>` / `react-transition-group` | CSS animation + 生命周期      |
| KeepAlive      | `<KeepAlive>`                             | Store 持久化 / DOM 隐藏       |
| Teleport       | `<Teleport>` / `createPortal`             | DOM 操作 / 独立 Frame         |
| Suspense       | `<Suspense>`                              | 状态机（loading/ready/error） |
| Fragment       | `<>...</>`                                | 模板天然支持多根节点          |
| Slot           | `<slot>` / `children`                     | `v-lark` 子视图               |
| Provide/Inject | `provide()` / `inject()`                  | Store / Frame 事件            |

## 设计哲学

Lark 不提供内置组件的原因：

1. **极简运行时**：没有组件注册表、没有虚拟组件解析、没有特殊节点类型
2. **DOM 即真相**：所有"组件"最终都是真实的 DOM 元素和 Frame 对象
3. **可预测性**：没有隐藏的组件生命周期交互，所有行为都是显式的
4. **性能**：没有组件抽象层的开销，Frame 树直接映射 DOM 树
5. **灵活性**：通过组合原语（Frame、事件、Store）可以实现任何组件模式
