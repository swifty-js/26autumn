---
title: 计算属性
description: Lark Mvc Store 中的计算属性（computed）机制，包括依赖声明、自动重算、写入保护与性能优化
---

# 计算属性

Lark Mvc 的 Store 系统提供了 `computed` 函数，用于声明派生状态（derived state）。计算属性基于依赖键自动重算，无需手动维护同步逻辑，是构建可预测状态流的核心能力。

## 基本概念

计算属性是一个**只读的派生值**，它依赖一个或多个已有的 state 键。当依赖键通过 `setState` 发生变更时，计算属性会在监听器被通知之前自动重新求值，确保所有订阅者始终看到一致的状态快照。

```ts
import { createStore, computed } from "@mm/lark-mvc";

const useCartStore = createStore("cart", (set, get) => ({
  // 基础状态
  items: [] as Array<{ name: string; price: number; qty: number }>,
  discount: 0,

  // 计算属性：总价
  totalPrice: computed(["items", "discount"], () => {
    const { items, discount } = get();
    const raw = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    return raw * (1 - discount);
  }),

  // 计算属性：商品数量
  itemCount: computed(["items"], () => {
    return get().items.reduce((sum, item) => sum + item.qty, 0);
  }),
}));
```

## API 签名

```ts
function computed<T>(deps: readonly string[], fn: () => T): T;
```

| 参数   | 类型                | 说明                                            |
| ------ | ------------------- | ----------------------------------------------- |
| `deps` | `readonly string[]` | 依赖的 state 键名数组，必须是字符串字面量       |
| `fn`   | `() => T`           | 计算函数，通过 `get()` 读取当前状态并返回派生值 |

返回值在类型层面表现为 `T`，但实际是一个带有内部品牌标记（`Symbol("lark-store-computed")`）的哨兵对象，在 `createStore` 初始化时被拦截和处理。

## 依赖声明（deps）

`deps` 是一个字符串键数组，声明计算属性所依赖的 state 键：

```ts
// 依赖单个键
doubled: computed(["count"], () => get().count * 2),

// 依赖多个键
fullName: computed(["firstName", "lastName"], () => {
  const { firstName, lastName } = get();
  return `${firstName} ${lastName}`;
}),
```

**重要规则：**

- `deps` 中的键必须是 state 中已存在的普通状态键
- 不支持计算属性依赖另一个计算属性（无级联）
- 键名使用字符串字面量，编译器无法自动推断依赖关系

## 求值时机：急切推送式重算

计算属性采用**急切推送式（eager push-based）** 重算策略。具体流程如下：

```
setState(partial)
  │
  ├─ 1. 浅合并 partial 到 state（跳过 computed 键和 action 键）
  │
  ├─ 2. Object.is 检测是否有值真正变化 → 无变化则直接返回
  │
  ├─ 3. recomputeIfNeeded(prevState)
  │     ├─ 收集所有变化的键 → changedKeys
  │     └─ 遍历 computedDefs，若 deps 与 changedKeys 有交集 → 调用 fn() 重算
  │
  └─ 4. 通知所有 listeners（此时 state 已包含最新计算值）
```

源码实现（`store.ts`）：

```ts
const recomputeIfNeeded = (prevState: T): void => {
  if (computedDefs.size === 0) return;

  // 收集本次 setState 中实际变化的键
  const changedKeys = new Set<string>();
  for (const key of Object.keys(state)) {
    if (!Object.is(Reflect.get(state, key), Reflect.get(prevState, key))) {
      changedKeys.add(key);
    }
  }

  // 遍历所有计算属性定义，按需重算
  for (const [key, def] of computedDefs) {
    if (def.deps.some((dep) => changedKeys.has(dep))) {
      const newVal = def.fn();
      if (!Object.is(Reflect.get(state, key), newVal)) {
        Reflect.set(state, key, newVal);
      }
    }
  }
};
```

这意味着：

- 监听器（`subscribe` 的回调）被调用时，`getState()` 返回的对象已经包含最新的计算值
- 不存在"脏标记"或"惰性求值"——每次依赖变化都立即重算
- 如果依赖未变化，计算函数不会被调用

## Object.is 写入跳过

Store 在两个层面使用 `Object.is` 进行优化：

### 1. setState 层面

`setState` 合并时，如果新值与旧值通过 `Object.is` 判定相等，则跳过该键的写入：

```ts
for (const key in resolved) {
  if (
    Object.prototype.hasOwnProperty.call(resolved, key) &&
    !computedKeys.has(key) &&
    !actionKeys.has(key)
  ) {
    const newVal = Reflect.get(resolved, key);
    if (!Object.is(Reflect.get(prevState, key), newVal)) {
      Reflect.set(nextState, key, newVal);
      changed = true;
    }
  }
}

if (!changed) return; // 无任何变化，不通知监听器
```

### 2. 计算属性层面

重算后，如果新值与旧值通过 `Object.is` 相等，则不写入 state：

```ts
const newVal = def.fn();
if (!Object.is(Reflect.get(state, key), newVal)) {
  Reflect.set(state, key, newVal);
}
```

**实践建议：** 计算函数应尽量返回原始值（number、string、boolean）或保持引用稳定的对象，以充分利用 `Object.is` 跳过机制避免不必要的监听器触发。

## 写入保护

通过 `setState` 直接写入计算属性的键会被**静默忽略**：

```ts
const store = createStore("example", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),
}));

// 尝试直接写入计算属性 — 被忽略
store.setState({ doubled: 999 });
console.log(store.getState().doubled); // 仍然是 0（count=0 → doubled=0）

// 正确做法：修改依赖键
store.setState({ count: 5 });
console.log(store.getState().doubled); // 10
```

