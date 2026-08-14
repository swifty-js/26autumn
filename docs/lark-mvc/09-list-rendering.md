---
title: 列表渲染
description: Lark Mvc 模板中的列表渲染语法，包括 forOf、forIn、for 循环的编译原理、keyed diffing 与性能优化
---

# 列表渲染

Lark Mvc 模板提供了三种循环语法：`{{forOf}}`（数组遍历）、`{{forIn}}`（对象遍历）和 `{{for}}`（通用 for 循环）。它们在编译阶段被转换为高性能的 JavaScript 循环语句。

## forOf：数组遍历

### 基本语法

```html
{{forOf list as item}}
<div>{{=item}}</div>
{{/forOf}}
```

### 带索引

```html
{{forOf list as item idx}}
<div>{{=idx}}. {{=item}}</div>
{{/forOf}}
```

### 带 first/last 辅助变量

```html
{{forOf list as item idx last first}}
<div class="{{=first ? 'first-item' : ''}} {{=last ? 'last-item' : ''}}">
  {{=item.name}}
</div>
{{/forOf}}
```

### 完整参数说明

```
{{forOf <数组表达式> as <元素变量> [索引变量] [last变量] [first变量]}}
```

| 参数位置    | 名称       | 是否必须 | 说明                                                      |
| ----------- | ---------- | -------- | --------------------------------------------------------- |
| 1           | 数组表达式 | 是       | 要遍历的数组（支持 `list`、`data.items`、`getList()` 等） |
| `as` 关键字 | —          | 是       | 分隔符，必须存在                                          |
| 2           | 元素变量   | 否       | 当前元素的变量名                                          |
| 3           | 索引变量   | 否       | 当前索引（默认 `_i`）                                     |
| 4           | last 变量  | 否       | 布尔值，是否为最后一个元素                                |
| 5           | first 变量 | 否       | 布尔值，是否为第一个元素                                  |

### 编译产物

模板：

```html
{{forOf items as item idx last first}}
<li>{{=idx}}: {{=item.name}}</li>
{{/forOf}}
```

编译器（`convertArtExpression` 中 `case "forOf"`）生成的内部代码：

```
<%for(let idx=0,_l=items.length,_lc=_l-1;idx<_l;idx++){let first=idx===0;let last=idx===_lc;let item=items[idx]%>
  <li><%=idx%>: <%=item.name%></li>
<%}%>
```

最终编译为 JavaScript（字符串模式）：

```js
for (let idx = 0, _l = items.length, _lc = _l - 1; idx < _l; idx++) {
  let first = idx === 0;
  let last = idx === _lc;
  let item = items[idx];
  __lark_out__ +=
    "<li>" +
    __lark_enc_html__(idx) +
    ": " +
    __lark_enc_html__(item.name) +
    "</li>";
}
```

### 编译细节

源码中 `forOf` 的编译逻辑：

