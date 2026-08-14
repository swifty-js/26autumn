# Formily 新手入门与原理深度解析

本文基于对 Formily 源码仓库（`formily/packages/`）的逐文件阅读整理而成，所有原理结论均给出对应的源码文件与行号引用，便于对照阅读。文档分两大部分：第一部分是面向新手的入门教程，第二部分是面向进阶的原理解析。

---

## 目录

- 第一部分 新手入门教程
  - 1. Formily 是什么
  - 2. 仓库结构与包职责
  - 3. 环境准备与安装
  - 4. 第一个表单：三种写法
  - 5. 字段模型四兄弟
  - 6. 字段状态与受控渲染
  - 7. 校验
  - 8. 字段联动
  - 9. 协议驱动（JSON Schema）
  - 10. 接入第三方组件库
  - 11. 常用 API 速查
- 第二部分 原理解析
  - 12. 整体架构与分层
  - 13. 响应式引擎 @formily/reactive
  - 14. 响应式如何接入 React
  - 15. 核心模型层 @formily/core
  - 16. 路径系统 @formily/path
  - 17. 校验系统 @formily/validator
  - 18. React 绑定层 @formily/react
  - 19. 协议驱动层 @formily/json-schema
  - 20. 一次输入的完整数据流
  - 21. 关键设计思想总结

---

# 第一部分 新手入门教程

## 1. Formily 是什么

Formily 是一个面向中后台复杂表单场景的解决方案。它要解决的核心痛点是：

- 表单字段多、嵌套深，手写受控组件会产生大量样板代码。
- 字段之间存在复杂联动（A 的值变化要影响 B 的显隐、可选项、校验）。
- 表单结构希望由后端下发的 JSON 描述（协议）动态生成，而非前端硬编码。
- 性能要求高：一个字段变化不应该导致整棵表单重新渲染。

Formily 的设计思路是把表单拆成三层：

1. 领域模型层（@formily/core）：与 UI 框架无关的纯 JS 表单模型，管理字段树、值、校验、联动。
2. 响应式层（@formily/reactive）：一个类 MobX 的响应式状态库，让模型变化能被精确追踪。
3. 视图绑定层（@formily/react / @formily/vue）：把模型渲染成具体 UI 组件。

理解了这三层，就理解了 Formily 的全部骨架。

## 2. 仓库结构与包职责

仓库是一个 lerna/yarn workspaces 的 monorepo，核心包都在 `formily/packages/` 下：

| 包                             | 路径                    | 职责                                              |
| ------------------------------ | ----------------------- | ------------------------------------------------- |
| @formily/reactive              | packages/reactive       | 响应式状态引擎，类 MobX，框架无关                 |
| @formily/reactive-react        | packages/reactive-react | 把响应式引擎接入 React（observer 等）             |
| @formily/shared                | packages/shared         | 共享工具函数（clone、merge、isEmpty、类型判断等） |
| @formily/path                  | packages/path           | 表单字段路径系统，支持通配符匹配                  |
| @formily/validator             | packages/validator      | 校验器，内置规则、自定义规则、国际化              |
| @formily/core                  | packages/core           | 表单领域模型层，框架无关                          |
| @formily/json-schema           | packages/json-schema    | JSON Schema 协议解析，协议转字段                  |
| @formily/react                 | packages/react          | React 绑定层，组件与 hooks                        |
| @formily/vue                   | packages/vue            | Vue 绑定层                                        |
| @formily/antd / next / element | packages/antd 等        | 对接具体 UI 组件库的字段组件                      |
| @formily/grid                  | packages/grid           | 栅格布局工具                                      |

依赖方向自底向上：reactive 与 shared 是最底层，path/validator 依赖它们，core 依赖 reactive+shared+validator，json-schema 依赖 core，react 依赖 core+json-schema+reactive-react，最上层是 antd 等组件库。

## 3. 环境准备与安装

以 React 技术栈为例，安装核心三件套加一个组件库：

```bash
npm install @formily/core @formily/react @formily/antd antd
```

版本对应关系：@formily 2.x 对应 React 16.8+（需要 hooks）与 antd 4/5。仓库当前版本为 2.3.7（见各包 package.json）。

## 4. 第一个表单：三种写法

Formily 提供三种由浅入深的写法，理解它们的递进关系是入门的关键。

### 4.1 纯模型写法（最底层）

直接用 core 创建表单模型，手动管理渲染。这种方式很少直接用，但能帮你理解底层。

```tsx
import { createForm } from "@formily/core";

const form = createForm();

const field = form.createField({
  name: "username",
  title: "用户名",
  required: true,
});
```

### 4.2 JSX 标签写法（Markup Schema）

用 JSX 描述字段结构，最直观，适合字段固定的场景。

```tsx
import { createForm } from "@formily/core";
import { FormProvider, Field } from "@formily/react";
import { Input, FormItem } from "@formily/antd";

const form = createForm();

export default () => (
  <FormProvider form={form}>
    <Field
      name="username"
      title="用户名"
      required
      decorator={[FormItem]}
      component={[Input, { placeholder: "请输入" }]}
    />
  </FormProvider>
);
```

要点：

