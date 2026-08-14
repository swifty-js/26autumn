---
title: 测试指南
description: Lark Mvc 测试完整指南，涵盖 vitest + jsdom 环境配置、视图测试、Store 测试、路由测试、Hooks 测试、编译器测试与 DOM Diff 测试的实用模式
---

# 测试指南

Lark Mvc 使用 **Vitest** 作为测试框架，配合 **jsdom** 环境模拟浏览器 DOM。本文档涵盖各模块的测试方法和实用模式。

## 测试环境配置

### vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom", // 模拟浏览器 DOM 环境
    globals: true, // 全局注入 describe/it/expect 等
    include: ["tests/**/*.test.ts"],
  },
});
```

### 运行测试

```bash
# 运行所有测试
npx vitest run

# 监听模式
npx vitest

# 运行特定文件
npx vitest run tests/router.test.ts

# 覆盖率报告
npx vitest run --coverage
```

### 测试文件结构

项目测试文件位于 `tests/` 目录：

```
tests/
├── cache.test.ts                  # LFU 缓存
├── common.test.ts                 # 公共常量/工具
├── compiler.test.ts               # 模板编译器
├── debug-vdom-attr.test.ts        # VDOM 属性调试
├── dom.test.ts                    # DOM Diff 引擎
├── event-delegator.test.ts        # 事件委托
├── event-emitter.test.ts          # 事件发射器
├── frame.test.ts                  # Frame 系统
├── framework.test.ts              # Framework 启动
├── hmr.test.ts                    # 热模块替换
├── investigate-issues.test.ts     # 问题排查回归测试
├── mark.test.ts                   # 异步标记
├── router.test.ts                 # 路由系统
├── service.test.ts                # 服务层
├── state.test.ts                  # State 状态
├── store-computed.test.ts         # Store computed
├── store-subscribe.test.ts        # Store 订阅
├── updater.test.ts                # Updater 数据绑定
├── url-state.test.ts              # URL 状态
├── utils.test.ts                  # 工具函数
├── vdom-compiler.test.ts          # VDOM 编译器
├── vdom-engine.test.ts            # VDOM 引擎
├── vdom-html-shortcircuit.test.ts # VDOM html 短路优化
├── vdom-view-compat.test.ts       # VDOM 视图兼容
├── view.test.ts                   # 视图系统
├── view-props.test.ts             # 视图属性
└── view-registry.test.ts          # 视图注册表
```

## 测试 Store

### 基础 Store 测试

```ts
import { describe, it, expect } from "vitest";
import { createStore, computed } from "../src/store";
import type { StoreApi } from "../src/store";

interface CountState {
  count: number;
  doubled: number;
  countPlusTen: number;
  increment: () => void;
}

let storeCounter = 0;
function nextName(): string {
  return `computed-test-${++storeCounter}`;
}

function makeCountStore(name: string): StoreApi<CountState> {
  return createStore<CountState>(name, (set, get) => ({
    count: 1,
    doubled: computed(["count"], () => get().count * 2),
    countPlusTen: computed(["count"], () => get().count + 10),
    increment() {
      set({ count: get().count + 1 });
    },
  }));
}

describe("createStore - computed", () => {
  it("计算初始值", () => {
    const store = makeCountStore(nextName());
    const state = store.getState();
    expect(state.count).toBe(1);
    expect(state.doubled).toBe(2);
    expect(state.countPlusTen).toBe(11);
    store.destroy();
  });

  it("setState 触发 computed 重算", () => {
    const store = makeCountStore(nextName());
    store.setState({ count: 5 });
    expect(store.getState().doubled).toBe(10);
    expect(store.getState().countPlusTen).toBe(15);
    store.destroy();
  });

  it("action 正确修改状态", () => {
    const store = makeCountStore(nextName());
    store.getState().increment();
    expect(store.getState().count).toBe(2);
    expect(store.getState().doubled).toBe(4);
    expect(store.getState().countPlusTen).toBe(12);
    store.destroy();
  });

  it("写入 computed 键被忽略", () => {
    const store = makeCountStore(nextName());
    store.setState({ doubled: 999 } as Partial<CountState>);
    expect(store.getState().doubled).toBe(2);
    store.destroy();
  });

  it("多个 computed 共享依赖同步更新", () => {
    const store = makeCountStore(nextName());
    store.getState().increment();
    store.getState().increment();
    expect(store.getState().count).toBe(3);
    expect(store.getState().doubled).toBe(6);
    expect(store.getState().countPlusTen).toBe(13);
    store.destroy();
  });
});
```

### 测试订阅

```ts
import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/store";

