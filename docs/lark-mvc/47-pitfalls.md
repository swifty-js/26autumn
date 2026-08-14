---
title: 常见陷阱
description: Lark Mvc 开发中的常见陷阱与避坑指南，涵盖闭包陷阱、digest 遗漏、异步安全、事件命名、内存泄漏等问题
---

# 常见陷阱（Pitfalls）

本文档汇总了 Lark Mvc 开发中最常遇到的陷阱和错误模式，帮助开发者快速定位和解决问题。

## 一、过期闭包陷阱（Stale Closure）

### 问题描述

这是 Lark Mvc 新手最常犯的错误。由于 setup 函数**只执行一次**（不同于 React 每次渲染都重新执行），如果在事件处理器中直接引用 setup 阶段的局部变量，将永远读到初始值。

### 错误示例

```typescript
export default defineView((ctx) => {
  let count = 0; // 局部变量，setup 后不再更新

  return {
    template,
    events: {
      "incr<click>": () => {
        count++; // 虽然修改了局部变量，但模板读的是 updater.data
        console.log(count); // 能正确递增
        // 但模板不会更新！因为 updater.data 没有变化
      },
    },
  };
});
```

### 正确做法：使用 useState 的 getter

`useState` 返回 `[getter, setter]` 对。getter 始终从 `ctx.updater.data` 读取最新值，避免闭包陷阱：

```typescript
export default defineView((ctx) => {
  const [getCount, setCount] = useState("count", 0);

  return {
    template,
    events: {
      "incr<click>": () => {
        // getCount() 每次调用都读取 updater.data 中的最新值
        setCount(getCount() + 1);
      },
    },
  };
});
```

### 为什么需要 getter 而非直接值？

源码中 `useState` 的实现：

```typescript
// hooks.ts
export function useState<T>(
  key: string,
  initial: T,
): [() => T, (v: T) => void] {
  const ctx = getCtx();
  const existing = ctx.updater.get<unknown>(key);
  if (existing === undefined) {
    ctx.updater.set({ [key]: initial });
  }
  // getter 每次调用都从 updater.data 读取
  const getter = (): T => ctx.updater.get<T>(key);
  const setter = (v: T): void => {
    ctx.updater.set({ [key]: v }).digest();
  };
  return [getter, setter];
}
```

getter 是一个函数，每次调用时动态读取 `ctx.updater.data[key]`——这保证了即使 setup 只运行一次，事件处理器中也能拿到最新状态。

### 陷阱变体：在 useEffect 中引用状态

```typescript
// 错误：effect 中的 count 永远是初始值
useEffect(() => {
  const timer = setInterval(() => {
    console.log(count); // 永远是 0
  }, 1000);
  return () => clearInterval(timer);
});

// 正确：通过 getter 读取
const [getCount] = useState("count", 0);
useEffect(() => {
  const timer = setInterval(() => {
    console.log(getCount()); // 始终是最新值
  }, 1000);
  return () => clearInterval(timer);
});
```

## 二、忘记调用 digest()

### 问题描述

`updater.set()` 只标记数据变更，**不会自动触发渲染**。必须显式调用 `digest()` 才能将变更反映到 DOM。

### 错误示例

```typescript
events: {
  "update<click>": () => {
    ctx.updater.set({ name: "新名字" });
    // 忘记 digest()，界面不会更新！
  },
}
```

### 正确做法

```typescript
events: {
  "update<click>": () => {
    ctx.updater.set({ name: "新名字" }).digest();
  },
}
```

或使用 `useState` 的 setter（内部自动调用 digest）：

```typescript
const [getName, setName] = useState("name", "");
// setter 内部: ctx.updater.set({ [key]: v }).digest()
events: {
  "update<click>": () => setName("新名字"),
}
```

### 批量更新时只需一次 digest

```typescript
events: {
  "batchUpdate<click>": () => {
    ctx.updater
      .set({ name: "新名字" })
      .set({ age: 25 })
      .set({ city: "杭州" })
      .digest(); // 只在最后调用一次
  },
}
```

### State 同样需要 digest

```typescript
// 错误
State.set({ theme: "dark" });
// 界面不会响应变化

// 正确
State.set({ theme: "dark" });
State.digest();

// 或简写
State.digest({ theme: "dark" });
```

## 三、异步回调在视图销毁后执行

### 问题描述

异步操作（fetch、setTimeout、WebSocket 消息）可能在视图已销毁后才返回。此时操作 DOM 或更新数据会导致错误或内存泄漏。

### 错误示例

```typescript
events: {
  "load<click>": async () => {
    const data = await fetch("/api/list").then((r) => r.json());
    // 如果视图在 fetch 期间被销毁，这里会操作已不存在的视图
    ctx.updater.set({ list: data }).digest();
  },
}
```