- `FormProvider` 把 form 实例注入 React Context，后代字段组件都能拿到。
- `Field` 的 `decorator` 是外层包装组件（通常是带 label、错误提示的 FormItem），`component` 是真正的输入组件。
- `decorator` 和 `component` 都是 `[组件, props]` 数组形式。

### 4.3 JSON 协议写法（JSON Schema）

用一个 JSON 对象描述整个表单，适合后端下发、低代码平台。

```tsx
import { createForm } from "@formily/core";
import { FormProvider, createSchemaField } from "@formily/react";
import { Input, FormItem } from "@formily/antd";

const SchemaField = createSchemaField({
  components: { Input, FormItem },
});

const form = createForm();

const schema = {
  type: "object",
  properties: {
    username: {
      type: "string",
      title: "用户名",
      required: true,
      "x-decorator": "FormItem",
      "x-component": "Input",
      "x-component-props": { placeholder: "请输入" },
    },
  },
};

export default () => (
  <FormProvider form={form}>
    <SchemaField schema={schema} />
  </FormProvider>
);
```

要点：

- `createSchemaField` 注册一个组件表，schema 里的 `x-component: 'Input'` 字符串会被解析成真实的 Input 组件。
- 以 `x-` 开头的属性是 Formily 对标准 JSON Schema 的扩展，描述 UI 相关信息。

三种写法最终都会走到同一套 core 模型，区别只是「用什么方式描述字段」。

## 5. 字段模型四兄弟

core 层有四种字段模型，对应不同的语义（见 packages/core/src/models/）：

| 模型        | 文件                  | 语义                   | 是否有 value |
| ----------- | --------------------- | ---------------------- | ------------ |
| Field       | models/Field.ts       | 普通数据字段           | 有           |
| ArrayField  | models/ArrayField.ts  | 数组字段（可增删项）   | 有（数组）   |
| ObjectField | models/ObjectField.ts | 对象字段（容纳子字段） | 有（对象）   |
| VoidField   | models/VoidField.ts   | 虚拟字段，纯布局用     | 无           |

继承关系：BaseField 是基类（models/BaseField.ts），Field/ArrayField/ObjectField/VoidField 都继承它。ArrayField 和 ObjectField 又继承自 Field。

VoidField 的典型用途是布局容器：它不产生数据路径，只用于组织视觉结构。这一点在路径系统里很重要，后文会讲。

## 6. 字段状态与受控渲染

每个字段模型上有一组状态属性，常用的有：

- `value` / `initialValue`：当前值 / 初始值
- `title` / `description`：标题 / 描述
- `required`：是否必填
- `pattern`：交互模式，取值为 editable / disabled / readOnly / readPretty
- `display`：展示状态，取值为 visible / hidden / none
- `validateStatus`：校验状态，如 error / warning / success
- `feedbacks`：校验反馈信息数组
- `componentType` / `componentProps`：输入组件及其 props
- `decoratorType` / `decoratorProps`：装饰组件及其 props

其中 `pattern` 和 `display` 是两个高频概念：

- `pattern` 控制「能不能编辑」。readPretty 是「只读美化态」，常用于详情页，会把输入框替换成纯文本展示。
- `display` 控制「显不显示」。hidden 是视觉隐藏但保留数据，none 是隐藏且清空数据。

视图层（@formily/react 的 ReactiveField）会读取这些状态，构造受控 props 渲染组件。例如把 `field.value` 作为组件的 value，把组件的 onChange 包装成 `field.onInput`。

## 7. 校验

校验由 @formily/validator 包实现，core 在合适时机调用它。

### 7.1 声明校验规则

```tsx
<Field
  name="age"
  title="年龄"
  validator={[
    { required: true },
    { maximum: 150, message: "年龄不能超过 150" },
    { format: "number" },
  ]}
/>
```

协议写法对应 `x-validator`。

### 7.2 内置规则

validator 内置了常用规则（packages/validator/src/rules.ts），包括 required、format（如 email、url、number、date）、pattern、maxLength、minLength、maximum、minimum 等。

### 7.3 自定义校验器

```tsx
import { registerValidateRules } from "@formily/core";

registerValidateRules({
  async checkPhone(value) {
    if (!/^1\d{10}$/.test(value)) return "手机号格式不正确";
    return "";
  },
});
```

然后在字段上用 `{ checkPhone: true }` 引用。

### 7.4 校验时机

校验会在以下时机自动触发：输入（onInput）、聚焦（onFocus）、失焦（onBlur）、值变化联动、显式调用 `form.validate()` 或 `field.validate()`、提交（submit）。

## 8. 字段联动

联动是 Formily 的杀手锏。它基于响应式自动依赖追踪，你只需在函数里「读取」某个字段的值，当那个值变化时函数就会自动重跑，无需手动订阅。

### 8.1 被动联动（reactions）

在字段上声明 reactions，函数参数是字段自身：

```tsx
<Field
  name="confirm"
  title="确认密码"
  reactions={(field) => {
    // 读取 password 的值，建立依赖
    const pwd = field.query("password").value();
    field.selfErrors = pwd === field.value ? [] : ["两次输入不一致"];
  }}
/>
```

只要函数体内读到了 `password` 的值，password 一变这个 reaction 就重跑。

