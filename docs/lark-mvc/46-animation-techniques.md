---
title: 动画技巧
description: 在 Lark Mvc 中实现各类动画效果的最佳实践，包括 CSS 过渡、生命周期动画、列表动画与 requestAnimationFrame 模式
---

# 动画技巧

Lark Mvc 采用真实 DOM diff 渲染策略，动画实现与 React/Vue 的虚拟 DOM 方案有所不同。本文档详细介绍如何在 Lark Mvc 的视图生命周期中优雅地实现各类动画效果。

## 核心原理

Lark Mvc 的渲染管线如下：

1. `updater.set(data)` 标记数据变更
2. `updater.digest()` 触发模板重新编译为 HTML 字符串
3. DOM diff 引擎（`domSetChildNodes`）通过 keyed 比较复用节点
4. 仅变更的节点被更新，未变更节点保持原样

这意味着：**DOM 节点在数据未变化时不会被销毁重建**，CSS transition/animation 可以自然地在节点上持续运行。

## 一、基于视图生命周期的进入/离开动画

### 进入动画（Mount）

视图挂载时，`mountCtx` 会依次执行：创建 ViewCtx → 运行 setup → 注册事件 → 调用 `ctx.render()`。利用 `useEffect` 可以在首次渲染后触发动画：

```typescript
import { defineView, useState, useEffect } from "@mm/lark-mvc";
import template from "./fade-panel.html";

export default defineView((ctx) => {
  const [getVisible, setVisible] = useState("visible", false);

  // 进入动画：挂载后下一帧添加 active 类
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setVisible(true);
    });
    return () => cancelAnimationFrame(raf);
  });

  return {
    template,
    events: {},
  };
});
```

对应模板 `fade-panel.html`：

```html
<div class="panel {{if visible}}panel--active{{/if}}">
  <p>内容区域</p>
</div>
```

CSS：

```css
.panel {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.panel--active {
  opacity: 1;
  transform: translateY(0);
}
```

### 离开动画（Unmount）

视图卸载时，`unmountCtx` 会执行 `useEffect` 的清理函数、注销事件、销毁资源、触发 `destroy` 事件。离开动画需要在 DOM 移除前延迟卸载：

```typescript
import { defineView, useState, useEffect } from "@mm/lark-mvc";
import template from "./slide-out.html";

export default defineView((ctx) => {
  const [getLeaving, setLeaving] = useState("leaving", false);

  // 监听父视图发来的关闭信号
  ctx.on("requestClose", () => {
    setLeaving(true);
    // 等待动画完成后再真正销毁
    setTimeout(() => {
      ctx.owner.unmountView();
    }, 300);
  });

  return {
    template,
    events: {
      "close<click>": () => {
        setLeaving(true);
        setTimeout(() => ctx.owner.unmountView(), 300);
      },
    },
  };
});
```

模板：

```html
<div class="drawer {{if leaving}}drawer--leaving{{/if}}">
  <button @click="close()">关闭</button>
</div>
```

```css
.drawer {
  transform: translateX(0);
  transition: transform 0.3s ease;
}
.drawer--leaving {
  transform: translateX(100%);
}
```

## 二、useEffect 的动画设置与清理

`useEffect` 在 setup 阶段同步执行，返回的清理函数在视图销毁时调用。这是管理动画相关资源的理想位置：

```typescript
import { defineView, useEffect, useState } from "@mm/lark-mvc";
import template from "./pulse.html";

export default defineView((ctx) => {
  const [getScale, setScale] = useState("scale", 1);

  useEffect(() => {
    let running = true;
    let start: number | null = null;

    function animate(timestamp: number) {
      if (!running) return;
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      // 呼吸动画：scale 在 1.0 ~ 1.2 之间循环
      const scale = 1 + 0.1 * (1 + Math.sin(elapsed / 500));
      setScale(scale);
      requestAnimationFrame(animate);
    }

    const rafId = requestAnimationFrame(animate);

    // 清理：视图销毁时停止动画
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  });

  return { template, events: {} };
});
```

> **注意**：Lark 的 `useEffect` 与 React 不同——它只在 setup 时执行一次，不会因依赖变化而重新执行。因此无需传入依赖数组。

## 三、条件渲染与 Transition 模式

### 使用 `{{if}}` 进行条件渲染

Lark 模板的 `{{if}}` 在 DOM diff 时会产生/移除节点。配合 CSS 可以实现显隐过渡：

```html
<!-- tooltip.html -->
<div class="tooltip-wrapper">
  <button @click="toggle()">显示提示</button>
  {{if showTip}}
  <div class="tooltip tooltip--enter">
    <span>这是一条提示信息</span>
  </div>
  {{/if}}
</div>
```