### 正确做法：使用 wrapAsync 签名守卫

`ctx.wrapAsync(fn)` 捕获当前 `signature`，返回的包装函数只在签名未变时执行：

```typescript
events: {
  "load<click>": () => {
    const safeUpdate = ctx.wrapAsync((data: unknown[]) => {
      ctx.updater.set({ list: data }).digest();
    });

    fetch("/api/list")
      .then((r) => r.json())
      .then(safeUpdate); // 视图销毁后静默丢弃
  },
}
```

源码中 `wrapAsync` 的实现：

```typescript
// view.ts
function wrapAsync<Fn extends AnyFunc>(fn: Fn, context?: unknown) {
  const currentSignature = signature.value;
  return (...args: Parameters<Fn>) => {
    // 只有 signature > 0（未销毁）且未变化（未重新渲染）才执行
    if (currentSignature > 0 && currentSignature === signature.value) {
      return fn.apply(context ?? ctx, args);
    }
    return undefined; // 静默丢弃
  };
}
```

### 使用 useResource 管理服务实例

```typescript
import { createService } from "@mm/lark-mvc";

const MyService = createService(syncFn);

export default defineView((ctx) => {
  const service = MyService.instance();
  // 注册为视图资源，销毁时自动调用 service.destroy()
  useResource("listService", service, true);

  return {
    template,
    events: {
      "load<click>": () => {
        service.all("getList", (errors, payload) => {
          if (!errors.length) {
            ctx.updater.set({ list: payload.get("data") }).digest();
          }
        });
      },
    },
  };
});
```

## 四、事件处理器命名错误

### 命名规范

事件处理器的 key 必须严格遵循 `"名称<事件类型>"` 格式：

| 语法                       | 含义                            |
| -------------------------- | ------------------------------- |
| `handler<click>`           | 视图根元素上的 click 事件       |
| `$selector<click>`         | 委托给匹配 `.selector` 的子元素 |
| `$window<resize>`          | 委托给 window                   |
| `$document<keydown>`       | 委托给 document                 |
| `handler<click,mousedown>` | 多事件绑定                      |
| `name<keydown><ctrl>`      | 仅在 Ctrl 按下时触发            |

### 常见错误

```typescript
// 错误：缺少尖括号
events: {
  "handleClick": (e) => { ... },  // 不会被注册！
}

// 错误：事件名拼写错误
events: {
  "save<clik>": (e) => { ... },   // "clik" 不是有效事件
}

// 错误：选择器语法错误
events: {
  ".btn<click>": (e) => { ... },  // 应该用模板 @click="btn()" + "btn<click>"（键名仅允许 \w 字符）
}

// 正确
events: {
  "save<click>": (e) => { ... },
  "$btn<click>": (e) => { ... },
  "$window<resize>": (e) => { ... },
}
```

### 事件名必须与模板中的 @event 对应

模板中：

```html
<button @click="save()">保存</button>
```

事件中：

```typescript
events: {
  "save<click>": (e) => { ... },  // "save" 必须匹配 @click="save()"
}
```

### 事件委托的引用计数

`EventDelegator` 使用引用计数管理 `document.body` 上的监听器。如果事件名格式不正确，`registerEvents` 中的正则匹配会失败，事件不会被注册，但也不会有任何错误提示——这是一个静默失败。

## 五、Ref Token 泄漏

### 问题描述

模板中的 `{{@expr}}` 操作符会将对象引用存储为 token（以 `\x1e` 前缀标识），存放在 `updater.refData` 中。如果不小心将 token 字符串当作普通数据处理，会导致引用泄漏。

### 错误示例

```typescript
// 模板中: {{@list}} 将 list 数组存入 refData
// updater.data 中存储的是 token 字符串 "\x1e0"

events: {
  "process<click>": () => {
    const raw = ctx.updater.get("list");
    // raw 是 "\x1e0" 这样的 token 字符串，不是数组！
    raw.forEach(...); // TypeError!
  },
}
```

### 正确做法：使用 translate 还原

```typescript
events: {
  "process<click>": () => {
    const raw = ctx.updater.get("list");
    const list = ctx.updater.translate(raw) as unknown[];
    // 现在 list 是真正的数组引用
    list.forEach(...);
  },
}
```

### 预防措施

- 对于需要事件处理器访问的对象，优先通过 `useState` 管理（不经过 refData）
- 只在模板渲染需要对象引用时使用 `{{@expr}}`
- 使用 `updater.parse(expr)` 安全地解析点路径

## 六、observeState 键名不匹配

### 问题描述