### 8.2 主动联动（effects）

在创建表单时用 effects 监听全局事件：

```tsx
const form = createForm({
  effects() {
    onFieldValueChange("type", (field) => {
      // type 变化时，控制 extra 字段的显隐
      form.setFieldState("extra", (state) => {
        state.display = field.value === "custom" ? "visible" : "none";
      });
    });
  },
});
```

### 8.3 协议联动（x-reactions）

JSON 写法用 `x-reactions` 描述联动，支持声明式的 when/fulfill/otherwise：

```json
{
  "extra": {
    "type": "string",
    "x-reactions": {
      "dependencies": ["type"],
      "fulfill": {
        "state": {
          "display": "{{$deps[0] === 'custom' ? 'visible' : 'none'}}"
        }
      }
    }
  }
}
```

## 9. 协议驱动（JSON Schema）

协议驱动是 Formily 区别于其他表单库的最大特色。核心约定：

标准 JSON Schema 字段（type、title、required、properties、items、enum、default 等）描述数据结构；以 `x-` 开头的扩展字段描述 UI：

| 扩展字段                             | 含义                             |
| ------------------------------------ | -------------------------------- |
| x-component                          | 输入组件名（对应组件表里的 key） |
| x-component-props                    | 输入组件 props                   |
| x-decorator                          | 装饰组件名                       |
| x-decorator-props                    | 装饰组件 props                   |
| x-validator                          | 校验规则                         |
| x-reactions                          | 联动                             |
| x-pattern                            | 交互模式                         |
| x-display                            | 展示状态                         |
| x-visible / x-hidden / x-disabled 等 | 状态快捷写法                     |
| x-index                              | 排序                             |
| x-data                               | 自定义扩展数据                   |

`{{ }}` 模板语法用于在协议里写表达式，例如 `"{{ $form.values.name }}"`。表达式里可以访问内置作用域变量：`$self`（当前字段）、`$form`（表单）、`$values`（表单值）、`$deps`（依赖）、`$record`（数组项）等。

## 10. 接入第三方组件库

Formily 通过 `connect` 把任意第三方组件适配成字段组件。以 antd 的 Input 为例，@formily/antd 内部大致是这样：

```tsx
import { connect, mapProps, mapReadPretty } from "@formily/react";
import { Input } from "antd";
import { PreviewText } from "../preview-text";

export const FormilyInput = connect(
  Input,
  mapProps((props, field) => {
    return {
      ...props,
      // 把字段的校验状态映射成组件的 status
    };
  }),
  mapReadPretty(PreviewText.Input),
);
```

三个高阶函数的作用：

- `connect`：适配入口，把普通组件包成可被字段识别的组件，转发 ref、提升静态属性。
- `mapProps`：把字段状态映射成组件 props，例如把 field 的 loading、错误状态同步给组件。
- `mapReadPretty`：当字段处于 readPretty 态时，切换到纯展示组件（如把输入框换成文本）。

## 11. 常用 API 速查

表单实例（form）：

- `createForm(options)`：创建表单
- `form.values`：表单所有值（响应式对象）
- `form.setValuesIn(path, value)` / `form.getValuesIn(path)`：按路径读写值
- `form.setFieldState(path, callback)`：修改字段状态
- `form.query(path)`：查询字段，返回 Query 对象，可链式 `.value()` / `.take()`
- `form.validate()`：触发全表单校验
- `form.submit()`：提交，先校验再回调
- `form.reset()`：重置

字段实例（field）：

- `field.value` / `field.setValue(v)`
- `field.onInput(v)`：模拟输入（会触发校验和联动）
- `field.query(path)`：相对当前字段查询
- `field.selfErrors`：自身校验错误
- `field.setState(callback)` / `field.getState()`

hooks（@formily/react）：

- `useForm()`：取当前 form
- `useField()`：取当前字段模型
- `useFormEffects(effects)`：在组件里注册 effects
- `observer(Component)`：把组件变成响应式，读到的 observable 变化会自动重渲染

---

# 第二部分 原理解析

## 12. 整体架构与分层

Formily 的分层可以用一句话概括：用响应式引擎驱动一个框架无关的表单模型，再由视图绑定层把模型渲染成 UI。

```
UI 组件库 (@formily/antd 等)
        |
视图绑定层 (@formily/react)  <-- 协议驱动 (@formily/json-schema)
        |
领域模型层 (@formily/core)
        |
响应式引擎 (@formily/reactive) + 路径 (@formily/path) + 校验 (@formily/validator) + 工具 (@formily/shared)
```

这套分层带来两个关键收益：

1. core 与 React/Vue 无关，同一套模型可同时服务两个框架。
2. 响应式做到「精确更新」：只有真正读取了某个值的组件，才会在那个值变化时重渲染，避免整表重渲染。

## 13. 响应式引擎 @formily/reactive

这是整个 Formily 性能与联动能力的基石。它本质上是一个精简版 MobX，核心 API 有 observable、autorun、reaction、batch、action、computed、Tracker。

### 13.1 observable：把对象变成响应式

`createObservable`（packages/reactive/src/internals.ts:42）用 ES6 Proxy 包裹目标对象：