describe("store.subscribe", () => {
  it("状态变化时通知监听器", () => {
    const store = createStore("sub-test", (set) => ({ value: 0 }));
    const listener = vi.fn();

    store.subscribe(listener);
    store.setState({ value: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1 }),
      expect.objectContaining({ value: 0 }),
    );
    store.destroy();
  });

  it("值未变化时不通知", () => {
    const store = createStore("sub-noop", (set) => ({ value: 0 }));
    const listener = vi.fn();

    store.subscribe(listener);
    store.setState({ value: 0 }); // 相同值

    expect(listener).not.toHaveBeenCalled();
    store.destroy();
  });

  it("取消订阅后不再通知", () => {
    const store = createStore("sub-off", (set) => ({ value: 0 }));
    const listener = vi.fn();

    const off = store.subscribe(listener);
    off(); // 取消
    store.setState({ value: 1 });

    expect(listener).not.toHaveBeenCalled();
    store.destroy();
  });
});
```

### 测试要点

- 每个测试使用唯一的 store name（避免注册表冲突）
- 测试结束后调用 `store.destroy()` 清理
- 使用 `vi.fn()` 验证监听器调用

## 测试 Router

### 配置路由模式

Router 测试需要先设置配置：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../src/router";
import type { FrameworkConfig } from "../src/types";

describe("Router", () => {
  describe("hash 模式解析", () => {
    beforeEach(() => {
      Router._setConfig({
        rootId: "app",
        routeMode: "hash",
      } as FrameworkConfig);
    });

    it("解析纯域名 URL", () => {
      const result = Router.parse("https://a.b.c.com");
      expect(result.href).toBe("https://a.b.c.com");
      expect(result.srcQuery).toBe("");
      expect(result.srcHash).toBe("");
      expect(result.params).toEqual({});
    });

    it("解析带 query 的 URL", () => {
      const result = Router.parse("https://a.b.c.com/?p0=000");
      expect(result.srcQuery).toBe("/?p0=000");
      expect(result.query.path).toBe("/");
      expect(result.query.params).toEqual({ p0: "000" });
      expect(result.params).toEqual({ p0: "000" });
    });

    it("解析带 hash 路径的 URL", () => {
      const result = Router.parse("https://a.b.c.com/#!/d/e?p1=111&p2=aaa");
      expect(result.srcHash).toBe("/d/e?p1=111&p2=aaa");
      expect(result.hash.path).toBe("/d/e");
      expect(result.hash.params).toEqual({ p1: "111", p2: "aaa" });
      expect(result.params).toEqual({ p1: "111", p2: "aaa" });
    });

    it("解析同时包含 query 和 hash 的 URL", () => {
      const result = Router.parse(
        "https://a.b.c.com/?p0=000#!/d/e?p1=111&p2=aaa",
      );
      expect(result.srcQuery).toBe("/?p0=000");
      expect(result.srcHash).toBe("/d/e?p1=111&p2=aaa");
      expect(result.params).toEqual({ p0: "000", p1: "111", p2: "aaa" });
    });

    it("Location.get 读取参数", () => {
      const result = Router.parse("https://a.b.c.com/#!/d/e?p1=111&p2=aaa");
      expect(result.get("p1")).toBe("111");
      expect(result.get("p2")).toBe("aaa");
      expect(result.get("nonexistent", "default")).toBe("default");
      expect(result.get("nonexistent")).toBe("");
    });

    it("解析结果被缓存", () => {
      const result1 = Router.parse("https://a.b.c.com");
      const result2 = Router.parse("https://a.b.c.com");
      expect(result1).toStrictEqual(result2);
    });
  });

  describe("history 模式解析", () => {
    beforeEach(() => {
      Router._setConfig({
        rootId: "app",
        routeMode: "history",
      } as FrameworkConfig);
    });

    it("解析 pathname + search", () => {
      const result = Router.parse("https://example.com/home?page=1&size=20");
      expect(result.srcQuery).toBe("/home?page=1&size=20");
      expect(result.query.path).toBe("/home");
      expect(result.query.params).toEqual({ page: "1", size: "20" });
      expect(result.params).toEqual({ page: "1", size: "20" });
    });

    it("解析纯 pathname", () => {
      const result = Router.parse("https://example.com/about");
      expect(result.srcQuery).toBe("/about");
      expect(result.query.path).toBe("/about");
      expect(result.query.params).toEqual({});
    });

    it("Location.get 在 history 模式下工作", () => {
      const result = Router.parse("https://example.com/list?page=2&sort=name");
      expect(result.get("page")).toBe("2");
      expect(result.get("sort")).toBe("name");
      expect(result.get("missing", "default")).toBe("default");
    });
  });
});
```

