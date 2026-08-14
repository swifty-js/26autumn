---
title: 模板语法
description: 全面讲解 Lark Mvc 的模板语法：输出运算符、条件与循环、变量声明、事件绑定，以及从 art 语法到 JS 渲染函数的编译流程。
---

# 模板语法

Lark Mvc 的模板是 `.html` 文件，在**构建期**被编译为 JavaScript 渲染函数。模板使用 `{{ }}`（art-template 风格）语法，支持转义输出、原始输出、引用传递、条件、循环、变量声明与事件绑定。

> 涉及源码：
>
> - 语法转换：`packages/lark-mvc/src/compiler/template-syntax.ts`
> - 编译主管线：`packages/lark-mvc/src/compiler/compile-template.ts`
> - 运行时辅助函数：`packages/lark-mvc/src/runtime.ts`
> - 共享编码函数：`packages/lark-mvc/src/common.ts`

## 输出运算符

模板提供四种输出运算符，区别在于是否转义、以及是否传递对象引用：

| 语法        | 说明                                 | 运行时辅助函数            |
| ----------- | ------------------------------------ | ------------------------- |
| `{{=expr}}` | HTML 转义输出（安全嵌入标记）        | `encHtml`（`encodeHTML`） |
| `{{:expr}}` | 双向绑定（渲染时与 `=` 等价）        | `encHtml`（`encodeHTML`） |
| `{{!expr}}` | 原始输出（不做 HTML 转义，谨慎使用） | `strSafe`                 |
| `{{@expr}}` | 引用查找，用于向子视图传递 JS 对象   | `refFn`                   |

### `{{=expr}}` 转义输出

最常用的输出方式。值会经过 HTML 实体转义（`& < > " ' \`` 分别转为 `&amp;`、`&lt;` 等），防止 XSS：

```html
<p>Hello, {{=name}}</p>
```

底层调用 `encodeHTML`（见 `common.ts`）：

```ts
export function encodeHTML(v: unknown): string {
  return String(v == null ? "" : v).replace(
    HTML_ENT_REGEXP,
    (m: string) => "&" + HTML_ENT_MAP[m] + ";",
  );
}
```

`null` / `undefined` 会被安全地转为空字符串。

### `{{:expr}}` 绑定输出

`{{:expr}}` 用于双向绑定场景，但在**渲染层面与 `{{=expr}}` 完全等价**——编译器对 `=` 与 `:` 生成相同的转义输出代码（见 `compile-template.ts`）：

```ts
} else if (operate === "=" || operate === ":") {
  // : (binding) is treated the same as = (escaped output) for rendering
  funcSource += `'+__lark_enc_html__(${content})+'`;
}
```

### `{{!expr}}` 原始输出

输出未经 HTML 转义的内容，适用于渲染受信任的 HTML 片段。**仅对可信内容使用**，否则有 XSS 风险：

```html
<div class="rich-text">{{!trustedHtml}}</div>
```

底层调用 `strSafe`（null 安全的 `String()`）：

```ts
export function strSafe(v: unknown): string {
  return String(v == null ? "" : v);
}
```

### `{{@expr}}` 引用传递

`{{@expr}}` 不输出值本身，而是为该对象在 `refData` 中登记一个稳定的「引用 token」，并将 token 写入 DOM 属性。事件触发或子视图读取时，再通过 token 还原为原始 JS 值。这是向子视图传递对象/数组/函数的核心机制：

```html
<div
  v-lark="components/list"
  *items="{{@items}}"
  *onSelect="{{@handleSelect}}"
></div>
```

底层调用 `refFn`（见 `common.ts`），它以 `SPLITTER`（U+001E）为前缀生成唯一键：

```ts
export function refFn(
  ref: Record<string, unknown>,
  value: unknown,
  key: string,
): string {
  const counter = ref[SPLITTER] as number;
  for (let i = counter; --i;) {
    key = SPLITTER + i;
    if (ref[key] === value) return key; // 复用已登记的同一引用
  }
  key = SPLITTER + (ref[SPLITTER] as number)++;
  ref[key] = value;
  return key;
}
```

