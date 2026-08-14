---
title: 服务层
description: Lark Mvc 服务层（Service）完整指南，涵盖 createService API、LFU 缓存、请求去重、串行队列、Payload 包装器及与视图的集成
---

# 服务层（Service）

Lark Mvc 的服务层提供了完整的 API 请求管理能力，包括 LFU 缓存、请求去重、串行任务队列、生命周期事件等。采用函数式工厂模式——无 class、无 this、无 prototype。

## 一、核心概念

```
┌─────────────────────────────────────────────────────────────┐
│                    createService(syncFn)                      │
├─────────────────────────────────────────────────────────────┤
│  ServiceApi (类型级)                                         │
│  ├── add()        注册端点元数据                              │
│  ├── meta()       查询端点配置                                │
│  ├── create()     创建 Payload                               │
│  ├── get()        获取或创建 Payload（含缓存查询）             │
│  ├── cached()     查询缓存                                   │
│  ├── clear()      清除指定端点缓存                            │
│  ├── on/off/fire  类型级事件（begin/done/fail/end）           │
│  └── instance()   创建服务实例                                │
├─────────────────────────────────────────────────────────────┤
│  ServiceInstance (实例级)                                     │
│  ├── all()        批量请求，全部完成后回调                     │
│  ├── one()        批量请求，逐个完成回调                       │
│  ├── save()       批量请求，跳过缓存                          │
│  ├── enqueue()    入队串行任务                                │
│  ├── dequeue()    出队执行                                   │
│  ├── destroy()    销毁实例，取消待处理请求                     │
│  └── on/off/fire  实例级事件                                  │
└─────────────────────────────────────────────────────────────┘
```

## 二、createService(syncFn) API

### 基本用法

```typescript
import { createService } from "@mm/lark-mvc";
import type { PayloadApi } from "@mm/lark-mvc";

// 创建服务类型，传入请求执行函数
const MyService = createService(
  (payload: PayloadApi, callback: () => void) => {
    const url = payload.get<string>("url");
    const params = payload.get<Record<string, unknown>>("params");

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
      .then((res) => res.json())
      .then((data) => {
        payload.set("data", data);
        callback(); // 通知完成
      })
      .catch((err) => {
        payload.set("error", err.message);
        callback(); // 即使失败也要调用 callback
      });
  },
  20, // cacheMax: 最大缓存条目数（默认 20）
  5, // cacheBuffer: 淘汰批次大小（默认 5）
);
```

### syncFn 签名

```typescript
type SyncFn = (payload: PayloadApi, callback: () => void) => void;
```

- `payload`：当前请求的数据载体，包含端点元数据和请求参数
- `callback`：请求完成时**必须调用**（无论成功或失败），用于触发后续流程

### 注册端点元数据

```typescript
MyService.add([
  {
    name: "getUserList",
    url: "/api/users",
    cache: 60000, // 缓存 60 秒
    before(payload) {
      // 请求前钩子：添加公共参数
      payload.set("params", {
        ...payload.get("params"),
        token: getToken(),
      });
    },
    after(payload) {
      // 响应后钩子：数据转换
      const data = payload.get<any>("data");
      payload.set("list", data.items);
      payload.set("total", data.total);
    },
  },
  {
    name: "createUser",
    url: "/api/users/create",
    cache: 0, // 不缓存
    cleanKeys: "getUserList", // 成功后清除 getUserList 的缓存
  },
]);
```

### ServiceMetaEntry 完整字段

| 字段        | 类型                | 说明                                 |
| ----------- | ------------------- | ------------------------------------ |
| `name`      | `string`            | 端点唯一标识                         |
| `url`       | `string`            | 请求 URL                             |
| `cache`     | `number`            | 缓存 TTL（毫秒），0 = 不缓存         |
| `before`    | `(payload) => void` | 请求前钩子                           |
| `after`     | `(payload) => void` | 响应后钩子                           |
| `cleanKeys` | `string`            | 成功后需清除缓存的端点名（逗号分隔） |

## 三、LFU 缓存机制

### 缓存架构