```ts
case "forOf": {
  blockStack.push({ ctrl: "forOf", line: lineNo });
  const object = tokens[0];

  // 验证 "as" 关键字
  if (tokens.length > 1 && tokens[1] !== "as") {
    throw new Error(
      `Bad forOf syntax: {{${code}}}. ` +
        `Expected "as" keyword, got "${tokens[1]}". ` +
        `Usage: {{forOf list as item [index]}}`,
    );
  }

  const restTokens = tokens.slice(2);
  const asValue = restTokens.join(" ");
  const asExpr = parseAsExpr(asValue);
  const index = asExpr.key || "_i";

  // 复杂表达式（含 . [] 等）需要缓存到临时变量
  const refObj = /[.[\]]/.test(object) ? `_art_obj_${object.replace(/[^\w]/g, "_")}` : object;
  const refExpr = /[.[\]]/.test(object) ? `,${refObj}=${object}` : "";

  // 长度缓存变量 _l
  const refObjCount = "_l";
  const valueDecl = asExpr.vars ? `let ${asExpr.vars}=${refObj}[${index}]` : "";

  // first/last 辅助变量
  let firstAndLast = "";
  let lastCount = "";
  if (asExpr.first) {
    firstAndLast += `let ${asExpr.first}=${index}===0;`;
  }
  if (asExpr.last) {
    lastCount = `,_lc=${refObjCount}-1`;
    firstAndLast += `let ${asExpr.last}=${index}===_lc;`;
  }

  return `${debugPrefix}<%for(let ${index}=0${refExpr},${refObjCount}=${refObj}.length${lastCount};${index}<${refObjCount};${index}++){${firstAndLast}${valueDecl}%>`;
}
```

### 长度缓存（\_l）

编译器使用 `_l` 变量缓存数组长度，避免每次迭代都访问 `.length` 属性：

```js
// 编译产物
for (let idx = 0, _l = items.length; idx < _l; idx++) { ... }
```

这是经典的性能优化模式，对于大列表尤其有效。

### 复杂表达式缓存

当遍历对象不是简单变量名（包含 `.`、`[`、`]`）时，编译器会生成临时变量缓存：

```html
{{forOf data.response.items as item}}
<div>{{=item.name}}</div>
{{/forOf}}
```

编译产物：

```js
for (
  let _i = 0,
    _art_obj_data_response_items = data.response.items,
    _l = _art_obj_data_response_items.length;
  _i < _l;
  _i++
) {
  let item = _art_obj_data_response_items[_i];
  __lark_out__ += "<div>" + __lark_enc_html__(item.name) + "</div>";
}
```

### 解构赋值

`as` 表达式支持解构语法：

```html
{{forOf entries as {key, value} idx}}
<div>{{=key}}: {{=value}}</div>
{{/forOf}}
```

编译产物：

```js
for (let idx = 0, _l = entries.length; idx < _l; idx++) {
  let { key, value } = entries[idx];
  __lark_out__ +=
    "<div>" +
    __lark_enc_html__(key) +
    ": " +
    __lark_enc_html__(value) +
    "</div>";
}
```

## forIn：对象遍历

### 基本语法

```html
{{forIn obj as val key}}
<div>{{=key}}: {{=val}}</div>
{{/forIn}}
```

### 参数说明

```
{{forIn <对象表达式> as <值变量> [键变量]}}
```

| 参数位置    | 名称       | 是否必须 | 说明                    |
| ----------- | ---------- | -------- | ----------------------- |
| 1           | 对象表达式 | 是       | 要遍历的对象            |
| `as` 关键字 | —          | 是       | 分隔符                  |
| 2           | 值变量     | 否       | 当前属性值              |
| 3           | 键变量     | 否       | 当前属性键（默认 `_k`） |

### 编译产物

模板：

```html
{{forIn config as value key}}
<p>{{=key}} = {{=value}}</p>
{{/forIn}}
```

编译结果：

```js
for (let key in config) {
  let value = config[key];
  __lark_out__ +=
    "<p>" + __lark_enc_html__(key) + " = " + __lark_enc_html__(value) + "</p>";
}
```

### 源码实现

```ts
case "forIn": {
  blockStack.push({ ctrl: "forIn", line: lineNo });
  const object = tokens[0];

  if (tokens.length > 1 && tokens[1] !== "as") {
    throw new Error(
      `Bad forIn syntax: {{${code}}}. ` +
        `Expected "as" keyword, got "${tokens[1]}". ` +
        `Usage: {{forIn obj as val [key]}}`,
    );
  }

  const restTokens2 = tokens.slice(2);
  const asValue2 = restTokens2.join(" ");
  const asExpr2 = parseAsExpr(asValue2);
  const key1 = asExpr2.key || "_k";
  const refObj2 = /[.[\]]/.test(object) ? `_art_obj_${object.replace(/[^\w]/g, "_")}` : object;
  const refExpr2 = /[.[\]]/.test(object) ? `let ${refObj2}=${object};` : "";
  const valueDecl2 = asExpr2.vars ? `let ${asExpr2.vars}=${refObj2}[${key1}]` : "";

  return `${debugPrefix}<%${refExpr2}for(let ${key1} in ${refObj2}){${valueDecl2}%>`;
}
```

## for：通用循环

### 基本语法

```html
{{for(let i = 0; i < 10; i++)}}
<span>{{=i}}</span>
{{/for}}
```

### 编译产物

```js
for (let i = 0; i < 10; i++) {
  __lark_out__ += "<span>" + __lark_enc_html__(i) + "</span>";
}
```

### 源码实现

```ts
// 括号形式：{{for(init;cond;step)}}
const ifForMatch = code.match(/^\s*(if|for)\s*\(/);
if (ifForMatch && ifForMatch[1] === "for") {
  blockStack.push({ ctrl: "for", line: lineNo });
  const forExpr = expr.replace(/\)\s*$/, "");
  return `${debugPrefix}<%for(${forExpr}){%>`;
}

// 空格形式：{{for let i = 0; i < n; i++}}
case "for": {
  blockStack.push({ ctrl: "for", line: lineNo });
  const expr = tokens.join(" ").trim();
  return `${debugPrefix}<%for(${expr}){%>`;
}
```

### 典型用例

```html
<!-- 生成页码 -->
<nav class="pagination">
  {{for(let p = 1; p <= totalPages; p++)}}
  <a href="?page={{=p}}" class="{{=p === currentPage ? 'active' : ''}}"
    >{{=p}}</a
  >
  {{/for}}
</nav>

<!-- 生成星级评分 -->
<div class="stars">
  {{for(let s = 1; s <= 5; s++)}}
  <span class="{{=s <= rating ? 'star filled' : 'star'}}">★</span>
  {{/for}}
</div>
```

## Keyed Diffing（键控差异对比）

无论字符串模式还是 VDOM 模式，Lark Mvc 都支持通过 `id` 属性指定 `compareKey`（VDOM 模式还支持专用的 `#` 属性），实现高效的列表 diff：

```html
{{forOf items as item}}
<div id="item_{{=item.id}}" class="list-item">{{=item.name}}</div>
{{/forOf}}
```

当列表数据变化时，VDOM diff 算法通过 `id`（compareKey）识别哪些节点是新增、删除或移动的，而非简单地按索引逐个对比。这带来以下优势：

- **节点复用**：相同 key 的节点只更新变化的属性/子节点
- **最小 DOM 操作**：移动节点而非销毁重建
- **状态保持**：节点内部的 DOM 状态（如 input 焦点）得以保留

### 性能对比

| 场景         | 无 key（按索引） | 有 key（按 id） |
| ------------ | ---------------- | --------------- |
| 列表头部插入 | 所有节点重新渲染 | 仅插入新节点    |
| 列表排序     | 所有节点重新渲染 | 仅移动节点      |
| 删除中间项   | 后续节点全部更新 | 仅删除目标节点  |

## parseAsExpr：as 表达式解析

`parseAsExpr` 函数负责解析 `as` 后面的变量声明：

```ts
function parseAsExpr(expr: string): AsExpr {
  expr = expr.trim();
  if (!expr) {
    return { vars: "", key: "", last: "", first: "", bad: false };
  }

  // 解构：以 { 或 [ 开头
  if (expr.startsWith("{") || expr.startsWith("[")) {
    // 使用栈匹配括号，按空格分割各变量
    // "{a,b} index last first" → { vars: "{a,b}", key: "index", last: "last", first: "first" }
  }

  // 简单形式："value index last first"
  const parts = expr.split(/\s+/);
  return {
    vars: parts[0] || "",
    key: parts[1] || "",
    last: parts[2] || "",
    first: parts[3] || "",
    bad: false,
  };
}
```

返回值结构：

```ts
interface AsExpr {
  vars: string; // 元素变量（或解构表达式）
  key: string; // 索引/键变量
  last: string; // last 辅助变量名
  first: string; // first 辅助变量名
  bad: boolean; // 括号不匹配等语法错误
}
```

## 完整示例

### 商品列表

```html
{{if products.length > 0}}
<div class="product-grid">
  {{forOf products as product idx last first}}
  <div
    id="product_{{=product.id}}"
    class="product-card {{=first ? 'first' : ''}} {{=last ? 'last' : ''}}"
  >
    <img src="{{=product.image}}" alt="{{=product.name}}" />
    <h3>{{=product.name}}</h3>
    <p class="price">¥{{=product.price.toFixed(2)}}</p>
    {{if product.tags.length > 0}}
    <div class="tags">
      {{forOf product.tags as tag}}
      <span class="tag">{{=tag}}</span>
      {{/forOf}}
    </div>
    {{/if}}
  </div>
  {{/forOf}}
</div>
{{else}}
<div class="empty-state">暂无商品</div>
{{/if}}
```

### 配置面板（forIn）

```html
<div class="config-panel">
  <h3>系统配置</h3>
  {{forIn settings as value key}}
  <div class="config-row">
    <label>{{=key}}</label>
    {{if typeof value === 'boolean'}}
    <input type="checkbox" checked="{{=value}}" />
    {{else}}
    <input type="text" value="{{=value}}" />
    {{/if}}
  </div>
  {{/forIn}}
</div>
```

### 日历生成（for 循环）

```html
<div class="calendar">
  {{for(let week = 0; week < 6; week++)}}
  <div class="week">
    {{for(let day = 0; day < 7; day++)}} {{set dayNum = week * 7 + day -
    startOffset + 1}}
    <div
      class="day {{=dayNum === today ? 'today' : ''}} {{=dayNum < 1 || dayNum > daysInMonth ? 'other-month' : ''}}"
    >
      {{if dayNum >= 1 && dayNum <= daysInMonth}} {{=dayNum}} {{/if}}
    </div>
    {{/for}}
  </div>
  {{/for}}
</div>
```

## 性能注意事项

| 建议                          | 说明                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 使用 `id` 属性作为 compareKey | 两种模式均启用 keyed diff（字符串模式取 id/v-lark，VDOM 模式另支持 `#`），大幅减少 DOM 操作                |
| 避免在循环内创建复杂表达式    | 预计算到 store 或 `{{set}}` 中                                                                             |
| 大列表频繁重排考虑 VDOM 模式  | 字符串模式也是 keyed diff（非全量 innerHTML 替换），但 VDOM 模式的 LIS 算法能把重排的 DOM 移动次数降到最少 |
| 合理使用 `first`/`last`       | 它们会生成额外的变量声明，仅在需要时使用                                                                   |
| 嵌套循环注意变量名            | 内外层循环使用不同的索引变量名避免遮蔽                                                                     |
| `forOf` 优于 `for` + 索引访问 | `forOf` 自动缓存长度和元素引用，代码更简洁                                                                 |

## 语法错误提示

编译器对常见错误提供清晰的错误信息：

```html
<!-- ❌ 缺少 as 关键字 -->
{{forOf list item}}
<!-- Error: Bad forOf syntax: {{forOf list item}}. Expected "as" keyword, got "item". Usage: {{forOf list as item [index]}} -->

<!-- ❌ 未关闭的循环块 -->
{{forOf list as item}}
<div>{{=item}}</div>
<!-- Error: Unclosed block(s): "forOf" at line 1 -->

<!-- ❌ 关闭标签不匹配 -->
{{forOf list as item}}
<div>{{=item}}</div>
{{/forIn}}
<!-- Error: Unexpected {{/forIn}}: expected {{/forOf}} to close block opened at line 1 -->
```

## 小结

- `{{forOf list as item idx last first}}`：数组遍历，编译为索引 for 循环，带 `_l` 长度缓存
- `{{forIn obj as val key}}`：对象遍历，编译为 `for...in` 循环
- `{{for(init;cond;step)}}`：通用 for 循环，直接透传为 JS 语句
- VDOM 模式下通过 `id` 属性实现 keyed diffing，优化列表更新性能
- 编译器验证 `as` 关键字和块的开闭匹配，提供清晰的错误提示
- 支持解构赋值、复杂表达式缓存、first/last 辅助变量
