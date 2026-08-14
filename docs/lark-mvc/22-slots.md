---
title: 插槽与内容组合
description: 详解 Lark Mvc 的内容组合机制。Lark Mvc 没有 Vue 风格的 slot 系统，而是通过 v-lark 子视图、Zone 挂载、布局视图等模式实现灵活的内容组合与复用。
---

# 插槽与内容组合

## 设计理念

Lark Mvc **没有** Vue 风格的 `<slot>` / `<template #default>` 插槽机制。这一设计选择源于 Lark 的核心架构理念：

- **视图是独立的运行时单元**：每个视图有自己的 Frame、Updater、生命周期
- **组合优于继承**：通过子视图嵌套实现 UI 组合，而非模板片段注入
- **Zone 机制**：父视图定义挂载点（Zone），子视图独立渲染到对应区域

这种设计使得每个视图都是完全自治的——拥有独立的状态、事件、生命周期，避免了插槽方案中常见的作用域泄漏和渲染时序问题。

## 核心组合机制：v-lark 子视图

`v-lark` 是 Lark Mvc 中内容组合的主要方式。父视图通过在模板中声明 `v-lark` 属性来定义子视图挂载点：

```html
<!-- 父视图模板 parent.html -->
<div class="page-layout">
  <header v-lark="app/views/header" id="zone_header"></header>
  <main
    v-lark="app/views/content"
    id="zone_content"
    p-lark-page="{{= currentPage}}"
  ></main>
  <footer v-lark="app/views/footer" id="zone_footer"></footer>
</div>
```

框架在父视图渲染完成后，通过 `frame.mountZone()` 自动扫描并挂载所有子视图：

```typescript
// src/frame.ts — mountZone 核心逻辑
mountZone(zoneId?: string): void {
  const targetZone = zoneId ?? frame.id;
  frame.holdFireCreated = 1;

  const rootEl = document.getElementById(targetZone);
  if (!rootEl) return;

  const selector = `[${LARK_VIEW}]`;
  const viewElements = rootEl.querySelectorAll(selector);

  viewElements.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const elId = el.id || ensureElementId(el, "frame_");

    if (htmlElIsBound(el)) {
      // 已绑定：更新 props
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
    // ... 读取 props 和 events，执行挂载
  });
}
```

## Zone 挂载机制

Zone 是 Lark Mvc 中管理子视图区域的核心概念。每个 `v-lark` 元素就是一个 Zone——一个独立的子视图挂载区域。

### Zone 的生命周期

父视图重新渲染时的自动流程如下：

```
父视图 render() → updater.digest()
  → 模板重渲染 + DOM diff（被移除的子视图节点通过 domUnmountFrames 卸载其 Frame）
  → endUpdate() → mountZone()（扫描并挂载/更新 v-lark 子视图）
```

> 注意：`beginUpdate()` 并不会在自动渲染流程中被调用，它是一个**可选的手动 API**，用于在局部更新前显式卸载某个 zone 内的子 Frame。自动流程中子 Frame 的卸载发生在 DOM diff 阶段（节点被移除时由 `domUnmountFrames` 处理）。

在 `src/view.ts` 中：

```typescript
// beginUpdate：手动调用，卸载 zone 中的子 frame（仅在已 endUpdate 过一次后生效）
function beginUpdate(zoneId?: string): void {
  if (signature.value > 0 && mutable.endUpdatePending !== undefined) {
    frame.unmountZone(zoneId);
  }
}

// endUpdate：重新挂载子 frame
function endUpdate(zoneId?: string, inner?: boolean): void {
  if (signature.value > 0) {
    const updateId = zoneId ?? id;
    // ...
    frame.mountZone(updateId);
    // 延迟执行 invoke 队列
    if (!flag) {
      setTimeout(
        wrapAsync(() => {
          runInvokes(frame);
        }),
        0,
      );
    }
  }
}
```

### 局部 Zone 更新

可以只更新特定区域而不影响其他子视图：

```typescript
const DashboardView = defineView((ctx) => {
  return {
    template,
    events: {
      // 只刷新数据面板区域
      "refresh<click>": () => {
        ctx.beginUpdate("zone_panel");
        ctx.updater.set({ panelData: fetchData() });
        ctx.updater.digest();
        // endUpdate 会自动重新挂载 zone_panel 中的子视图
      },
    },
  };
});
```

## 内容组合模式

### 模式一：布局视图（Layout View）

最常见的组合模式——布局视图定义页面骨架，内容区域由子视图填充：

```typescript
// layouts/main.ts
const MainLayout = defineView((ctx) => {
  return {
    template: mainLayoutTemplate,
  };
});
```

```html
<!-- layouts/main.html -->
<div class="app-shell">
  <aside v-lark="app/views/sidebar" id="layout_sidebar" class="sidebar"></aside>
  <div class="main-area">
    <nav v-lark="app/views/breadcrumb" id="layout_breadcrumb"></nav>
    <div
      v-lark="{{= contentView}}"
      id="layout_content"
      class="content"
      p-lark-params="{{@routeParams}}"
    ></div>
  </div>
</div>
```

注意 `v-lark` 的值可以是动态表达式——这实现了**动态内容区域**，等效于 Vue 的 `<component :is="...">`：

```typescript
// 根据路由动态切换内容视图
const [getContentView, setContentView] = useState(
  "contentView",
  "app/views/home",
);

useEffect(() => {
  const off = Router.on("changed", (e) => {
    setContentView(resolveView(Router.parse().path));
    ctx.render();
  });
  return off;
});
```

### 模式二：包装视图（Wrapper View）

包装视图为子视图提供通用功能（加载状态、错误边界、权限控制）：