### 测试 Router.join

```ts
describe("Router.join", () => {
  it("合并路径段", () => {
    expect(Router.join("a", "b", "c")).toBe("a/b/c");
  });

  it("处理 ./ 相对路径", () => {
    expect(Router.join("/a/b/./c/./d")).toBe("/a/b/c/d");
  });

  it("处理 ../ 父目录", () => {
    expect(Router.join("a/b/c/../../d")).toBe("a/d");
  });

  it("处理多余斜杠", () => {
    expect(Router.join("a//b/c")).toBe("a/b/c");
  });

  it("复杂路径合并", () => {
    expect(Router.join("/a/b/../c/./d//e")).toBe("/a/c/d/e");
  });
});
```

### 测试事件系统

```ts
describe("Router 事件", () => {
  it("绑定和触发事件", () => {
    const handler = vi.fn();
    Router.on("testEvent", handler);
    Router.fire("testEvent", { data: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
    Router.off("testEvent", handler);
  });

  it("解绑后不再触发", () => {
    const handler = vi.fn();
    Router.on("testEvent2", handler);
    Router.off("testEvent2", handler);
    Router.fire("testEvent2");
    expect(handler).not.toHaveBeenCalled();
  });

  it("fire 返回 Router 支持链式调用", () => {
    const result = Router.fire("testEvent3");
    expect(result).toBe(Router);
  });
});
```

### 测试导航守卫

```ts
describe("Router.beforeEach", () => {
  it("注册和取消守卫", () => {
    const guard = vi.fn(() => true);
    const off = Router.beforeEach(guard);
    expect(typeof off).toBe("function");
    off();
    // 重复取消不报错
    expect(() => off()).not.toThrow();
  });

  it("多个守卫独立注册", () => {
    const g1 = vi.fn();
    const g2 = vi.fn();
    const off1 = Router.beforeEach(g1);
    const off2 = Router.beforeEach(g2);
    off1();
    off2();
    expect(g1).not.toHaveBeenCalled();
    expect(g2).not.toHaveBeenCalled();
  });
});
```

## 测试 Updater