```ts
const proxy = new Proxy(target, baseHandlers);
```

它维护两张映射表：`ProxyRaw`（proxy 到原始对象）和 `RawProxy`（原始对象到 proxy），保证同一个对象始终对应同一个 proxy。

关键设计是「懒代理」：嵌套对象不会在初始化时一次性全部代理，而是在第一次被 `get` 访问时才创建子 proxy（packages/reactive/src/handlers.ts:181-188）。这避免了深层对象的初始化开销。

并非所有对象都会被代理。`isSupportObservable`（packages/reactive/src/externals.ts:32-62）会排除 React 元素、Moment 对象、以及自带 toJS/toJSON 方法的对象，防止把不该响应的东西也代理了。

### 13.2 依赖收集（track）

当代码读取 proxy 的某个属性时，Proxy 的 `get` 拦截器会调用 `bindTargetKeyWithCurrentReaction`（packages/reactive/src/reaction.ts:99）。

这个函数做两件事：

1. 从全局的 `ReactionStack`（一个栈）取出栈顶的 reaction——也就是「当前正在执行的副作用函数」。
2. 在依赖表 `RawReactionsMap` 里记录「target 的 key 被这个 reaction 依赖了」，同时反向记录到 reaction 自己的 `_reactionsSet`。

依赖表的结构是：

```
RawReactionsMap: WeakMap<target, Map<key, ArraySet<Reaction>>>
```

即「目标对象 -> (属性名 -> 依赖它的 reaction 集合)」。用 WeakMap 是为了让 target 被回收时依赖表也能释放，避免内存泄漏。ArraySet 是一个去重数组（packages/reactive/src/array.ts:9）。

这种「正向 target->reactions、反向 reaction->targets」的双向绑定，使得：触发更新时能从 target 快速找到所有 reaction；reaction 重跑或销毁时能从自身快速解绑旧依赖。

### 13.3 触发更新（trigger）

当代码写入 proxy 的某个属性时，Proxy 的 `set` 拦截器会调用 `runReactionsFromTargetKey`（packages/reactive/src/reaction.ts:128），从依赖表里查出所有依赖这个 key 的 reaction，然后分发执行（reaction.ts:71-93）：

- 如果是 computed，标记为脏（不立即重算）。
- 如果当前处于 batch 中，把 reaction 放进待执行队列，等 batch 结束统一执行。
- 否则立即执行。

### 13.4 autorun 与动态依赖

`autorun`（packages/reactive/src/autorun.ts:19）创建一个 reaction 并立即执行一次。每次重跑前，它会先 `releaseBindingReactions`（reaction.ts:150）清空上一次收集的依赖，再重新执行函数体收集新依赖。

这个「先清空再收集」的机制实现了动态依赖：如果函数里有 `if (a) { read b } else { read c }`，那么当 a 变化导致走另一条分支时，依赖会自动从 b 切换到 c，不再被 b 的变化触发。

### 13.5 batch 与 action

`batch`（packages/reactive/src/batch.ts:12）用引用计数 `BatchCount`（reaction.ts:180-193）实现批处理：在 batch 内的多次同步修改，触发的 reaction 会先入队，等计数归零时统一 flush 一次。这避免了「改三个字段触发三次渲染」。

`action`（packages/reactive/src/action.ts:12）等于 batch 加 untrack：内部的读取不收集依赖、写入做批处理。对应 MobX 的 action 语义，用于封装一组修改操作。

### 13.6 computed

computed（packages/reactive/src/annotations/computed.ts:70-155）本身也是一个 reaction，但带两个特性：

- 惰性加缓存：用 `_dirty` 标记，只有脏的时候才重新计算，否则返回缓存值。
- 标脏传播：当 computed 的依赖变化时，不立即重算，而是把自己标脏，并向所有「消费了这个 computed 的 reaction」传播失效（computed.ts:97-102）。

此外还有 GC 机制：当一个 computed 没有任何消费者时，`suspendComputedReactions`（reaction.ts:161）会 dispose 它，防止泄漏。

### 13.7 全局数据结构一览

所有全局单例都定义在 packages/reactive/src/environment.ts:5-19：

| 名称                      | 作用                             |
| ------------------------- | -------------------------------- |
| RawReactionsMap           | 依赖表（dep map）                |
| ReactionStack             | 正在收集依赖的 reaction 栈       |
| BatchCount / UntrackCount | 批处理 / 取消追踪计数器          |
| PendingReactions          | batch 期间待执行的 reaction 队列 |

## 14. 响应式如何接入 React

@formily/reactive-react 负责把上面的响应式引擎接到 React 的渲染流程里。核心是 `observer` 高阶组件。

### 14.1 Tracker：桥梁

`Tracker`（packages/reactive/src/tracker.ts:11-47）是一个可复用、可销毁的 reaction 容器。它的 `track(view)` 方法会把自己入栈、执行传入的渲染函数 view、收集依赖、出栈。当依赖变化时，触发构造时传入的 scheduler 回调。

### 14.2 observer 的工作闭环

`observer`（packages/reactive-react/src/observer.ts:6）包裹组件，内部用 `useObserver`（useObserver.ts:6）：