服务层使用 LFU（Least Frequently Used）风格的有界缓存：

```typescript
// cache.ts
export function createCache<T>(options: CacheOptions<T> = {}): CacheApi<T> {
  let entries: CacheEntry<T>[] = [];
  const lookup = new Map<string, CacheEntry<T>>();
  const maxSize = options.maxSize ?? 20;
  const bufferSize = options.bufferSize ?? 5;
  const capacity = maxSize + bufferSize;
  // ...
}
```

### 缓存策略

- **容量**：`maxSize + bufferSize`（默认 25 条）
- **淘汰触发**：当条目数达到 capacity 时
- **淘汰数量**：每次淘汰 `bufferSize` 条（默认 5 条）
- **淘汰依据**：频率最低 + 最近最少访问
- **淘汰算法**：单趟部分选择（O(n·k)），而非全排序（O(n log n)）

### 缓存键生成

```typescript
// 缓存键 = JSON(attrs) + SPLITTER + JSON(meta)
function defaultCacheKey(
  meta: ServiceMetaEntry,
  attrs: Record<string, unknown>,
): string {
  return JSON.stringify(attrs) + SPLITTER + getMetaJson(meta);
}
```

同一端点 + 同一参数 = 同一缓存键。不同参数产生不同缓存条目。

### 缓存生命周期

```
请求发起
  │
  ├── cache > 0 ?
  │     ├── 是 → 计算 cacheKey
  │     │         ├── pendingCacheKeys 中有？→ 复用进行中的请求（去重）
  │     │         ├── payloadCache 中有且未过期？→ 直接返回缓存
  │     │         └── 缓存过期？→ 删除旧缓存，发起新请求
  │     └── 否 → 直接发起新请求
  │
  ▼
请求完成
  │
  ├── cacheInfo.time = Date.now()
  └── payloadCache.set(cacheKey, entity)
```

### 手动清除缓存

```typescript
// 清除单个端点的所有缓存
MyService.clear("getUserList");

// 清除多个端点
MyService.clear("getUserList,getDepartment");
```

## 四、请求去重

### 工作原理

当多个视图同时请求相同的数据时，服务层通过 `pendingCacheKeys` 实现请求去重：

```typescript
// service.ts 内部逻辑
if (cacheKey && pendingCacheKeys[cacheKey]) {
  // 已有相同请求在进行中，将回调加入等待队列
  pendingCacheKeys[cacheKey].push(complete);
} else if (payloadInfo.needsUpdate) {
  // 首次请求，创建等待队列并发起请求
  const cacheList: PendingCacheEntry = [complete];
  cacheList.entity = payloadEntity;
  pendingCacheKeys[cacheKey] = cacheList;

  const cacheComplete = (): void => {
    const list = pendingCacheKeys[cacheKey];
    // 写入缓存
    if (isPayload(entity) && entity.cacheInfo) {
      entity.cacheInfo.time = Date.now();
      payloadCache.set(cacheKey, entity);
    }
    // 清除 pending 标记
    Reflect.deleteProperty(pendingCacheKeys, cacheKey);
    // 通知所有等待者
    for (const cb of list) {
      if (typeof cb === "function") cb();
    }
  };

  syncFn(payloadEntity, cacheComplete);
}
```

### 去重效果

```typescript
// 视图 A
service.all("getUserList", (errors, payload) => { ... });

// 视图 B（几乎同时）
service.all("getUserList", (errors, payload) => { ... });

// 结果：只发起一次网络请求，两个回调都收到相同的 payload
```

## 五、串行任务队列

### enqueue/dequeue 机制

服务实例内置串行队列，确保同一实例的请求按顺序执行：

```typescript
function enqueue(callback: AnyFunc): ServiceInstance {
  if (!inst.destroyed) {
    taskQueue.push(callback);
    dequeue(...prevArgs);
  }
  return inst;
}

function dequeue(...args: unknown[]): void {
  if (!inst.busy && !inst.destroyed) {
    inst.busy = 1;
    setTimeout(() => {
      inst.busy = 0;
      if (!inst.destroyed) {
        const task = taskQueue.shift();
        if (task) {
          prevArgs = args;
          funcWithTry(task, args, inst, noop);
        }
      }
    }, 0);
  }
}
```