```ts
import { describe, it, expect } from "vitest";
import { createUpdater } from "../src/updater";

describe("Updater", () => {
  it("初始状态包含 vId", () => {
    const updater = createUpdater("viewId1");
    const data = updater.get<Record<string, unknown>>();
    expect(data["vId"]).toBe("viewId1");
  });

  it("set/get 数据绑定", () => {
    const updater = createUpdater("viewId2");
    const result = updater.set({ a: 1, b: 2 });
    expect(result).toBe(updater); // 链式调用
    expect(updater.get("a")).toBe(1);
    expect(updater.get("b")).toBe(2);
  });

  it("set 更新已有键", () => {
    const updater = createUpdater("viewId3");
    updater.set({ x: 1 });
    expect(updater.get("x")).toBe(1);
    updater.set({ x: 2 });
    expect(updater.get("x")).toBe(2);
  });

  it("snapshot/altered 变更检测", () => {
    const updater = createUpdater("viewId4");
    updater.set({ a: 1 });

    expect(updater.altered()).toBeUndefined(); // 未 snapshot

    updater.snapshot();
    expect(updater.altered()).toBe(false); // 无变化

    updater.set({ c: 1 });
    expect(updater.altered()).toBe(true); // 有变化
  });

  it("相同值不触发 altered", () => {
    const updater = createUpdater("viewId5");
    updater.set({ a: 1 });
    updater.snapshot();
    updater.set({ a: 1 }); // 相同值
    expect(updater.altered()).toBe(false);
  });

  it("支持循环引用数据（无 JSON.stringify）", () => {
    const updater = createUpdater("viewId6");
    type Node = { name: string; self?: Node };
    const node: Node = { name: "root" };
    node.self = node; // 循环引用

    updater.set({ node });
    updater.snapshot();
    expect(updater.altered()).toBe(false);

    updater.set({ node, extra: 1 });
    expect(updater.altered()).toBe(true);
  });

  it("translate 解析引用令牌", () => {
    const updater = createUpdater("viewId7");
    const SPLITTER = "\x1e";
    const target = { hello: "world" };
    updater.refData[`${SPLITTER}9`] = target;
    expect(updater.translate(`${SPLITTER}9`)).toBe(target);
    expect(updater.translate("normalString")).toBe("normalString");
    expect(updater.translate(123)).toBe(123);
  });

  it("parse 安全路径解析（无 eval）", () => {
    const updater = createUpdater("viewId8");
    updater.refData["user"] = { profile: { name: "alice" } };

    expect(updater.parse("user.profile.name")).toBe("alice");
    expect(updater.parse("user.profile")).toEqual({ name: "alice" });
    expect(updater.parse("missing")).toBeUndefined();
    expect(updater.parse("42")).toBe(42);
    expect(updater.parse("-1.5")).toBe(-1.5);
    expect(updater.parse("1 + 2")).toBeUndefined(); // 拒绝表达式
    expect(updater.parse("alert(1)")).toBeUndefined();
    expect(updater.parse("a[b]")).toBeUndefined();
  });

  it("forceDigest 标记所有键为已变更", () => {
    const updater = createUpdater("force-test");
    updater.set({ a: 1, b: 2, c: 3 });
    updater.digest();
    expect(updater.getChangedKeys().size).toBe(0);

    expect(() => updater.forceDigest()).not.toThrow();
    expect(updater.getChangedKeys().size).toBe(0); // 已消费
  });
});
```

## 测试视图（View）

视图测试需要模拟 DOM 环境和 Frame 系统：