`ctx.observeState(keys)` 声明视图关注哪些 State 键。如果键名与 `State.set()` 中的键名不一致，视图不会响应变化。

### 错误示例

```typescript
// 视图 A
ctx.observeState("userName");

// 视图 B 中更新
State.digest({ username: "Alice" }); // 注意：username vs userName
// 视图 A 不会重新渲染！键名大小写不匹配
```

### 正确做法

```typescript
// 确保键名完全一致
ctx.observeState("username");
State.digest({ username: "Alice" }); // 匹配
```

### 多键观察

```typescript
// 字符串形式（逗号分隔）
ctx.observeState("page,size,sortBy");

// 数组形式
ctx.observeState(["page", "size", "sortBy"]);
```

### 配合 State.clean 防止内存泄漏

```typescript
export default defineView((ctx) => {
  ctx.observeState("theme,locale");
  // 注册清理：视图销毁时减少引用计数
  State.clean("theme,locale")(ctx);

  return { template, events: {} };
});
```

## 七、VDOM 模式 vs 字符串模式的差异

### 模式选择

通过 `FrameworkConfig.vdom` 控制：

```typescript
Framework.boot({
  rootId: "app",
  vdom: false, // 默认：字符串模式（真实 DOM diff）
  // vdom: true,  // VDOM 模式
});
```

### 字符串模式注意事项

- 模板编译为返回 HTML 字符串的函数
- 每次 digest 生成完整 HTML，通过 `document.implementation.createHTMLDocument` 解析
- DOM diff 通过 `domSetChildNodes` 的 keyed 比较完成
- **表单元素**的 value/checked/selected 通过 `domSpecialDiff` 单独处理

### VDOM 模式注意事项

- 模板编译为返回 `VDomNode` 树的函数（使用 `vdomCreate`）
- diff 通过 `vdomSetChildNodes` 完成，支持 LIS（最长递增子序列）优化
- DOM 属性通过 `ref.nodeProps` 延迟设置

### 常见陷阱

```typescript
// 在字符串模式下，innerHTML 中的脚本不会执行
// 错误：期望动态插入的 <script> 执行
ctx.updater.set({ html: '<script>console.log("hi")</script>' }).digest();
// 脚本不会执行！浏览器对 innerHTML 中的 script 有安全限制

// 在 VDOM 模式下，不能混用字符串模板
// 错误：vdom: true 时模板返回字符串
// 正确：vdom: true 时模板必须返回 VDomNode
```

## 八、HMR 状态丢失场景

### 状态保留机制

HMR 通过 `hotSwapView` 保留 `ViewCtx`——`updater.data`、`resources`、`emitter`、`signature` 全部保留。但以下场景仍会丢失状态：

### 场景 1：setup 中重新初始化数据

```typescript
export default defineView((ctx) => {
  // 错误：每次 HMR 重新执行 setup 时，会覆盖已有数据
  ctx.updater.set({ count: 0 });

  // 正确：使用 useState（只在首次设置初始值）
  const [getCount, setCount] = useState("count", 0);
  // useState 内部检查: if (existing === undefined) 才设置初始值
});
```

### 场景 2：useEffect 中的状态

```typescript
export default defineView((ctx) => {
  useEffect(() => {
    // HMR 时：旧 cleanup 先执行，然后新 effect 重新执行
    // 如果 effect 中修改了 updater.data，这些修改会保留
    // 但 effect 内部的局部状态会丢失
    let localCounter = 0; // HMR 后重置为 0

    const timer = setInterval(() => {
      localCounter++;
      ctx.updater.set({ tick: localCounter }).digest();
    }, 1000);

    return () => clearInterval(timer);
  });
});
```

### 场景 3：非 defineView 模块的变更

如果修改的是工具函数文件（非视图 `.ts`、非模板 `.html`），HMR 无法热替换——会触发全页刷新，所有状态丢失。

## 九、常见编译器语法错误

### 模板语法

```html
<!-- 错误：缺少闭合标签 -->
{{if show}}
<div>内容</div>
<!-- 缺少 {{/if}} -->

<!-- 错误：forOf 语法错误 -->
{{forOf items item}}
<!-- 缺少 as，编译期抛错：Bad forOf syntax -->
{{forOf items as item}}
<!-- 正确 -->

<!-- 错误：表达式中使用了不支持的语法 -->
{{= items.filter(x => x.active)}}
<!-- 箭头函数在某些上下文可能有问题 -->

<!-- 正确：在 setup 中预处理 -->
```

### 事件绑定语法