1. 创建一个 `Tracker`，scheduler 设为 `forceUpdate`。
2. 渲染时调用 `tracker.track(view)`，在追踪状态下执行真正的渲染函数。
3. 渲染过程中读取的所有 observable 被收集为依赖。
4. 任一依赖变化 -> Tracker 的 scheduler 触发 -> forceUpdate -> 组件重渲染 -> 重新收集依赖。

这就形成了「渲染即收集、变化即重渲染」的闭环，且只重渲染真正读到变化数据的组件。

### 14.3 并发模式与 StrictMode 兼容

`useForceUpdate`（packages/reactive-react/src/useForceUpdate.ts:9-57）用 `setState([])` 强制刷新，并用模块级的 `RENDER_COUNT` / `RENDER_QUEUE` 处理 React 18 ConcurrentMode 下多组件并发渲染的问题（渲染中入队、结束统一 flush），同时兼容 StrictMode 的双渲染。

`useCompatFactory` 配合 `GarbageCollector`（gc.ts:10）用 `FinalizationRegistry` 在 React 跳过 unmount 时仍能 dispose Tracker，防止内存泄漏。

## 15. 核心模型层 @formily/core

core 是框架无关的表单领域模型。入口 src/index.ts 只有几行 re-export，真正的实现在 models/ 和 shared/ 下。

### 15.1 模型继承结构

```
BaseField (models/BaseField.ts)
  ├── Field (models/Field.ts)
  │     ├── ArrayField (models/ArrayField.ts)
  │     └── ObjectField (models/ObjectField.ts)
  └── VoidField (models/VoidField.ts)
```

Form 模型（models/Form.ts）持有一张 `fields` 表，登记所有字段。

### 15.2 最核心的设计：值不存在字段上

这是理解 core 的关键。字段的 `value` 并不是存在字段对象上的独立属性，而是一个 computed，投影自 `form.values`（packages/core/src/models/Field.ts:326-328）。

也就是说，`form.values` 是唯一数据源（single source of truth），每个字段的 value 只是「从 form.values 里按路径取出来的那个值」的响应式投影。这样做的好处：

- 表单值天然是一棵完整的对象树，序列化（form.values）即得完整数据。
- 字段值与表单值永远一致，不存在同步问题。
- 借助响应式 computed，字段值变化能精确通知到读取它的组件。

### 15.3 状态如何变成响应式

core 用 @formily/reactive 的 `define()` 把模型属性标注为不同类型（Form.ts:122-166、Field.ts:134-218）：

- `observable.ref`：可观察的引用属性（如 values、errors）。
- `computed`：计算属性（如字段的 value）。
- `action`：方法（如 setValue、onInput），内部自动 batch。

`setState` / `getState` 经过 serialize/deserialize（shared/internals.ts:613-654），会跳过 Reserved（保留）和 ReadOnly（只读）属性。

### 15.4 生命周期与事件系统

事件分发链路是：`field.notify -> form.notify -> heart.publish`（models/Heart.ts:52）。Heart 把事件分发给所有注册的 LifeCycle 处理器和 subscribe 订阅者。

effect 钩子（如 onFieldValueChange、onFieldInit）的实现靠 `createEffectHook` 加 `runEffects`（shared/effective.ts）。其机制是：在「收集期」把 effects 函数里调用的 `onXxx()` 收集成一组 LifeCycle 监听器，挂载到 heart 上。

生命周期类型定义在 types.ts 的 LifeCycleTypes 枚举里，涵盖表单和字段的挂载、卸载、值变化、校验、提交等各阶段。

### 15.5 校验如何触发与执行

校验入口是 `batchValidate`（packages/core/src/shared/internals.ts:894），它并发执行各字段的 `validateSelf`（:944），后者调用 `validateToFeedbacks`（Field.ts:305）请求 @formily/validator 做实际校验，把结果写入 `field.feedbacks`。

`shouldValidate`（:883）会按字段的 pattern 和 display 做白名单过滤——比如隐藏（display=none）或只读的字段通常不参与校验。

### 15.6 联动机制

字段级联动：字段的 `reactions` 属性经 `createReactions`（internals.ts:1062）包进一个 autorun。autorun 执行时读取了哪些 observable，就建立了对它们的依赖，那些值变化时 reaction 自动重跑。

跨字段联动：`onFieldReact`（基于 autorun）和 `onFieldChange`（基于 reaction）是两个常用 effect。前者持续追踪依赖、自动重跑；后者监听特定字段的特定变化。

本质上，Formily 的联动不需要「手动订阅-手动通知」，而是借响应式的自动依赖追踪，让「读取即订阅」自然发生。

## 16. 路径系统 @formily/path

表单字段构成一棵树，每个字段在树中有位置。@formily/path 的 Path 类负责解析、匹配、访问这些路径。

### 16.1 架构：三段式

Path 的实现是一个小型语言处理器（packages/path/src/）：

1. 词法分析器（tokenizer）：把路径字符串切成 token。
2. 递归下降解析器（parser.ts）：把 token 解析成语法树，支持通配符 `*`、`**`、`*(a,b)`、`*(!a)`、`*[0:10]` 等（parser.ts:211-477）。
3. 树匹配器（matcher）：在字段树上做匹配，并用 matchScore 计分（index.ts:410）。

