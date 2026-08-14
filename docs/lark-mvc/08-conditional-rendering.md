---
title: 条件渲染
description: Lark Mvc 模板中的条件渲染语法，包括 if/else if/else 的编译原理、嵌套条件与循环组合使用
---

# 条件渲染

Lark Mvc 模板提供了 `{{if}}`、`{{else if}}`、`{{else}}`、`{{/if}}` 控制流语法，用于根据数据条件决定渲染哪些 DOM 片段。条件表达式在编译阶段被转换为标准的 JavaScript `if/else` 语句块。

## 基本语法

```html
{{if condition}}
<!-- condition 为真时渲染 -->
{{else if otherCondition}}
<!-- otherCondition 为真时渲染 -->
{{else}}
<!-- 以上条件均不满足时渲染 -->
{{/if}}
```

### 简单示例

```html
<div class="message">
  {{if status === 'loading'}}
  <span class="spinner">加载中...</span>
  {{else if status === 'error'}}
  <span class="error">加载失败：{{=errorMsg}}</span>
  {{else}}
  <span class="success">加载完成</span>
  {{/if}}
</div>
```

## 编译原理

条件渲染的编译由 `convertArtExpression` 函数处理（位于 `src/compiler/template-syntax.ts`）。模板中的 `{{if}}` 语法被转换为内部的 `<% %>` 代码块语法，最终编译为 JavaScript 的 `if/else` 语句。

### 编译流程

```
{{if count > 0}}
  有 {{=count}} 条记录
{{else}}
  暂无记录
{{/if}}
```

**第一步：`convertArtSyntax` 将 `{{ }}` 转换为 `<% %>`**

`convertArtExpression` 对 `if` 关键字的处理：

```ts
case "if": {
  blockStack.push({ ctrl: "if", line: lineNo });
  const rawExpr = tokens.join(" ").trim();
  const expr = trimOuterParens(rawExpr);
  return `${debugPrefix}<%if(${expr}){%>`;
}
```

对 `else` / `else if` 的处理：

```ts
case "else": {
  if (tokens[0] === "if") {
    tokens.shift(); // 消费 "if"
    const rawExpr = tokens.join(" ").trim();
    const expr = trimOuterParens(rawExpr);
    return `${debugPrefix}<%}else if(${expr}){%>`;
  }
  return `${debugPrefix}<%}else{%>`;
}
```

对关闭标签 `/if` 的处理：

```ts
case "/if": {
  const expectedCtrl = keyword.substring(1); // "/if" → "if"
  const last = blockStack.pop();
  if (!last) {
    throw new Error(`Unexpected {{${code}}}: no matching open block`);
  }
  if (last.ctrl !== expectedCtrl) {
    throw new Error(
      `Unexpected {{${code}}}: expected {{/${last.ctrl}}} to close block opened at line ${last.line}`,
    );
  }
  return `${debugPrefix}<%}%>`;
}
```

**第二步：转换结果**

```
{{if count > 0}}    →  <%if(count > 0){%>
{{else}}            →  <%}else{%>
{{/if}}             →  <%}%>
```

**第三步：`compileToFunction` 将 `<% %>` 编译为 JS**

最终生成的模板函数（字符串模式，简化）：

```js
(
  __lark_data__,
  __lark_view_id__,
  __lark_ref_alt__,
  __lark_enc_html__,
  __lark_str_safe__,
  __lark_ref_fn__,
) => {
  let __lark_out__ = "";
  let count = __lark_data__.count;

  if (count > 0) {
    __lark_out__ += "有 " + __lark_enc_html__(count) + " 条记录";
  } else {
    __lark_out__ += "暂无记录";
  }

  return __lark_out__;
};
```

### 括号处理：trimOuterParens

编译器会自动剥离条件表达式外层匹配的括号：

```html
{{if (count > 0)}} → if(count > 0){ {{if ((a > b))}} → if((a > b)){ {{if (a) &&
(b)}} → if((a) && (b)){ ← 内层括号阻止外层剥离
```

源码实现：

```ts
function trimOuterParens(expr: string): string {
  expr = expr.trim();
  while (expr.startsWith("(") && expr.endsWith(")")) {
    let depth = 0;
    let matched = true;
    for (let i = 0; i < expr.length - 1; i++) {
      const c = expr.charAt(i);
      if (c === "(") depth++;
      else if (c === ")") depth--;
      if (depth === 0 && i < expr.length - 1) {
        matched = false;
        break;
      }
    }
    if (!matched) break;
    expr = expr.substring(1, expr.length - 1).trim();
  }
  return expr;
}
```