### 自动排队

当实例正忙（`busy = 1`）时，新请求自动入队：

```typescript
// serviceSend 内部
if (service.busy) {
  const queued = () => serviceSend(service, attrs, done, flag, save, internals);
  service.enqueue(queued);
  return;
}
service.busy = 1;
```

### 使用场景

```typescript
const service = MyService.instance();

// 这些请求会串行执行，不会并发
service.all("getUserList", callback1);
service.all("getDepartment", callback2); // 等第一个完成后执行
service.save("updateUser", callback3); // 等第二个完成后执行
```

## 六、all / one / save 请求模式

### all：全部完成后回调

```typescript
service.all(
  ["getUserList", "getDepartment", "getRole"],
  (
    errors: unknown[],
    userList: PayloadApi,
    dept: PayloadApi,
    role: PayloadApi,
  ) => {
    if (errors.length) {
      console.error("部分请求失败:", errors);
      return;
    }
    // 所有请求完成后一次性回调
    ctx.updater
      .set({
        users: userList.get("data"),
        departments: dept.get("data"),
        roles: role.get("data"),
      })
      .digest();
  },
);
```

回调签名：`(errors: unknown[], ...payloads: PayloadApi[]) => void`

### one：逐个完成回调

```typescript
service.one(
  ["getUserList", "getDepartment", "getRole"],
  (
    error: unknown | null,
    payload: PayloadApi,
    isLast: boolean,
    index: number,
  ) => {
    if (error) {
      console.error(`第 ${index} 个请求失败:`, error);
      return;
    }
    // 每完成一个就回调一次
    const name = payload.get<string>("name");
    ctx.updater.set({ [name]: payload.get("data") }).digest();

    if (isLast) {
      console.log("全部完成");
    }
  },
);
```

回调签名：`(error, payload, isLast, index) => void`

### save：跳过缓存

```typescript
// save 与 all 行为相同，但强制跳过缓存（createNew = true）
service.save(
  { name: "createUser", params: { name: "Alice", age: 25 } },
  (errors: unknown[], payload: PayloadApi) => {
    if (!errors.length) {
      console.log("创建成功:", payload.get("data"));
    }
  },
);
```

### 参数格式

```typescript
// 字符串形式（使用已注册的端点名）
service.all("getUserList", callback);

// 对象形式（可覆盖参数）
service.all({ name: "getUserList", params: { page: 1 } }, callback);

// 数组形式（批量请求）
service.all(["getUserList", "getDepartment"], callback);

// 混合形式
service.all(
  ["getUserList", { name: "getDetail", params: { id: 42 } }],
  callback,
);
```

## 七、before/after 钩子

### before 钩子

在请求发出前修改 Payload：

```typescript
MyService.add({
  name: "getUserList",
  url: "/api/users",
  before(payload) {
    // 添加认证 token
    const params = payload.get<Record<string, unknown>>("params") || {};
    payload.set("params", {
      ...params,
      token: localStorage.getItem("token"),
      timestamp: Date.now(),
    });

    // 修改请求 URL
    payload.set("url", "/api/v2/users");
  },
});
```

### after 钩子

在响应数据传递给视图前进行转换：

```typescript
MyService.add({
  name: "getUserList",
  url: "/api/users",
  after(payload) {
    const raw = payload.get<any>("data");
    // 数据标准化
    payload.set(
      "list",
      raw.items.map((item: any) => ({
        id: item.user_id,
        name: item.user_name,
        avatar: item.avatar_url || "/default-avatar.png",
      })),
    );
    payload.set("total", raw.pagination.total);
  },
});
```

### 钩子执行时机

```
create(attrs)
  │
  ├── 合并 meta 到 payload
  ├── 合并 attrs 到 payload
  ├── 执行 before(payload)    ← 请求前钩子
  ├── 触发 "begin" 事件
  │
  ▼
syncFn(payload, callback)     ← 实际网络请求
  │
  ▼
callback() 被调用
  │
  ├── 触发 "done" 或 "fail" 事件
  ├── 触发 "end" 事件
  └── 调用视图回调
```