```ts
import { describe, it, expect, vi } from "vitest";
import { defineView, createCtx, mountCtx, unmountCtx } from "../src/view";
import { Frame, createFrame } from "../src/frame";
import type { FrameObj, ViewCtx, ViewSetup } from "../src/types";

// 创建测试用 Frame（需要 DOM 元素）
function createTestFrame(id: string): FrameObj {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

// 清理测试 Frame
function cleanupFrame(frame: FrameObj): void {
  const el = document.getElementById(frame.id);
  if (el) el.remove();
  (Frame.getAll() as Map<string, FrameObj>).delete(frame.id);
}

describe("View (functional)", () => {
  it("defineView 返回 setup 函数本身", () => {
    const setup: ViewSetup = () => ({ template: () => "" });
    const result = defineView(setup);
    expect(result).toBe(setup);
    expect(typeof result).toBe("function");
  });

  it("mountCtx 执行 setup 并返回 ctx", () => {
    const frame = createTestFrame("test-frame-1");
    const templateFn = () => "hello";
    let receivedCtx: ViewCtx | undefined;

    const setup = defineView((ctx) => {
      receivedCtx = ctx;
      return { template: templateFn };
    });

    const ctx = mountCtx(frame, setup);
    expect(receivedCtx).toBe(ctx);
    expect(ctx.id).toBe("test-frame-1");
    expect(ctx.owner).toBe(frame);
    expect(ctx.updater).toBeDefined();
    expect(typeof ctx.render).toBe("function");
    expect(ctx.getTemplate()).toBe(templateFn);

    unmountCtx(ctx);
    cleanupFrame(frame);
  });

  it("事件通过 getEvents 可访问", () => {
    const frame = createTestFrame("test-frame-2");
    const handler = vi.fn();

    const setup = defineView(() => ({
      template: () => "",
      events: { "btn<click>": handler },
    }));

    const ctx = mountCtx(frame, setup);
    expect(ctx.getEvents()).toEqual({ "btn<click>": handler });

    unmountCtx(ctx);
    cleanupFrame(frame);
  });

  it("on/fire 事件系统", () => {
    const frame = createTestFrame("evt-frame-1");
    const ctx = createCtx(frame);
    const handler = vi.fn();

    ctx.on("testEvent", handler);
    ctx.fire("testEvent", { data: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    cleanupFrame(frame);
  });
});
```

### 测试 wrapAsync

```ts
it("wrapAsync 在视图销毁后不执行", () => {
  const frame = createTestFrame("async-frame");
  const ctx = createCtx(frame);
  ctx.signature.value = 1; // 模拟激活

  const fn = vi.fn();
  const wrapped = ctx.wrapAsync(fn);

  // 正常执行
  wrapped();
  expect(fn).toHaveBeenCalledTimes(1);

  // 模拟销毁
  ctx.signature.value = 0;
  wrapped();
  expect(fn).toHaveBeenCalledTimes(1); // 不再执行

  cleanupFrame(frame);
});

it("wrapAsync 在重渲染后丢弃旧回调", () => {
  const frame = createTestFrame("async-frame-2");
  const ctx = createCtx(frame);
  ctx.signature.value = 1;

  const fn = vi.fn();
  const wrapped = ctx.wrapAsync(fn);

  // 模拟重渲染（signature 递增）
  ctx.signature.value = 2;
  wrapped();
  expect(fn).not.toHaveBeenCalled(); // 旧签名不匹配

  cleanupFrame(frame);
});
```

## 测试 Hooks

```ts
import { describe, it, expect, vi } from "vitest";
import { useState, useEffect, useInterval, useTimeout } from "../src/hooks";
import { createCtx, mountCtx, unmountCtx, defineView } from "../src/view";
import { createFrame } from "../src/frame";

function createTestFrame(id: string) {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return createFrame(id);
}

describe("Hooks", () => {
  it("useState 返回 getter/setter 对", () => {
    const frame = createTestFrame("hooks-frame-1");
    let getter: () => number;
    let setter: (v: number) => void;

    const setup = defineView((ctx) => {
      [getter, setter] = useState("count", 0);
      return { template: () => "" };
    });

    const ctx = mountCtx(frame, setup);

    expect(getter!()).toBe(0);
    setter!(5);
    expect(getter!()).toBe(5);

    unmountCtx(ctx);
    document.getElementById("hooks-frame-1")?.remove();
  });

  it("useEffect 清理函数在销毁时执行", () => {
    const frame = createTestFrame("hooks-frame-2");
    const cleanup = vi.fn();

    const setup = defineView((ctx) => {
      useEffect(() => {
        return cleanup;
      });
      return { template: () => "" };
    });

    const ctx = mountCtx(frame, setup);
    expect(cleanup).not.toHaveBeenCalled();

    unmountCtx(ctx);
    expect(cleanup).toHaveBeenCalledTimes(1);

    document.getElementById("hooks-frame-2")?.remove();
  });
});
```

## 测试 DOM Diff