这一保护通过 `computedKeys` 集合实现——`setState` 在合并时跳过所有属于 `computedKeys` 的键。

## 无级联计算

Lark Mvc 的计算属性**不支持计算属性依赖另一个计算属性**。`deps` 中引用的键必须是普通状态键：

```ts
// ❌ 不推荐：doubled 依赖 quadrupled（另一个计算属性）
const store = createStore("bad", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),
  // quadrupled 依赖 doubled，但 doubled 是计算属性
  // 重算顺序不确定，可能导致读取到旧值
  quadrupled: computed(["doubled"], () => get().doubled * 2),
}));

// ✅ 推荐：所有计算属性直接依赖基础状态键
const store = createStore("good", (set, get) => ({
  count: 0,
  doubled: computed(["count"], () => get().count * 2),
  quadrupled: computed(["count"], () => get().count * 4),
}));
```

原因：`recomputeIfNeeded` 遍历 `computedDefs`（一个 Map），重算顺序取决于插入顺序，不保证拓扑排序。如果计算属性之间存在依赖链，可能读取到尚未重算的旧值。

## 初始化流程

Store 创建时，计算属性的初始化流程：

```ts
// 1. 执行 creator 获取初始 body
const body = creator(setState, getState);

// 2. 分离 state、actions、computed
for (const key of Object.keys(body)) {
  const val = Reflect.get(body, key);
  if (isComputedMarker(val)) {
    computedDefs.set(key, val); // 记录计算定义
    computedKeys.add(key); // 标记为计算键
    initialState[key] = undefined; // 占位
  } else if (typeof val === "function") {
    actions[key] = val; // 函数 → action
    actionKeys.add(key);
  } else {
    initialState[key] = val; // 普通值 → 初始状态
  }
}

// 3. 构建初始 state
state = { ...initialState, ...actions };

// 4. 计算所有计算属性的初始值
for (const [key, def] of computedDefs) {
  Reflect.set(state, key, def.fn());
}
```

## 与 View 集成

通过 `bindStore` 将 Store 绑定到 Lark View 时，计算属性会随基础状态一起同步到 View 的 updater：

```ts
import { bindStore } from "@mm/lark-mvc";
import { useCartStore } from "./stores/cart";

const CartView = defineView((ctx) => {
  // 绑定 store，计算属性自动同步
  bindStore(ctx, useCartStore);

  return {
    template: `
      <div>
        <p>商品数量：{{=itemCount}}</p>
        <p>总价：{{=totalPrice}}</p>
      </div>
    `,
    events: {
      "addItem<click>": () => {
        const items = [...useCartStore.getState().items];
        items.push({ name: "商品", price: 99, qty: 1 });
        useCartStore.setState({ items });
        // totalPrice 和 itemCount 自动重算并触发视图更新
      },
    },
  };
});
```

也可以使用 selector 只订阅部分状态：

```ts
bindStore(ctx, useCartStore, (s) => ({
  totalPrice: s.totalPrice,
  itemCount: s.itemCount,
}));
```

## 完整示例：购物车状态管理

```ts
import { createStore, computed } from "@mm/lark-mvc";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

interface CartState {
  items: CartItem[];
  couponCode: string;
  couponDiscount: number;
  subtotal: number;
  discount: number;
  total: number;
  isEmpty: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  applyCoupon: (code: string, discount: number) => void;
}

export const useCartStore = createStore<CartState>("cart", (set, get) => ({
  items: [],
  couponCode: "",
  couponDiscount: 0,

  // 小计：依赖 items
  subtotal: computed(["items"], () => {
    return get().items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }),

  // 折扣金额：依赖 subtotal 和 couponDiscount
  // 注意：subtotal 是计算属性，这里直接依赖 items 和 couponDiscount
  discount: computed(["items", "couponDiscount"], () => {
    const items = get().items;
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );
    return subtotal * get().couponDiscount;
  }),

  // 最终总价：依赖 items 和 couponDiscount
  total: computed(["items", "couponDiscount"], () => {
    const items = get().items;
    const subtotal = items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );
    return subtotal * (1 - get().couponDiscount);
  }),

  // 是否为空：依赖 items
  isEmpty: computed(["items"], () => get().items.length === 0),

  // Actions
  addItem: (item: CartItem) => {
    const items = [...get().items];
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      existing.qty += item.qty;
    } else {
      items.push(item);
    }
    set({ items });
  },

  removeItem: (id: string) => {
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  applyCoupon: (code: string, discount: number) => {
    set({ couponCode: code, couponDiscount: discount });
  },
}));
```

## 性能注意事项

| 场景                 | 建议                                                          |
| -------------------- | ------------------------------------------------------------- |
| 计算函数开销大       | 确保 `deps` 精确，避免不必要的依赖键                          |
| 返回对象/数组        | 注意 `Object.is` 对引用类型的比较——每次返回新对象都会触发更新 |
| 多个计算属性共享依赖 | 各自独立重算，无缓存共享；考虑合并为一个计算属性              |
| 高频 setState        | 计算属性在每次有效 setState 时同步重算，避免在循环中频繁调用  |

## 小结

- `computed(deps, fn)` 声明派生状态，`deps` 为字符串键数组
- 采用急切推送式重算：依赖变化 → 立即重算 → 再通知监听器
- `Object.is` 双重跳过：setState 层和计算层均避免无意义写入
- 计算属性键不可通过 `setState` 直接写入（静默忽略）
- 不支持计算属性之间的级联依赖
- 与 `bindStore` 配合，计算属性自动同步到 View 层