为性能考虑，Path 有解析快速通道（index.ts:159）和全局缓存（index.ts:533），常见路径不必重复解析。

### 16.2 核心方法

- `match`（index.ts:410）：判断路径是否匹配某模式，支持通配符。
- `includes`（index.ts:368）：前缀包含判断。
- `matchAliasGroup`（index.ts:461）：相交语义（包内无同名 intersect）。
- `getIn` / `setIn` / `deleteIn` / `existIn`：按路径读写嵌套数据，配合解构（destructor.ts）。

### 16.3 双轨制：address 与 path

这是 core 里一个容易混淆但极其重要的设计。每个字段有两个「路径」：

- address：字段在字段树中的节点地址，包含 VoidField。
- path：数据的真实路径，剔除 VoidField。

举例：一个布局 VoidField 名为 layout，其下有个字段 username。那么 username 的 address 是 `layout.username`，但 path 是 `username`（因为 layout 不产生数据）。

`buildDataPath`（packages/core/src/shared/internals.ts:109-142）负责构建 path，`form.indexes` 存了 path 到 address 的反查表。数组增删项时，`spliceArrayState` 会迁移子字段的 address。

理解双轨制能解释很多现象：为什么布局容器不影响数据结构、为什么数组项移动后字段状态能跟着走。

## 17. 校验系统 @formily/validator

### 17.1 主流程

`validate`（packages/validator/src/validator.ts:18）是入口，它按校验类型分桶，并支持 validateFirst（遇到第一个错误即停）。

规则解析有一条优先级链（parser.ts）：required 优先处理，自定义 validator 最后处理。

### 17.2 内置规则与别名

内置规则表在 rules.ts:46，别名映射在 rules.ts:157。涵盖 required、各类 format、pattern、长度与数值范围等。

### 17.3 注册表 API

`registerValidateRules`、`registerValidateLocale` 等注册 API 在 registry.ts:98-122。自定义规则、自定义消息模板、多语言文案都通过注册表扩展。

### 17.4 国际化与消息模板

locale.ts 处理多语言，`getISOCode` 做语言码模糊匹配。template.ts 实现 `{{var}}` 插值，把校验上下文（如最大值、实际值）填进错误消息。

## 18. React 绑定层 @formily/react

这一层把 core 模型渲染成 React 组件。它的 index.ts:1 直接 `export * from '@formily/json-schema'`，所以 React 包同时是协议包的消费者和再导出者。

### 18.1 Context：模型绑定的骨架

所有 React Context 定义在 packages/react/src/shared/context.ts:17-25，关键的有两个：

- `FormContext`：持有 core 的 Form 实例。
- `FieldContext`：持有当前 Field 模型。

绑定原理：字段组件创建模型后，用 `FieldContext.Provider value={field}` 向下传递，嵌套字段就形成了父子字段树。`useForm()` 和 `useField()` 本质就是 `useContext(FormContext)` 和 `useContext(FieldContext)`（hooks/useForm.ts:5、useField.ts:5）。

`ContextCleaner`（context.ts:9-15）在 FormProvider 处把子级 Context 重置为 undefined，防止跨表单泄漏。

### 18.2 字段组件

Field/ArrayField/ObjectField/VoidField 四个组件结构一致，区别只在调用 core 的不同工厂方法（createField / createArrayField / createObjectField / createVoidField）。以 Field 为例（components/Field.tsx:7-24）：

1. `useForm()` 取 form，`useField()` 取父字段。
2. `form.createField({ basePath: parent?.address, ...props })` 创建模型，basePath 自动拼成地址树。
3. 用 `FieldContext.Provider` 注入模型，渲染 `ReactiveField`。

### 18.3 ReactiveField：真正的渲染引擎

`ReactiveField`（components/ReactiveField.tsx:36-115）被 `observer` 包裹（:113-115），所以是响应式的。渲染流程：

1. 若 `field.display !== 'visible'`，返回 null（:46）。
2. `getComponent`（:48-52）：若 componentType 是字符串，从 `SchemaComponentsContext` 注册表解析出真实组件。
3. `renderComponent`（:66-106）：构造受控 props——value 取 `field.value`，onChange 包装成 `field.onInput()` 加原回调（:69-74），onFocus/onBlur 同理转发，disabled/readOnly 由 `field.pattern` 推导（:87-92）。
4. `renderDecorator`（:54-64）：有 decoratorType 时，把 component 作为 children 外包一层。
5. 最终 `renderDecorator(renderComponent())`（:108）——装饰器在外、组件在内。`toJS` 把响应式 proxy 转成普通 JS 再传给组件。

### 18.4 connect / mapProps / mapReadPretty

定义在 shared/connect.ts：

- `connect`（:70-87）：适配入口，用 `args.reduce` 依次应用 mapper，`forwardRef` 转发 ref，`hoistNonReactStatics` 提升静态属性。
- `mapProps`（:9-45）：把字段状态映射成组件 props，支持函数式 `mapper(props, field)` 或对象式映射（用 FormPath.getIn 取字段路径）。整体被 `observer({ forwardRef: true })` 包裹，所以映射是响应式的。
- `mapReadPretty`（:47-68）：`field.pattern === 'readPretty'` 时切换到纯展示组件。