```ts
import { describe, it, expect } from "vitest";
import {
  domGetNode,
  domSetChildNodes,
  createDomRef,
  applyDomOps,
  applyIdUpdates,
} from "../src/dom";

describe("DOM Diff 引擎", () => {
  it("domGetNode 解析 HTML 字符串", () => {
    const container = document.createElement("div");
    const result = domGetNode("<p>hello</p>", container);
    expect(result.innerHTML).toContain("<p>hello</p>");
  });

  it("domGetNode 处理 table 元素", () => {
    const container = document.createElement("div");
    const result = domGetNode("<tr><td>cell</td></tr>", container);
    expect(result.querySelector("td")?.textContent).toBe("cell");
  });

  it("domGetNode 处理 SVG 命名空间", () => {
    const container = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    const result = domGetNode("<circle></circle>", container);
    expect(result).toBeDefined();
  });

  it("domSetChildNodes 执行 keyed diff", () => {
    const parent = document.createElement("div");
    parent.innerHTML = '<div id="a">1</div><div id="b">2</div>';

    const newParent = document.createElement("div");
    newParent.innerHTML = '<div id="b">2-updated</div><div id="a">1</div>';

    const ref = createDomRef();
    const mockFrame = {
      unmountZone: () => {},
      children: () => [],
      unmountFrame: () => {},
    };

    domSetChildNodes(parent, newParent, ref, mockFrame as any);
    applyDomOps(ref.domOps);
    applyIdUpdates(ref.idUpdates);

    // 验证节点顺序已更新
    expect(parent.children[0].id).toBe("b");
    expect(parent.children[1].id).toBe("a");
  });
});
```

## 测试编译器

编译器的公共 API 是异步的 `compileTemplate(source, options)`，它返回一段 **ES 模块源码字符串**（而非可直接调用的函数）。该模块默认导出签名为 `(data, viewId, refData) => string` 的模板函数，并从 `@mm/lark-mvc/runtime` 导入 `encHtml` / `strSafe` / `refFn` 等辅助函数。

因此测试时需要：先用 `extractGlobalVars` 提取变量，再 `compileTemplate` 得到模块代码，最后把 `import` 替换为本地注入、`export default` 改写为 `return`，用 `new Function` 求值得到模板函数（参见 `tests/compiler.test.ts` 中的 `render` 辅助函数）。

```ts
import { describe, it, expect } from "vitest";
import { compileTemplate, extractGlobalVars } from "../src/compiler";
import * as runtime from "../src/runtime";

// 编译 + 执行模板，返回渲染结果字符串
async function render(
  source: string,
  data: Record<string, unknown> = {},
): Promise<string> {
  const globalVars = await extractGlobalVars(source);
  const moduleCode = await compileTemplate(source, { globalVars });

  // 将静态 import 替换为对本地 runtime 的解构，
  // 并把 export default 改写为 return，便于用 new Function 求值
  const transformed = moduleCode
    .replace(
      /import\s*\{[\s\S]*?\}\s*from\s*["']@mm\/lark-mvc\/runtime["'];?/,
      "const { encHtml: __lark_enc_html__, strSafe: __lark_str_safe__, refFn: __lark_ref_fn__ } = __runtime;",
    )
    .replace("function __lark_template__(", "return function(")
    .replace("\nexport default __lark_template__;", "");

  const fn = new Function("__runtime", transformed)(runtime);
  return fn(data, "testViewId", null);
}

describe("模板编译器", () => {
  it("编译简单模板为渲染函数", async () => {
    const result = await render("<div>{{= name}}</div>", { name: "Alice" });
    expect(result).toContain("Alice");
  });

  it("对 {{=}} 输出进行 HTML 转义", async () => {
    const result = await render("{{= html}}", { html: "<b>bold</b>" });
    expect(result).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("处理循环", async () => {
    const result = await render(
      "{{forOf list as item}}<li>{{= item}}</li>{{/forOf}}",
      { list: ["a", "b"] },
    );
    expect(result).toContain("<li>a</li>");
    expect(result).toContain("<li>b</li>");
  });
});
```