## 八、Payload 包装器

### createPayload

```typescript
// Payload 由服务管线内部通过 createPayload() 创建（非公共导出 API），
// 视图回调中拿到的 payload 参数即为该包装器实例。

// 读取
payload.get<string>("initialKey"); // "value"

// 写入（键值对）
payload.set("name", "Alice");

// 写入（对象合并）
payload.set({ age: 25, city: "杭州" });

// 直接访问底层数据
payload.data; // { initialKey: "value", name: "Alice", age: 25, city: "杭州" }

// 缓存信息
payload.cacheInfo; // { name: "getUserList", key: "...", time: 1234567890 }
```

### PayloadApi 接口

```typescript
interface PayloadApi {
  get<T = unknown>(key: string): T;
  set(keyOrData: string | Record<string, unknown>, value?: unknown): PayloadApi;
  data: Record<string, unknown>;
  cacheInfo?: ServiceCacheInfo;
}
```

## 九、生命周期事件

### 类型级事件（全局）

```typescript
// 监听所有请求的生命周期
MyService.on("begin", ({ payload }) => {
  console.log(`请求开始: ${payload.get("name")}`);
  showLoading();
});

MyService.on("done", ({ payload }) => {
  console.log(`请求成功: ${payload.get("name")}`);
});

MyService.on("fail", ({ payload, error }) => {
  console.error(`请求失败: ${payload.get("name")}`, error);
  showError(error);
});

MyService.on("end", ({ payload, error }) => {
  console.log(`请求结束: ${payload.get("name")}`);
  hideLoading();
});
```

### 事件触发顺序

```
begin → (请求执行中) → done/fail → end
```

- `begin`：Payload 创建后、syncFn 调用前
- `done`：请求成功完成（无 error）
- `fail`：请求失败（有 error）
- `end`：请求结束（无论成功失败，在 done/fail 之后）

### 实例级事件

```typescript
const service = MyService.instance();

service.on("customEvent", (data) => {
  console.log("实例级事件:", data);
});

service.fire("customEvent", { message: "hello" });
```

## 十、与视图集成（useResource）

### 基本集成模式

```typescript
import { defineView, useState, useResource } from "@mm/lark-mvc";
import template from "./user-list.html";

const UserService = createService(syncFn);
UserService.add([
  { name: "getUsers", url: "/api/users", cache: 30000 },
  {
    name: "deleteUser",
    url: "/api/users/delete",
    cache: 0,
    cleanKeys: "getUsers",
  },
]);

export default defineView((ctx) => {
  const [getUsers, setUsers] = useState("users", []);
  const [getLoading, setLoading] = useState("loading", false);

  // 创建服务实例并注册为视图资源
  const service = UserService.instance();
  useResource("userService", service);
  // 视图销毁时自动调用 service.destroy()，取消待处理请求

  // 初始加载
  setLoading(true);
  service.all("getUsers", (errors: unknown[], payload: PayloadApi) => {
    setLoading(false);
    if (!errors.length) {
      setUsers(payload.get("list"));
    }
  });

  return {
    template,
    events: {
      "delete<click>": (e) => {
        const id = e.params.id;
        // save 跳过缓存，确保删除请求总是发送
        service.save(
          { name: "deleteUser", params: { id } },
          (errors: unknown[]) => {
            if (!errors.length) {
              // 删除成功后重新加载列表
              service.all(
                "getUsers",
                (errs: unknown[], payload: PayloadApi) => {
                  if (!errs.length) setUsers(payload.get("list"));
                },
              );
            }
          },
        );
      },
      "refresh<click>": () => {
        // 手动清除缓存后重新请求
        UserService.clear("getUsers");
        service.all("getUsers", (errors: unknown[], payload: PayloadApi) => {
          if (!errors.length) setUsers(payload.get("list"));
        });
      },
    },
  };
});
```

### 配合 wrapAsync 防止过期回调