### 两种 if 语法

编译器支持两种 `if` 写法：

```html
<!-- 空格分隔（推荐） -->
{{if count > 0}}...{{/if}}

<!-- 括号形式（也支持） -->
{{if(count > 0)}}...{{/if}}
```

括号形式由 `ifForMatch` 正则匹配处理：

```ts
const ifForMatch = code.match(/^\s*(if|for)\s*\(/);
if (ifForMatch) {
  const keyword = ifForMatch[1];
  if (keyword === "if") {
    blockStack.push({ ctrl: "if", line: lineNo });
    const rawExpr = expr.replace(/\)\s*$/, "");
    const cleanExpr = trimOuterParens(rawExpr);
    return `${debugPrefix}<%if(${cleanExpr}){%>`;
  }
}
```

## 块匹配验证

编译器维护一个 `blockStack` 栈来验证块的开闭匹配：

- 遇到 `{{if}}`、`{{forOf}}`、`{{forIn}}`、`{{for}}` → 压栈
- 遇到 `{{/if}}`、`{{/forOf}}`、`{{/forIn}}`、`{{/for}}` → 弹栈并验证匹配
- 模板结束时栈非空 → 抛出未关闭块错误

```ts
// 编译结束时的检查
if (blockStack.length > 0) {
  const unclosed = blockStack
    .map((b) => `"${b.ctrl}" at line ${b.line}`)
    .join(", ");
  throw new Error(`Unclosed block(s): ${unclosed}`);
}
```

错误示例：

```html
<!-- ❌ 编译报错：Unclosed block(s): "if" at line 1 -->
{{if show}}
<div>内容</div>
<!-- 缺少 {{/if}} -->
```

```html
<!-- ❌ 编译报错：Unexpected {{/forOf}}: expected {{/if}} to close block -->
{{if show}} {{forOf list as item}}
<span>{{=item}}</span>
{{/if}} {{/forOf}}
```

## 嵌套条件

条件块可以自由嵌套：

```html
{{if user}}
<div class="profile">
  <h2>{{=user.name}}</h2>
  {{if user.isVip}}
  <span class="badge gold">VIP</span>
  {{if user.vipLevel >= 5}}
  <span class="badge diamond">钻石会员</span>
  {{else}}
  <span class="badge">普通会员</span>
  {{/if}} {{else}}
  <span class="badge free">免费用户</span>
  {{/if}}
</div>
{{else}}
<div class="login-prompt">
  <a href="/login">请先登录</a>
</div>
{{/if}}
```

编译后生成嵌套的 `if/else` 语句：

```js
if (user) {
  __lark_out__ +=
    '<div class="profile"><h2>' + __lark_enc_html__(user.name) + "</h2>";
  if (user.isVip) {
    __lark_out__ += '<span class="badge gold">VIP</span>';
    if (user.vipLevel >= 5) {
      __lark_out__ += '<span class="badge diamond">钻石会员</span>';
    } else {
      __lark_out__ += '<span class="badge">普通会员</span>';
    }
  } else {
    __lark_out__ += '<span class="badge free">免费用户</span>';
  }
  __lark_out__ += "</div>";
} else {
  __lark_out__ +=
    '<div class="login-prompt"><a href="/login">请先登录</a></div>';
}
```

## 与 forOf 组合使用

条件渲染常与列表渲染组合：

### 在循环内部使用条件

```html
<ul class="list">
  {{forOf items as item idx}}
  <li class="{{=idx % 2 === 0 ? 'even' : 'odd'}}">
    {{=item.name}} {{if item.isNew}}
    <span class="tag new">NEW</span>
    {{/if}} {{if item.discount > 0}}
    <span class="price original">¥{{=item.price}}</span>
    <span class="price sale">¥{{=item.price * (1 - item.discount)}}</span>
    {{else}}
    <span class="price">¥{{=item.price}}</span>
    {{/if}}
  </li>
  {{/forOf}}
</ul>
```

### 在条件内部使用循环

```html
{{if categories.length > 0}}
<div class="category-grid">
  {{forOf categories as cat}}
  <div class="category-card">
    <h3>{{=cat.name}}</h3>
    <p>{{=cat.count}} 个商品</p>
  </div>
  {{/forOf}}
</div>
{{else}}
<div class="empty-state">
  <p>暂无分类</p>
</div>
{{/if}}
```

### 空列表判断

```html
{{if list && list.length > 0}}
<table>
  <thead>
    <tr>
      <th>名称</th>
      <th>状态</th>
    </tr>
  </thead>
  <tbody>
    {{forOf list as row}}
    <tr>
      <td>{{=row.name}}</td>
      <td>{{=row.status}}</td>
    </tr>
    {{/forOf}}
  </tbody>
</table>
{{else}}
<div class="empty">暂无数据</div>
{{/if}}
```

## 条件表达式支持

`{{if}}` 中的条件表达式支持所有合法的 JavaScript 表达式：

```html
<!-- 比较运算 -->
{{if count > 0}}...{{/if}} {{if name !== ''}}...{{/if}} {{if score >= 60 &&
score <= 100}}...{{/if}}

<!-- 逻辑运算 -->
{{if isLoggedIn && hasPermission}}...{{/if}} {{if !isEmpty}}...{{/if}} {{if a ||
b || c}}...{{/if}}

<!-- 存在性检查 -->
{{if user && user.name}}...{{/if}} {{if typeof value !== 'undefined'}}...{{/if}}

<!-- 三元表达式（通常用于属性值，而非 if 条件） -->
{{if status === 'active' ? true : false}}...{{/if}}

<!-- 数组/对象检查 -->
{{if items.length > 0}}...{{/if}} {{if Object.keys(config).length >
0}}...{{/if}}
```

## 使用 set 简化复杂条件

对于重复使用的复杂条件，推荐使用 `{{set}}` 预计算：

```html
{{set canEdit = user && user.role === 'admin' && !isLocked}} {{set showBanner =
notifications.length > 0 && !isDismissed}} {{if showBanner}}
<div class="banner">您有 {{=notifications.length}} 条未读通知</div>
{{/if}}

<div class="content">
  {{if canEdit}}
  <button @click="edit()">编辑</button>
  <button @click="delete()">删除</button>
  {{/if}}
  <p>{{=content}}</p>
</div>
```

## Debug 模式

在 debug 模式下（`debug: true`），编译器会为每个条件块插入行号标记，便于运行时错误定位：

```ts
// debug 模式下的 if 编译结果
const debugPrefix =
  debug && lineNo > -1
    ? `<%'${lineNo}\x11${code.replace(/\\|'/g, "\\$&").replace(/\r\n?|\n/g, "\\n")}\x11'%>`
    : "";