```html
<!-- 错误：参数传递格式 -->
<button @click="delete(id)">删除</button>
<!-- 错误：id 未定义 -->
<button @click="delete({id: '{{=item.id}}'})">删除</button>
<!-- 正确：动态值用 {{=expr}}，作为字符串字面量传入 -->

<!-- 错误：事件名中有空格 -->
<button @click="my handler()">按钮</button>
<!-- 错误 -->
<button @click="myHandler()">按钮</button>
<!-- 正确 -->
```

### 注释语法

```html
<!-- 这是 HTML 注释，会原样出现在最终 DOM 中 -->
<!-- 注释内部的 {{=expr}} 不会被编译（protectComments 保护），恢复后原样输出 -->
```

Lark 没有独立的「模板注释」语法——唯一的注释机制是 HTML 注释 `<!-- -->`。
编译管线会先通过 `protectComments` 把注释替换为占位符（注释内的 `{{ }}`
不会被转换），编译完成后再由 `restoreComments` 原样恢复，因此注释会保留在
最终 DOM 中。若不希望注释出现在输出里，需自行在渲染后移除，或避免写入模板。

## 十、内存泄漏：未清理的资源

### 常见泄漏源

#### 1. 未清理的事件监听

```typescript
// 错误：手动添加的 DOM 事件监听未在销毁时移除
useEffect(() => {
  const handler = () => { ... };
  window.addEventListener("scroll", handler);
  // 忘记返回清理函数！
});

// 正确
useEffect(() => {
  const handler = () => { ... };
  window.addEventListener("scroll", handler);
  return () => window.removeEventListener("scroll", handler);
});
```

#### 2. 未清理的定时器

```typescript
// 错误：直接使用 setInterval
useEffect(() => {
  setInterval(() => { ... }, 1000); // 永远不会被清除！
});

// 正确：使用 useInterval（自动清理）
useInterval(() => { ... }, 1000);

// 或手动清理
useEffect(() => {
  const id = setInterval(() => { ... }, 1000);
  return () => clearInterval(id);
});
```

#### 3. 未销毁的 Service 实例

```typescript
// 错误：创建了 service 实例但未注册为资源
const service = MyService.instance();
service.all("getData", callback);
// 视图销毁后，pending 的请求回调仍可能执行

// 正确：使用 useResource 注册
const service = MyService.instance();
useResource("myService", service);
// 视图销毁时自动调用 service.destroy()
```

#### 4. Store 订阅未取消

```typescript
// 错误：手动订阅 store
useEffect(() => {
  const unsub = myStore.subscribe((state) => { ... });
  // 忘记返回 unsub！
});

// 正确：使用 useStore（自动管理订阅生命周期）
const getState = useStore(myStore, (s) => ({ count: s.count }));

// 或手动清理
useEffect(() => {
  const unsub = myStore.subscribe((state) => { ... });
  return unsub;
});
```

#### 5. capture 的资源未释放

```typescript
// 错误：capture 后从未 release
ctx.capture("observer", new IntersectionObserver(callback));
// 如果视图多次 render，旧 observer 不会被销毁（除非 destroyOnRender=true）

// 正确：设置 destroyOnRender 或手动 release
ctx.capture("observer", new IntersectionObserver(callback), true);
// 或在适当时机
ctx.release("observer"); // 调用 observer.destroy()
```

### 泄漏检测清单

| 资源类型                            | 清理方式                                    |
| ----------------------------------- | ------------------------------------------- |
| setInterval/setTimeout              | useInterval/useTimeout 或 useEffect cleanup |
| DOM 事件监听                        | useEffect 返回 removeEventListener          |
| Service 实例                        | useResource 注册                            |
| Store 订阅                          | useStore 或 useEffect 返回 unsubscribe      |
| IntersectionObserver/ResizeObserver | ctx.capture + destroyOnRender               |
| WebSocket 连接                      | useEffect cleanup 中 close()                |
| requestAnimationFrame               | useEffect cleanup 中 cancelAnimationFrame   |

## 总结

| 陷阱           | 根因                 | 解决方案                          |
| -------------- | -------------------- | --------------------------------- |
| 过期闭包       | setup 只执行一次     | 使用 useState getter              |
| 界面不更新     | 忘记 digest()        | set().digest() 或用 setter        |
| 异步回调错误   | 视图已销毁           | wrapAsync 签名守卫                |
| 事件不触发     | 命名格式错误         | 严格遵循 `name<type>` 格式        |
| Ref token 错误 | 混淆 token 与原始值  | 使用 translate() 还原             |
| State 不响应   | 键名不匹配           | 确保 observeState 与 set 键名一致 |
| HMR 状态丢失   | setup 中硬编码初始值 | 使用 useState 的条件初始化        |
| 内存泄漏       | 资源未清理           | useEffect cleanup + useResource   |