## 实用测试模式

### 模式一：隔离测试环境

每个测试创建独立的 DOM 容器和 Frame，测试后清理：

```ts
function withTestFrame(id: string, fn: (frame: FrameObj) => void) {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  const frame = createFrame(id);
  try {
    fn(frame);
  } finally {
    el.remove();
    (Frame.getAll() as Map<string, FrameObj>).delete(id);
  }
}

it("测试视图挂载", () => {
  withTestFrame("isolated-frame", (frame) => {
    const ctx = mountCtx(
      frame,
      defineView(() => ({ template: () => "<p>hi</p>" })),
    );
    expect(ctx.signature.value).toBe(1);
    unmountCtx(ctx);
  });
});
```

### 模式二：Store 唯一命名

避免全局注册表冲突：

```ts
let counter = 0;
function uniqueName(prefix = "store"): string {
  return `${prefix}-${++counter}`;
}

it("每个测试使用独立 store", () => {
  const store = createStore(uniqueName(), (set) => ({ value: 0 }));
  // ... 测试逻辑
  store.destroy();
});
```

### 模式三：异步操作测试

```ts
it("异步 action 正确更新状态", async () => {
  const store = createStore(uniqueName(), (set, get) => ({
    data: null as string | null,
    loading: false,
    async fetchData() {
      set({ loading: true });
      await new Promise((r) => setTimeout(r, 10));
      set({ data: "result", loading: false });
    },
  }));

  await store.getState().fetchData();
  expect(store.getState().data).toBe("result");
  expect(store.getState().loading).toBe(false);
  store.destroy();
});
```

### 模式四：Mock 定时器

```ts
import { vi } from "vitest";

it("useInterval 定时执行并在销毁后停止", () => {
  vi.useFakeTimers();

  const frame = createTestFrame("timer-frame");
  const fn = vi.fn();

  const setup = defineView((ctx) => {
    useInterval(fn, 1000);
    return { template: () => "" };
  });

  const ctx = mountCtx(frame, setup);

  vi.advanceTimersByTime(3000);
  expect(fn).toHaveBeenCalledTimes(3);

  unmountCtx(ctx); // 清理定时器
  vi.advanceTimersByTime(2000);
  expect(fn).toHaveBeenCalledTimes(3); // 不再执行

  vi.useRealTimers();
  document.getElementById("timer-frame")?.remove();
});
```

### 模式五：测试视图完整生命周期

```ts
it("视图完整生命周期", () => {
  const frame = createTestFrame("lifecycle-frame");
  const events: string[] = [];

  const setup = defineView((ctx) => {
    events.push("setup");

    ctx.on("render", () => events.push("render"));
    ctx.on("destroy", () => events.push("destroy"));

    useEffect(() => {
      events.push("effect");
      return () => events.push("effect-cleanup");
    });

    return { template: () => "<div>test</div>" };
  });

  const ctx = mountCtx(frame, setup);
  expect(events).toContain("setup");
  expect(events).toContain("effect");

  unmountCtx(ctx);
  expect(events).toContain("effect-cleanup");
  expect(events).toContain("destroy");
  expect(ctx.signature.value).toBe(0);

  document.getElementById("lifecycle-frame")?.remove();
});
```

## 测试最佳实践

1. **唯一标识**：每个测试使用唯一的 Frame ID 和 Store name，避免全局状态污染
2. **彻底清理**：测试后移除 DOM 元素、销毁 Frame 和 Store
3. **避免共享状态**：每个 `it` 块独立创建所需对象
4. **使用 vi.fn()**：验证回调调用次数和参数
5. **测试边界情况**：空值、循环引用、重复操作、销毁后操作
6. **异步安全**：使用 `async/await` 或 `vi.useFakeTimers()` 控制时序
7. **不依赖执行顺序**：测试之间无顺序依赖
8. **jsdom 限制**：注意 jsdom 不支持 `layout`、`IntersectionObserver` 等，需要 mock