```typescript
export default defineView((ctx) => {
  const [getShowTip, setShowTip] = useState("showTip", false);

  return {
    template,
    events: {
      "toggle<click>": () => setShowTip(!getShowTip()),
    },
  };
});
```

由于 `{{if}}` 为 false 时节点被移除，CSS transition 无法直接在移除方向生效。解决方案是保留节点、用类名控制可见性：

```html
<div class="tooltip {{if showTip}}tooltip--visible{{/if}}">
  <span>这是一条提示信息</span>
</div>
```

```css
.tooltip {
  opacity: 0;
  visibility: hidden;
  transform: scale(0.9);
  transition: all 0.2s ease;
}
.tooltip--visible {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
}
```

### 高度过渡（展开/折叠）

```html
<div class="collapse">
  <div class="collapse__header" @click="toggle()">
    <span>点击展开</span>
  </div>
  <div class="collapse__body {{if expanded}}collapse__body--open{{/if}}">
    <div class="collapse__inner">
      <p>折叠内容...</p>
    </div>
  </div>
</div>
```

```css
.collapse__body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.35s ease;
}
.collapse__body--open {
  max-height: 500px; /* 足够大的值 */
}
```

## 四、列表动画与 Keyed Diffing

### Keyed Diff 算法原理

Lark 的 `domSetChildNodes` 使用 keyed 比较算法：

1. 从旧子节点构建 `keyedNodes` Map（按 `compareKey` 分桶）
2. 遍历新子节点，尝试通过 key 复用旧节点
3. 未匹配的旧节点被移除，未匹配的新节点被追加

`compareKey` 来源于元素的 `id` 属性或 `v-lark` 路径。因此，**为列表项设置唯一 `id` 是列表动画的关键**。

### 列表项过渡动画

```html
<!-- list.html -->
<ul class="animated-list">
  {{forOf items as item}}
  <li id="item-{{=item.id}}" class="list-item">
    <span>{{=item.name}}</span>
    <button @click="remove({id: '{{=item.id}}'})">删除</button>
  </li>
  {{/forOf}}
</ul>
```

```typescript
export default defineView((ctx) => {
  const [getItems, setItems] = useState("items", [
    { id: 1, name: "项目 A" },
    { id: 2, name: "项目 B" },
    { id: 3, name: "项目 C" },
  ]);

  return {
    template,
    events: {
      "remove<click>": (e) => {
        const id = Number(e.params.id);
        const items = getItems().filter((item) => item.id !== id);
        setItems(items);
      },
    },
  };
});
```

```css
.list-item {
  animation: slideIn 0.3s ease;
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

由于 keyed diff 会复用已有节点，只有新增的 `<li>` 会触发 `slideIn` 动画，已有项不会重新播放。

### 删除动画（FLIP 模式）

对于删除动画，需要在 DOM 移除前执行动画。结合 `wrapAsync` 确保安全：

```typescript
"remove<click>": (e) => {
  const id = e.params.id;
  const el = document.getElementById(`item-${id}`);
  if (el) {
    el.classList.add("list-item--removing");
    // 等待动画结束后再更新数据
    const safeUpdate = ctx.wrapAsync(() => {
      const items = getItems().filter((item) => String(item.id) !== id);
      setItems(items);
    });
    setTimeout(safeUpdate, 300);
  }
}
```

```css
.list-item--removing {
  animation: slideOut 0.3s ease forwards;
}

@keyframes slideOut {
  to {
    opacity: 0;
    transform: translateX(20px);
    height: 0;
    margin: 0;
    padding: 0;
  }
}
```

## 五、requestAnimationFrame 与 useInterval/useTimeout

### useInterval：自动清理的定时器

`useInterval` 内部调用 `setInterval` 并自动在视图销毁时清除：

```typescript
import { defineView, useInterval, useState } from "@mm/lark-mvc";

export default defineView((ctx) => {
  const [getProgress, setProgress] = useState("progress", 0);

  // 进度条动画：每 16ms 更新一次（约 60fps）
  useInterval(() => {
    const current = getProgress();
    if (current < 100) {
      setProgress(current + 1);
    }
  }, 16);

  return { template, events: {} };
});
```

### useTimeout：延迟执行

```typescript
import { defineView, useTimeout, useState } from "@mm/lark-mvc";