### 18.5 SchemaField 与 createSchemaField

`createSchemaField(options)`（components/SchemaField.tsx:29-198）是工厂，返回绑定了组件注册表的 SchemaField。

主组件（:32-68）把普通 JSON 包成 Schema 实例，建立三个 Context：`SchemaComponentsContext`（组件表）、`ExpressionScope`（表达式作用域）、`SchemaOptionsContext`，然后交给 `RecursionField` 递归渲染。

Markup 模式（:72-195）：不传 schema 而用 JSX 子元素时，用 `createPortal` 渲染到一个离屏 div（shared/render.ts:10），仅触发收集逻辑把 JSX props 收集进 schema 树。工厂还会生成 `SchemaField.String/Object/Array` 等类型化子组件（:116-195）。

`RecursionField`（components/RecursionField.tsx:30-139）：调用 `schema.toFieldProps({ scope })`（:15-20，进入 json-schema 层的桥梁），按 `schema.type` 选择 ObjectField/ArrayField/VoidField/Field，`renderProperties`（:57-106）按 `x-index` 排序递归渲染子 schema。

## 19. 协议驱动层 @formily/json-schema

### 19.1 Schema 类

`Schema` 类（packages/json-schema/src/schema.ts）的成员包括标准 JSON Schema 字段加 Formily 扩展（:148-186）：x-index、x-pattern、x-display、x-validator、x-decorator(-props)、x-component(-props)、x-reactions、x-content/x-data/x-value、x-visible/x-hidden/x-disabled/x-editable/x-read-only/x-read-pretty、x-compile-omitted 等。

关键方法：

- `fromJSON`（:486-519）：分派 properties/items/$ref 到对应 setter，先经 `reducePatches` 做版本兼容，`$ref`经`findDefinitions`（:368-372）按 `#/` 路径解析。
- `compile`（:472-484）：编译表达式，非嵌套键深编译、嵌套键浅编译。
- `getOrderProperties`（:567-583）：按 x-index 排序。
- `toFieldProps`（:561-565）：委托 `transformFieldProps`，是 Schema 转 Field 的入口。

### 19.2 扩展属性如何变成字段状态

映射表在 shared.ts：

- `SchemaStateMap`（:20-43）：x-* 到 field state 的映射，如 `x-component -> componentType`、`x-decorator -> decoratorType`、`x-visible -> visible`、`default -> initialValue`、`enum -> dataSource`。ReactiveField 读取的正是这些 state。
- `SchemaValidatorMap`（:45-62）：标准校验关键字（required/format/maxLength/maximum/pattern 等）经 `setValidatorRule`（:208-211）写入。
- `patchStateFormSchema`（:190-214）：编译后按映射表写入 field state，枚举经 `createDataSource`（:177-188）转成 `{label, value}`。

### 19.3 transformer：转换几乎全靠 reactions

这是协议层最深刻的洞察。`transformFieldProps`（packages/json-schema/src/transformer.ts:267-277）返回的 fieldProps 几乎只有 `{ name, reactions }`。也就是说，Schema 到 Field 的状态转换，不是「一次性赋值」，而是「注册一批 reactions，在字段初始化和变化时持续把 x-* 刷进 state」。

- `getBaseReactions`（:200-210）：内置 reaction，把整个 schema 编译后同步到 state（demand 按需）。
- `getUserReactions`（:212-265）：解析 `x-reactions`。先 `shallowCompile`（:220）；若结果是函数则直接调用（:222-224）；若是对象协议 `{when, fulfill, otherwise, target, effects, dependencies}`，则用 `getDependencies`（:59-92，支持 `'field#path'` 语法）解析依赖，`shallowCompile(when)` 求值条件决定走 fulfill 还是 otherwise，再由 `setSchemaFieldState` 执行。
- `setSchemaFieldState`（:94-147）：`request.state` 走 patchCompile、`request.schema` 走 patchSchemaCompile、`request.run` 包成 `{{function(){...}}}` 执行；target 模式会注入 `$target`。
- `getBaseScope`（:149-198）：内置作用域变量 `$self/$form/$values/$record/$records/$index/$lookup/$observable/$effect/$memo/$props`。

### 19.4 表达式编译器：{{ }} 如何执行

核心在 packages/json-schema/src/compiler.ts:20-36。正则 `ExpRE = /^\s*\{\{([\s\S]*)\}\}\s*$/` 匹配整段 `{{ }}`，编译器用：

```js
new Function("$root", "with($root) { return (expression); }")(scope);
```

`with` 语句把 scope 的所有属性变成局部变量，所以 `{{ $values.name }}`、`{{ $self.value * 2 }}` 能直接访问作用域里的变量。silent 模式下求值失败会静默返回 undefined。

`registerCompiler`（:42-48）允许替换默认编译器（例如换成安全沙箱，避免 `with` 的安全隐患）。`shallowCompile`（:50-60）只编译整段匹配 `{{ }}` 的字符串；`compile`（:62-94）深编译，递归数组/对象叶子，用 seenObjects 防循环。