```html
<!-- wrappers/protected.html -->
<div class="protected-wrapper">
  {{if hasPermission}}
  <div
    v-lark="{{= targetView}}"
    id="protected_content"
    p-lark-data="{{@sharedData}}"
  ></div>
  {{else}}
  <div v-lark="app/views/no-permission" id="no_perm"></div>
  {{/if}}
</div>
```

```typescript
// wrappers/protected.ts
const ProtectedWrapper = defineView((ctx, params) => {
  const [getHasPermission, setHasPermission] = useState("hasPermission", false);
  const [getTargetView] = useState("targetView", params.view);

  useEffect(() => {
    checkPermission(params.requiredRole).then(
      ctx.wrapAsync((allowed) => {
        setHasPermission(allowed);
      }),
    );
  });

  return {
    template: protectedTemplate,
  };
});
```

### 模式三：列表 + 项目视图

将列表渲染拆分为容器视图和项目视图：

```html
<!-- list/container.html -->
<ul class="item-list">
  {{forOf items as item itemIndex}}
  <li
    v-lark="app/views/list-item"
    id="item_{{=item.id}}"
    p-lark-item="{{@item}}"
    p-lark-index="{{=itemIndex}}"
    e-lark-delete="handleDelete"
  ></li>
  {{/forOf}}
</ul>
```

```typescript
// list/item.ts
const ListItemView = defineView((ctx, params) => {
  const item = params.item;

  return {
    template: itemTemplate,
    events: {
      "del<click>": () => {
        // 通过 frame 事件通知父视图
        ctx.owner.fire("delete", { id: item.id });
      },
    },
  };
});
```

### 模式四：条件组合

根据状态动态决定渲染哪些子视图：

```html
<!-- dashboard.html -->
<div class="dashboard">
  <div v-lark="app/views/stats-summary" id="stats_zone"></div>

  {{if showChart}}
  <div
    v-lark="app/views/chart-panel"
    id="chart_zone"
    p-lark-chart-type="{{= chartType}}"
  ></div>
  {{/if}} {{if showTable}}
  <div
    v-lark="app/views/data-table"
    id="table_zone"
    p-lark-columns="{{@columns}}"
  ></div>
  {{/if}}
</div>
```

当条件变化时，框架会：

1. 卸载不再存在的子视图（调用 `unmountFrame`）
2. 挂载新出现的子视图（调用 `mountFrame`）
3. 保留未变化的子视图（通过 `htmlElIsBound` 检测）

### 模式五：嵌套组合

子视图内部可以继续嵌套子视图，形成多层组合树：

```html
<!-- page.html -->
<div v-lark="app/views/panel" id="panel_main" class="panel"></div>
```

```html
<!-- panel.html（panel 视图的模板） -->
<div class="panel-inner">
  <div
    class="panel-header"
    v-lark="app/views/panel-header"
    id="panel_hdr"
    p-lark-title="{{= title}}"
  ></div>
  <div class="panel-body" v-lark="app/views/panel-body" id="panel_bdy"></div>
</div>
```

Frame 树结构：

```
root
└── page (frame)
    └── panel_main (frame)
        ├── panel_hdr (frame)
        └── panel_bdy (frame)
```

## 父子通信

### 父→子：Props 传递

通过 `p-lark-*` 属性向下传递数据：

```html
<div
  v-lark="app/views/user-card"
  id="user_card"
  p-lark-name="{{= userName}}"
  p-lark-avatar="{{= avatarUrl}}"
  p-lark-config="{{@cardConfig}}"
></div>
```

### 子→父：事件冒泡

通过 `e-lark-*` 属性或 `frame.fire()` 向上通信：

```html
<!-- 声明式事件绑定 -->
<div
  v-lark="app/views/counter"
  id="counter"
  e-lark-increment="handleIncrement"
  e-lark-reset="handleReset"
></div>
```

```typescript
// 父视图
const ParentView = defineView((ctx) => {
  return {
    template,
    events: {
      "handleIncrement<increment>": (data) => {
        console.log("子视图触发 increment", data);
      },
      "handleReset<reset>": () => {
        console.log("子视图触发 reset");
      },
    },
  };
});
```

```typescript
// 子视图 counter.ts
const CounterView = defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);
  return {
    template,
    events: {
      "inc<click>": () => {
        const newCount = getCount() + 1;
        setCount(newCount);
        // 向父 frame 触发事件
        ctx.owner.fire("increment", { count: newCount });
      },
    },
  };
});
```

## 与 Vue Slot 的对比

| 特性         | Vue Slot              | Lark v-lark                          |
| ------------ | --------------------- | ------------------------------------ |
| 内容定义位置 | 父组件模板内          | 独立视图文件                         |
| 作用域       | 可访问父组件数据      | 完全独立，通过 Props 通信            |
| 渲染时机     | 随父组件同步渲染      | 独立异步挂载                         |
| 状态管理     | 共享父组件作用域      | 独立 Updater/Store                   |
| 生命周期     | 无独立生命周期        | 完整生命周期（mount/render/destroy） |
| 动态切换     | `<component :is>`     | 动态 `v-lark` 表达式                 |
| 条件渲染     | `v-if` + `<template>` | 模板条件 + Zone 自动管理             |

## 最佳实践

1. **合理划分视图粒度**：每个 `v-lark` 区域应是功能内聚的独立单元
2. **使用有意义的 id**：为 Zone 指定语义化 id（如 `zone_header`），便于调试和局部更新
3. **避免过深嵌套**：Frame 树层级过深会增加 created 事件的冒泡开销
4. **利用 Props 更新机制**：父视图重新渲染时，已存在的子视图只更新 Props 而不重建
5. **动态视图路径**：使用表达式作为 `v-lark` 的值实现动态内容切换，框架会自动处理旧视图卸载和新视图挂载