```typescript
export default defineView((ctx) => {
  const service = MyService.instance();
  useResource("svc", service);

  return {
    template,
    events: {
      "load<click>": () => {
        // wrapAsync 确保视图销毁后回调被丢弃
        const safeUpdate = ctx.wrapAsync((payload: PayloadApi) => {
          ctx.updater.set({ data: payload.get("data") }).digest();
        });

        service.all("getData", (errors: unknown[], payload: PayloadApi) => {
          if (!errors.length) safeUpdate(payload);
        });
      },
    },
  };
});
```

## 十一、错误处理模式

### 模式 1：all 的 errors 数组

```typescript
service.all(["getA", "getB", "getC"], (errors, a, b, c) => {
  // errors 数组与请求一一对应
  if (errors[0]) console.error("getA 失败:", errors[0]);
  if (errors[1]) console.error("getB 失败:", errors[1]);
  // 即使部分失败，成功的 payload 仍可用
  if (a) ctx.updater.set({ dataA: a.get("data") });
  ctx.updater.digest();
});
```

### 模式 2：one 的逐个错误处理

```typescript
service.one(["getA", "getB"], (error, payload, isLast, index) => {
  if (error) {
    // 单个失败不影响其他请求
    showNotification(`${payload.get("name")} 加载失败`);
    return;
  }
  // 逐个渲染，提升感知性能
  appendToList(payload.get("data"));
});
```

### 模式 3：全局错误拦截

```typescript
MyService.on("fail", ({ payload, error }) => {
  const status = error?.status;
  if (status === 401) {
    // token 过期，跳转登录
    Router.to("/login");
  } else if (status === 500) {
    showGlobalError("服务器错误，请稍后重试");
  }
});
```

### 模式 4：重试机制

```typescript
function fetchWithRetry(
  service: ServiceInstance,
  name: string,
  retries = 3,
): Promise<PayloadApi> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      service.all(name, (errors: unknown[], payload: PayloadApi) => {
        if (!errors.length) {
          resolve(payload);
        } else if (remaining > 0) {
          setTimeout(() => attempt(remaining - 1), 1000);
        } else {
          reject(errors[0]);
        }
      });
    };
    attempt(retries);
  });
}
```

## 十二、destroy 与资源清理

### ServiceInstance.destroy()

```typescript
function destroy(): void {
  inst.destroyed = 1;
  taskQueue.length = 0; // 清空待执行队列
}
```

销毁后：

- 所有待处理的回调被忽略（`if (service.destroyed) return`）
- 队列中的任务被清空
- 已发出的网络请求无法取消（需配合 AbortController）

### 与 useResource 配合

```typescript
// useResource 在视图销毁时自动调用 resource.destroy()
const service = MyService.instance();
useResource("myService", service);

// destroyOnRender = true 时，每次 render 也会销毁
useResource("tempService", MyService.instance(), true);
```

## 十三、高级用法

### 自定义缓存策略

```typescript
// 创建大缓存服务（适合数据字典）
const DictService = createService(syncFn, 100, 20);

// 创建无缓存服务（适合实时数据）
const RealtimeService = createService(syncFn, 0, 0);
```

### 请求拦截器模式

```typescript
const ApiService = createService((payload, callback) => {
  const url = payload.get<string>("url");
  const params = payload.get<Record<string, unknown>>("params");
  const method = payload.get<string>("method") || "GET";

  const controller = new AbortController();
  payload.set("_controller", controller);

  fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: method !== "GET" ? JSON.stringify(params) : undefined,
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw { status: res.status, message: res.statusText };
      return res.json();
    })
    .then((data) => {
      payload.set("data", data);
      callback();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        payload.set("error", err);
      }
      callback();
    });
});
```

### 配合 State 实现全局数据加载

```typescript
export default defineView((ctx) => {
  ctx.observeState("appConfig");
  State.clean("appConfig")(ctx);

  const service = ConfigService.instance();
  useResource("configSvc", service);

  service.all("getConfig", (errors: unknown[], payload: PayloadApi) => {
    if (!errors.length) {
      State.digest({ appConfig: payload.get("data") });
    }
  });

  return { template, events: {} };
});
```