export default defineView((ctx) => {
  const [getShow, setShow] = useState("show", false);

  // 延迟 500ms 后显示通知
  useTimeout(() => {
    setShow(true);
  }, 500);

  return { template, events: {} };
});
```

### requestAnimationFrame + wrapAsync 模式

对于需要精确帧控制的动画，使用 `requestAnimationFrame` 配合 `ctx.wrapAsync` 防止视图销毁后的回调执行：

```typescript
export default defineView((ctx) => {
  const [getOffset, setOffset] = useState("offset", 0);

  useEffect(() => {
    let frameId: number;
    const startTime = performance.now();
    const duration = 1000;
    const targetOffset = 200;

    // wrapAsync 确保视图销毁后回调被静默丢弃
    const step = ctx.wrapAsync((timestamp: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic 缓动
      const eased = 1 - Math.pow(1 - progress, 3);
      setOffset(targetOffset * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    });

    frameId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frameId);
  });

  return { template, events: {} };
});
```

## 六、实用动画示例

### 淡入淡出（Fade）

```html
<div class="fade-container {{if visible}}fade-in{{else}}fade-out{{/if}}">
  <p>{{content}}</p>
</div>
```

```css
.fade-container {
  transition: opacity 0.4s ease;
}
.fade-in {
  opacity: 1;
}
.fade-out {
  opacity: 0;
}
```

### 滑动（Slide）

```html
<div class="slide-panel {{if open}}slide-panel--open{{/if}}">
  <nav>侧边导航</nav>
</div>
```

```css
.slide-panel {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-panel--open {
  transform: translateX(0);
}
```

### 交错动画（Stagger）

利用 CSS 自定义属性实现列表项交错入场：

```html
<ul class="stagger-list">
  {{forOf items as item index}}
  <li id="stagger-{{=item.id}}" class="stagger-item" style="--i: {{=index}}">
    {{=item.name}}
  </li>
  {{/forOf}}
</ul>
```

```css
.stagger-item {
  opacity: 0;
  transform: translateY(10px);
  animation: staggerIn 0.4s ease forwards;
  animation-delay: calc(var(--i) * 80ms);
}

@keyframes staggerIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 数字滚动动画

```typescript
export default defineView((ctx) => {
  const [getDisplayValue, setDisplayValue] = useState("displayValue", 0);
  const [getTargetValue, setTargetValue] = useState("targetValue", 0);

  useEffect(() => {
    let frameId: number;

    const animateValue = ctx.wrapAsync(() => {
      const current = getDisplayValue();
      const target = getTargetValue();
      const diff = target - current;

      if (Math.abs(diff) < 1) {
        setDisplayValue(target);
        return;
      }

      setDisplayValue(current + diff * 0.1);
      frameId = requestAnimationFrame(animateValue);
    });

    // 监听目标值变化
    const off = ctx.on("render", () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(animateValue);
    });

    return () => {
      cancelAnimationFrame(frameId);
      off();
    };
  });

  return {
    template,
    events: {
      "setTarget<click>": (e) => {
        setTargetValue(Number(e.params.value));
      },
    },
  };
});
```

## 七、性能建议

| 建议                              | 说明                                               |
| --------------------------------- | -------------------------------------------------- |
| 优先使用 CSS transition/animation | 浏览器可将其合成到 GPU 层，避免主线程阻塞          |
| 动画属性选择 transform/opacity    | 避免触发 layout（width、height、top 等）           |
| 使用 `will-change` 提示           | 对即将动画的元素提前声明 `will-change: transform`  |
| 利用 keyed diff                   | 为列表项设置唯一 id，避免不必要的 DOM 重建         |
| 用 wrapAsync 保护 rAF 回调        | 防止视图销毁后继续操作已不存在的 DOM               |
| 用 useInterval/useTimeout         | 自动清理，避免内存泄漏                             |
| 避免在 digest 循环中触发动画      | 动画状态更新应通过独立的 rAF 循环，而非每次 render |

## 八、与 DOM Diff 的协作要点

Lark 的 DOM diff 引擎（`dom.ts`）在每次 digest 时：

1. 将模板编译结果解析为临时 DOM 树（`domGetNode`）
2. 通过 `domSetChildNodes` 进行 keyed 比较
3. 仅对变更节点执行 `appendChild`/`removeChild`/`replaceChild`/`insertBefore`

**关键影响**：

- 未变更的节点不会被替换，其上的 CSS 动画/过渡状态得以保留
- 表单元素（input/textarea/select）的 value/checked/selected 通过 `domSpecialDiff` 单独同步，不会因 diff 丢失用户输入
- 带有 `v-lark` 属性的子视图容器不会被 diff 穿透，子视图的动画状态独立于父视图

理解这些机制，可以确保动画与框架渲染管线和谐共存，避免意外的动画中断。