作用域链路：`createSchemaField({scope})` 或 `<SchemaField scope>` -> `ExpressionScope` 合并进 Context -> `useFieldProps` 传给 `toFieldProps({scope})` -> `getBaseScope` 用 lazyMerge 合并用户 scope 与内置变量（transformer.ts:161-197）-> 作为 `$root` 传入 `with`。

## 20. 一次输入的完整数据流

把前面所有层串起来，看用户在 Input 里敲一个字符时发生了什么：

1. 视图层：`<SchemaField schema={json}/>`，schema 含 `x-component: 'Input'`。
2. SchemaField 把 JSON 包成 Schema 实例，建立组件表和作用域 Context，交给 RecursionField。
3. RecursionField 调 `schema.toFieldProps({scope})`，transformFieldProps 返回 `{name, reactions}`。
4. 按 `schema.type` 选择 Field/ObjectField/ArrayField/VoidField。
5. Field 调 `form.createField()` 创建模型并注册 reactions；初始化时 base reaction 把 `x-component -> componentType` 刷入 state。
6. ReactiveField（被 observer 包裹）读取 componentType，从注册表解析出真实 Input，构造 value/onChange 受控渲染。
7. 用户输入 -> 触发 onChange -> 调用 `field.onInput(value)`。
8. core 在 action（batch）中更新 form.values 上对应路径的值（observable 写入）。
9. 字段的 value（computed 投影自 form.values）随之失效，observer 追踪到依赖变化，触发该字段组件重渲染。
10. 若有 x-reactions 依赖这个值，core 触发对应 field effect，run() 编译表达式、更新目标字段 state，目标字段随之重渲染。
11. 若配置了校验，onInput 还会触发 validateSelf，validator 计算结果写入 field.feedbacks，错误提示组件因读到 feedbacks 而更新。

整条链路里，只有真正读取了变化数据的组件会重渲染，其余组件不受影响——这正是响应式精确更新的体现。

## 21. 关键设计思想总结

1. 分层与框架无关：core 是纯 JS 领域模型，靠响应式与视图解耦，同一模型可服务 React 和 Vue。

2. 唯一数据源：字段 value 不独立存储，而是 computed 投影自 form.values。表单值天然是一棵完整对象树，序列化即得完整数据。

3. 响应式精确更新：用 Proxy 做依赖收集与触发，配合 observer，实现「读取即订阅、变化即局部重渲染」，避免整表重渲染，这是 Formily 性能的根本来源。

4. 读取即订阅的联动：联动不靠手动订阅通知，而靠 autorun 的自动依赖追踪。函数里读到哪个值，就自动订阅哪个值，依赖还能随分支动态切换。

5. 协议驱动：用 JSON Schema 加 x-* 扩展描述表单，Schema 到 Field 的转换通过 reactions 持续同步而非一次性赋值，使协议能响应运行时变化。表达式用 `new Function + with` 在作用域里求值。

6. 路径双轨制：address（字段树地址，含 VoidField）与 path（数据真实路径，剔除 VoidField）分离，使布局与数据解耦，数组项迁移时字段状态能正确跟随。

7. 批处理与性能：batch/action 用引用计数把多次同步修改合并为一次更新；computed 惰性求值加缓存加标脏传播；Path 有解析缓存；嵌套对象懒代理。这些共同支撑大型表单的流畅体验。

---

附：关键源码文件索引

| 关注点                          | 文件                                                                       |
| ------------------------------- | -------------------------------------------------------------------------- |
| 响应式 Proxy 与懒代理           | packages/reactive/src/internals.ts, handlers.ts                            |
| 依赖收集与触发                  | packages/reactive/src/reaction.ts                                          |
| 全局数据结构                    | packages/reactive/src/environment.ts                                       |
| computed                        | packages/reactive/src/annotations/computed.ts                              |
| React 接入                      | packages/reactive-react/src/observer.ts, useObserver.ts, useForceUpdate.ts |
| Tracker 桥梁                    | packages/reactive/src/tracker.ts                                           |
| Form 模型                       | packages/core/src/models/Form.ts                                           |
| Field 模型与 value 投影         | packages/core/src/models/Field.ts                                          |
| core 内部工具（路径/校验/联动） | packages/core/src/shared/internals.ts                                      |
| 事件分发                        | packages/core/src/models/Heart.ts                                          |
| Path 解析与匹配                 | packages/path/src/index.ts, parser.ts, matcher.ts                          |
| 校验主流程                      | packages/validator/src/validator.ts, parser.ts, rules.ts                   |
| React Context                   | packages/react/src/shared/context.ts                                       |
| 字段渲染引擎                    | packages/react/src/components/ReactiveField.tsx                            |
| connect/mapProps/mapReadPretty  | packages/react/src/shared/connect.ts                                       |
| SchemaField 工厂                | packages/react/src/components/SchemaField.tsx                              |
| Schema 递归渲染                 | packages/react/src/components/RecursionField.tsx                           |
| Schema 类                       | packages/json-schema/src/schema.ts                                         |
| 表达式编译                      | packages/json-schema/src/compiler.ts                                       |
| reactions 转换引擎              | packages/json-schema/src/transformer.ts                                    |
| 状态映射表                      | packages/json-schema/src/shared.ts                                         |
