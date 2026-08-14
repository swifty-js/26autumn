---
title: 类与样式绑定
description: Lark Mvc 模板中动态 class 和 style 绑定的实现原理，涵盖字符串模式与 VDOM 模式的属性值编译
---

# 类与样式绑定

Lark Mvc 的模板系统通过模板表达式（`{{=expr}}`）实现动态 class 和 style 绑定。属性值中的表达式在编译阶段被转换为 JavaScript 拼接逻辑，运行时根据数据动态生成最终的属性字符串。

## 基本原理

在 Lark Mvc 中，HTML 属性值可以包含模板表达式。编译器会识别属性值中的 `{{=...}}`、`{{!...}}`、`{{:...}}` 等语法，并将其编译为运行时的字符串拼接或 VDOM 属性表达式。

```html
<!-- 模板源码 -->
<div class="{{=isActive ? 'active' : ''}} item">内容</div>
```

编译后（字符串模式），属性值变为：

```js
// 编译产物（简化）
'<div class="' +
  __lark_enc_html__(isActive ? "active" : "") +
  ' item">内容</div>';
```

## 动态 class 绑定

### 基础用法：三元表达式

最常见的动态 class 方式是使用三元表达式：

```html
<div class="btn {{=disabled ? 'btn-disabled' : 'btn-primary'}}">按钮</div>
```

当 `disabled` 为 `true` 时，输出 `class="btn btn-disabled"`；否则输出 `class="btn btn-primary"`。

### 多条件 class

可以组合多个表达式实现多条件 class：

```html
<li
  class="tab {{=current === 'home' ? 'active' : ''}} {{=hasError ? 'error' : ''}}"
>
  首页
</li>
```

### 使用 set 预计算

对于复杂的 class 逻辑，推荐使用 `{{set}}` 预先计算：

```html
{{set btnClass = 'btn ' + (size === 'lg' ? 'btn-lg' : size === 'sm' ? 'btn-sm' :
'') + (disabled ? ' disabled' : '') + (block ? ' btn-block' : '')}}
<button class="{{=btnClass}}">提交</button>
```

### 对象/数组模式（手动拼接）

Lark Mvc 不提供 Vue 风格的 `:class="{ active: isActive }"` 对象语法，但可以通过表达式实现类似效果：

```html
{{set classes = ['item', type, isActive ? 'active' : '', isHidden ? 'hidden' :
''].filter(Boolean).join(' ')}}
<div class="{{=classes}}">内容</div>
```

## 动态 style 绑定

### 内联样式表达式

style 属性同样支持模板表达式：

```html
<div style="width: {{=progress}}%; background-color: {{=color}};">进度条</div>
```

### 条件样式

```html
<div style="display: {{=visible ? 'block' : 'none'}}; opacity: {{=opacity}};">
  可切换内容
</div>
```

### 动态计算样式

```html
{{set transformStyle = 'translateX(' + offsetX + 'px) translateY(' + offsetY +
'px) scale(' + scale + ')'}}
<div style="transform: {{=transformStyle}}; transition: transform 0.3s ease;">
  可拖拽元素
</div>
```

## 编译原理：字符串模式

在字符串模式（默认模式）下，模板被编译为一个返回 HTML 字符串的函数。属性值中的表达式通过 `__lark_enc_html__`（HTML 转义输出）处理。

### 编译流程

```
模板源码 → protectComments → convertArtSyntax → processViewEvents → compileToFunction
```

`convertArtSyntax` 阶段将 `{{=expr}}` 转换为内部 `<%=expr%>` 语法：

```
class="{{=isActive ? 'active' : ''}}"
→ class="<%=isActive ? 'active' : ''%>"
```

`compileToFunction` 阶段将 `<%=expr%>` 编译为字符串拼接：

```js
// 正则匹配: /<%([@=!:])?([\s\S]*?)%>|$/g
// operate = "=", content = "isActive ? 'active' : ''"
funcSource += `'+__lark_enc_html__(${content})+'`;
```

最终产物：

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
  let isActive = __lark_data__.isActive;
  __lark_out__ +=
    '<div class="' +
    __lark_enc_html__(isActive ? "active" : "") +
    '">内容</div>';
  return __lark_out__;
};
```

### 操作符说明

| 操作符 | 语法        | 编译结果                        | 用途                         |
| ------ | ----------- | ------------------------------- | ---------------------------- |
| `=`    | `{{=expr}}` | `__lark_enc_html__(expr)`       | 转义输出（class/style 推荐） |
| `:`    | `{{:expr}}` | `__lark_enc_html__(expr)`       | 双向绑定（渲染时同 `=`）     |
| `!`    | `{{!expr}}` | `__lark_str_safe__(expr)`       | 原始输出（不转义）           |
| `@`    | `{{@expr}}` | `__lark_ref_fn__(refAlt, expr)` | 引用查找                     |

对于 class 和 style 属性，推荐使用 `{{=expr}}`（转义输出），防止 XSS 注入。

## 编译原理：VDOM 模式

在 VDOM 模式下（`vdom: true`），模板被编译为虚拟 DOM 创建调用。属性值通过 `vdomResolveAttrValue` 函数处理。

### vdomResolveAttrValue 处理逻辑

```ts
function vdomResolveAttrValue(
  rawValue: string,
  exprStore: VDomExprEntry[],
): string {
  const hasPlaceholders = rawValue.includes("\x00");
  const hasViewId = rawValue.includes("\x1f");

  // 无表达式占位符 → 纯静态字符串
  if (!hasPlaceholders && !hasViewId) {
    return `'${vdomEscapeStr(rawValue)}'`;
  }

  // 包含代码块占位符（if/for）→ IIFE 模式
  if (hasPlaceholders) {
    // 检测是否有 op === "" 的代码块
    // → 路由到 vdomResolveAttrValueIIFE
  }

  // 仅包含表达式占位符 → 拼接模式
  // 将每个占位符替换为对应的 JS 表达式，用 + 连接
}
```

### 拼接模式

当属性值只包含表达式（无 if/for 代码块）时，生成拼接表达式：

```html
<div class="{{=baseClass}} {{=isActive ? 'active' : ''}}"></div>
```

编译产物：

```js
// props 对象
{ 'class': __lark_str_safe__(baseClass) + ' ' + __lark_str_safe__(isActive ? 'active' : '') }
```

注意：VDOM 模式下使用 `__lark_str_safe__`（null-safe toString）而非 `__lark_enc_html__`，因为 VDOM 不生成 HTML 字符串，无需 HTML 实体转义。

### IIFE 模式

当属性值中包含控制流代码块（如 `{{if}}`）时，无法用简单拼接表达，编译器生成一个立即执行函数：

```html
<div
  class="base {{if isActive}}active{{/if}} {{if isPrimary}}primary{{/if}}"