> 选择 U+001E（Record Separator）作为分隔符，是因为它绝不会出现在用户数据中，且在 HTML 属性中安全。

## 条件语句

使用 `{{if}}` / `{{else if}}` / `{{else}}` / `{{/if}}`：

```html
{{if user.isAdmin}}
<div class="admin-panel">Welcome, admin</div>
{{else if user.isEditor}}
<div class="editor-panel">Welcome, editor</div>
{{else}}
<div class="user-panel">Welcome, user</div>
{{/if}}
```

条件表达式两侧的外层括号会被自动剥离（`trimOuterParens`），因此 `{{if (a > b)}}` 与 `{{if a > b}}` 等价。也支持函数式写法 `{{if(condition)}}`。

编译器会维护一个块栈（`blockStack`）校验配对：遇到未闭合的块或错误的闭合标签会抛出明确的编译错误，例如：

```
Unexpected {{/forOf}}: expected {{/if}} to close block opened at line 3
```

## 循环语句

### `{{forOf}}` 数组遍历

基本形式：

```html
{{forOf items as item}}
<div>{{=item.name}}</div>
{{/forOf}}
```

带索引：

```html
{{forOf items as item index}}
<div class="item" id="item-{{=index}}">{{=index}}: {{=item.name}}</div>
{{/forOf}}
```

带 `last` / `first` 辅助变量（注意参数顺序为 `value index last first`）：

```html
{{forOf items as item index last first}}
<div class="{{if first}}first{{/if}}{{if last}}last{{/if}}">{{=item.name}}</div>
{{/forOf}}
```

支持解构：

```html
{{forOf entries as {key, value} index}}
<div>{{=key}}: {{=value}}</div>
{{/forOf}}
```

`as` 之后的四个位置依次为：`value`、`index`、`last`、`first`（见 `parseAsExpr`）。若省略 `index`，编译器会使用内部变量 `_i`。

> 语法校验：`{{forOf list item}}`（缺少 `as`）会报错：
> `Bad forOf syntax: Expected "as" keyword, got "item". Usage: {{forOf list as item [index]}}`

### `{{forIn}}` 对象遍历

```html
{{forIn config as val key}}
<div>{{=key}} = {{=val}}</div>
{{/forIn}}
```

`as` 之后依次为 `value`、`key`。若省略 `key`，使用内部变量 `_k`。

### `{{for(...)}}` 通用循环

支持任意标准 for 循环表达式：

```html
{{for(let i = 0; i < count; i++)}}
<span>{{=i}}</span>
{{/for}}
```

也接受 `{{for(init;test;update)}}` 的紧凑写法。

## 变量声明

使用 `{{set name = expr}}` 在模板内声明局部变量，编译为 `let` 声明：

```html
{{set formattedDate = new Date(date).toLocaleDateString()}}
<p>Date: {{=formattedDate}}</p>
```

## 注释

HTML 注释 `<!-- ... -->` 会在编译前被保护起来（`protectComments`），注释内部的 `{{ }}` 不会被转换，编译完成后再原样恢复（`restoreComments`）。因此可以安全地注释掉模板片段：

```html
<!-- {{=thisWillNotBeCompiled}} -->
```

## 事件绑定

### 基本事件

使用 `@事件名="handler()"` 绑定事件处理器：

```html
<button @click="handleClick()">Click me</button>
```

### 带参数的事件

参数使用 JS 对象字面量书写，编译器会将其转换为 URL 查询参数格式：

```html
<button @click="deleteItem({id: item.id})">Delete</button>
```

转换规则（见 `processViewEvents` 与 `jsObjectToUrlParams`）：

```
@click="handlerName({key: 'value'})" → @click="\x1f\x1ehandlerName(key=value)"
@click="handlerName()"               → @click="\x1f\x1ehandlerName()"
@click="goHome"                      → 不变（无括号 = 非事件处理器）
```