return `${debugPrefix}<%if(${expr}){%>`;
```

运行时如果条件表达式抛出异常，错误信息会包含原始模板表达式和行号：

```
render error: Cannot read property 'name' of undefined
	src art:{{if user.name}}
	translate to:<%if(user.name){%>
	at file:./views/home.html
```

## VDOM 模式下的条件渲染

在 VDOM 模式下，条件渲染同样编译为 JS `if/else` 语句，但输出的是 VDOM 节点创建调用而非字符串拼接：

```js
// VDOM 模式编译产物（简化）
let __lark_vdom1__ = [];
if (count > 0) {
  __lark_vdom1__.push(__lark_vdom_create__(0, __lark_str_safe__(count)));
  __lark_vdom1__.push(__lark_vdom_create__(0, " 条记录"));
} else {
  __lark_vdom1__.push(__lark_vdom_create__(0, "暂无记录"));
}
```

VDOM 模式下条件渲染的优势在于：当条件切换时，diff 算法只更新变化的 DOM 节点，而非重新设置整个 innerHTML。

## 最佳实践

| 建议               | 说明                                               |
| ------------------ | -------------------------------------------------- |
| 保持条件表达式简洁 | 复杂逻辑提取到 `{{set}}` 或 store 的计算属性中     |
| 避免深层嵌套       | 超过 3 层嵌套时考虑拆分子模板或预计算              |
| 确保块正确闭合     | 每个 `{{if}}` 必须有对应的 `{{/if}}`，编译器会验证 |
| 优先使用 else if   | 多分支场景用 `{{else if}}` 而非嵌套 `{{if}}`       |
| 注意 falsy 值      | `0`、`''`、`null`、`undefined`、`NaN` 均为 falsy   |
| 条件与循环配合     | 空列表判断放在循环外层，避免渲染空的容器标签       |

## 小结

- `{{if expr}}...{{else if expr}}...{{else}}...{{/if}}` 是条件渲染的核心语法
- 编译为标准的 JavaScript `if/else` 语句块
- 编译器通过 `blockStack` 验证块的开闭匹配
- 支持任意合法的 JavaScript 条件表达式
- 可自由嵌套，也可与 `{{forOf}}`/`{{forIn}}` 组合使用
- Debug 模式提供行号和原始表达式的错误追踪