></div>
```

编译产物：

```js
{ 'class': (() => {
    let _s = '';
    _s += 'base ';
    if (isActive) { _s += 'active' }
    _s += ' ';
    if (isPrimary) { _s += 'primary' }
    return _s;
  })()
}
```

`vdomResolveAttrValueIIFE` 函数的核心逻辑：

```ts
function vdomResolveAttrValueIIFE(
  rawValue: string,
  exprStore: VDomExprEntry[],
): string {
  const stmts: string[] = [];
  // 遍历 rawValue 中的占位符和静态文本
  // 静态文本 → _s += 'text'
  // 表达式占位符（op = "="）→ _s += __lark_str_safe__(expr)
  // 代码块占位符（op = ""）→ 直接插入语句（if/for）
  const body = stmts.join(";");
  return `(()=>{let _s='';${body};return _s;})()`;
}
```

## 属性值中的 View ID 注入

属性值中的 `\x1f`（VIEW_ID_PLACEHOLDER）会被替换为 `'+__lark_view_id__+'`（字符串模式）或 `__lark_view_id__`（VDOM 模式），用于事件绑定等场景：

```ts
// 字符串模式
const viewIdRegExp = new RegExp(String.fromCharCode(0x1f), "g");
funcSource = funcSource.replace(viewIdRegExp, `'+__lark_view_id__+'`);

// VDOM 模式（vdomResolveAttrValue 中）
if (specialType === "vi") {
  segments.push("__lark_view_id__");
}
```

## 实际示例

### 导航菜单高亮

```html
<nav>
  {{forOf menus as menu idx}}
  <a
    href="{{=menu.url}}"
    class="nav-link {{=currentPath === menu.path ? 'active' : ''}} {{=menu.disabled ? 'disabled' : ''}}"
    style="{{=menu.color ? 'color: ' + menu.color + ';' : ''}}"
  >
    {{=menu.title}}
  </a>
  {{/forOf}}
</nav>
```

### 响应式网格布局

```html
{{set colClass = 'col-' + (columns || 12)}} {{set gapStyle = 'gap: ' + gap +
'px; padding: ' + padding + 'px;'}}
<div
  class="grid {{=colClass}} {{=fluid ? 'grid-fluid' : ''}}"
  style="{{=gapStyle}}"
>
  {{forOf items as item}}
  <div class="grid-item {{=item.highlight ? 'highlight' : ''}}">
    {{=item.content}}
  </div>
  {{/forOf}}
</div>
```

### 动态主题色

```html
{{set themeVars = '--primary: ' + theme.primary + '; --bg: ' + theme.background
+ ';'}}
<div class="themed-container" style="{{=themeVars}}">
  <h1 style="color: var(--primary);">{{=title}}</h1>
  <p style="line-height: {{=lineHeight}}; font-size: {{=fontSize}}px;">
    {{=content}}
  </p>
</div>
```

## 最佳实践

| 建议                              | 说明                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------- |
| 使用 `{{=expr}}` 而非 `{{!expr}}` | class/style 值应经过转义，防止注入                                           |
| 复杂逻辑用 `{{set}}` 预计算       | 保持模板可读性，避免过长的内联表达式                                         |
| 避免在属性中嵌套 `{{if}}`         | 字符串模式下可行但降低可读性；VDOM 模式下会触发 IIFE 编译                    |
| 静态 class 直接写                 | 无需表达式的 class 直接作为字面量，编译器不做额外处理                        |
| style 拼接注意分号                | 动态 style 片段末尾加 `;` 防止与后续静态样式粘连                             |
| VDOM 模式优先                     | 对于频繁更新的动态 class/style，VDOM 模式的 diff 更新比全量 innerHTML 更高效 |

## 小结

- 动态 class/style 通过 `{{=expr}}` 模板表达式实现
- 字符串模式：表达式编译为 `__lark_enc_html__(expr)` 字符串拼接
- VDOM 模式：表达式通过 `vdomResolveAttrValue` 编译为属性表达式或 IIFE
- 属性值中包含控制流代码块时，VDOM 模式使用 IIFE 累积字符串
- 推荐对 class/style 使用转义输出（`=`），复杂逻辑用 `{{set}}` 预计算