其中 `\x1f`（U+001F）是视图 ID 占位符，渲染时替换为 `'+__lark_view_id__+'`；`\x1e`（SPLITTER）作为分隔符。

### 多事件与修饰符（events map 侧）

注意：多事件与修饰符是 **events map 键名语法**，不是模板属性语法。模板中的事件属性只支持 `@单一事件名="handler(...)"` 形式（`processViewEvents` 的正则是 `/@(\w+)="([^"]+)"/`，`@input,change` 或 `@click<ctrl>` 这样的属性名不会被识别）：

```ts
// 在视图的 events map 中声明：
events: {
  // 多事件绑定：同一处理器响应 input 与 change
  "validate<input,change>": (e) => { /* ... */ },

  // 键盘修饰符：仅对 $window / $document 全局事件生效
  "$document<keydown><ctrl>": (e) => { /* Ctrl 按下时才触发 */ },
}
```

支持的修饰符为 `ctrl`、`shift`、`alt`、`meta`；源码实现中，修饰符过滤仅在 `$window` / `$document` 全局事件的 `registerGlobalEvent` 中执行。

### 组件属性与子视图事件

在 `v-lark` 子视图元素上，使用 `*prop` 传递属性、`@event` 绑定子到父的事件：

```html
<div
  v-lark="components/counter-updater"
  *count="{{=count}}"
  *history="{{@history}}"
  @increment="increment"
  @clearHistory="clearHistory"
></div>
```

| 语法                   | 说明                                 |
| ---------------------- | ------------------------------------ |
| `*prop="{{=expr}}"`    | 传递字符串值（HTML 转义）            |
| `*prop="{{@expr}}"`    | 传递对象/数组引用（经 refData 还原） |
| `@event="handlerName"` | 将子视图事件绑定到父处理器           |

编译期转换（见 `processViewBindings`）：

```
*count="{{=count}}"     → p-lark-count="{{=count}}"
*history="{{@history}}" → p-lark-history="{{@history}}"
@increment="increment"  → e-lark-increment="increment"
```

## 编译流程

模板从 `.html` 源码到可执行的 ES 模块，经历以下阶段（见 `compile-template.ts` 的 `compileTemplate`）：

```
.html source
    |
    +---> extractGlobalVars()  -- 基于 AST 的变量自动检测（对原始源码）
    |
protectComments()      -- 保护 HTML 注释
    |
convertArtSyntax()     -- {{}} → <% %> 内部语法
    |
processViewEvents()    -- @event 属性编码
    |
processViewBindings()  -- *prop / @event 组件绑定
    |
restoreComments()      -- 恢复 HTML 注释
    |
compileToFunction()    -- <% %> → JS 模板函数（字符串模式）
    或
compileToVDomFunction() -- <% %> → VDomNode 树构建器（VDOM 模式）
    |
ES module output       -- export default __lark_template__
```

### 阶段一：art 语法 → 内部 `<% %>` 语法

`convertArtSyntax` 将 `{{ }}` 转换为内部的 `<% %>` 语法。各运算符映射如下：

| art 语法                     | 内部语法                                            |
| ---------------------------- | --------------------------------------------------- |
| `{{=expr}}` / `{{:expr}}`    | `<%=expr%>` / `<%:expr%>`                           |
| `{{!expr}}`                  | `<%!expr%>`                                         |
| `{{@expr}}`                  | `<%@expr%>`                                         |
| `{{if cond}}`                | `<%if(cond){%>`                                     |
| `{{else if cond}}`           | `<%}else if(cond){%>`                               |
| `{{else}}`                   | `<%}else{%>`                                        |
| `{{/if}}` 等                 | `<%}%>`                                             |
| `{{forOf list as item idx}}` | `<%for(let idx=0,...;idx<...;idx++){let item=...%>` |
| `{{set a = b}}`              | `<%let a = b;%>`                                    |

### 阶段二：内部语法 → JS 模板函数

`compileToFunction` 遍历 `<% %>` 块，生成字符串拼接代码：

- `<%=expr%>` / `<%:expr%>` → `__lark_out__+=__lark_enc_html__(expr)`
- `<%!expr%>` → `__lark_out__+=__lark_str_safe__(expr)`
- `<%@expr%>` → `__lark_out__+=__lark_ref_fn__(__lark_ref_alt__,expr)`
- `<%code%>` → 原样作为 JS 语句（if/for/else 块）
- 块之间的纯文本被转义后追加到 `__lark_out__`

最终生成的箭头函数签名为：

```
(__lark_data__,__lark_view_id__,__lark_ref_alt__,__lark_enc_html__,__lark_str_safe__,__lark_ref_fn__) => { ... return __lark_out__ }
```

### 阶段三：变量自动提取

> 注意：`extractGlobalVars` 实际上在管线最前端对**原始源码**执行（见上方流程图），此处作为独立阶段说明其原理。

编译器通过 `extractGlobalVars`（基于 `@babel/parser` 的 AST 分析）自动检测模板中引用的全局变量，并生成解构声明：

```js
let count = __lark_data__.count;
let name = __lark_data__.name;
```

这就是「零配置」变量提取——开发者无需手动声明模板用到的字段。

### 阶段四：模块包装

最终输出一个 ES 模块，运行时辅助函数从 `@mm/lark-mvc/runtime` 导入（而非内联到每个模板，节省体积）：

```js
import { encHtml as __lark_enc_html__, strSafe as __lark_str_safe__, refFn as __lark_ref_fn__ } from "@mm/lark-mvc/runtime";
function __lark_template__(data, viewId, refData) {
  let __lark_data__ = data || {},
      __lark_view_id__ = viewId || '';
  return (/* 编译后的箭头函数 */)(__lark_data__, __lark_view_id__, refData,
    __lark_enc_html__, __lark_str_safe__, __lark_ref_fn__
  );
}
export default __lark_template__;
```

导出的模板函数签名为 `(data, viewId, refData) => string`，由 Updater 在渲染时调用。

### 调试模式

当 `debug: true` 时，编译器会：

- 通过 `addLineMarkers` 为每个 `{{ }}` 块插入行号标记；
- 用 `__lark_dbg_expr__` / `__lark_dbg_art__` 记录当前表达式；
- 用 try-catch 包裹整个函数体，运行时报错时附带原始模板表达式、转换后的代码与文件路径。

错误信息形如：

```
render error: xxx is not defined
	src art:{{=xxx}}
	expr:<%=xxx%>
	at file:src/views/home.html
```

## 运行时辅助函数一览

编译后的模板从 `@mm/lark-mvc/runtime` 导入以下辅助函数（见 `runtime.ts`）：

| 导出       | 说明                                                      |
| ---------- | --------------------------------------------------------- |
| `strSafe`  | null 安全的 `String(value)`，`null`/`undefined` 转为 `""` |
| `encHtml`  | HTML 转义（`encodeHTML`）                                 |
| `encUri`   | 带额外字符转义的 URI 编码（`encodeURIExtra`）             |
| `encQuote` | 为属性字符串内容反斜杠转义引号（`encodeQuote`）           |
| `refFn`    | 为对象值登记/查找稳定的 refData token                     |

## 小结

- Lark Mvc 模板在构建期编译为 JS 渲染函数，运行时无模板解析开销。
- 四种输出运算符 `=` `:` `!` `@` 分别对应转义、绑定、原始、引用传递。
- 控制流支持 `if/else if/else`、`forOf`、`forIn`、通用 `for` 与 `set` 变量声明，并有严格的块配对校验。
- 编译管线为「变量提取（对原始源码）→ 保护注释 → art 转 `<% %>` → 事件/绑定编码 → 恢复注释 → 函数生成 → 模块包装」。
- 变量自动提取基于 AST，实现零配置开发体验。

下一步阅读 [响应式基础](./05-reactivity-fundamentals.md)，理解模板产出的内容如何随数据变化而被高效更新。
